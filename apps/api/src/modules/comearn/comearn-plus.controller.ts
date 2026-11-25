/**
 * COMEARN part 2 (tested in test/comearn-plus.e2e.ts):
 *  - Reverse marketplace: members post genuine customer requirements (customer identity private), verified companies submit
 *    sealed commission bids, the member selects one → a private opportunity + an engagement with the lead already registered.
 *  - Team formation: the lead member invites members (suggested from capability profiles, with match reasons) for a share of
 *    the commission pool; each must accept; on payment the lead owes each accepted member their share (allocations).
 *  - Reputation from recorded activity only; CRM hand-off; featured listings (COLLABIZ-granted — paid promotion needs payments);
 *    sales assistant drafts (labelled templates from the record; never sent automatically).
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CE_CATEGORIES, CE_STAGES, CE_TEAM_ROLES, CE_TRIGGERS, CeBidSchema, CeRequirementSchema, CeTeamInviteSchema, VAI_ROLES,
  ceLeadFingerprint, cePotential, ceReputation, matchRole, type CeStage, type CeTeamRole, type CeTerms, type VaiRole,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { ceAllocations, ceBids, ceCommissions, ceDisputes, ceEngagements, ceEvents, ceLeads, ceOpportunities, ceRequirements, ceTeamMembers, crmDeals, customers, memberships, notifications, organizations, vaiCapabilities } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { canonicalJson, randomDigits, sha256 } from '../../common/crypto';
import { config } from '../../config';
import { agreementText } from './comearn.controller';
import { ratingsFor } from './ratings';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const code = (p: string) => `${p}-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
const today = () => new Date().toISOString().slice(0, 10);
const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
type Opp = typeof ceOpportunities.$inferSelect;
const termsOf = (o: Opp): CeTerms => ({ model: o.model as CeTerms['model'], rateBps: o.rateBps ?? undefined, fixedPaise: o.fixedPaise ?? undefined, milestones: (o.milestones as CeTerms['milestones']) ?? [], recurringMonths: o.recurringMonths ?? undefined, trigger: o.trigger as CeTerms['trigger'], paymentDays: o.paymentDays });

@ApiTags('comearn')
@Controller()
export class ComearnPlusController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private on() { if (!config().FEATURE_COMEARN) throw new NotFoundException('COMEARN is not enabled'); }
  private admin(ctx: RequestContext) { const m = ctx.memberships?.find((x) => x.organizationId === ctx.orgId); if (m && !['org_owner', 'org_admin'].includes(m.role)) throw new ForbiddenException('Only owners and admins of your business can do this'); }
  private async verified(orgId: string) { const [o] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, orgId)).limit(1); return o?.v === 'verified'; }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const team = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin'])));
    if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.u, kind: 'comearn', title, body: text, link })));
  }
  private async req(id: string) { const [r] = await this.db.select().from(ceRequirements).where(or(eq(ceRequirements.id, id), eq(ceRequirements.code, id))).limit(1); if (!r) throw new NotFoundException('Requirement not found'); return r; }

  /** Recorded performance for an organization, as earner and as paying company. Null parts mean "no history yet". */
  async reputation(orgId: string) {
    const [e] = (await this.db.execute(sql`select count(*)::int n, count(*) filter (where stage in ('order_confirmed','payment_verified','commission_approved','commission_paid'))::int conv,
      (select count(*) from ce_commissions c where c.earner_org_id = ${orgId} and c.status = 'paid')::int paid, (select count(*) from ce_disputes d join ce_engagements x on x.id = d.engagement_id where x.earner_org_id = ${orgId})::int disputes
      from ce_engagements where earner_org_id = ${orgId}`) as unknown as { rows: { n: number; conv: number; paid: number; disputes: number }[] }).rows;
    const [c] = (await this.db.execute(sql`select count(*)::int n, count(*) filter (where e.stage in ('order_confirmed','payment_verified','commission_approved','commission_paid'))::int conv,
      (select count(*) from ce_commissions c where c.payer_org_id = ${orgId} and c.status = 'paid')::int paid, (select count(*) from ce_commissions c where c.payer_org_id = ${orgId} and c.status = 'paid' and c.paid_at::date <= c.due_on)::int ontime,
      (select count(*) from ce_disputes d join ce_engagements x on x.id = d.engagement_id join ce_opportunities y on y.id = x.opportunity_id where y.org_id = ${orgId})::int disputes
      from ce_engagements e join ce_opportunities o on o.id = e.opportunity_id where o.org_id = ${orgId}`) as unknown as { rows: { n: number; conv: number; paid: number; ontime: number; disputes: number }[] }).rows;
    return {
      asEarner: ceReputation({ engagements: e.n, converted: e.conv, paid: e.paid, onTime: e.paid, disputesLost: e.disputes }),
      asCompany: ceReputation({ engagements: c.n, converted: c.conv, paid: c.paid, onTime: c.ontime, disputesLost: c.disputes }),
      verified: await this.verified(orgId),
      rating: (await ratingsFor(this.db, [orgId], 'company')).get(orgId) ?? null, ratingAsEarner: (await ratingsFor(this.db, [orgId], 'earner')).get(orgId) ?? null,
    };
  }

  @Get('comearn/reputation/:orgId')
  @RequireOrg()
  async rep(@Param('orgId', ParseUUIDPipe) orgId: string) { this.on(); const [o] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, orgId)).limit(1); if (!o) throw new NotFoundException(); return { org: o.n, ...(await this.reputation(orgId)) }; }

  // ------------------------------------------------------------------ reverse marketplace
  @Post('comearn/requirements')
  @RequireOrg()
  @HttpCode(201)
  async postRequirement(@Ctx() ctx: RequestContext, @Body(body(CeRequirementSchema)) b: z.infer<typeof CeRequirementSchema>) {
    this.on(); this.admin(ctx);
    if (b.closesOn < today()) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { closesOn: 'Choose a future date' } });
    const fingerprint = ceLeadFingerprint(b);
    const [dup] = await this.db.select({ id: ceRequirements.id }).from(ceRequirements).where(and(eq(ceRequirements.fingerprint, fingerprint), ne(ceRequirements.status, 'closed'))).limit(1);
    if (dup) throw new ConflictException('This customer already has an open requirement on COMEARN posted by another member. The first posting owns it.');
    const [r] = await this.db.insert(ceRequirements).values({ code: code('CER'), orgId: ctx.orgId!, createdBy: ctx.userId, title: b.title, category: b.category, description: b.description, city: b.city, estimatedValuePaise: b.estimatedValuePaise ?? null, closesOn: b.closesOn,
      customer: { customerName: b.customerName, customerCompany: b.customerCompany ?? null, contactName: b.contactName, phone: b.phone ?? null, email: b.email ?? null, gstin: b.gstin ?? null }, fingerprint }).returning();
    await this.audit.record(ctx, { action: 'comearn.requirement_posted', objectType: 'ce_requirement', objectId: r.id });
    return { id: r.id, code: r.code, status: r.status };
  }

  /** Open requirements from other members, anonymised (no customer identity), with my own bid if any. */
  @Get('comearn/requirements')
  @RequireOrg()
  async requirements(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select({ r: ceRequirements, bids: sql<number>`(select count(*) from ce_bids b where b.requirement_id = ${ceRequirements.id} and b.status = 'submitted')::int` })
      .from(ceRequirements).where(and(eq(ceRequirements.status, 'open'), ne(ceRequirements.orgId, ctx.orgId!), sql`${ceRequirements.closesOn} >= current_date`)).orderBy(desc(ceRequirements.createdAt)).limit(100);
    const mine = rows.length ? await this.db.select().from(ceBids).where(and(eq(ceBids.orgId, ctx.orgId!), inArray(ceBids.requirementId, rows.map((x) => x.r.id)))) : [];
    return { canBid: await this.verified(ctx.orgId!), items: rows.map(({ r, bids }) => ({ id: r.id, code: r.code, title: r.title, category: r.category, description: r.description, city: r.city, estimatedValuePaise: r.estimatedValuePaise, closesOn: r.closesOn, bids, myBid: mine.find((b) => b.requirementId === r.id) ?? null })) };
  }

  @Get('comearn/requirements/mine')
  @RequireOrg()
  async myRequirements(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select().from(ceRequirements).where(eq(ceRequirements.orgId, ctx.orgId!)).orderBy(desc(ceRequirements.createdAt));
    const bids = rows.length ? await this.db.select({ n: sql<number>`count(*)::int`, id: ceBids.requirementId }).from(ceBids).where(and(inArray(ceBids.requirementId, rows.map((r) => r.id)), eq(ceBids.status, 'submitted'))).groupBy(ceBids.requirementId) : [];
    return { items: rows.map((r) => ({ id: r.id, code: r.code, title: r.title, category: r.category, city: r.city, status: r.status, closesOn: r.closesOn, estimatedValuePaise: r.estimatedValuePaise, bids: bids.find((b) => b.id === r.id)?.n ?? 0, engagementId: r.engagementId })) };
  }

  @Get('comearn/requirements/:id')
  @RequireOrg()
  async requirement(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    this.on(); const r = await this.req(id);
    const owner = r.orgId === ctx.orgId;
    const base = { id: r.id, code: r.code, title: r.title, category: r.category, description: r.description, city: r.city, estimatedValuePaise: r.estimatedValuePaise, closesOn: r.closesOn, status: r.status, owner };
    if (owner || staff(ctx)) {
      const bids = await this.db.select({ b: ceBids, org: organizations.displayName }).from(ceBids).innerJoin(organizations, eq(organizations.id, ceBids.orgId)).where(eq(ceBids.requirementId, r.id)).orderBy(desc(ceBids.createdAt));
      const withRep = await Promise.all(bids.filter((x) => x.b.status !== 'withdrawn').map(async ({ b, org }) => ({ ...b, company: org, reputation: await this.reputation(b.orgId),
        commissionPaise: b.model === 'fixed' ? b.fixedPaise : r.estimatedValuePaise ? Math.round((r.estimatedValuePaise * (b.rateBps ?? 0)) / 10000) : null })));
      return { ...base, customer: owner ? r.customer : null, engagementId: r.engagementId, bids: withRep,
        note: 'Commission is one factor. Compare the companies’ proposals, verification and track record for your customer — the highest commission is not always the right choice.' };
    }
    if (r.status !== 'open') throw new NotFoundException('Requirement not found');
    const [mine] = await this.db.select().from(ceBids).where(and(eq(ceBids.requirementId, r.id), eq(ceBids.orgId, ctx.orgId!))).limit(1);
    return { ...base, customer: null, myBid: mine ?? null, canBid: await this.verified(ctx.orgId!) };
  }

  @Post('comearn/requirements/:id/bids')
  @RequireOrg()
  @HttpCode(201)
  async bid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeBidSchema)) b: z.infer<typeof CeBidSchema>) {
    this.on(); this.admin(ctx); const r = await this.req(id);
    if (r.orgId === ctx.orgId) throw new BadRequestException('You cannot bid on your own requirement');
    if (r.status !== 'open' || r.closesOn < today()) throw new ConflictException('This requirement is no longer open for bids');
    if (!(await this.verified(ctx.orgId!))) throw new ForbiddenException('Only verified businesses can bid. Complete your business verification first.');
    const v = { model: b.model, rateBps: b.model === 'percent' ? b.rateBps ?? null : null, fixedPaise: b.model === 'fixed' ? b.fixedPaise ?? null : null, trigger: b.trigger, paymentDays: b.paymentDays, proposal: b.proposal, status: 'submitted', updatedAt: new Date() };
    const [x] = await this.db.insert(ceBids).values({ requirementId: r.id, orgId: ctx.orgId!, createdBy: ctx.userId, ...v }).onConflictDoUpdate({ target: [ceBids.requirementId, ceBids.orgId], set: v, where: sql`${ceBids.status} in ('submitted','withdrawn')` }).returning();
    if (!x) throw new ConflictException('Your bid can no longer be changed');
    await this.notifyOrg(r.orgId, `COMEARN: new commission offer on ${r.title}`, 'A business offered a commission on your customer requirement.', `/comearn/requirements/${r.id}`);
    return x;
  }

  @Post('comearn/bids/:id/withdraw')
  @RequireOrg()
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); this.admin(ctx);
    const [b] = await this.db.select().from(ceBids).where(eq(ceBids.id, id)).limit(1);
    if (!b || b.orgId !== ctx.orgId) throw new NotFoundException();
    if (b.status !== 'submitted') throw new ConflictException('Only submitted bids can be withdrawn');
    await this.db.update(ceBids).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(ceBids.id, id));
    return { status: 'withdrawn' };
  }

  /** The member selects a bid: a private opportunity with the bid's terms, the member's engagement with the agreement accepted
   *  and the customer registered as a protected lead. Customer details are released to the selected company only. */
  @Post('comearn/requirements/:id/select')
  @RequireOrg()
  @HttpCode(200)
  async select(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ bidId: z.string().uuid(), confirm: z.literal(true, { message: 'Confirm you accept this company’s commission terms' }) }))) b: { bidId: string }) {
    this.on(); this.admin(ctx); const r = await this.req(id);
    if (r.orgId !== ctx.orgId) throw new ForbiddenException();
    if (r.status !== 'open') throw new ConflictException('A bid has already been selected');
    const [bid] = await this.db.select().from(ceBids).where(and(eq(ceBids.id, b.bidId), eq(ceBids.requirementId, r.id), eq(ceBids.status, 'submitted'))).limit(1);
    if (!bid) throw new NotFoundException('Bid not found');
    const [company] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, bid.orgId)).limit(1);
    const cust = r.customer as { customerName: string; customerCompany: string | null; contactName: string; phone: string | null; email: string | null; gstin: string | null };
    const out = await this.db.transaction(async (tx) => {
      const [o] = await tx.insert(ceOpportunities).values({ code: code('CE'), orgId: bid.orgId, title: r.title, type: 'sales_conversion', category: r.category, description: `${r.description}\n\nCompany proposal: ${bid.proposal}`, territory: r.city,
        estimatedValuePaise: r.estimatedValuePaise, model: bid.model, rateBps: bid.rateBps, fixedPaise: bid.fixedPaise, trigger: bid.trigger, paymentDays: bid.paymentDays, maxEarners: 1, status: 'private', source: { module: 'requirement', id: r.id }, createdBy: bid.createdBy }).returning();
      const terms = { ...termsOf(o), version: o.version, id: o.id };
      const h = sha256(canonicalJson(terms));
      const [e] = await tx.insert(ceEngagements).values({ code: code('CEE'), opportunityId: o.id, earnerOrgId: r.orgId, earnerUserId: ctx.userId, stage: 'lead_registered', terms: { ...terms, text: agreementText(o, company?.n ?? '—') }, termsHash: h, acceptedAt: new Date() }).returning();
      const cert = code('CEL');
      await tx.insert(ceLeads).values({ engagementId: e.id, opportunityId: o.id, certificateCode: cert, customerName: cust.customerName, customerCompany: cust.customerCompany, city: r.city, contactName: cust.contactName, phone: cust.phone, email: cust.email, gstin: cust.gstin,
        requirement: r.description, estimatedValuePaise: r.estimatedValuePaise, fingerprint: r.fingerprint, recordHash: sha256(canonicalJson({ requirement: r.code, engagement: e.code, fingerprint: r.fingerprint, at: new Date().toISOString() })) });
      for (const [stage, ref] of [['selected', r.code], ['agreement_accepted', h.slice(0, 16)], ['lead_registered', cert]] as const) await tx.insert(ceEvents).values({ engagementId: e.id, stage, reference: ref, byUserId: ctx.userId, byOrgId: ctx.orgId! });
      await tx.update(ceBids).set({ status: 'selected', updatedAt: new Date() }).where(eq(ceBids.id, bid.id));
      await tx.update(ceBids).set({ status: 'not_selected', updatedAt: new Date() }).where(and(eq(ceBids.requirementId, r.id), ne(ceBids.id, bid.id), eq(ceBids.status, 'submitted')));
      await tx.update(ceRequirements).set({ status: 'awarded', selectedBidId: bid.id, engagementId: e.id, updatedAt: new Date() }).where(eq(ceRequirements.id, r.id));
      return { engagementId: e.id, certificateCode: cert };
    });
    await this.notifyOrg(bid.orgId, `COMEARN: your commission offer was selected — ${r.title}`, 'The customer details are now in your COMEARN tracker.', `/comearn/engagements/${out.engagementId}`);
    const losers = await this.db.select({ orgId: ceBids.orgId }).from(ceBids).where(and(eq(ceBids.requirementId, r.id), eq(ceBids.status, 'not_selected')));
    for (const l of losers) await this.notifyOrg(l.orgId, `COMEARN: another offer was selected — ${r.title}`, 'Thank you for your offer.', '/comearn/requirements');
    await this.audit.record(ctx, { action: 'comearn.bid_selected', objectType: 'ce_requirement', objectId: r.id, after: { bid: bid.id } });
    return out;
  }

  @Post('comearn/requirements/:id/close')
  @RequireOrg()
  @HttpCode(200)
  async closeReq(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); this.admin(ctx); const r = await this.req(id);
    if (r.orgId !== ctx.orgId) throw new ForbiddenException(); if (r.status !== 'open') throw new ConflictException('Not open');
    await this.db.update(ceRequirements).set({ status: 'closed', updatedAt: new Date() }).where(eq(ceRequirements.id, r.id));
    return { status: 'closed' };
  }

  // ------------------------------------------------------------------ team formation and commission pool
  private async lead(ctx: RequestContext, engagementId: string) {
    const [e] = await this.db.select().from(ceEngagements).where(eq(ceEngagements.id, engagementId)).limit(1);
    if (!e) throw new NotFoundException();
    if (e.earnerOrgId !== ctx.orgId) throw new ForbiddenException('Only the lead member manages the team');
    const [o] = await this.db.select().from(ceOpportunities).where(eq(ceOpportunities.id, e.opportunityId)).limit(1);
    return { e, o };
  }

  /** Suggested members for each team role from capability profiles, with match reasons. Contact details are never returned. */
  @Get('comearn/engagements/:id/team-suggestions')
  @RequireOrg()
  async suggestions(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const { e, o } = await this.lead(ctx, id);
    const caps = await this.db.select({ c: vaiCapabilities, org: organizations.displayName, v: organizations.verificationStatus }).from(vaiCapabilities).innerJoin(organizations, eq(organizations.id, vaiCapabilities.orgId))
      .where(and(ne(vaiCapabilities.orgId, e.earnerOrgId), ne(vaiCapabilities.orgId, o.orgId)));
    const cat = CE_CATEGORIES[o.category as keyof typeof CE_CATEGORIES];
    const roles = (Object.keys(CE_TEAM_ROLES) as CeTeamRole[]).filter((k) => CE_TEAM_ROLES[k].capability).map((k) => {
      const need = { role: CE_TEAM_ROLES[k].capability as VaiRole, categories: [cat], countries: ['IN'] };
      const cands = caps.map(({ c, org, v }) => { const m = matchRole(need, { ...c, verified: v === 'verified', completedCollaborations: 0 }); return m ? { orgId: c.orgId, org, percent: m.percent, reasons: m.reasons } : null; })
        .filter(Boolean).sort((a, b) => b!.percent - a!.percent).slice(0, 5);
      return { role: k, label: CE_TEAM_ROLES[k].label, suggestedPct: CE_TEAM_ROLES[k].suggestedPct, capability: VAI_ROLES[CE_TEAM_ROLES[k].capability as VaiRole], candidates: cands };
    });
    return { roles, note: 'Suggestions come from members’ capability profiles (rules-based, with reasons). The split shown is a starting point — every member must accept their share before it applies.' };
  }

  @Post('comearn/engagements/:id/team')
  @RequireOrg()
  @HttpCode(201)
  async invite(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeTeamInviteSchema)) b: z.infer<typeof CeTeamInviteSchema>) {
    this.on(); this.admin(ctx); const { e, o } = await this.lead(ctx, id);
    if (['payment_verified', 'commission_approved', 'commission_paid'].includes(e.stage)) throw new ConflictException('The team cannot change after the customer payment is verified');
    if (b.orgId === e.earnerOrgId || b.orgId === o.orgId) throw new BadRequestException('Invite another member business, not yourself or the paying company');
    const [org] = await this.db.select({ id: organizations.id, n: organizations.displayName }).from(organizations).where(eq(organizations.id, b.orgId)).limit(1);
    if (!org) throw new NotFoundException('Member not found');
    const current = await this.db.select().from(ceTeamMembers).where(and(eq(ceTeamMembers.engagementId, e.id), inArray(ceTeamMembers.status, ['invited', 'accepted'])));
    const bp = Math.round(b.sharePct * 100);
    const taken = current.reduce((s, t) => s + t.sharePct, 0);
    if (taken + bp > 9000) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { sharePct: `Team shares would total ${(taken + bp) / 100}% — the lead member must keep at least 10%` } });
    const [cap] = await this.db.select().from(vaiCapabilities).where(eq(vaiCapabilities.orgId, b.orgId)).limit(1);
    const capRole = CE_TEAM_ROLES[b.role].capability as VaiRole | null;
    const m = cap && capRole ? matchRole({ role: capRole, categories: [CE_CATEGORIES[o.category as keyof typeof CE_CATEGORIES]], countries: ['IN'] }, { ...cap, verified: false, completedCollaborations: 0 }) : null;
    const [t] = await this.db.insert(ceTeamMembers).values({ engagementId: e.id, orgId: b.orgId, role: b.role, sharePct: bp, matchPercent: m?.percent ?? null, matchReasons: m?.reasons ?? [], invitedBy: ctx.userId }).onConflictDoNothing().returning();
    if (!t) throw new ConflictException('This member is already on the team');
    await this.notifyOrg(b.orgId, `COMEARN team invitation — ${o.title}`, `${CE_TEAM_ROLES[b.role].label}, ${b.sharePct}% of the commission pool. Accept or decline in COMEARN.`, '/comearn/my');
    return { id: t.id, status: t.status, leadSharePct: (10000 - taken - bp) / 100 };
  }

  @Get('comearn/team-invitations')
  @RequireOrg()
  async invitations(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select({ t: ceTeamMembers, e: ceEngagements, o: ceOpportunities, lead: organizations.displayName }).from(ceTeamMembers).innerJoin(ceEngagements, eq(ceEngagements.id, ceTeamMembers.engagementId))
      .innerJoin(ceOpportunities, eq(ceOpportunities.id, ceEngagements.opportunityId)).innerJoin(organizations, eq(organizations.id, ceEngagements.earnerOrgId)).where(eq(ceTeamMembers.orgId, ctx.orgId!)).orderBy(desc(ceTeamMembers.createdAt));
    return { items: rows.map((r) => ({ id: r.t.id, engagementId: r.e.id, status: r.t.status, role: r.t.role, roleLabel: CE_TEAM_ROLES[r.t.role as CeTeamRole]?.label, sharePct: r.t.sharePct / 100, lead: r.lead, title: r.o.title,
      potentialPaise: (() => { const p = cePotential((r.e.terms ?? termsOf(r.o)) as CeTerms, r.o.estimatedValuePaise); return p == null ? null : Math.round((p * r.t.sharePct) / 10000); })(), matchReasons: r.t.matchReasons })) };
  }

  @Post('comearn/team/:id/respond')
  @RequireOrg()
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'decline']) }))) b: { decision: 'accept' | 'decline' }) {
    this.on(); this.admin(ctx);
    const [t] = await this.db.select().from(ceTeamMembers).where(and(eq(ceTeamMembers.id, id), eq(ceTeamMembers.orgId, ctx.orgId!))).limit(1);
    if (!t) throw new NotFoundException(); if (t.status !== 'invited') throw new ConflictException('Already answered');
    await this.db.update(ceTeamMembers).set({ status: b.decision === 'accept' ? 'accepted' : 'declined', respondedBy: ctx.userId, respondedAt: new Date() }).where(eq(ceTeamMembers.id, id));
    const [e] = await this.db.select().from(ceEngagements).where(eq(ceEngagements.id, t.engagementId)).limit(1);
    await this.notifyOrg(e.earnerOrgId, `COMEARN team: ${b.decision === 'accept' ? 'accepted' : 'declined'}`, `${CE_TEAM_ROLES[t.role as CeTeamRole]?.label}, ${t.sharePct / 100}%`, `/comearn/engagements/${e.id}`);
    await this.audit.record(ctx, { action: `comearn.team_${b.decision}`, objectType: 'ce_team_member', objectId: id });
    return { status: b.decision === 'accept' ? 'accepted' : 'declined', engagementId: e.id };
  }

  @Post('comearn/allocations/:id/paid')
  @RequireOrg()
  @HttpCode(200)
  async allocPaid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reference: z.string().trim().min(3).max(120) }))) b: { reference: string }) {
    this.on(); this.admin(ctx);
    const [a] = await this.db.select({ a: ceAllocations, earner: ceCommissions.earnerOrgId }).from(ceAllocations).innerJoin(ceCommissions, eq(ceCommissions.id, ceAllocations.commissionId)).where(eq(ceAllocations.id, id)).limit(1);
    if (!a || a.earner !== ctx.orgId) throw new NotFoundException();
    if (a.a.status !== 'owed') throw new ConflictException('Already recorded');
    await this.db.update(ceAllocations).set({ status: 'paid', reference: b.reference, paidAt: new Date() }).where(eq(ceAllocations.id, id));
    await this.notifyOrg(a.a.orgId, 'COMEARN: your team share was paid', `Reference ${b.reference}. Please confirm receipt.`, '/comearn/earnings');
    return { status: 'paid' };
  }

  @Post('comearn/allocations/:id/confirm')
  @RequireOrg()
  @HttpCode(200)
  async allocConfirm(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on();
    const [a] = await this.db.select().from(ceAllocations).where(eq(ceAllocations.id, id)).limit(1);
    if (!a || a.orgId !== ctx.orgId) throw new NotFoundException();
    if (a.status !== 'paid') throw new ConflictException('Not marked as paid yet');
    await this.db.update(ceAllocations).set({ status: 'confirmed', confirmedAt: new Date() }).where(eq(ceAllocations.id, id));
    return { status: 'confirmed' };
  }

  @Get('comearn/team-earnings')
  @RequireOrg()
  async teamEarnings(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select({ a: ceAllocations, title: ceOpportunities.title, lead: organizations.displayName, eng: ceEngagements.id }).from(ceAllocations).innerJoin(ceCommissions, eq(ceCommissions.id, ceAllocations.commissionId))
      .innerJoin(ceEngagements, eq(ceEngagements.id, ceCommissions.engagementId)).innerJoin(ceOpportunities, eq(ceOpportunities.id, ceEngagements.opportunityId)).innerJoin(organizations, eq(organizations.id, ceEngagements.earnerOrgId))
      .where(eq(ceAllocations.orgId, ctx.orgId!)).orderBy(desc(ceAllocations.createdAt));
    return { items: rows.map((r) => ({ ...r.a, title: r.title, lead: r.lead, engagementId: r.eng })) };
  }

  // ------------------------------------------------------------------ CRM hand-off
  /** Copies the protected lead into the caller's own CRM (customer + deal). Only the earner or the paying company. */
  @Post('comearn/engagements/:id/crm')
  @RequireOrg()
  @HttpCode(201)
  async toCrm(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on();
    const [e] = await this.db.select().from(ceEngagements).where(eq(ceEngagements.id, id)).limit(1); if (!e) throw new NotFoundException();
    const [o] = await this.db.select().from(ceOpportunities).where(eq(ceOpportunities.id, e.opportunityId)).limit(1);
    if (e.earnerOrgId !== ctx.orgId && o.orgId !== ctx.orgId) throw new NotFoundException();
    const [l] = await this.db.select().from(ceLeads).where(eq(ceLeads.engagementId, e.id)).limit(1);
    if (!l) throw new ConflictException('Register the customer first');
    const title = `COMEARN ${e.code} — ${l.customerName}`;
    const [exists] = await this.db.select({ id: crmDeals.id }).from(crmDeals).where(and(eq(crmDeals.organizationId, ctx.orgId!), eq(crmDeals.title, title))).limit(1);
    if (exists) return { dealId: exists.id, existed: true };
    const d = await this.db.transaction(async (tx) => {
      const [c] = await tx.insert(customers).values({ organizationId: ctx.orgId!, legalName: l.customerCompany ?? l.customerName, taxId: l.gstin, contactName: l.contactName, contactEmail: l.email, contactPhone: l.phone, city: l.city, country: 'IN',
        consentProvenance: { method: 'comearn_lead', certificate: l.certificateCode, obtainedAt: l.createdAt, disclosureScope: 'restricted' }, restrictedContacts: true }).returning();
      const [d] = await tx.insert(crmDeals).values({ organizationId: ctx.orgId!, customerId: c.id, title, value: l.estimatedValuePaise ?? null, ownerUserId: ctx.userId }).returning();
      return d;
    });
    return { dealId: d.id, existed: false };
  }

  // ------------------------------------------------------------------ sales assistant
  /** Draft messages from the engagement record (labelled templates; never sent automatically, nothing invented). */
  @Post('comearn/engagements/:id/assist')
  @RequireOrg()
  @HttpCode(200)
  async assist(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ kind: z.enum(['introduction', 'proposal_cover', 'follow_up']) }))) b: { kind: 'introduction' | 'proposal_cover' | 'follow_up' }) {
    this.on();
    const [e] = await this.db.select().from(ceEngagements).where(eq(ceEngagements.id, id)).limit(1); if (!e) throw new NotFoundException();
    const [o] = await this.db.select().from(ceOpportunities).where(eq(ceOpportunities.id, e.opportunityId)).limit(1);
    if (e.earnerOrgId !== ctx.orgId && o.orgId !== ctx.orgId) throw new NotFoundException();
    const [l] = await this.db.select().from(ceLeads).where(eq(ceLeads.engagementId, e.id)).limit(1);
    const [company] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, o.orgId)).limit(1);
    const who = l?.contactName ?? '[customer contact]';
    const need = l?.requirement ?? '[customer requirement]';
    const text = b.kind === 'introduction'
      ? `Dear ${who},\n\nThank you for speaking with me about ${need.toLowerCase()}. I would like to introduce ${company?.n}, who ${o.description.split('.')[0].toLowerCase()}.\n\nWould you be open to a short call with their team this week? I will stay involved to make sure your questions are answered.\n\nRegards,\n[your name]`
      : b.kind === 'proposal_cover'
        ? `Dear ${who},\n\nPlease find ${company?.n}'s proposal for ${need.toLowerCase()} attached. In summary:\n- Scope: [from the company's quotation]\n- Price and payment terms: [from the quotation]\n- Timeline: [from the quotation]\n\nHappy to arrange a meeting to go through it.\n\nRegards,\n[your name]`
        : `Dear ${who},\n\nI wanted to follow up on ${company?.n}'s proposal for ${need.toLowerCase()}. Do you have any questions, or would a site visit help you decide?\n\nRegards,\n[your name]`;
    return { provider: 'template', label: 'Draft from your COMEARN record — check, complete the [bracketed] parts and send it yourself. AI-written drafts switch on when the AI key is connected.', text,
      stage: CE_STAGES[e.stage as CeStage]?.label };
  }

  // ------------------------------------------------------------------ featured (admin)
  @Put('admin/comearn/opportunities/:id/feature')
  async feature(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), note: z.string().trim().max(300).optional() }))) b: { until: string | null; note?: string }) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const [o] = await this.db.update(ceOpportunities).set({ featuredUntil: b.until, updatedAt: new Date() }).where(eq(ceOpportunities.id, id)).returning();
    if (!o) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'comearn.featured', objectType: 'ce_opportunity', objectId: id, after: { until: b.until, note: b.note } });
    return { featuredUntil: o.featuredUntil };
  }

  @Get('admin/comearn/requirements')
  async adminRequirements(@Ctx() ctx: RequestContext) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const rows = await this.db.select({ r: ceRequirements, org: organizations.displayName, bids: sql<number>`(select count(*) from ce_bids b where b.requirement_id = ${ceRequirements.id})::int` }).from(ceRequirements).innerJoin(organizations, eq(organizations.id, ceRequirements.orgId)).orderBy(desc(ceRequirements.createdAt)).limit(100);
    return { items: rows.map((x) => ({ id: x.r.id, code: x.r.code, title: x.r.title, category: x.r.category, city: x.r.city, status: x.r.status, member: x.org, bids: x.bids })) };
  }
}
void ceDisputes; void CE_TRIGGERS; void rupees;
