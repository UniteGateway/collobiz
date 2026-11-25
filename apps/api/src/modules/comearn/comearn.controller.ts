/**
 * COLLABIZ COMEARN API — Opportunities to Earn (tested in test/comearn.e2e.ts). Feature flag FEATURE_COMEARN.
 *
 * Offer commissions: a verified company posts an opportunity (type, category, commission model, trigger, payment days) and
 * publishes it. Earn commissions: a member joins, accepts the frozen terms (the commission agreement, with a hash), registers
 * a protected lead (first registration of a customer per opportunity owns the introduction), and the company records the
 * remaining stages: quotation, order, verified customer payment (the server computes the commission), approval and transfer.
 * The commission is paid by the posting company directly to the member; COLLABIZ records it. Platform fee and restricted
 * sectors are super-admin settings (fee off by default).
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CE_CATEGORIES, CE_STAGES, CE_STAGE_ORDER, CE_TRIGGERS, CE_TYPES, CeLeadSchema, CeOpportunitySchema, CeStageSchema,
  ceAllocate, ceCommission, ceLeadFingerprint, cePlatformFee, cePotential, type CeStage, type CeTerms,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { ceAllocations, ceCommissions, ceDisputes, ceEngagements, ceEvents, ceLeads, ceOpportunities, ceTeamMembers, commissionEntries, memberships, notifications, organizations, siteSettings } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { canonicalJson, randomDigits, sha256 } from '../../common/crypto';
import { config } from '../../config';

type Opp = typeof ceOpportunities.$inferSelect;
type Eng = typeof ceEngagements.$inferSelect;
interface Settings { platformFeeBps: number; feePayer: 'company' | 'earner'; restrictedCategories: string[]; legalReviewed: boolean }
const DEFAULTS: Settings = { platformFeeBps: 0, feePayer: 'company', restrictedCategories: ['real_estate'], legalReviewed: false };
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const code = (p: string) => `${p}-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
const termsOf = (o: Opp): CeTerms => ({ model: o.model as CeTerms['model'], rateBps: o.rateBps ?? undefined, fixedPaise: o.fixedPaise ?? undefined, milestones: (o.milestones as CeTerms['milestones']) ?? [], recurringMonths: o.recurringMonths ?? undefined, trigger: o.trigger as CeTerms['trigger'], paymentDays: o.paymentDays });
const rank = (s: string) => CE_STAGE_ORDER.indexOf(s as CeStage);
const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Plain-language commission agreement shown to the member before accepting; its hash is stored with the acceptance. */
export function agreementText(o: Opp, company: string) {
  const t = termsOf(o);
  const how = t.model === 'fixed' ? `a fixed commission of ${rupees(t.fixedPaise ?? 0)}` : t.model === 'milestone' ? `${(t.rateBps ?? 0) / 100}% of the verified business value, paid in milestones: ${t.milestones?.map((m) => `${m.label} ${m.pct}%`).join(', ')}` : t.model === 'recurring' ? `${(t.rateBps ?? 0) / 100}% of verified repeat transactions for ${t.recurringMonths} months` : `${(t.rateBps ?? 0) / 100}% of the verified business value`;
  return [
    `COMEARN commission agreement — ${o.title} (${o.code}, terms version ${o.version})`,
    `Paying company: ${company}. Opportunity type: ${CE_TYPES[o.type as keyof typeof CE_TYPES]?.label}. Territory: ${o.territory}.`,
    `1. Commission: ${how}.`,
    `2. When it is earned: ${CE_TRIGGERS[t.trigger]}, verified by the paying company with a reference. Nothing is earned on estimates or unpaid orders.`,
    `3. Payment: within ${t.paymentDays} days of approval, by the paying company directly to the member, less tax deducted at source where applicable (with a certificate).`,
    `4. Lead protection: the first member to register a customer for this opportunity owns that introduction. The company may not bypass a registered introduction for this opportunity.`,
    '5. Disputes: either side can raise a dispute in COMEARN; COLLABIZ reviews the records and rules. Payment of an amount in dispute is held.',
    '6. The member acts independently, not as an employee or agent with authority to bind the company, and must not make claims about the company or its products beyond what the company has published.',
  ].join('\n');
}

@ApiTags('comearn')
@Controller()
export class ComearnController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private on() { if (!config().FEATURE_COMEARN) throw new NotFoundException('COMEARN is not enabled'); }
  private admin(ctx: RequestContext) { const m = ctx.memberships?.find((x) => x.organizationId === ctx.orgId); if (m && !['org_owner', 'org_admin'].includes(m.role)) throw new ForbiddenException('Only owners and admins of your business can do this'); }
  private async settings(): Promise<Settings> { const [s] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, 'comearn')).limit(1); return { ...DEFAULTS, ...((s?.value as Partial<Settings>) ?? {}) }; }
  private async opp(id: string) { const [o] = await this.db.select().from(ceOpportunities).where(or(eq(ceOpportunities.id, id), eq(ceOpportunities.code, id))).limit(1); if (!o) throw new NotFoundException('Opportunity not found'); return o; }
  private async orgName(id: string) { const [o] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, id)).limit(1); return o?.n ?? '—'; }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const team = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin'])));
    if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.u, kind: 'comearn', title, body: text, link })));
  }
  private async eng(ctx: RequestContext, id: string) {
    const [e] = await this.db.select().from(ceEngagements).where(eq(ceEngagements.id, id)).limit(1);
    if (!e) throw new NotFoundException('Not found');
    const o = await this.opp(e.opportunityId);
    let side: 'earner' | 'company' | 'staff' | 'team' | null = e.earnerOrgId === ctx.orgId ? 'earner' : o.orgId === ctx.orgId ? 'company' : staff(ctx) ? 'staff' : null;
    if (!side && ctx.orgId) { const [t] = await this.db.select({ id: ceTeamMembers.id }).from(ceTeamMembers).where(and(eq(ceTeamMembers.engagementId, e.id), eq(ceTeamMembers.orgId, ctx.orgId), eq(ceTeamMembers.status, 'accepted'))).limit(1); if (t) side = 'team'; }
    if (!side) throw new NotFoundException('Not found');
    return { e, o, side };
  }
  private async event(e: Eng, ctx: RequestContext, stage: string, x: { note?: string; amountPaise?: number; reference?: string } = {}) {
    await this.db.insert(ceEvents).values({ engagementId: e.id, stage, note: x.note ?? null, amountPaise: x.amountPaise ?? null, reference: x.reference ?? null, byUserId: ctx.userId, byOrgId: ctx.orgId! });
  }
  private card(o: Opp, company: string, extra: Record<string, unknown> = {}) {
    const t = termsOf(o);
    return { id: o.id, code: o.code, title: o.title, type: o.type, typeLabel: CE_TYPES[o.type as keyof typeof CE_TYPES]?.label, category: o.category, territory: o.territory, model: o.model, rateBps: o.rateBps, fixedPaise: o.fixedPaise,
      trigger: o.trigger, estimatedValuePaise: o.estimatedValuePaise, potentialPaise: cePotential(t, o.estimatedValuePaise), status: o.status, company,
      featured: !!o.featuredUntil && o.featuredUntil >= new Date().toISOString().slice(0, 10), source: o.source ?? null, ...extra };
  }

  // ------------------------------------------------------------------ home
  @Get('comearn/home')
  @RequireOrg()
  async home(@Ctx() ctx: RequestContext) {
    this.on();
    const org = ctx.orgId!;
    const [money] = (await this.db.execute(sql`select coalesce(sum(net_paise) filter (where status = 'paid'),0)::bigint earned, coalesce(sum(gross_paise) filter (where status in ('pending_approval','approved')),0)::bigint pending from ce_commissions where earner_org_id = ${org}`) as unknown as { rows: { earned: number; pending: number }[] }).rows;
    const mine = await this.db.select({ e: ceEngagements, o: ceOpportunities, lead: ceLeads.estimatedValuePaise }).from(ceEngagements).innerJoin(ceOpportunities, eq(ceOpportunities.id, ceEngagements.opportunityId)).leftJoin(ceLeads, eq(ceLeads.engagementId, ceEngagements.id))
      .where(and(eq(ceEngagements.earnerOrgId, org), eq(ceEngagements.status, 'active')));
    const potential = mine.filter((x) => rank(x.e.stage) < rank('payment_verified')).reduce((s, x) => s + (cePotential(termsOf(x.o), x.lead ?? x.o.estimatedValuePaise) ?? 0), 0);
    const live = await this.db.select({ o: ceOpportunities, company: organizations.displayName }).from(ceOpportunities).innerJoin(organizations, eq(organizations.id, ceOpportunities.orgId)).where(and(eq(ceOpportunities.status, 'live'), ne(ceOpportunities.orgId, org))).orderBy(desc(ceOpportunities.updatedAt)).limit(200);
    const joined = new Set(mine.map((x) => x.o.id));
    // Rules-based recommendations (no AI): categories I already earn in first, then newest. Labelled as such on screen.
    const myCats = new Set(mine.map((x) => x.o.category));
    const recommended = live.filter((x) => !joined.has(x.o.id)).sort((a, b) => Number(myCats.has(b.o.category)) - Number(myCats.has(a.o.category))).slice(0, 4).map((x) => this.card(x.o, x.company, { why: myCats.has(x.o.category) ? `You already earn in ${CE_CATEGORIES[x.o.category as keyof typeof CE_CATEGORIES]}` : 'New opportunity' }));
    const categories = Object.fromEntries(Object.keys(CE_CATEGORIES).map((k) => [k, live.filter((x) => x.o.category === k).length]));
    const [posted] = (await this.db.execute(sql`select count(*) filter (where status = 'live')::int live, count(*)::int total from ce_opportunities where org_id = ${org}`) as unknown as { rows: { live: number; total: number }[] }).rows;
    const [toAct] = (await this.db.execute(sql`select count(*)::int n from ce_engagements e join ce_opportunities o on o.id = e.opportunity_id where o.org_id = ${org} and e.status = 'active' and e.stage in ('lead_registered','quoted','order_confirmed','payment_verified','commission_approved')`) as unknown as { rows: { n: number }[] }).rows;
    return {
      earnedPaise: Number(money.earned), pendingPaise: Number(money.pending), potentialPaise: potential, activeOpportunities: live.length,
      myEngagements: mine.length, categories, recommended,
      tracker: mine.slice(0, 5).map((x) => ({ id: x.e.id, title: x.o.title, stage: x.e.stage, stageLabel: CE_STAGES[x.e.stage as CeStage]?.label, step: rank(x.e.stage) + 1 })),
      company: { posted: posted.total, live: posted.live, toAct: toAct.n },
    };
  }

  // ------------------------------------------------------------------ marketplace
  @Get('comearn/opportunities')
  @RequireOrg()
  async list(@Ctx() ctx: RequestContext, @Query('category') category?: string, @Query('type') type?: string, @Query('q') q?: string) {
    this.on();
    const rows = await this.db.select({ o: ceOpportunities, company: organizations.displayName, earners: sql<number>`(select count(*) from ce_engagements e where e.opportunity_id = ${ceOpportunities.id})::int` })
      .from(ceOpportunities).innerJoin(organizations, eq(organizations.id, ceOpportunities.orgId))
      .where(and(eq(ceOpportunities.status, 'live'), category && category !== 'all' ? eq(ceOpportunities.category, category) : undefined, type ? eq(ceOpportunities.type, type) : undefined,
        q ? sql`(${ceOpportunities.title} ilike ${'%' + q + '%'} or ${ceOpportunities.description} ilike ${'%' + q + '%'})` : undefined))
      .orderBy(sql`(${ceOpportunities.featuredUntil} >= current_date) desc nulls last`, desc(ceOpportunities.updatedAt)).limit(100);
    return { items: rows.map((r) => this.card(r.o, r.company, { earners: r.earners, mine: r.o.orgId === ctx.orgId })) };
  }

  @Get('comearn/opportunities/:id')
  @RequireOrg()
  async detail(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    this.on(); const o = await this.opp(id);
    const mine = o.orgId === ctx.orgId;
    if (o.status !== 'live' && !mine && !staff(ctx)) throw new NotFoundException('Opportunity not found');
    const company = await this.orgName(o.orgId);
    const [me] = await this.db.select().from(ceEngagements).where(and(eq(ceEngagements.opportunityId, o.id), eq(ceEngagements.earnerOrgId, ctx.orgId!))).limit(1);
    const [n] = (await this.db.execute(sql`select count(*)::int n from ce_engagements where opportunity_id = ${o.id}`) as unknown as { rows: { n: number }[] }).rows;
    const s = await this.settings();
    return { ...this.card(o, company, { earners: n.n, mine }), description: o.description, idealEarner: o.idealEarner, milestones: o.milestones, recurringMonths: o.recurringMonths, paymentDays: o.paymentDays, maxEarners: o.maxEarners, licenceNote: o.licenceNote, version: o.version,
      restricted: s.restrictedCategories.includes(o.category), agreement: agreementText(o, company), engagement: me ? { id: me.id, stage: me.stage, status: me.status } : null };
  }

  // ------------------------------------------------------------------ offer commissions (company side)
  @Post('comearn/opportunities')
  @RequireOrg()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(CeOpportunitySchema)) b: z.infer<typeof CeOpportunitySchema>) {
    this.on(); this.admin(ctx);
    const [o] = await this.db.insert(ceOpportunities).values({ code: code('CE'), orgId: ctx.orgId!, title: b.title, type: b.type, category: b.category, description: b.description, idealEarner: b.idealEarner ?? null, territory: b.territory,
      estimatedValuePaise: b.estimatedValuePaise ?? null, model: b.model, rateBps: b.model === 'fixed' ? null : b.rateBps ?? null, fixedPaise: b.model === 'fixed' ? b.fixedPaise ?? null : null, milestones: b.model === 'milestone' ? b.milestones : [],
      recurringMonths: b.model === 'recurring' ? b.recurringMonths ?? null : null, trigger: b.trigger, paymentDays: b.paymentDays, maxEarners: b.maxEarners ?? null, licenceNote: b.licenceNote ?? null, source: b.source ?? null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'comearn.opportunity_created', objectType: 'ce_opportunity', objectId: o.id, after: { code: o.code } });
    return { id: o.id, code: o.code, status: o.status, potentialPaise: cePotential(termsOf(o), o.estimatedValuePaise) };
  }

  /** Changing terms of a published opportunity bumps the version; members who already accepted keep the terms they accepted. */
  @Put('comearn/opportunities/:id')
  @RequireOrg()
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeOpportunitySchema)) b: z.infer<typeof CeOpportunitySchema>) {
    this.on(); this.admin(ctx); const o = await this.opp(id);
    if (o.orgId !== ctx.orgId) throw new ForbiddenException();
    if (o.status === 'closed') throw new ConflictException('Closed opportunities cannot be changed');
    const [u] = await this.db.update(ceOpportunities).set({ title: b.title, type: b.type, category: b.category, description: b.description, idealEarner: b.idealEarner ?? null, territory: b.territory, estimatedValuePaise: b.estimatedValuePaise ?? null,
      model: b.model, rateBps: b.model === 'fixed' ? null : b.rateBps ?? null, fixedPaise: b.model === 'fixed' ? b.fixedPaise ?? null : null, milestones: b.model === 'milestone' ? b.milestones : [], recurringMonths: b.model === 'recurring' ? b.recurringMonths ?? null : null,
      trigger: b.trigger, paymentDays: b.paymentDays, maxEarners: b.maxEarners ?? null, licenceNote: b.licenceNote ?? null, version: o.version + 1, updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id)).returning();
    return { id: u.id, version: u.version };
  }

  @Post('comearn/opportunities/:id/status')
  @RequireOrg()
  @HttpCode(200)
  async setStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['live', 'paused', 'closed']) }))) b: { status: 'live' | 'paused' | 'closed' }) {
    this.on(); this.admin(ctx); const o = await this.opp(id);
    if (o.orgId !== ctx.orgId) throw new ForbiddenException();
    if (o.status === 'closed') throw new ConflictException('This opportunity is closed');
    if (b.status === 'live') {
      const [org] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
      if (org?.v !== 'verified') throw new ForbiddenException('Only verified businesses can publish earning opportunities. Complete your business verification first.');
      const s = await this.settings();
      if (s.restrictedCategories.includes(o.category) && !o.licenceNote) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { licenceNote: `${CE_CATEGORIES[o.category as keyof typeof CE_CATEGORIES]} is a regulated sector. Add your licence or registration number (for example RERA) before publishing.` } });
    }
    await this.db.update(ceOpportunities).set({ status: b.status, updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.audit.record(ctx, { action: `comearn.opportunity_${b.status}`, objectType: 'ce_opportunity', objectId: o.id });
    return { status: b.status };
  }

  @Get('comearn/offer')
  @RequireOrg()
  async myOffers(@Ctx() ctx: RequestContext) {
    this.on();
    const opps = await this.db.select().from(ceOpportunities).where(eq(ceOpportunities.orgId, ctx.orgId!)).orderBy(desc(ceOpportunities.updatedAt));
    const engs = opps.length ? await this.db.select({ e: ceEngagements, earner: organizations.displayName, lead: ceLeads.customerName }).from(ceEngagements).innerJoin(organizations, eq(organizations.id, ceEngagements.earnerOrgId)).leftJoin(ceLeads, eq(ceLeads.engagementId, ceEngagements.id))
      .where(inArray(ceEngagements.opportunityId, opps.map((o) => o.id))).orderBy(desc(ceEngagements.updatedAt)) : [];
    const owed = (await this.db.execute(sql`select coalesce(sum(gross_paise) filter (where status in ('pending_approval','approved')),0)::bigint owed, coalesce(sum(gross_paise) filter (where status = 'paid'),0)::bigint paid from ce_commissions where payer_org_id = ${ctx.orgId}`) as unknown as { rows: { owed: number; paid: number }[] }).rows[0];
    return { owedPaise: Number(owed.owed), paidPaise: Number(owed.paid),
      opportunities: opps.map((o) => ({ ...this.card(o, ''), version: o.version, engagements: engs.filter((x) => x.e.opportunityId === o.id).map((x) => ({ id: x.e.id, code: x.e.code, earner: x.earner, stage: x.e.stage, stageLabel: CE_STAGES[x.e.stage as CeStage]?.label, status: x.e.status, customer: x.lead })) })) };
  }

  // ------------------------------------------------------------------ earn commissions (member side)
  @Post('comearn/opportunities/:id/join')
  @RequireOrg()
  @HttpCode(201)
  async join(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const o = await this.opp(id);
    if (o.status !== 'live') throw new NotFoundException('Opportunity not found');
    if (o.orgId === ctx.orgId) throw new BadRequestException('You cannot earn commission on your own company’s opportunity');
    if (o.maxEarners) { const [n] = (await this.db.execute(sql`select count(*)::int n from ce_engagements where opportunity_id = ${o.id} and status <> 'withdrawn'`) as unknown as { rows: { n: number }[] }).rows; if (n.n >= o.maxEarners) throw new ConflictException('This opportunity has all the members it needs'); }
    const [e] = await this.db.insert(ceEngagements).values({ code: code('CEE'), opportunityId: o.id, earnerOrgId: ctx.orgId!, earnerUserId: ctx.userId }).onConflictDoNothing().returning();
    if (!e) throw new ConflictException('You have already joined this opportunity');
    await this.event(e, ctx, 'selected');
    return { id: e.id, stage: e.stage, agreement: agreementText(o, await this.orgName(o.orgId)), termsHash: sha256(canonicalJson({ ...termsOf(o), version: o.version, id: o.id })) };
  }

  @Get('comearn/my')
  @RequireOrg()
  async my(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select({ e: ceEngagements, o: ceOpportunities, company: organizations.displayName, customer: ceLeads.customerName, leadValue: ceLeads.estimatedValuePaise }).from(ceEngagements)
      .innerJoin(ceOpportunities, eq(ceOpportunities.id, ceEngagements.opportunityId)).innerJoin(organizations, eq(organizations.id, ceOpportunities.orgId)).leftJoin(ceLeads, eq(ceLeads.engagementId, ceEngagements.id))
      .where(eq(ceEngagements.earnerOrgId, ctx.orgId!)).orderBy(desc(ceEngagements.updatedAt));
    return { items: rows.map((r) => ({ id: r.e.id, code: r.e.code, stage: r.e.stage, stageLabel: CE_STAGES[r.e.stage as CeStage]?.label, step: rank(r.e.stage) + 1, status: r.e.status, customer: r.customer,
      opportunity: this.card(r.o, r.company), potentialPaise: cePotential((r.e.terms ?? termsOf(r.o)) as CeTerms, r.leadValue ?? r.o.estimatedValuePaise) })) };
  }

  @Post('comearn/engagements/:id/accept')
  @RequireOrg()
  @HttpCode(200)
  async accept(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ termsHash: z.string().length(64), confirm: z.literal(true, { message: 'Tick to accept the agreement' }) }))) b: { termsHash: string }) {
    this.on(); this.admin(ctx); const { e, o, side } = await this.eng(ctx, id);
    if (side !== 'earner') throw new ForbiddenException();
    if (e.stage !== 'selected') throw new ConflictException('Already accepted');
    const terms = { ...termsOf(o), version: o.version, id: o.id };
    const h = sha256(canonicalJson(terms));
    if (h !== b.termsHash) throw new ConflictException('The company changed the terms. Reload and read the new agreement before accepting.');
    await this.db.update(ceEngagements).set({ stage: 'agreement_accepted', terms: { ...terms, text: agreementText(o, await this.orgName(o.orgId)) }, termsHash: h, acceptedAt: new Date(), updatedAt: new Date() }).where(eq(ceEngagements.id, e.id));
    await this.event(e, ctx, 'agreement_accepted', { reference: h.slice(0, 16) });
    await this.audit.record(ctx, { action: 'comearn.agreement_accepted', objectType: 'ce_engagement', objectId: e.id, after: { termsHash: h } });
    return { stage: 'agreement_accepted', termsHash: h };
  }

  @Post('comearn/engagements/:id/lead')
  @RequireOrg()
  @HttpCode(201)
  async registerLead(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeLeadSchema)) l: z.infer<typeof CeLeadSchema>) {
    this.on(); const { e, o, side } = await this.eng(ctx, id);
    if (side !== 'earner') throw new ForbiddenException();
    if (e.stage !== 'agreement_accepted') throw new ConflictException(e.stage === 'selected' ? 'Accept the commission agreement first' : 'A lead is already registered on this engagement');
    const fingerprint = ceLeadFingerprint(l);
    const cert = code('CEL');
    const record = { opportunity: o.code, engagement: e.code, customer: l.customerName, city: l.city, fingerprint, at: new Date().toISOString() };
    const [lead] = await this.db.insert(ceLeads).values({ engagementId: e.id, opportunityId: o.id, certificateCode: cert, customerName: l.customerName, customerCompany: l.customerCompany ?? null, city: l.city, contactName: l.contactName, phone: l.phone ?? null, email: l.email ?? null,
      gstin: l.gstin ?? null, requirement: l.requirement, estimatedValuePaise: l.estimatedValuePaise ?? null, fingerprint, recordHash: sha256(canonicalJson(record)) }).onConflictDoNothing().returning();
    if (!lead) throw new ConflictException('This customer has already been introduced for this opportunity by another member. The first registration owns the introduction.');
    await this.db.update(ceEngagements).set({ stage: 'lead_registered', updatedAt: new Date() }).where(eq(ceEngagements.id, e.id));
    await this.event(e, ctx, 'lead_registered', { reference: cert });
    await this.notifyOrg(o.orgId, `COMEARN: new customer introduced — ${o.title}`, `${l.customerName}, ${l.city}. Lead certificate ${cert}.`, `/comearn/engagements/${e.id}`);
    return { certificateCode: cert, recordHash: lead.recordHash, stage: 'lead_registered' };
  }

  @Get('comearn/engagements/:id')
  @RequireOrg()
  async engagement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const { e, o, side } = await this.eng(ctx, id);
    const [lead] = await this.db.select().from(ceLeads).where(eq(ceLeads.engagementId, e.id)).limit(1);
    const events = await this.db.select().from(ceEvents).where(eq(ceEvents.engagementId, e.id)).orderBy(ceEvents.createdAt);
    const comms = await this.db.select().from(ceCommissions).where(eq(ceCommissions.engagementId, e.id)).orderBy(ceCommissions.createdAt);
    const disputes = await this.db.select().from(ceDisputes).where(eq(ceDisputes.engagementId, e.id)).orderBy(desc(ceDisputes.createdAt));
    const team = await this.db.select({ t: ceTeamMembers, org: organizations.displayName }).from(ceTeamMembers).innerJoin(organizations, eq(organizations.id, ceTeamMembers.orgId)).where(eq(ceTeamMembers.engagementId, e.id)).orderBy(ceTeamMembers.createdAt);
    const allocations = comms.length ? await this.db.select().from(ceAllocations).where(inArray(ceAllocations.commissionId, comms.map((c) => c.id))) : [];
    const visibleAlloc = side === 'team' ? allocations.filter((a) => a.orgId === ctx.orgId) : side === 'company' ? [] : allocations;
    const safeLead = lead && side === 'team' ? { ...lead, phone: null, email: null, gstin: null, contactName: '—' } : lead;
    return { id: e.id, code: e.code, stage: e.stage, status: e.status, side, acceptedAt: e.acceptedAt, termsHash: e.termsHash, agreement: (e.terms as { text?: string } | null)?.text ?? null,
      team: team.map((x) => ({ id: x.t.id, org: x.org, orgId: x.t.orgId, role: x.t.role, sharePct: x.t.sharePct / 100, status: x.t.status, matchPercent: x.t.matchPercent, matchReasons: x.t.matchReasons, mine: x.t.orgId === ctx.orgId })),
      allocations: visibleAlloc,
      opportunity: { ...this.card(o, await this.orgName(o.orgId)), milestones: o.milestones, paymentDays: o.paymentDays }, earner: await this.orgName(e.earnerOrgId),
      stages: CE_STAGE_ORDER.map((s) => ({ key: s, label: CE_STAGES[s].label, by: CE_STAGES[s].by, done: rank(e.stage) >= rank(s), at: events.find((x) => x.stage === s)?.createdAt ?? null })),
      lead: safeLead ?? null, events, commissions: side === 'team' ? [] : comms, disputes: side === 'team' ? [] : disputes };
  }

  /** Company records quotation, order, verified customer payment (creates the commission), approval and transfer. */
  @Post('comearn/engagements/:id/stage')
  @RequireOrg()
  @HttpCode(200)
  async stage(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CeStageSchema)) b: z.infer<typeof CeStageSchema>) {
    this.on(); this.admin(ctx); const { e, o, side } = await this.eng(ctx, id);
    if (side !== 'company') throw new ForbiddenException('Only the paying company records this stage');
    if (e.status === 'disputed') throw new ConflictException('This engagement is in dispute. COLLABIZ will rule before it continues.');
    if (e.status !== 'active') throw new ConflictException('This engagement is closed');
    const cur = rank(e.stage);
    const need = (min: CeStage) => { if (cur < rank(min)) throw new ConflictException(`First complete: ${CE_STAGES[min].label}`); };
    const t = (e.terms ?? termsOf(o)) as CeTerms;
    let advance: CeStage | null = null; let commission: unknown = null;
    if (b.stage === 'quoted') { need('lead_registered'); advance = 'quoted'; }
    else if (b.stage === 'order_confirmed') { need('quoted'); if (!b.amountPaise) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { amountPaise: 'Enter the order value' } }); advance = 'order_confirmed'; }
    else if (b.stage === 'payment_verified') {
      need('order_confirmed');
      if (!b.amountPaise || !b.reference) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { ...(!b.amountPaise ? { amountPaise: 'Enter the verified amount' } : {}), ...(!b.reference ? { reference: 'Enter the invoice or payment reference' } : {}) } });
      if (t.model === 'milestone' && b.milestoneIndex == null) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { milestoneIndex: 'Choose the milestone' } });
      if (t.model !== 'recurring' && t.model !== 'milestone') { const [x] = await this.db.select({ id: ceCommissions.id }).from(ceCommissions).where(and(eq(ceCommissions.engagementId, e.id), ne(ceCommissions.status, 'cancelled'))).limit(1); if (x) throw new ConflictException('Commission for this engagement is already recorded'); }
      if (t.model === 'milestone') { const [x] = await this.db.select({ id: ceCommissions.id }).from(ceCommissions).where(and(eq(ceCommissions.engagementId, e.id), eq(ceCommissions.milestoneIndex, b.milestoneIndex!), ne(ceCommissions.status, 'cancelled'))).limit(1); if (x) throw new ConflictException('Commission for this milestone is already recorded'); }
      const gross = ceCommission(t, b.amountPaise, b.milestoneIndex);
      const s = await this.settings();
      const due = new Date(Date.now() + t.paymentDays * 86400000).toISOString().slice(0, 10);
      const m = t.model === 'milestone' ? t.milestones?.[b.milestoneIndex!] : null;
      const [c] = await this.db.insert(ceCommissions).values({ engagementId: e.id, payerOrgId: o.orgId, earnerOrgId: e.earnerOrgId, description: `${o.title}${m ? ` — ${m.label}` : ''} (${CE_TRIGGERS[t.trigger]}, ref ${b.reference})`, milestoneIndex: b.milestoneIndex ?? null,
        basePaise: b.amountPaise, grossPaise: gross, netPaise: gross, platformFeeBps: s.platformFeeBps, platformFeePaise: cePlatformFee(gross, s.platformFeeBps), platformFeePayer: s.platformFeeBps ? s.feePayer : null, dueOn: due, verifiedBy: ctx.userId }).returning();
      commission = c; advance = cur < rank('payment_verified') ? 'payment_verified' : null;
    } else if (b.stage === 'commission_approved') {
      const [c] = await this.db.select().from(ceCommissions).where(and(eq(ceCommissions.engagementId, e.id), eq(ceCommissions.status, 'pending_approval'))).orderBy(ceCommissions.createdAt).limit(1);
      if (!c) throw new ConflictException('There is no commission waiting for approval');
      await this.db.update(ceCommissions).set({ status: 'approved', approvedBy: ctx.userId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(ceCommissions.id, c.id));
      commission = { ...c, status: 'approved' }; advance = cur < rank('commission_approved') ? 'commission_approved' : null;
    } else if (b.stage === 'commission_paid') {
      const [c] = await this.db.select().from(ceCommissions).where(and(eq(ceCommissions.engagementId, e.id), eq(ceCommissions.status, 'approved'))).orderBy(ceCommissions.createdAt).limit(1);
      if (!c) throw new ConflictException('Approve the commission before recording the transfer');
      if (!b.reference) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { reference: 'Enter the bank transfer reference' } });
      const tds = b.tdsPaise ?? 0;
      if (tds > c.grossPaise) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { tdsPaise: 'Tax deducted cannot exceed the commission' } });
      const net = c.grossPaise - tds - (c.platformFeePayer === 'earner' ? c.platformFeePaise : 0);
      await this.db.update(ceCommissions).set({ status: 'paid', tdsPaise: tds, netPaise: net, paidAt: new Date(), paymentReference: b.reference, tdsCertificateRef: b.tdsCertificateRef ?? null, updatedAt: new Date() }).where(eq(ceCommissions.id, c.id));
      // Team pool: the lead member owes each accepted team member their agreed share of what was received.
      const team = await this.db.select().from(ceTeamMembers).where(and(eq(ceTeamMembers.engagementId, e.id), eq(ceTeamMembers.status, 'accepted')));
      if (team.length) {
        const others = team.map((t) => t.sharePct);
        const parts = ceAllocate(net, [10000 - others.reduce((a, x) => a + x, 0), ...others]);
        await this.db.insert(ceAllocations).values(team.map((t, i) => ({ commissionId: c.id, teamMemberId: t.id, orgId: t.orgId, amountPaise: parts[i + 1] }))).onConflictDoNothing();
        for (const t of team) await this.notifyOrg(t.orgId, `COMEARN: your team share is due — ${o.title}`, 'The lead member received the commission and owes your agreed share.', `/comearn/engagements/${e.id}`);
      }
      commission = { ...c, status: 'paid' }; advance = cur < rank('commission_paid') ? 'commission_paid' : null;
    }
    if (advance) await this.db.update(ceEngagements).set({ stage: advance, updatedAt: new Date() }).where(eq(ceEngagements.id, e.id));
    await this.event(e, ctx, b.stage, { note: b.note, amountPaise: b.amountPaise, reference: b.reference });
    await this.notifyOrg(e.earnerOrgId, `COMEARN: ${CE_STAGES[b.stage].label} — ${o.title}`, b.note ?? '', `/comearn/engagements/${e.id}`);
    await this.audit.record(ctx, { action: `comearn.${b.stage}`, objectType: 'ce_engagement', objectId: e.id, after: { amountPaise: b.amountPaise, reference: b.reference } });
    return { stage: advance ?? e.stage, commission };
  }

  @Post('comearn/commissions/:id/received')
  @RequireOrg()
  @HttpCode(200)
  async received(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const [c] = await this.db.select().from(ceCommissions).where(eq(ceCommissions.id, id)).limit(1);
    if (!c || c.earnerOrgId !== ctx.orgId) throw new NotFoundException();
    if (c.status !== 'paid') throw new ConflictException('Not marked as paid yet');
    await this.db.update(ceCommissions).set({ receivedConfirmedAt: new Date(), updatedAt: new Date() }).where(eq(ceCommissions.id, id));
    return { received: true };
  }

  @Post('comearn/engagements/:id/dispute')
  @RequireOrg()
  @HttpCode(201)
  async dispute(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(20).max(2000) }))) b: { reason: string }) {
    this.on(); const { e, o, side } = await this.eng(ctx, id);
    if (side === 'staff') throw new ForbiddenException();
    const [open] = await this.db.select({ id: ceDisputes.id }).from(ceDisputes).where(and(eq(ceDisputes.engagementId, e.id), eq(ceDisputes.status, 'open'))).limit(1);
    if (open) throw new ConflictException('A dispute is already open');
    const [d] = await this.db.insert(ceDisputes).values({ engagementId: e.id, raisedByOrgId: ctx.orgId!, raisedBy: ctx.userId, reason: b.reason }).returning();
    await this.db.update(ceEngagements).set({ status: 'disputed', updatedAt: new Date() }).where(eq(ceEngagements.id, e.id));
    await this.db.update(ceCommissions).set({ status: 'disputed', updatedAt: new Date() }).where(and(eq(ceCommissions.engagementId, e.id), inArray(ceCommissions.status, ['pending_approval', 'approved'])));
    await this.notifyOrg(side === 'earner' ? o.orgId : e.earnerOrgId, `COMEARN dispute raised — ${o.title}`, b.reason.slice(0, 160), `/comearn/engagements/${e.id}`);
    await this.audit.record(ctx, { action: 'comearn.dispute_raised', objectType: 'ce_engagement', objectId: e.id });
    return d;
  }

  /** My commissions: COMEARN (paid by companies) and the existing Unite commission ledger, shown side by side. */
  @Get('comearn/earnings')
  @RequireOrg()
  async earnings(@Ctx() ctx: RequestContext) {
    this.on();
    const rows = await this.db.select({ c: ceCommissions, payer: organizations.displayName, opp: ceOpportunities.title }).from(ceCommissions).innerJoin(organizations, eq(organizations.id, ceCommissions.payerOrgId))
      .innerJoin(ceEngagements, eq(ceEngagements.id, ceCommissions.engagementId)).innerJoin(ceOpportunities, eq(ceOpportunities.id, ceEngagements.opportunityId)).where(eq(ceCommissions.earnerOrgId, ctx.orgId!)).orderBy(desc(ceCommissions.createdAt));
    const unite = await this.db.select({ status: commissionEntries.status, payable: sql<number>`coalesce(sum(${commissionEntries.payable}),0)::bigint` }).from(commissionEntries).where(eq(commissionEntries.beneficiaryOrgId, ctx.orgId!)).groupBy(commissionEntries.status);
    return { comearn: rows.map((r) => ({ ...r.c, payer: r.payer, opportunity: r.opp })), uniteLedger: unite.map((u) => ({ status: u.status, payablePaise: Number(u.payable) })) };
  }

  // ------------------------------------------------------------------ admin
  @Get('admin/comearn/overview')
  async adminOverview(@Ctx() ctx: RequestContext) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const counts = (await this.db.execute(sql`select (select count(*) from ce_opportunities where status = 'live')::int live, (select count(*) from ce_opportunities)::int opportunities, (select count(*) from ce_engagements)::int engagements, (select count(*) from ce_leads)::int leads,
      (select coalesce(sum(gross_paise),0) from ce_commissions where status = 'paid')::bigint paid, (select coalesce(sum(gross_paise),0) from ce_commissions where status in ('pending_approval','approved'))::bigint pending, (select coalesce(sum(platform_fee_paise),0) from ce_commissions where status = 'paid')::bigint fees`) as unknown as { rows: Record<string, number>[] }).rows[0];
    const disputes = await this.db.select({ d: ceDisputes, e: ceEngagements, title: ceOpportunities.title, raisedBy: organizations.displayName }).from(ceDisputes).innerJoin(ceEngagements, eq(ceEngagements.id, ceDisputes.engagementId)).innerJoin(ceOpportunities, eq(ceOpportunities.id, ceEngagements.opportunityId))
      .innerJoin(organizations, eq(organizations.id, ceDisputes.raisedByOrgId)).orderBy(desc(ceDisputes.createdAt)).limit(50);
    const opps = await this.db.select({ o: ceOpportunities, company: organizations.displayName }).from(ceOpportunities).innerJoin(organizations, eq(organizations.id, ceOpportunities.orgId)).orderBy(desc(ceOpportunities.updatedAt)).limit(50);
    return { counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])), settings: await this.settings(),
      disputes: disputes.map((x) => ({ ...x.d, engagementCode: x.e.code, opportunity: x.title, raisedByOrg: x.raisedBy })), opportunities: opps.map((x) => this.card(x.o, x.company)) };
  }

  @Put('admin/comearn/settings')
  async saveSettings(@Ctx() ctx: RequestContext, @Body(body(z.object({ platformFeeBps: z.number().int().min(0).max(3000), feePayer: z.enum(['company', 'earner']), restrictedCategories: z.array(z.enum(Object.keys(CE_CATEGORIES) as [string, ...string[]])).max(8), legalReviewed: z.boolean() }))) b: Settings) {
    this.on(); if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin changes COMEARN fees and restricted sectors');
    if (b.platformFeeBps > 0 && !b.legalReviewed) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { legalReviewed: 'Confirm legal and tax review before switching on a platform fee' } });
    await this.db.insert(siteSettings).values({ key: 'comearn', value: b, updatedBy: ctx.userId }).onConflictDoUpdate({ target: siteSettings.key, set: { value: b, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: 'comearn.settings', objectType: 'site_settings', objectId: 'comearn', after: b });
    return b;
  }

  @Post('admin/comearn/opportunities/:id/pause')
  @HttpCode(200)
  async adminPause(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(400) }))) b: { reason: string }) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const o = await this.opp(id);
    await this.db.update(ceOpportunities).set({ status: 'paused', updatedAt: new Date() }).where(eq(ceOpportunities.id, o.id));
    await this.notifyOrg(o.orgId, `COMEARN: ${o.title} paused by COLLABIZ`, b.reason, `/comearn/offer`);
    await this.audit.record(ctx, { action: 'comearn.opportunity_paused_by_admin', objectType: 'ce_opportunity', objectId: o.id, reason: b.reason });
    return { status: 'paused' };
  }

  @Post('admin/comearn/disputes/:id/rule')
  @HttpCode(200)
  async rule(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ ruling: z.string().trim().min(10).max(2000), outcome: z.enum(['continue', 'cancel_commission']) }))) b: { ruling: string; outcome: 'continue' | 'cancel_commission' }) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const [d] = await this.db.select().from(ceDisputes).where(eq(ceDisputes.id, id)).limit(1);
    if (!d) throw new NotFoundException(); if (d.status !== 'open') throw new ConflictException('Already ruled');
    await this.db.update(ceDisputes).set({ status: 'resolved', ruling: b.ruling, ruledBy: ctx.userId, ruledAt: new Date() }).where(eq(ceDisputes.id, id));
    await this.db.update(ceEngagements).set({ status: 'active', updatedAt: new Date() }).where(eq(ceEngagements.id, d.engagementId));
    const restore = b.outcome === 'continue' ? sql`case when approved_at is not null then 'approved' else 'pending_approval' end` : sql`'cancelled'`;
    await this.db.update(ceCommissions).set({ status: restore, updatedAt: new Date() }).where(and(eq(ceCommissions.engagementId, d.engagementId), eq(ceCommissions.status, 'disputed')));
    await this.audit.record(ctx, { action: 'comearn.dispute_ruled', objectType: 'ce_dispute', objectId: id, after: { outcome: b.outcome } });
    return { status: 'resolved', outcome: b.outcome };
  }
}

