import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  assertTransition, businessMinutesBetween, duplicateScore, DisputeMachine, LeadClaimMachine, slaStatus, DEFAULT_CALENDAR,
  type BusinessCalendar, type DisputeState, type LeadClaimState, type LeadCreateInput,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { crmActivities, crmDeals, customers, disputeEntries, disputes, duplicateCandidates, groupCompanies, leadClaims, memberships, notifications, opportunities, opportunityEvents, organizations, routingEvents, users } from '../../db/schema';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { randomDigits, sha256, canonicalJson } from '../../common/crypto';
import type { RequestContext } from '../../common/context';
import { OpportunitiesService } from '../opportunities/opportunities.service';

export const PROTECTION_DAYS = 90; // assumption A-07 — configurable per commission addendum
export const APPEAL_DAYS = 14;
type Claim = typeof leadClaims.$inferSelect;
type RoutingEvent = typeof routingEvents.$inferSelect;


@Injectable()
export class LeadsService {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private mail: MailService, private opps: OpportunitiesService) {}

  // ---------------- Registration (043–049) ----------------
  async register(ctx: RequestContext, b: LeadCreateInput) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified partners can register protected leads');
    if (new Date(b.consent.obtainedAt) > new Date()) throw new BadRequestException({ statusCode: 400, message: 'Consent date cannot be in the future', issues: [{ path: 'consent.obtainedAt', message: 'Cannot be in the future' }] });
    const [gc] = await this.db.select().from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId))
      .where(sql`${b.sector} = any(${groupCompanies.sectors}) and ${groupCompanies.status} = 'active' and ${groupCompanies.receivesLeads}`).orderBy(asc(organizations.createdAt)).limit(1).then((r) => r.map((x) => x.group_companies));
    const code = await this.opps.nextCode();
    const registeredAt = new Date();
    const snapshot = {
      code, registeredAt: registeredAt.toISOString(), introducerOrgId: ctx.orgId, introducerUserId: ctx.userId,
      customer: b.customer, sector: b.sector, productOrProject: b.productOrProject, quantityOrCapacity: b.quantityOrCapacity ?? null,
      estimatedValue: b.estimatedValue, currency: b.currency, requirements: b.requirements, consent: b.consent, evidenceSummary: b.evidenceSummary,
    };
    const evidenceHash = sha256(canonicalJson(snapshot));
    const claimId = await this.db.transaction(async (txx) => {
      const tx = txx as unknown as Db;
      const [cust] = await tx.insert(customers).values({ organizationId: ctx.orgId!, legalName: b.customer.legalName, taxId: b.customer.taxId, contactName: b.customer.contactName, contactEmail: b.customer.contactEmail, contactPhone: b.customer.contactPhone, city: b.customer.city, country: b.customer.country, consentProvenance: b.consent, restrictedContacts: b.consent.disclosureScope === 'restricted' }).returning();
      const [o] = await tx.insert(opportunities).values({
        code, title: `${b.productOrProject} — ${b.customer.city}`, summary: b.requirements, sector: b.sector, kind: 'project', route: 'partner_originated', source: 'partner_lead',
        city: b.customer.city, country: b.customer.country, estimatedValue: b.estimatedValue, currency: b.currency, deadline: b.expectedCloseDate ? new Date(b.expectedCloseDate) : null,
        visibility: 'private', ownerOrgId: ctx.orgId!, groupCompanyOrgId: gc?.organizationId ?? null, buyerConfidential: true, status: 'draft', createdBy: ctx.userId,
      }).returning();
      await tx.insert(opportunityEvents).values({ opportunityId: o.id, version: 1, fromStatus: null, toStatus: 'draft', reason: 'Lead registered', actorUserId: ctx.userId });
      const [c] = await tx.insert(leadClaims).values({
        opportunityId: o.id, introducerOrgId: ctx.orgId!, introducerUserId: ctx.userId, customerId: cust.id, evidenceSummary: b.evidenceSummary, evidenceSnapshot: snapshot, evidenceHash,
        consent: b.consent, certificateCode: `CZL-${new Date().getFullYear()}-${randomDigits(8)}`,
      }).returning();
      await this.opps.transition(ctx, o.id, 'submitted', 'Lead submitted with evidence snapshot', tx);
      // Stage 07: every registered lead opens a CRM deal so follow-ups and conversion are tracked.
      const [deal] = await tx.insert(crmDeals).values({ organizationId: ctx.orgId!, customerId: cust.id, leadClaimId: c.id, title: b.productOrProject, value: b.estimatedValue, currency: b.currency, ownerUserId: ctx.userId, expectedClose: b.expectedCloseDate ? new Date(b.expectedCloseDate) : null }).returning();
      await tx.insert(crmActivities).values([
        { organizationId: ctx.orgId!, subjectType: 'lead', subjectId: c.id, kind: 'system', body: `Lead ${code} registered; evidence sealed (${evidenceHash.slice(0, 12)}…)`, actorUserId: ctx.userId },
        { organizationId: ctx.orgId!, subjectType: 'deal', subjectId: deal.id, kind: 'system', body: 'Deal opened from protected lead registration', actorUserId: ctx.userId },
      ]);
      await this.audit.record(ctx, { action: 'lead.registered', objectType: 'lead_claim', objectId: c.id, after: { code, evidenceHash, urgent: b.urgent } }, tx);
      return c.id;
    });
    await this.pipeline(ctx, claimId, b.urgent);
    return this.detail(ctx, claimId);
  }

  /** consent check → duplicate review → verified (protected) → Unite priority review (or straight to release if no matching company). */
  async pipeline(ctx: RequestContext | null, claimId: string, urgent = false) {
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, claimId)).limit(1);
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, claim.opportunityId)).limit(1);
    if (o.status === 'submitted') {
      const consent = claim.consent as LeadCreateInput['consent'];
      await this.opps.transition(ctx, o.id, 'consent_check', 'Consent provenance recorded');
      if (!consent?.method || !consent?.obtainedAt) {
        await this.opps.transition(ctx, o.id, 'rejected', 'Missing buyer consent');
        await this.setClaim(ctx, claim, 'rejected', 'Missing buyer consent');
        return;
      }
      await this.opps.transition(ctx, o.id, 'duplicate_review', 'Duplicate screening');
      const dups = await this.screenDuplicates(claim);
      if (dups.length) {
        await this.notifyRole('compliance', 'Lead duplicate review needed', `${o.code} matches ${dups.length} earlier lead(s)`, '/lead-conflicts');
        return; // waits for an evidence-based ruling (134)
      }
    }
    await this.verifyAndRoute(ctx, claim.id, urgent);
  }

  private async screenDuplicates(claim: Claim) {
    const snap = claim.evidenceSnapshot as { customer: { legalName: string; taxId?: string; contactEmail?: string; contactPhone?: string; city?: string }; sector: string };
    const others = await this.db.select({ c: leadClaims, sector: opportunities.sector }).from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId))
      .where(and(ne(leadClaims.id, claim.id), inArray(leadClaims.status, ['pending', 'protected', 'contested', 'upheld'])));
    const found: { candidate: Claim; score: number; reasons: string[] }[] = [];
    for (const { c, sector } of others) {
      const s2 = c.evidenceSnapshot as typeof snap;
      const r = duplicateScore(
        { customerName: snap.customer.legalName, taxId: snap.customer.taxId, email: snap.customer.contactEmail, phone: snap.customer.contactPhone, city: snap.customer.city, category: snap.sector },
        { customerName: s2.customer.legalName, taxId: s2.customer.taxId, email: s2.customer.contactEmail, phone: s2.customer.contactPhone, city: s2.customer.city, category: sector },
      );
      if (r.requiresReview) found.push({ candidate: c, score: r.score, reasons: r.reasons });
    }
    for (const f of found) await this.db.insert(duplicateCandidates).values({ claimId: claim.id, candidateClaimId: f.candidate.id, score: f.score, reasons: f.reasons });
    if (found.length) await this.db.update(leadClaims).set({ duplicateScore: Math.max(...found.map((f) => f.score)) }).where(eq(leadClaims.id, claim.id));
    return found;
  }

  async verifyAndRoute(ctx: RequestContext | null, claimId: string, urgent = false) {
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, claimId)).limit(1);
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, claim.opportunityId)).limit(1);
    const now = new Date();
    await this.opps.transition(ctx, o.id, 'verified', 'Evidence and consent verified; no unresolved duplicates');
    await this.setClaim(ctx, claim, 'protected', 'Lead verified', { protectedFrom: now, protectedUntil: new Date(now.getTime() + PROTECTION_DAYS * 86400_000) });
    if (!o.groupCompanyOrgId) {
      // No Unite company covers this sector: release to the introducer (no exchange listing without consent).
      await this.opps.transition(ctx, o.id, 'released', 'No matching Unite Group company for this sector');
      return;
    }
    const [gc] = await this.db.select().from(groupCompanies).where(eq(groupCompanies.organizationId, o.groupCompanyOrgId)).limit(1);
    const cal = (gc.calendar as BusinessCalendar) ?? DEFAULT_CALENDAR;
    const sla = urgent ? Math.min(gc.slaMinutes, 60) : gc.slaMinutes; // urgent tenders: shortened window (exception workflow)
    const st = slaStatus(now, sla, 0, now, cal);
    await this.opps.transition(ctx, o.id, 'unite_priority_review', `Unite first review by ${gc.brandName} (${sla} business minutes)`);
    await this.db.insert(routingEvents).values({ opportunityId: o.id, groupCompanyOrgId: gc.organizationId, startAt: now, dueAt: st.dueAt, slaMinutes: sla, calendar: cal, urgent });
    await this.notifyOrg(gc.organizationId, 'routing', 'New partner lead for first review', `${o.code} — due ${st.dueAt.toISOString()}`, '/routing');
  }

  private async setClaim(ctx: RequestContext | null, claim: Claim, to: LeadClaimState, reason: string, extra: Partial<Claim> = {}, tx: Db = this.db) {
    const [cur] = await tx.select().from(leadClaims).where(eq(leadClaims.id, claim.id)).limit(1);
    assertTransition(LeadClaimMachine, cur.status as LeadClaimState, to);
    await tx.update(leadClaims).set({ ...extra, status: to, version: cur.version + 1, updatedAt: new Date() }).where(and(eq(leadClaims.id, claim.id), eq(leadClaims.version, cur.version)));
    await this.audit.record(ctx, { action: `lead.claim_${to}`, objectType: 'lead_claim', objectId: claim.id, organizationId: cur.introducerOrgId, reason, before: { status: cur.status }, after: { status: to, ...extra } }, tx);
  }

  // ---------------- Views ----------------
  /** Owner org, or platform staff, may view a claim. Everyone else → 404. */
  async load(ctx: RequestContext, claimId: string) {
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, claimId)).limit(1);
    if (!claim) throw new NotFoundException('Lead not found');
    const platform = ctx.platformRoles.length > 0 && !ctx.mfaRequiredButMissing;
    if (!platform && !ctx.memberships.some((m) => m.organizationId === claim.introducerOrgId)) throw new NotFoundException('Lead not found');
    return claim;
  }

  async detail(ctx: RequestContext, claimId: string) {
    const claim = await this.load(ctx, claimId);
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, claim.opportunityId)).limit(1);
    const [cust] = await this.db.select().from(customers).where(eq(customers.id, claim.customerId)).limit(1);
    const routing = await this.db.select().from(routingEvents).where(eq(routingEvents.opportunityId, o.id)).orderBy(desc(routingEvents.createdAt)).limit(1);
    const dups = await this.db.select({ id: duplicateCandidates.id, score: duplicateCandidates.score, reasons: duplicateCandidates.reasons, ruling: duplicateCandidates.ruling, rulingReason: duplicateCandidates.rulingReason, createdAt: duplicateCandidates.createdAt })
      .from(duplicateCandidates).where(eq(duplicateCandidates.claimId, claim.id)); // other party's identity is never disclosed
    const history = await this.db.select().from(opportunityEvents).where(eq(opportunityEvents.opportunityId, o.id)).orderBy(opportunityEvents.version);
    const gc = o.groupCompanyOrgId ? (await this.db.select({ brandName: groupCompanies.brandName }).from(groupCompanies).where(eq(groupCompanies.organizationId, o.groupCompanyOrgId)))[0] : null;
    return {
      claim: { id: claim.id, status: claim.status, certificateCode: claim.certificateCode, evidenceHash: claim.evidenceHash, evidenceSummary: claim.evidenceSummary, consent: claim.consent, protectedFrom: claim.protectedFrom, protectedUntil: claim.protectedUntil, duplicateScore: claim.duplicateScore, feeTrigger: claim.feeTrigger, createdAt: claim.createdAt, version: claim.version },
      opportunity: { id: o.id, code: o.code, title: o.title, sector: o.sector, status: o.status, estimatedValue: o.estimatedValue, currency: o.currency, route: o.route, listed: o.listed, groupCompany: gc?.brandName ?? null },
      customer: cust, routing: routing[0] ? this.routingView(routing[0]) : null, duplicates: dups, history,
    };
  }

  routingView(e: RoutingEvent, now = new Date()) {
    const cal = e.calendar as BusinessCalendar;
    const extraPause = e.pausedAt ? businessMinutesBetween(e.pausedAt, now, cal) : 0;
    const st = slaStatus(e.startAt, e.slaMinutes, e.pausedMinutes + extraPause, e.decidedAt ?? now, cal);
    return { id: e.id, startAt: e.startAt, dueAt: st.dueAt, slaMinutes: e.slaMinutes, elapsedMinutes: st.elapsedMinutes, remainingMinutes: e.decidedAt ? 0 : st.remainingMinutes, breached: !e.decidedAt && st.breached,
      paused: !!e.pausedAt, pauseReason: e.pauseReason, escalatedAt: e.escalatedAt, urgent: e.urgent, decision: e.decision, reason: e.reason, decidedAt: e.decidedAt, timezone: cal.timezone };
  }

  async myLeads(ctx: RequestContext) {
    const rows = await this.db.select({ c: leadClaims, o: opportunities, customer: customers.legalName }).from(leadClaims)
      .innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).innerJoin(customers, eq(customers.id, leadClaims.customerId))
      .where(eq(leadClaims.introducerOrgId, ctx.orgId!)).orderBy(desc(leadClaims.createdAt));
    const events = rows.length ? await this.db.select().from(routingEvents).where(inArray(routingEvents.opportunityId, rows.map((r) => r.o.id))) : [];
    return rows.map((r) => {
      const e = events.filter((x) => x.opportunityId === r.o.id).sort((a, b) => +b.createdAt - +a.createdAt)[0];
      return { id: r.c.id, code: r.o.code, title: r.o.title, customer: r.customer, sector: r.o.sector, estimatedValue: r.o.estimatedValue, claimStatus: r.c.status, opportunityStatus: r.o.status, protectedUntil: r.c.protectedUntil, certificateCode: r.c.certificateCode, createdAt: r.c.createdAt, routing: e ? this.routingView(e) : null };
    });
  }

  async protectionSummary(ctx: RequestContext) {
    const leads = await this.myLeads(ctx);
    const soon = Date.now() + 14 * 86400_000;
    const myDisputes = await this.db.select({ id: disputes.id }).from(disputes).where(and(or(eq(disputes.claimantOrgId, ctx.orgId!), eq(disputes.respondentOrgId, ctx.orgId!)), ne(disputes.status, 'closed')));
    const by = (s: string) => leads.filter((l) => l.claimStatus === s).length;
    return {
      total: leads.length, protected: by('protected') + by('upheld'), pending: by('pending'), contested: by('contested'), rejected: by('rejected'), expired: by('expired'),
      inUniteReview: leads.filter((l) => l.opportunityStatus === 'unite_priority_review').length, released: leads.filter((l) => l.opportunityStatus === 'released').length,
      expiringSoon: leads.filter((l) => l.protectedUntil && +new Date(l.protectedUntil) < soon && ['protected', 'upheld'].includes(l.claimStatus)),
      openDisputes: myDisputes.length, leads,
    };
  }

  // ---------------- Routing (050, 132, 133) ----------------
  private canRoute(ctx: RequestContext, gcOrgId: string) {
    if (!ctx.caps.has('routing.decide')) return false;
    return ctx.platformRoles.includes('routing_owner') || ctx.platformRoles.includes('super_admin') || ctx.memberships.some((m) => m.organizationId === gcOrgId);
  }

  async queue(ctx: RequestContext, state: 'open' | 'decided' = 'open') {
    const rows = await this.db.select({ e: routingEvents, o: opportunities, introducer: organizations.displayName, gc: groupCompanies.brandName })
      .from(routingEvents).innerJoin(opportunities, eq(opportunities.id, routingEvents.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .innerJoin(groupCompanies, eq(groupCompanies.organizationId, routingEvents.groupCompanyOrgId))
      .where(state === 'open' ? isNull(routingEvents.decidedAt) : sql`${routingEvents.decidedAt} is not null`).orderBy(routingEvents.dueAt);
    return rows.filter((r) => this.canRoute(ctx, r.e.groupCompanyOrgId)).map((r) => ({
      ...this.routingView(r.e), opportunityId: r.o.id, code: r.o.code, title: r.o.title, sector: r.o.sector, estimatedValue: r.o.estimatedValue, summary: r.o.summary, introducer: r.introducer, groupCompany: r.gc, opportunityStatus: r.o.status,
    }));
  }

  async decide(ctx: RequestContext, opportunityId: string, decision: string, reason: string) {
    const [e] = await this.db.select().from(routingEvents).where(and(eq(routingEvents.opportunityId, opportunityId), isNull(routingEvents.decidedAt))).limit(1);
    if (!e) throw new NotFoundException('No open first-review for this opportunity');
    if (!this.canRoute(ctx, e.groupCompanyOrgId)) throw new ForbiddenException('You are not a reviewer for this group company');
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    if (ctx.memberships.some((m) => m.organizationId === o.ownerOrgId)) throw new ForbiddenException('You cannot route a lead introduced by your own organization');
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.opportunityId, opportunityId)).limit(1);
    const now = new Date();
    const cal = e.calendar as BusinessCalendar;
    switch (decision) {
      case 'pause':
        if (e.pausedAt) throw new ConflictException('Already paused');
        await this.db.update(routingEvents).set({ pausedAt: now, pauseReason: reason }).where(eq(routingEvents.id, e.id));
        break;
      case 'resume': {
        if (!e.pausedAt) throw new ConflictException('Not paused');
        const pm = e.pausedMinutes + businessMinutesBetween(e.pausedAt, now, cal);
        const st = slaStatus(e.startAt, e.slaMinutes, pm, now, cal);
        await this.db.update(routingEvents).set({ pausedAt: null, pauseReason: null, pausedMinutes: pm, dueAt: st.dueAt }).where(eq(routingEvents.id, e.id));
        break;
      }
      case 'escalate':
        await this.db.update(routingEvents).set({ escalatedAt: now }).where(eq(routingEvents.id, e.id));
        await this.notifyRole('routing_owner', 'Lead escalated', `${o.code}: ${reason}`, '/routing');
        break;
      case 'accept':
      case 'release':
      case 'reject':
        await this.closeReview(ctx, e, o, claim, decision, reason);
        break;
      default:
        throw new BadRequestException('Unknown decision');
    }
    await this.audit.record(ctx, { action: `routing.${decision}`, objectType: 'opportunity', objectId: opportunityId, reason, organizationId: o.ownerOrgId });
    return this.queueItem(opportunityId);
  }

  private async closeReview(ctx: RequestContext | null, e: RoutingEvent, o: typeof opportunities.$inferSelect, claim: Claim, decision: string, reason: string) {
    const consent = claim.consent as LeadCreateInput['consent'];
    await this.db.transaction(async (txx) => {
      const tx = txx as unknown as Db;
      await tx.update(routingEvents).set({ decision, reason, actorUserId: ctx?.userId ?? null, decidedAt: new Date(), pausedAt: null }).where(eq(routingEvents.id, e.id));
      if (decision === 'accept') {
        await this.opps.transition(ctx, o.id, 'accepted', reason, tx);
      } else if (decision === 'reject') {
        await this.opps.transition(ctx, o.id, 'rejected', reason, tx);
      } else {
        // Release: list on the partner exchange ONLY if the buyer consented to sharing with approved partners (§4.3).
        const share = consent?.disclosureScope === 'unite_and_approved_partners';
        await this.opps.transition(ctx, o.id, 'released', reason, tx, undefined, share ? { listed: true, route: 'partner_exchange', visibility: 'verified_partners', publishedAt: new Date() } : {});
      }
    });
    await this.notifyOrg(o.ownerOrgId, 'lead', `Unite first review: ${decision}`, `${o.code}: ${reason}`, `/leads/${claim.id}/review-status`);
  }

  async queueItem(opportunityId: string) {
    const [e] = await this.db.select().from(routingEvents).where(eq(routingEvents.opportunityId, opportunityId)).orderBy(desc(routingEvents.createdAt)).limit(1);
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
    return { ...this.routingView(e), opportunityStatus: o.status, listed: o.listed, route: o.route };
  }

  /** SLA sweep (run by scheduler): escalate on first breach; auto-release only if policy AND consent allow (§2.3). */
  async sweep(ctx: RequestContext | null, now = new Date()) {
    const open = await this.db.select().from(routingEvents).where(isNull(routingEvents.decidedAt));
    const result = { checked: open.length, escalated: 0, autoReleased: 0 };
    for (const e of open) {
      if (e.pausedAt) continue;
      const v = this.routingView(e, now);
      if (!v.breached) continue;
      const [gc] = await this.db.select().from(groupCompanies).where(eq(groupCompanies.organizationId, e.groupCompanyOrgId)).limit(1);
      const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, e.opportunityId)).limit(1);
      const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.opportunityId, e.opportunityId)).limit(1);
      if (!e.escalatedAt) {
        await this.db.update(routingEvents).set({ escalatedAt: now }).where(eq(routingEvents.id, e.id));
        await this.notifyRole('routing_owner', 'First-review SLA breached', `${o.code} (${gc.brandName}) passed its review window`, '/routing');
        await this.notifyOrg(e.groupCompanyOrgId, 'routing', 'First-review SLA breached', o.code, '/routing');
        await this.audit.record(ctx, { action: 'routing.sla_breached', objectType: 'opportunity', objectId: o.id, organizationId: o.ownerOrgId });
        result.escalated++;
      } else if (gc.autoReleaseOnBreach) {
        await this.closeReview(ctx, e, o, claim, 'release', 'Auto-released: first-review window breached after escalation (policy)');
        result.autoReleased++;
      }
    }
    return result;
  }

  // ---------------- Duplicate rulings (048, 134) ----------------
  async rule(ctx: RequestContext, candidateId: string, ruling: 'not_duplicate' | 'duplicate_upheld_earlier' | 'duplicate_upheld_this', reason: string) {
    const [d] = await this.db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, candidateId)).limit(1);
    if (!d) throw new NotFoundException();
    if (d.ruling !== 'pending') throw new ConflictException('Already ruled');
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, d.claimId)).limit(1);
    const [earlier] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, d.candidateClaimId)).limit(1);
    if (ctx.memberships.some((m) => m.organizationId === claim.introducerOrgId || m.organizationId === earlier.introducerOrgId)) throw new ForbiddenException('Panel members must be independent of both parties');
    await this.db.update(duplicateCandidates).set({ ruling, rulingReason: reason, ruledBy: ctx.userId, ruledAt: new Date() }).where(eq(duplicateCandidates.id, candidateId));
    await this.audit.record(ctx, { action: `lead.duplicate_${ruling}`, objectType: 'lead_claim', objectId: claim.id, reason, after: { candidate: earlier.id, ruling } });
    if (ruling === 'duplicate_upheld_earlier') {
      await this.opps.transition(ctx, claim.opportunityId, 'rejected', `Duplicate of an earlier registration: ${reason}`);
      await this.setClaim(ctx, claim, 'rejected', reason);
      return { claimStatus: 'rejected' };
    }
    if (ruling === 'duplicate_upheld_this' && ['protected', 'upheld', 'pending'].includes(earlier.status)) {
      await this.setClaim(ctx, earlier, earlier.status === 'pending' ? 'rejected' : 'released', `Superseded by better-evidenced registration: ${reason}`);
    }
    const pending = await this.db.select().from(duplicateCandidates).where(and(eq(duplicateCandidates.claimId, claim.id), eq(duplicateCandidates.ruling, 'pending')));
    if (!pending.length) await this.verifyAndRoute(ctx, claim.id);
    return { claimStatus: pending.length ? 'pending' : 'protected' };
  }

  async conflicts() {
    const dups = await this.db.select({ d: duplicateCandidates, claimCode: opportunities.code, claimOrg: organizations.displayName }).from(duplicateCandidates)
      .innerJoin(leadClaims, eq(leadClaims.id, duplicateCandidates.claimId)).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).innerJoin(organizations, eq(organizations.id, leadClaims.introducerOrgId))
      .where(eq(duplicateCandidates.ruling, 'pending')).orderBy(duplicateCandidates.createdAt);
    const out = [];
    for (const r of dups) {
      const [cand] = await this.db.select({ c: leadClaims, code: opportunities.code, org: organizations.displayName }).from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).innerJoin(organizations, eq(organizations.id, leadClaims.introducerOrgId)).where(eq(leadClaims.id, r.d.candidateClaimId));
      const [c] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, r.d.claimId));
      out.push({ ...r.d, claim: { code: r.claimCode, org: r.claimOrg, registeredAt: c.createdAt, evidenceSummary: c.evidenceSummary, consent: c.consent, snapshot: c.evidenceSnapshot },
        candidate: { code: cand.code, org: cand.org, registeredAt: cand.c.createdAt, evidenceSummary: cand.c.evidenceSummary, consent: cand.c.consent, status: cand.c.status, snapshot: cand.c.evidenceSnapshot } });
    }
    const openDisputes = await this.db.select().from(disputes).where(and(eq(disputes.kind, 'lead_ownership'), ne(disputes.status, 'closed'))).orderBy(disputes.createdAt);
    return { duplicates: out, disputes: openDisputes };
  }

  // ---------------- Disputes (153, 134) ----------------
  async openDispute(ctx: RequestContext, claimId: string, statement: string) {
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, claimId)).limit(1);
    if (!claim) throw new NotFoundException('Lead certificate not found');
    if (claim.introducerOrgId === ctx.orgId) throw new BadRequestException('You cannot dispute your own lead');
    if (!['protected', 'upheld'].includes(claim.status)) throw new BadRequestException('Only protected leads can be disputed');
    const open = await this.db.select().from(disputes).where(and(eq(disputes.subjectId, claimId), eq(disputes.claimantOrgId, ctx.orgId!), ne(disputes.status, 'closed')));
    if (open.length) throw new ConflictException('You already have an open dispute on this lead');
    const [d] = await this.db.insert(disputes).values({ code: `DSP-${randomDigits(8)}`, kind: 'lead_ownership', subjectId: claimId, claimantOrgId: ctx.orgId!, respondentOrgId: claim.introducerOrgId, statement, createdBy: ctx.userId }).returning();
    await this.db.insert(disputeEntries).values({ disputeId: d.id, organizationId: ctx.orgId, userId: ctx.userId, kind: 'evidence', body: statement });
    if (claim.status === 'protected') await this.setClaim(ctx, claim, 'contested', `Dispute ${d.code} opened`);
    await this.notifyOrg(claim.introducerOrgId, 'dispute', 'Your lead ownership is disputed', `${d.code} — respond with evidence`, '/lead-disputes');
    await this.notifyRole('compliance', 'New lead ownership dispute', d.code, '/lead-conflicts');
    await this.audit.record(ctx, { action: 'dispute.opened', objectType: 'dispute', objectId: d.id, after: { code: d.code, subject: claimId } });
    return d;
  }

  private async loadDisputeFor(ctx: RequestContext, id: string) {
    const [d] = await this.db.select().from(disputes).where(eq(disputes.id, id)).limit(1);
    if (!d) throw new NotFoundException();
    const party = ctx.memberships.some((m) => m.organizationId === d.claimantOrgId || m.organizationId === d.respondentOrgId);
    const panel = ctx.caps.has('lead.dispute.rule');
    if (!party && !panel) throw new NotFoundException();
    return { d, party, panel };
  }

  async myDisputes(ctx: RequestContext) {
    return this.db.select().from(disputes).where(or(eq(disputes.claimantOrgId, ctx.orgId!), eq(disputes.respondentOrgId, ctx.orgId!))).orderBy(desc(disputes.createdAt));
  }

  async disputeDetail(ctx: RequestContext, id: string) {
    const { d } = await this.loadDisputeFor(ctx, id);
    const entries = await this.db.select({ e: disputeEntries, org: organizations.displayName, author: users.fullName }).from(disputeEntries).leftJoin(organizations, eq(organizations.id, disputeEntries.organizationId)).innerJoin(users, eq(users.id, disputeEntries.userId))
      .where(eq(disputeEntries.disputeId, id)).orderBy(disputeEntries.createdAt);
    const [claim] = await this.db.select({ code: opportunities.code, certificateCode: leadClaims.certificateCode, registeredAt: leadClaims.createdAt, status: leadClaims.status }).from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).where(eq(leadClaims.id, d.subjectId));
    const orgs = await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [d.claimantOrgId, d.respondentOrgId]));
    const name = (x: string) => orgs.find((o) => o.id === x)?.name;
    return { ...d, claimant: name(d.claimantOrgId), respondent: name(d.respondentOrgId), lead: claim, entries: entries.map((x) => ({ ...x.e, org: x.org, author: x.author })) };
  }

  async addEvidence(ctx: RequestContext, id: string, body: string) {
    const { d, party } = await this.loadDisputeFor(ctx, id);
    if (!party) throw new ForbiddenException('Only the parties can submit evidence');
    if (['resolved', 'closed'].includes(d.status)) throw new BadRequestException('Evidence period has ended');
    await this.db.insert(disputeEntries).values({ disputeId: id, organizationId: ctx.orgId, userId: ctx.userId, kind: 'evidence', body });
    if (d.status === 'open') {
      assertTransition(DisputeMachine, 'open', 'evidence');
      await this.db.update(disputes).set({ status: 'evidence' }).where(eq(disputes.id, id));
    }
    await this.audit.record(ctx, { action: 'dispute.evidence_added', objectType: 'dispute', objectId: id });
    return this.disputeDetail(ctx, id);
  }

  /** Independent panel ruling; a re-hearing after appeal must be by a different panel member. */
  async ruleDispute(ctx: RequestContext, id: string, outcome: 'upheld' | 'rejected' | 'split', reason: string) {
    const { d } = await this.loadDisputeFor(ctx, id);
    if (!ctx.caps.has('lead.dispute.rule')) throw new ForbiddenException();
    if (ctx.memberships.some((m) => m.organizationId === d.claimantOrgId || m.organizationId === d.respondentOrgId)) throw new ForbiddenException('Panel members must be independent of both parties');
    if (d.previousPanelUserIds.includes(ctx.userId)) throw new ForbiddenException('An appeal must be heard by a different panel member');
    let st = d.status as DisputeState;
    if (st === 'open' || st === 'evidence') { assertTransition(DisputeMachine, st, 'panel_review'); st = 'panel_review'; }
    assertTransition(DisputeMachine, st, 'resolved');
    const [claim] = await this.db.select().from(leadClaims).where(eq(leadClaims.id, d.subjectId)).limit(1);
    await this.db.update(disputes).set({ status: 'resolved', outcome, rulingReason: reason, panelUserId: ctx.userId, resolvedAt: new Date(), appealDeadline: new Date(Date.now() + APPEAL_DAYS * 86400_000) }).where(eq(disputes.id, id));
    await this.db.insert(disputeEntries).values({ disputeId: id, userId: ctx.userId, kind: 'ruling', body: `${outcome.toUpperCase()}: ${reason}` });
    // Claimant wins → introducer's claim rejected; claimant loses or split → introducer's claim upheld.
    if (claim.status === 'contested') await this.setClaim(ctx, claim, outcome === 'upheld' ? 'rejected' : 'upheld', `Dispute ${d.code}: ${outcome}`);
    else if (claim.status === 'rejected' && outcome !== 'upheld') await this.setClaim(ctx, claim, 'contested', `Appeal ruling ${d.code}`).then(() => this.setClaim(ctx, claim, 'upheld', `Dispute ${d.code}: ${outcome}`));
    else if (claim.status === 'upheld' && outcome === 'upheld') await this.setClaim(ctx, claim, 'released', `Dispute ${d.code} upheld on appeal`);
    for (const org of [d.claimantOrgId, d.respondentOrgId]) await this.notifyOrg(org, 'dispute', `Dispute ${d.code} resolved: ${outcome}`, reason, '/lead-disputes');
    await this.audit.record(ctx, { action: 'dispute.ruled', objectType: 'dispute', objectId: id, reason, after: { outcome } });
    return this.disputeDetail(ctx, id);
  }

  async appeal(ctx: RequestContext, id: string, grounds: string) {
    const { d, party } = await this.loadDisputeFor(ctx, id);
    if (!party) throw new ForbiddenException();
    if (d.status !== 'resolved') throw new BadRequestException('Only resolved disputes can be appealed');
    if (d.appealDeadline && d.appealDeadline < new Date()) throw new BadRequestException('The appeal window has closed');
    assertTransition(DisputeMachine, 'resolved', 'appealed');
    await this.db.update(disputes).set({ status: 'panel_review', previousPanelUserIds: sql`array_append(${disputes.previousPanelUserIds}, ${d.panelUserId})` }).where(eq(disputes.id, id));
    await this.db.insert(disputeEntries).values({ disputeId: id, organizationId: ctx.orgId, userId: ctx.userId, kind: 'appeal', body: grounds });
    await this.notifyRole('compliance', 'Dispute appealed', d.code, '/lead-conflicts');
    await this.audit.record(ctx, { action: 'dispute.appealed', objectType: 'dispute', objectId: id, reason: grounds });
    return this.disputeDetail(ctx, id);
  }

  // ---------------- Certificates (051, 152) ----------------
  async publicVerify(code: string) {
    const [r] = await this.db.select({ c: leadClaims, o: opportunities, org: organizations.displayName }).from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).innerJoin(organizations, eq(organizations.id, leadClaims.introducerOrgId))
      .where(eq(leadClaims.certificateCode, code)).limit(1);
    if (!r) throw new NotFoundException('Certificate not found');
    const valid = ['protected', 'upheld'].includes(r.c.status) && (!r.c.protectedUntil || r.c.protectedUntil > new Date());
    // Public verification never reveals the customer.
    return { certificateCode: code, opportunityCode: r.o.code, introducer: r.org, sector: r.o.sector, registeredAt: r.c.createdAt, protectedFrom: r.c.protectedFrom, protectedUntil: r.c.protectedUntil, status: r.c.status, valid, evidenceHash: r.c.evidenceHash };
  }

  // ---------------- Notifications ----------------
  private async notifyOrg(orgId: string, kind: string, title: string, body: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind, title, body, link });
  }
  private async notifyRole(role: string, title: string, body: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.role, role), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind: 'admin', title, body, link });
    await this.mail.emitIntegrationEvent(`notify.${role}`, { title, body });
  }
}
