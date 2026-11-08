import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { assertTransition, OpportunityMachine, OPEN_OPPORTUNITY_STATES, scorePartner, sectorName, type OpportunityState } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { notifications, opportunities, opportunityApplications, opportunityEvents, organizations, partnerProfiles, savedSearches, users } from '../../db/schema';
import { AuditService } from '../../common/audit.service';
import type { RequestContext } from '../../common/context';
import { levelRank, viewerOf, type Viewer } from '../../common/viewer';

export type Opp = typeof opportunities.$inferSelect;
const OPEN = [...OPEN_OPPORTUNITY_STATES] as string[];
/** Constant SQL list (values are compile-time constants, not user input). */
export const OPEN_LIST = sql.raw(`(${OPEN.map((s) => `'${s}'`).join(',')})`);

export type ListSort = 'newest' | 'closing' | 'value';
export interface ListFilters { q?: string; sector?: string; city?: string; region?: string; route?: string; kind?: string; minValue?: number; maxValue?: number; deadlineBefore?: string; scope?: 'all' | 'unite' | 'exchange'; mapped?: boolean }

@Injectable()
export class OpportunitiesService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async nextCode() {
    const { rows } = await this.db.execute<{ n: number }>(sql`select nextval('opportunity_code_seq')::int as n`);
    const n = rows[0].n;
    return `OPP-${new Date().getFullYear()}-${String(n).padStart(5, '0')}`;
  }

  /**
   * Marketplace visibility: anonymous → public listings; partners → public + verified_partners listings
   * (partner-exchange listings only for VERIFIED partners); owner org and platform → everything they own/oversee.
   */
  visibility(v: Viewer): SQL {
    if (v.platform) return sql`true`;
    const own = v.memberOf.size ? inArray(opportunities.ownerOrgId, [...v.memberOf]) : sql`false`;
    const open = and(eq(opportunities.listed, true), inArray(opportunities.status, OPEN))!;
    if (!v.partner) return or(and(open, eq(opportunities.visibility, 'public')), own)!;
    const visible = v.verified ? inArray(opportunities.visibility, ['public', 'verified_partners']) : and(inArray(opportunities.visibility, ['public', 'verified_partners']), sql`${opportunities.route} <> 'partner_exchange'`);
    return or(and(open, visible), own)!;
  }

  filters(f: ListFilters): SQL[] {
    const c: SQL[] = [];
    if (f.q) c.push(or(sql`to_tsvector('english', ${opportunities.title} || ' ' || ${opportunities.summary}) @@ plainto_tsquery('english', ${f.q})`, ilike(opportunities.title, `%${f.q}%`), eq(opportunities.code, f.q.toUpperCase()))!);
    if (f.sector) c.push(eq(opportunities.sector, f.sector));
    if (f.city) c.push(ilike(opportunities.city, `%${f.city}%`));
    if (f.region) c.push(eq(opportunities.region, f.region));
    if (f.kind) c.push(eq(opportunities.kind, f.kind));
    if (f.route) c.push(eq(opportunities.route, f.route));
    if (f.scope === 'unite') c.push(eq(opportunities.route, 'unite_owned'));
    if (f.scope === 'exchange') c.push(inArray(opportunities.route, ['partner_exchange', 'partner_originated']), eq(opportunities.status, 'released'));
    if (f.minValue != null && !Number.isNaN(f.minValue)) c.push(gte(opportunities.estimatedValue, f.minValue));
    if (f.maxValue != null && !Number.isNaN(f.maxValue)) c.push(lte(opportunities.estimatedValue, f.maxValue));
    if (f.deadlineBefore) c.push(lte(opportunities.deadline, new Date(f.deadlineBefore)));
    if (f.mapped) c.push(sql`${opportunities.lat} is not null and ${opportunities.lng} is not null`);
    return c;
  }

  async list(ctx: RequestContext | null, f: ListFilters, limit = 50, offset = 0, sort: ListSort = 'newest') {
    const v = viewerOf(ctx);
    const order = sort === 'closing' ? [sql`${opportunities.deadline} asc nulls last`, desc(opportunities.publishedAt)]
      : sort === 'value' ? [sql`${opportunities.estimatedValue} desc nulls last`, desc(opportunities.publishedAt)]
      : [desc(opportunities.publishedAt), desc(opportunities.createdAt)];
    const rows = await this.db.select({ o: opportunities, ownerName: organizations.displayName })
      .from(opportunities).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(this.visibility(v), ...this.filters(f))).orderBy(...order, opportunities.id).limit(Math.min(200, limit)).offset(Math.max(0, offset));
    return rows.map((r) => this.present(r.o, r.ownerName, v));
  }

  /** 031 — one page of results plus the total and per-route counts for the same filters. */
  async page(ctx: RequestContext | null, f: ListFilters, limit: number, offset: number, sort: ListSort) {
    const v = viewerOf(ctx);
    const base = and(this.visibility(v), ...this.filters({ ...f, scope: 'all', route: undefined }));
    const [c] = await this.db.select({
      all: sql<number>`count(*)::int`,
      unite: sql<number>`count(*) filter (where ${opportunities.route} = 'unite_owned')::int`,
      exchange: sql<number>`count(*) filter (where ${opportunities.route} in ('partner_exchange','partner_originated') and ${opportunities.status} = 'released')::int`,
    }).from(opportunities).where(base);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(opportunities).where(and(this.visibility(v), ...this.filters(f)));
    const items = await this.list(ctx, f, limit, offset, sort);
    return { items, total: Number(total), limit, offset, sort, counts: { all: Number(c.all), unite: Number(c.unite), exchange: Number(c.exchange) } };
  }

  present(o: Opp, ownerName: string | null, v: Viewer) {
    const own = v.platform || v.memberOf.has(o.ownerOrgId);
    return {
      id: o.id, code: o.code, title: o.title, summary: o.summary, sector: o.sector, kind: o.kind, route: o.route, source: o.source,
      city: o.city, region: o.region, country: o.country, lat: o.lat, lng: o.lng, estimatedValue: o.estimatedValue, currency: o.currency, deadline: o.deadline,
      visibility: o.visibility, minLevel: o.minLevel, requiredCertifications: o.requiredCertifications, status: o.status, publishedAt: o.publishedAt,
      // Originator identity is withheld from non-owners on partner-originated/confidential listings.
      publisher: own || o.route === 'unite_owned' ? ownerName : o.buyerConfidential ? 'Confidential' : 'Verified COLLABIZ partner',
      isOwner: own, version: o.version,
    };
  }

  async getVisible(ctx: RequestContext | null, id: string) {
    const v = viewerOf(ctx);
    const [r] = await this.db.select({ o: opportunities, ownerName: organizations.displayName }).from(opportunities).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(eq(opportunities.id, id), this.visibility(v))).limit(1);
    if (!r) throw new NotFoundException('Opportunity not found');
    return { row: r.o, view: this.present(r.o, r.ownerName, v), v };
  }

  /** Versioned status change with optimistic locking; every change is appended to opportunity_events. */
  async transition(ctx: RequestContext | null, id: string, to: OpportunityState, reason: string | null, tx: Db = this.db, expectedVersion?: number, extra: Partial<Opp> = {}) {
    const [o] = await tx.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!o) throw new NotFoundException('Opportunity not found');
    if (expectedVersion != null && expectedVersion !== o.version) throw new ConflictException('This opportunity was changed by someone else. Reload and try again.');
    assertTransition(OpportunityMachine, o.status as OpportunityState, to);
    const [u] = await tx.update(opportunities).set({ ...extra, status: to, version: o.version + 1, updatedAt: new Date() }).where(and(eq(opportunities.id, id), eq(opportunities.version, o.version))).returning();
    if (!u) throw new ConflictException('Concurrent update detected. Reload and try again.');
    await tx.insert(opportunityEvents).values({ opportunityId: id, version: o.version + 1, fromStatus: o.status, toStatus: to, reason, actorUserId: ctx?.userId ?? null });
    await this.audit.record(ctx, { action: `opportunity.${to}`, objectType: 'opportunity', objectId: id, organizationId: o.ownerOrgId, reason, before: { status: o.status, version: o.version }, after: { status: to, version: o.version + 1 } }, tx);
    return u;
  }

  /** 041 — eligibility: verification, membership level, sector, certifications, coverage, deadline, existing application. */
  async eligibility(ctx: RequestContext, o: Opp) {
    const v = viewerOf(ctx);
    const [p] = ctx.orgId ? await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)).limit(1) : [];
    const checks: { key: string; label: string; result: 'pass' | 'fail' | 'warn'; detail: string }[] = [];
    const add = (key: string, label: string, result: 'pass' | 'fail' | 'warn', detail: string) => checks.push({ key, label, result, detail });
    add('partner', 'Partner account', v.partner ? 'pass' : 'fail', v.partner ? 'Partner organization selected' : 'Create or select a partner organization');
    add('verified', 'KYB verification', v.verified ? 'pass' : 'fail', v.verified ? 'Organization verified' : `Verification status: ${ctx.orgVerificationStatus ?? 'none'}`);
    const need = levelRank(o.minLevel);
    const lvl = (l: string | null | undefined) => (l ? `${l.charAt(0).toUpperCase()}${l.slice(1).replace('_', ' ')} partner` : 'none');
    add('level', 'Membership level', v.levelRank >= need ? 'pass' : 'fail', `Requires ${lvl(o.minLevel)} or above · you are ${lvl(ctx.orgMembershipLevel)}`);
    const sectorOk = !!p?.sectors.includes(o.sector);
    add('sector', 'Sector capability', sectorOk ? 'pass' : 'fail', sectorOk ? `Declared capability in ${sectorName(o.sector)}` : `Add ${sectorName(o.sector)} to your industries (screen 016) if you have this capability`);
    const missing = o.requiredCertifications.filter((c) => !p?.certifications.includes(c));
    add('certifications', 'Required certifications', missing.length ? 'fail' : 'pass', missing.length ? `Missing: ${missing.join(', ')}` : o.requiredCertifications.length ? 'All held' : 'None required');
    if (o.region) {
      const cov = !!p?.regions.some((r) => r === o.region || o.region!.startsWith(r) || r.startsWith(o.region!));
      add('coverage', 'Geographic coverage', cov ? 'pass' : p?.willingToTravel ? 'warn' : 'warn', cov ? 'Inside your declared service area' : p?.willingToTravel ? 'Outside declared coverage (willing to travel)' : 'Outside declared coverage');
    }
    if (o.estimatedValue && p?.capacityMax) add('capacity', 'Declared capacity', p.capacityMax >= o.estimatedValue ? 'pass' : 'warn', p.capacityMax >= o.estimatedValue ? 'Capacity sufficient' : 'Value exceeds your declared capacity — consider a team (screen 060)');
    const open = OPEN.includes(o.status) && o.listed && (!o.deadline || o.deadline > new Date());
    add('open', 'Accepting applications', open ? 'pass' : 'fail', open ? (o.deadline ? `Closes ${o.deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Open until filled') : 'Not currently accepting applications');
    if (ctx.orgId && ctx.orgId === o.ownerOrgId) add('own', 'Not your own listing', 'fail', 'You cannot apply to your own opportunity');
    const existing = ctx.orgId ? await this.db.select().from(opportunityApplications).where(and(eq(opportunityApplications.opportunityId, o.id), eq(opportunityApplications.organizationId, ctx.orgId), sql`${opportunityApplications.status} <> 'withdrawn'`)).limit(1) : [];
    if (existing.length) add('duplicate', 'No existing application', 'fail', `Already applied (${existing[0].status})`);
    return { eligible: checks.every((c) => c.result !== 'fail'), checks, existingApplication: existing[0] ?? null };
  }

  /** Notifies users whose saved searches match a newly listed opportunity (037 alerts). */
  async notifySavedSearches(o: Opp) {
    const searches = await this.db.select().from(savedSearches).where(eq(savedSearches.alert, true));
    for (const s of searches) {
      const q = s.query as ListFilters;
      const text = `${o.title} ${o.summary}`.toLowerCase();
      const match = (!q.sector || q.sector === o.sector) && (!q.city || (o.city ?? '').toLowerCase().includes(q.city.toLowerCase())) && (!q.q || q.q.toLowerCase().split(/\s+/).every((w) => text.includes(w)))
        && (q.minValue == null || (o.estimatedValue ?? 0) >= q.minValue) && (q.maxValue == null || (o.estimatedValue ?? Infinity) <= q.maxValue);
      if (!match) continue;
      await this.db.insert(notifications).values({ userId: s.userId, kind: 'opportunity_alert', title: `New opportunity: ${o.title}`, body: `Matches your saved search "${s.name}"`, link: `/opportunities/${o.id}` });
      await this.db.update(savedSearches).set({ lastAlertAt: new Date() }).where(eq(savedSearches.id, s.id));
    }
  }

  /** 025 — explainable recommendations (consent-gated). Rules engine; human decides. */
  async feed(ctx: RequestContext) {
    if (!ctx.orgId) return { consent: false, items: [] };
    const [p] = await this.db.select().from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId)).limit(1);
    if (!p) return { consent: false, items: [] };
    if (!p.consentToMatch) return { consent: false, items: [] };
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
    const open = await this.list(ctx, {}, 200);
    const partner = { id: org.id, name: org.displayName, sectors: p.sectors, regions: p.regions, capacityMax: p.capacityMax, certifications: p.certifications, reputationScore: null, verified: true, consentToMatch: true };
    const items = open.filter((o) => !o.isOwner).map((o) => ({ opportunity: o, match: scorePartner(partner, { category: o.sector, region: o.region, value: o.estimatedValue, requiredCertifications: o.requiredCertifications }) }))
      .filter((x) => x.match && x.match.score >= 40).sort((a, b) => b.match!.score - a.match!.score).slice(0, 20);
    return { consent: true, items };
  }

  async dashboard(ctx: RequestContext) {
    const orgId = ctx.orgId;
    if (!orgId) return null;
    const [apps] = await this.db.execute<{ total: number; submitted: number; shortlisted: number; accepted: number }>(sql`select count(*)::int as total,
      count(*) filter (where status='submitted')::int as submitted, count(*) filter (where status='shortlisted')::int as shortlisted, count(*) filter (where status='accepted')::int as accepted
      from opportunity_applications where organization_id = ${orgId} and status <> 'withdrawn'`).then((r) => r.rows);
    const [owned] = await this.db.execute<{ total: number; open: number }>(sql`select count(*)::int as total, count(*) filter (where status in ${OPEN_LIST} and listed)::int as open from opportunities where owner_org_id = ${orgId}`).then((r) => r.rows);
    const feed = await this.feed(ctx);
    const [saved] = await this.db.execute<{ n: number }>(sql`select count(*)::int as n from saved_opportunities where user_id = ${ctx.userId}`).then((r) => r.rows);
    const unread = await this.db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)));
    return { applications: apps, ownedOpportunities: owned, recommended: feed.items.length, topRecommendations: feed.items.slice(0, 3), saved: saved.n, unreadNotifications: unread[0].n };
  }

  async applicants(ctx: RequestContext, o: Opp) {
    const v = viewerOf(ctx);
    if (!v.memberOf.has(o.ownerOrgId) && !(v.platform && ctx.caps.has('opportunity.moderate'))) throw new ForbiddenException('Only the publishing organization can review applicants');
    return this.db.select({ a: opportunityApplications, orgName: organizations.displayName, verificationStatus: organizations.verificationStatus, level: organizations.membershipLevel, applicant: users.fullName })
      .from(opportunityApplications).innerJoin(organizations, eq(organizations.id, opportunityApplications.organizationId)).innerJoin(users, eq(users.id, opportunityApplications.applicantUserId))
      .where(eq(opportunityApplications.opportunityId, o.id)).orderBy(desc(opportunityApplications.createdAt))
      .then((r) => r.map((x) => ({ ...x.a, orgName: x.orgName, verificationStatus: x.verificationStatus, level: x.level, applicant: x.applicant })));
  }

  assertDraftable(b: { route: string }, ctx: RequestContext) {
    if (b.route !== 'unite_owned' && b.route !== 'joint_execution') throw new BadRequestException('Partner-originated opportunities are registered as protected leads (screen 043)');
    if (!ctx.caps.has('opportunity.publish')) throw new ForbiddenException('Only Unite Group administrators can publish Unite opportunities');
  }
}
