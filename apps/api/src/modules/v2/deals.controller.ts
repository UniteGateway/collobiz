/**
 * V2 Stage 01 + 02 — Deal Passport and AI project team plans.
 *
 * Deal Passport (tested in test/v2-deals.e2e.ts):
 *  - Issued once Unite has protected (or ruled on) a registered lead. It joins what COLLABIZ already records — ownership,
 *    consent, priority review, duplicate rulings, documents, agreed participation, contract and milestones, audit history.
 *  - Visible to the registering partner, Unite staff, and organisations the owner adds — those only after accepting a
 *    confidentiality undertaking; they never see the customer's contact details. Every party view is logged.
 *  - Never an unconditional promise of commission: rights follow signed commercial agreements.
 * Team plans:
 *  - Built for an opportunity, project or tender: roles with responsibilities, ranked verified candidates with reasons,
 *    capability gaps (no verified candidate, or only self-declared certificates) and a draft responsibility matrix.
 *  - The owner invites candidates; invitees accept or decline; the owner approves the plan, which creates a normal
 *    collaboration team whose members still sign the team NDA. Nobody is contacted automatically.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  PASSPORT_ELIGIBLE_CLAIM_STATES, PassportNdaSchema, PassportPartySchema, RESPONSIBILITIES, TeamPlanInviteSchema, TeamPlanSourceSchema, passportNdaText, rankPartners, responsibilityMatrix, sectorName,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  aiSettings, aiSuggestions, auditEvents, collaborationTeams, commissionAgreements, contracts, customers, dealPassportParties, dealPassports, duplicateCandidates, groupCompanies, leadClaims, leadDocuments,
  memberships, milestones, notifications, opportunities, opportunityEvents, organizations, partnerProfiles, projects, routingEvents, teamMembers, teamPlanInvites, teamPlans, tenders, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';
import { config } from '../../config';
import { ReputationService } from '../growth/growth.controller';

const PARTNER = ['partner_company', 'partner_individual'];
const platform = (ctx: RequestContext) => ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));

@Injectable()
export class V2Service {
  constructor(@InjectDb() private db: Db, private rep: ReputationService) {}
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  async orgName(id: string) { return (await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, id)))[0]?.n ?? '—'; }
  /** Verified partners with reputation, for matching. */
  async partners(exceptOrg: string) {
    const list = await this.db.select({ o: organizations, p: partnerProfiles }).from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.verificationStatus, 'verified'), ne(organizations.id, exceptOrg), inArray(organizations.type, PARTNER)));
    return Promise.all(list.map(async (r) => ({ id: r.o.id, name: r.o.displayName, sectors: r.p.sectors, regions: r.p.regions, capacityMax: r.p.capacityMax, certifications: r.p.certifications, reputationScore: (await this.rep.score(r.o.id)).score, verified: true, consentToMatch: true, level: r.o.membershipLevel })));
  }
}

@ApiTags('v2 deals')
@Controller()
export class DealsController {
  constructor(@InjectDb() private db: Db, private svc: V2Service, private audit: AuditService) {}

  // ================= Deal Passport =================
  private async passportFor(claimId: string) {
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, claimId)).limit(1);
    if (!claim) throw new NotFoundException('Lead not found');
    const [p] = await this.db.select().from(dealPassports).where(eq(dealPassports.claimId, claimId)).limit(1);
    return { claim, p };
  }
  private async access(ctx: RequestContext, claim: typeof leadClaims.$inferSelect, passportId: string | null) {
    if (ctx.memberships.some((m) => m.organizationId === claim.introducerOrgId)) return { level: 'owner' as const, party: null };
    if (platform(ctx)) return { level: 'staff' as const, party: null };
    if (passportId && ctx.orgId) {
      const [party] = await this.db.select().from(dealPassportParties).where(and(eq(dealPassportParties.passportId, passportId), eq(dealPassportParties.organizationId, ctx.orgId), isNull(dealPassportParties.revokedAt))).limit(1);
      if (party) return { level: party.ndaAcceptedAt ? 'party' as const : 'invitee' as const, party };
    }
    throw new NotFoundException('Deal Passport not found');
  }

  @Get('leads/:id/passport')
  async passport(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    let { claim, p } = await this.passportFor(id);
    const a = await this.access(ctx, claim, p?.id ?? null);
    if (!p) {
      if (!PASSPORT_ELIGIBLE_CLAIM_STATES.includes(claim.status)) throw new ConflictException('A Deal Passport is issued once Unite has reviewed and protected this lead');
      [p] = await this.db.insert(dealPassports).values({ code: `DP-${new Date().getFullYear()}-${randomDigits(6)}`, claimId: claim.id, ownerOrgId: claim.introducerOrgId }).onConflictDoNothing().returning();
      if (!p) [p] = await this.db.select().from(dealPassports).where(eq(dealPassports.claimId, claim.id));
      else await this.audit.record(ctx, { action: 'passport.issued', objectType: 'deal_passport', objectId: p.id, after: { code: p.code, claim: claim.certificateCode } });
    }
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, claim.opportunityId));
    const owner = await this.svc.orgName(claim.introducerOrgId);
    const base = { passport: { id: p.id, code: p.code, status: p.status, issuedAt: p.issuedAt }, access: a.level, owner, opportunity: { code: o.code, title: o.title } };
    if (a.level === 'invitee') return { ...base, role: a.party!.role, ndaText: passportNdaText(p.code, o.title, owner) };
    if (a.level === 'party') await this.audit.record(ctx, { action: 'passport.viewed', objectType: 'deal_passport', objectId: p.id, after: { organization: ctx.orgId } });

    const [cust] = await this.db.select().from(customers).where(eq(customers.id, claim.customerId));
    const [introducer] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, claim.introducerUserId));
    const [routing] = await this.db.select().from(routingEvents).where(eq(routingEvents.opportunityId, o.id)).orderBy(desc(routingEvents.createdAt)).limit(1);
    const gc = routing ? await this.svc.orgName(routing.groupCompanyOrgId) : null;
    const dups = await this.db.select({ score: duplicateCandidates.score, ruling: duplicateCandidates.ruling, rulingReason: duplicateCandidates.rulingReason, at: duplicateCandidates.createdAt }).from(duplicateCandidates).where(eq(duplicateCandidates.claimId, claim.id));
    const events = await this.db.select({ version: opportunityEvents.version, at: opportunityEvents.at, from: opportunityEvents.fromStatus, to: opportunityEvents.toStatus, note: opportunityEvents.reason }).from(opportunityEvents).where(eq(opportunityEvents.opportunityId, o.id)).orderBy(asc(opportunityEvents.version));
    const docs = await this.db.select({ name: leadDocuments.fileName, size: leadDocuments.size, at: leadDocuments.createdAt }).from(leadDocuments).where(eq(leadDocuments.claimId, claim.id));
    const agreements = await this.db.select().from(commissionAgreements).where(eq(commissionAgreements.leadClaimId, claim.id));
    const projectIds = agreements.map((x) => x.projectId).filter(Boolean) as string[];
    const projs = projectIds.length ? await this.db.select().from(projects).where(inArray(projects.id, projectIds)) : [];
    const ms = projectIds.length ? await this.db.select().from(milestones).where(inArray(milestones.projectId, projectIds)).orderBy(asc(milestones.seq)) : [];
    const ctrIds = projs.map((x) => x.contractId).filter(Boolean) as string[];
    const ctrs = ctrIds.length ? await this.db.select({ id: contracts.id, code: contracts.code, title: contracts.title, status: contracts.status }).from(contracts).where(inArray(contracts.id, ctrIds)) : [];
    const parties = await this.db.select({ x: dealPassportParties, org: organizations.displayName }).from(dealPassportParties).innerJoin(organizations, eq(organizations.id, dealPassportParties.organizationId)).where(eq(dealPassportParties.passportId, p.id)).orderBy(asc(dealPassportParties.grantedAt));
    const audit = await this.db.select({ seq: auditEvents.seq, at: auditEvents.at, action: auditEvents.action, hash: auditEvents.hash }).from(auditEvents).where(inArray(auditEvents.objectId, [claim.id, p.id, o.id])).orderBy(asc(auditEvents.seq)).limit(200);
    const full = a.level !== 'party';
    return {
      ...base,
      ownership: { registeredBy: introducer?.name ?? null, registeredAt: claim.createdAt, certificateCode: claim.certificateCode, evidenceHash: claim.evidenceHash, status: claim.status, protectedFrom: claim.protectedFrom, protectedUntil: claim.protectedUntil, policy: claim.feeTrigger },
      customer: full ? { name: cust.legalName, contact: cust.contactName, email: cust.contactEmail, phone: cust.contactPhone, city: cust.city } : { name: cust.legalName, city: cust.city },
      consent: claim.consent,
      opportunity: { code: o.code, title: o.title, sector: o.sector, region: o.region, estimatedValue: o.estimatedValue, status: o.status },
      review: { groupCompany: gc, decision: routing?.decision ?? null, reason: routing?.reason ?? null, startedAt: routing?.startAt ?? null, dueAt: routing?.dueAt ?? null, decidedAt: routing?.decidedAt ?? null, duplicates: dups, history: events },
      parties: parties.map(({ x, org }) => ({ organizationId: x.organizationId, organization: org, role: x.role, ndaAccepted: !!x.ndaAcceptedAt, ndaAcceptedAt: x.ndaAcceptedAt, revoked: !!x.revokedAt, grantedAt: x.grantedAt })),
      participation: agreements.map((g) => ({ code: g.code, status: g.status, shareBps: g.shareBps, policy: (g.terms as { policy?: { name?: string; basis?: string; rateBps?: number | null } }).policy, termsHash: g.termsHash })),
      execution: projs.map((pr) => ({ code: pr.code, title: pr.title, status: pr.status, value: pr.value, contract: ctrs.find((c) => c.id === pr.contractId) ?? null, milestones: ms.filter((m) => m.projectId === pr.id).map((m) => ({ seq: m.seq, title: m.title, status: m.status, amount: m.amount })) })),
      documents: docs,
      audit,
      notice: 'This passport records registration, review and agreed participation. It is not a guarantee of commission: rights arise only from signed commercial agreements.',
      canManage: a.level === 'staff' || manager(ctx, claim.introducerOrgId),
    };
  }

  @Post('leads/:id/passport/parties')
  @HttpCode(201)
  async addParty(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PassportPartySchema)) b: z.infer<typeof PassportPartySchema>) {
    const { claim, p } = await this.passportFor(id);
    if (!p) throw new ConflictException('Open the Deal Passport first');
    await this.access(ctx, claim, p.id); // outsiders get "not found", never a hint that the passport exists
    if (!platform(ctx) && !manager(ctx, claim.introducerOrgId)) throw new ForbiddenException('Only the registering company’s owner or admin, or Unite, can share this passport');
    if (b.organizationId === claim.introducerOrgId) throw new BadRequestException('The registering company already has access');
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, b.organizationId)).limit(1);
    const isGroup = org ? (await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(eq(groupCompanies.organizationId, org.id))).length > 0 : false;
    if (!org || (!isGroup && (org.verificationStatus !== 'verified' || !PARTNER.includes(org.type)))) throw new BadRequestException('Share only with verified partners or Unite Group companies');
    const [o] = await this.db.select({ title: opportunities.title }).from(opportunities).where(eq(opportunities.id, claim.opportunityId));
    const text = passportNdaText(p.code, o.title, await this.svc.orgName(claim.introducerOrgId));
    const [row] = await this.db.insert(dealPassportParties).values({ passportId: p.id, organizationId: b.organizationId, role: b.role, ndaHash: sha256(text), grantedBy: ctx.userId })
      .onConflictDoUpdate({ target: [dealPassportParties.passportId, dealPassportParties.organizationId], set: { role: b.role, revokedAt: null, ndaAcceptedAt: null, ndaAcceptedBy: null, ndaTypedName: null, grantedBy: ctx.userId, grantedAt: new Date() } }).returning();
    await this.svc.notifyOrg(b.organizationId, `Deal Passport ${p.code} shared with you`, `${o.title} — accept the confidentiality undertaking to view it.`, `/leads/${id}/passport`);
    await this.audit.record(ctx, { action: 'passport.party_added', objectType: 'deal_passport', objectId: p.id, after: { organizationId: b.organizationId, role: b.role } });
    return { id: row.id, status: 'awaiting_nda' };
  }

  @Delete('leads/:id/passport/parties/:orgId')
  async removeParty(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('orgId', ParseUUIDPipe) orgId: string) {
    const { claim, p } = await this.passportFor(id);
    if (!p) throw new NotFoundException();
    if (!platform(ctx) && !manager(ctx, claim.introducerOrgId)) throw new ForbiddenException('Only the registering company or Unite can withdraw access');
    await this.db.update(dealPassportParties).set({ revokedAt: new Date() }).where(and(eq(dealPassportParties.passportId, p.id), eq(dealPassportParties.organizationId, orgId)));
    await this.audit.record(ctx, { action: 'passport.party_removed', objectType: 'deal_passport', objectId: p.id, after: { organizationId: orgId } });
    return { ok: true };
  }

  @Post('leads/:id/passport/nda')
  @HttpCode(200)
  async acceptNda(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PassportNdaSchema)) b: z.infer<typeof PassportNdaSchema>) {
    const { claim, p } = await this.passportFor(id);
    const a = await this.access(ctx, claim, p?.id ?? null);
    if (a.level !== 'invitee') throw new ConflictException('There is no undertaking to accept');
    if (!manager(ctx, ctx.orgId!)) throw new ForbiddenException('Your company owner or admin accepts the undertaking');
    if (ctx.fullName.trim().toLowerCase() !== b.typedName.trim().toLowerCase()) throw new BadRequestException({ statusCode: 400, message: 'Type your full name exactly as registered', issues: [{ path: 'typedName', message: 'Type your full name exactly as registered' }] });
    await this.db.update(dealPassportParties).set({ ndaAcceptedAt: new Date(), ndaAcceptedBy: ctx.userId, ndaTypedName: b.typedName }).where(eq(dealPassportParties.id, a.party!.id));
    await this.audit.record(ctx, { action: 'passport.nda_accepted', objectType: 'deal_passport', objectId: p!.id, after: { organization: ctx.orgId, ndaHash: a.party!.ndaHash, typedName: b.typedName } });
    await this.svc.notifyOrg(claim.introducerOrgId, `Undertaking accepted on ${p!.code}`, `${await this.svc.orgName(ctx.orgId!)} can now view the Deal Passport.`, `/leads/${id}/passport`);
    return { ok: true };
  }

  @Get('passports/shared')
  async shared(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return [];
    const rows = await this.db.select({ x: dealPassportParties, p: dealPassports, title: opportunities.title }).from(dealPassportParties).innerJoin(dealPassports, eq(dealPassports.id, dealPassportParties.passportId))
      .innerJoin(leadClaims, eq(leadClaims.id, dealPassports.claimId)).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId))
      .where(and(eq(dealPassportParties.organizationId, ctx.orgId), isNull(dealPassportParties.revokedAt))).orderBy(desc(dealPassportParties.grantedAt));
    return rows.map((r) => ({ claimId: r.p.claimId, code: r.p.code, title: r.title, role: r.x.role, ndaAccepted: !!r.x.ndaAcceptedAt }));
  }

  /** Public check — confirms a passport exists and is valid; shows no customer or commercial data. */
  @Public()
  @Get('public/passports/:code')
  async verify(@Param('code') code: string) {
    const [r] = await this.db.select({ p: dealPassports, c: leadClaims, o: opportunities.code }).from(dealPassports).innerJoin(leadClaims, eq(leadClaims.id, dealPassports.claimId)).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).where(eq(dealPassports.code, code.toUpperCase())).limit(1);
    if (!r) throw new NotFoundException('No Deal Passport with this code');
    return { code: r.p.code, valid: r.p.status === 'active', issuedAt: r.p.issuedAt, opportunity: r.o, leadStatus: r.c.status, protectedUntil: r.c.protectedUntil, registeredBy: await this.svc.orgName(r.c.introducerOrgId) };
  }

  // ================= AI team plans =================
  private async source(ctx: RequestContext, b: z.infer<typeof TeamPlanSourceSchema>) {
    if (b.sourceType === 'opportunity') {
      const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, b.sourceId)).limit(1);
      if (!o || (o.ownerOrgId !== ctx.orgId && !o.listed && !platform(ctx))) throw new NotFoundException('Opportunity not found');
      return { title: `${o.code} — ${o.title}`, sector: b.sector ?? o.sector, region: o.region, value: o.estimatedValue, certifications: o.requiredCertifications };
    }
    if (b.sourceType === 'project') {
      const [p] = await this.db.select().from(projects).where(eq(projects.id, b.sourceId)).limit(1);
      if (!p || (![p.ownerOrgId, p.leadOrgId].includes(ctx.orgId ?? '') && !platform(ctx))) throw new NotFoundException('Project not found');
      const [t] = p.tenderId ? await this.db.select().from(tenders).where(eq(tenders.id, p.tenderId)) : [];
      return { title: `${p.code} — ${p.title}`, sector: b.sector ?? t?.sector ?? 'construction', region: p.region, value: p.value, certifications: [] as string[] };
    }
    const [t] = await this.db.select().from(tenders).where(eq(tenders.id, b.sourceId)).limit(1);
    if (!t || (t.status === 'draft' && t.issuerOrgId !== ctx.orgId && !platform(ctx))) throw new NotFoundException('Tender not found');
    const el = (t.eligibility ?? {}) as { certifications?: string[]; region?: string };
    return { title: `${t.code} — ${t.title}`, sector: b.sector ?? t.sector, region: el.region ?? null, value: t.budget, certifications: el.certifications ?? [] };
  }

  @Post('ai/team-plans')
  @HttpCode(201)
  async createPlan(@Ctx() ctx: RequestContext, @Body(body(TeamPlanSourceSchema)) b: z.infer<typeof TeamPlanSourceSchema>) {
    if (!ctx.orgId) throw new ForbiddenException('Choose your company first');
    const [setting] = await this.db.select().from(aiSettings).where(eq(aiSettings.kind, 'team_builder')).limit(1);
    if (setting && !setting.enabled) throw new ForbiddenException('This AI assistant has been turned off by the COLLABIZ administrator');
    const s = await this.source(ctx, b);
    const [me] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)).limit(1);
    const all = await this.svc.partners(ctx.orgId);
    const target = (extra: Partial<{ category: string; requiredCertifications: string[] }> = {}) => ({ category: s.sector, region: s.region, value: s.value, requiredCertifications: [] as string[], ...extra });
    const roles: { key: string; role: string; kind: string; why: string; coveredByYou: boolean; t: ReturnType<typeof target> }[] = [];
    roles.push({ key: 'lead', role: `Lead — ${sectorName(s.sector)}`, kind: 'lead', why: 'Owns delivery and the client relationship', coveredByYou: !!me?.sectors.includes(s.sector) || !me, t: target() });
    s.certifications.forEach((c, i) => roles.push({ key: `cert${i}`, role: `Certified partner (${c})`, kind: 'certified', why: `The work requires ${c}`, coveredByYou: !!me?.certifications.includes(c), t: target({ requiredCertifications: [c] }) }));
    if (s.region && !me?.regions.some((r) => r === s.region || s.region!.startsWith(r))) roles.push({ key: 'local', role: 'Local execution partner', kind: 'local', why: 'The site is outside your declared coverage', coveredByYou: false, t: target() });
    if (s.value && me?.capacityMax && me.capacityMax < s.value) roles.push({ key: 'capacity', role: 'Capacity partner', kind: 'capacity', why: 'The value exceeds your declared capacity', coveredByYou: false, t: target() });
    if ((s.value ?? 0) >= 5_00_00_000_00) roles.push({ key: 'procurement', role: 'Procurement partner', kind: 'procurement', why: 'Large value: dedicated sourcing reduces schedule risk', coveredByYou: false, t: target({ category: 'trading' }) });
    if (['solar', 'renewable_energy', 'power_equipment'].includes(s.sector)) roles.push({ key: 'om', role: 'O&M partner', kind: 'om', why: 'Plants need operations and maintenance after handover', coveredByYou: false, t: target() });
    const planned = roles.map((r) => {
      const cands = r.coveredByYou ? [] : rankPartners(all, r.t, 4).map((x) => {
        const p = all.find((a) => a.id === x.partnerId)!;
        return { partnerId: x.partnerId, partnerName: x.partnerName, score: x.score, reputation: p.reputationScore, factors: x.factors, evidence: r.t.requiredCertifications.map((c) => ({ item: c, state: p.certifications.includes(c) ? 'self-declared' : 'missing' })) };
      });
      const gaps: string[] = [];
      if (!r.coveredByYou && !cands.length) gaps.push('No verified partner on COLLABIZ matches this role yet');
      if (r.kind === 'certified' && cands.length && cands.every((c) => c.evidence.some((e) => e.state !== 'missing'))) gaps.push('Certificates are self-declared — ask for copies before relying on them');
      if (r.kind === 'certified' && cands.length && cands.every((c) => c.evidence.some((e) => e.state === 'missing'))) gaps.push('No candidate declares this certificate');
      return { key: r.key, role: r.role, kind: r.kind, why: r.why, coveredByYou: r.coveredByYou, responsibilities: RESPONSIBILITIES[r.kind] ?? [], candidates: cands, gaps };
    });
    const [plan] = await this.db.insert(teamPlans).values({ ownerOrgId: ctx.orgId, sourceType: b.sourceType, sourceId: b.sourceId, title: s.title, roles: planned, createdBy: ctx.userId }).returning();
    await this.db.insert(aiSuggestions).values({ kind: 'team_builder', organizationId: ctx.orgId, userId: ctx.userId, input: b, output: { planId: plan.id, roles: planned.map((r) => ({ key: r.key, candidates: r.candidates.map((c) => c.partnerId) })) }, sources: [{ type: b.sourceType, id: b.sourceId }, { type: 'partner_profiles', count: all.length }], provider: config().AI_PROVIDER, promptVersion: 'team-plan-v2' });
    await this.audit.record(ctx, { action: 'team_plan.created', objectType: 'team_plan', objectId: plan.id, after: { source: b.sourceType, roles: planned.length } });
    return this.planView(ctx, plan.id);
  }

  private async plan(ctx: RequestContext, id: string, ownerOnly = false) {
    const [p] = await this.db.select().from(teamPlans).where(eq(teamPlans.id, id)).limit(1);
    if (!p) throw new NotFoundException('Team plan not found');
    const invited = ctx.orgId ? (await this.db.select({ id: teamPlanInvites.id }).from(teamPlanInvites).where(and(eq(teamPlanInvites.planId, id), eq(teamPlanInvites.organizationId, ctx.orgId))).limit(1)).length > 0 : false;
    const owner = p.ownerOrgId === ctx.orgId;
    if (!owner && !platform(ctx) && (ownerOnly || !invited)) throw new NotFoundException('Team plan not found');
    return { p, owner };
  }

  @Get('ai/team-plans/:id')
  async getPlan(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) { return this.planView(ctx, id); }

  private async planView(ctx: RequestContext, id: string) {
    const { p, owner } = await this.plan(ctx, id);
    const inv = await this.db.select({ i: teamPlanInvites, org: organizations.displayName }).from(teamPlanInvites).innerJoin(organizations, eq(organizations.id, teamPlanInvites.organizationId)).where(eq(teamPlanInvites.planId, id)).orderBy(asc(teamPlanInvites.createdAt));
    const roles = p.roles as { key: string; role: string; kind: string; why: string; coveredByYou: boolean; responsibilities: string[]; candidates: unknown[]; gaps: string[] }[];
    const invites = inv.map(({ i, org }) => ({ id: i.id, roleKey: i.roleKey, organizationId: i.organizationId, organization: org, status: i.status, message: i.message, mine: i.organizationId === ctx.orgId }));
    const view = { id: p.id, title: p.title, sourceType: p.sourceType, sourceId: p.sourceId, status: p.status, teamId: p.teamId, isOwner: owner, owner: await this.svc.orgName(p.ownerOrgId), createdAt: p.createdAt };
    if (!owner && !platform(ctx)) return { ...view, roles: roles.filter((r) => invites.some((i) => i.mine && i.roleKey === r.key)).map((r) => ({ key: r.key, role: r.role, responsibilities: r.responsibilities })), invites: invites.filter((i) => i.mine) };
    const open = roles.filter((r) => !r.coveredByYou && !invites.some((i) => i.roleKey === r.key && i.status === 'accepted'));
    return {
      ...view, roles, invites, matrix: responsibilityMatrix(roles.map((r) => ({ key: r.key, role: r.role, kind: r.kind }))),
      readiness: { openRoles: open.map((r) => r.role), canApprove: p.status === 'draft' && invites.some((i) => i.status === 'accepted') },
      note: 'Suggestions only. Matches use self-declared profiles and verified status; check certificates before relying on them. Nobody is contacted until you invite them.',
    };
  }

  @Post('ai/team-plans/:id/invites')
  @HttpCode(201)
  async invite(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(TeamPlanInviteSchema)) b: z.infer<typeof TeamPlanInviteSchema>) {
    const { p } = await this.plan(ctx, id, true);
    if (p.ownerOrgId !== ctx.orgId) throw new ForbiddenException('Only the plan owner invites partners');
    if (p.status !== 'draft') throw new ConflictException('This plan is no longer open');
    const role = (p.roles as { key: string; role: string; responsibilities: string[] }[]).find((r) => r.key === b.roleKey);
    if (!role) throw new BadRequestException('Unknown role');
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, b.organizationId)).limit(1);
    if (!org || org.verificationStatus !== 'verified' || !PARTNER.includes(org.type)) throw new BadRequestException('Only verified partners can be invited');
    if (org.id === ctx.orgId) throw new BadRequestException('You already lead this plan');
    const [row] = await this.db.insert(teamPlanInvites).values({ planId: id, roleKey: b.roleKey, organizationId: b.organizationId, message: b.message, invitedBy: ctx.userId }).onConflictDoNothing().returning();
    if (!row) throw new ConflictException('This partner is already invited for this role');
    await this.svc.notifyOrg(b.organizationId, `Team invitation: ${role.role}`, `${await this.svc.orgName(ctx.orgId!)} — ${p.title}. ${role.responsibilities.join('; ')}`, `/ai/team-plans/${id}`);
    await this.audit.record(ctx, { action: 'team_plan.invited', objectType: 'team_plan', objectId: id, after: { roleKey: b.roleKey, organizationId: b.organizationId } });
    return this.planView(ctx, id);
  }

  @Post('team-plan-invites/:id/respond')
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'decline', 'reject']) }))) b: { decision: 'accept' | 'decline' | 'reject' }) {
    const [i] = await this.db.select().from(teamPlanInvites).where(eq(teamPlanInvites.id, id)).limit(1);
    if (!i) throw new NotFoundException('Invitation not found');
    const [p] = await this.db.select().from(teamPlans).where(eq(teamPlans.id, i.planId));
    if (b.decision === 'reject') {
      if (p.ownerOrgId !== ctx.orgId) throw new ForbiddenException('Only the plan owner can reject a partner');
    } else {
      if (i.organizationId !== ctx.orgId) throw new NotFoundException('Invitation not found');
      if (!manager(ctx, ctx.orgId)) throw new ForbiddenException('Your company owner or admin responds to invitations');
      if (i.status !== 'invited') throw new ConflictException('Already answered');
    }
    if (p.status !== 'draft') throw new ConflictException('This plan is no longer open');
    const status = b.decision === 'accept' ? 'accepted' : b.decision === 'decline' ? 'declined' : 'rejected';
    await this.db.update(teamPlanInvites).set({ status, respondedAt: new Date() }).where(eq(teamPlanInvites.id, id));
    await this.svc.notifyOrg(b.decision === 'reject' ? i.organizationId : p.ownerOrgId, `Team plan: invitation ${status}`, p.title, `/ai/team-plans/${p.id}`);
    await this.audit.record(ctx, { action: `team_plan.${status}`, objectType: 'team_plan', objectId: p.id, after: { inviteId: id } });
    return { status };
  }

  /** Human approval: creates a collaboration team with the accepted partners; each still signs the team NDA before activation. */
  @Post('ai/team-plans/:id/approve')
  @HttpCode(200)
  async approve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ kind: z.enum(['team', 'consortium']).default('team') }))) b: { kind: 'team' | 'consortium' }) {
    const { p } = await this.plan(ctx, id, true);
    if (p.ownerOrgId !== ctx.orgId || !manager(ctx, ctx.orgId!)) throw new ForbiddenException('The plan owner’s company owner or admin approves the team');
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified partners can form teams');
    if (p.status !== 'draft') throw new ConflictException('Already approved');
    const accepted = await this.db.select().from(teamPlanInvites).where(and(eq(teamPlanInvites.planId, id), eq(teamPlanInvites.status, 'accepted')));
    if (!accepted.length) throw new ConflictException('At least one invited partner must accept before the team is created');
    const roles = p.roles as { key: string; role: string; kind: string; responsibilities: string[] }[];
    const lead = await this.svc.orgName(ctx.orgId!);
    const purpose = `Team for ${p.title}. Roles: ${roles.map((r) => r.role).join('; ')}.`;
    const ndaText = `MUTUAL NON-DISCLOSURE UNDERTAKING — DRAFT PENDING LEGAL REVIEW\n\nTeam: ${p.title}\nLead organization: ${lead}\nPurpose: ${purpose}\n\nMembers keep each other's confidential information private, use it only for this team's purpose, and return or destroy it when the team ends.`;
    const kindMap: Record<string, string> = { lead: 'lead', certified: 'specialist', local: 'execution', capacity: 'execution', procurement: 'procurement', om: 'specialist' };
    const team = await this.db.transaction(async (tx) => {
      const [t] = await tx.insert(collaborationTeams).values({ code: `TM-${randomDigits(6)}`, name: p.title.slice(0, 120), purpose, kind: b.kind, opportunityId: p.sourceType === 'opportunity' ? p.sourceId : null, leadOrgId: ctx.orgId!, ndaText, ndaHash: sha256(ndaText), createdBy: ctx.userId, status: 'nda_pending' }).returning();
      await tx.insert(teamMembers).values({ teamId: t.id, organizationId: ctx.orgId!, role: 'lead', responsibilities: RESPONSIBILITIES.lead.join('; '), status: 'nda_signed', invitedBy: ctx.userId, respondedAt: new Date(), ndaSignedAt: new Date(), ndaSignedBy: ctx.userId, ndaTypedName: ctx.fullName });
      for (const a of accepted) {
        const r = roles.find((x) => x.key === a.roleKey);
        await tx.insert(teamMembers).values({ teamId: t.id, organizationId: a.organizationId, role: kindMap[r?.kind ?? ''] ?? 'specialist', responsibilities: (r?.responsibilities ?? [r?.role ?? 'Member']).join('; '), status: 'accepted', invitedBy: ctx.userId, respondedAt: a.respondedAt ?? new Date() }).onConflictDoNothing();
      }
      await tx.update(teamPlans).set({ status: 'approved', teamId: t.id, approvedBy: ctx.userId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(teamPlans.id, id));
      return t;
    });
    for (const a of accepted) await this.svc.notifyOrg(a.organizationId, `Team formed: ${p.title}`, 'Sign the team NDA to join the workspace.', `/teams/${team.id}/members`);
    await this.audit.record(ctx, { action: 'team_plan.approved', objectType: 'team_plan', objectId: id, after: { teamId: team.id, members: accepted.length + 1 } });
    return { teamId: team.id, code: team.code };
  }

  @Get('ai/team-plans')
  async myPlans(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) return { mine: [], invited: [] };
    const mine = await this.db.select().from(teamPlans).where(eq(teamPlans.ownerOrgId, ctx.orgId)).orderBy(desc(teamPlans.createdAt)).limit(50);
    const inv = await this.db.select({ i: teamPlanInvites, p: teamPlans }).from(teamPlanInvites).innerJoin(teamPlans, eq(teamPlans.id, teamPlanInvites.planId)).where(eq(teamPlanInvites.organizationId, ctx.orgId)).orderBy(desc(teamPlanInvites.createdAt));
    return { mine: mine.map((p) => ({ id: p.id, title: p.title, sourceType: p.sourceType, status: p.status, roles: (p.roles as unknown[]).length, createdAt: p.createdAt })), invited: inv.map(({ i, p }) => ({ inviteId: i.id, planId: p.id, title: p.title, roleKey: i.roleKey, status: i.status, role: (p.roles as { key: string; role: string }[]).find((r) => r.key === i.roleKey)?.role })) };
  }
}

