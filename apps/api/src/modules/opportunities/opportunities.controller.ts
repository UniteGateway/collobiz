import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ApplicationDecisionSchema, ApplySchema, OpportunityCreateSchema, RfqCreateSchema, SavedSearchSchema } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { groupCompanies, notifications, opportunities, opportunityApplications, opportunityEvents, organizations, rfqRequests, savedOpportunities, savedSearches } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, OptionalCtx, Public, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { Idempotent } from '../../common/idempotency';
import { randomDigits } from '../../common/crypto';
import { viewerOf } from '../../common/viewer';
import { OpportunitiesService, OPEN_LIST, type ListFilters } from './opportunities.service';

const num = (v?: string) => (v == null || v === '' ? undefined : Number(v));
function filtersFrom(q: Record<string, string | undefined>): ListFilters {
  return { q: q.q, sector: q.sector, city: q.city, region: q.region, route: q.route, kind: q.kind, minValue: num(q.minValue), maxValue: num(q.maxValue), deadlineBefore: q.deadlineBefore, scope: (q.scope as ListFilters['scope']) ?? 'all' };
}

/** Screens 006, 009, 024, 025, 031–038, 040–042 and 023 KPIs. */
@ApiTags('opportunities')
@Controller()
export class OpportunitiesController {
  constructor(@InjectDb() private db: Db, private svc: OpportunitiesService, private audit: AuditService, private mail: MailService) {}

  @Public()
  @Get('public/opportunities')
  publicList(@Query() q: Record<string, string>) {
    return this.svc.list(null, filtersFrom(q), 50);
  }

  /** 009 — partner coverage by region (verified partners only; counts, never identities). */
  @Public()
  @Get('public/locations')
  async locations() {
    const coverage = await this.db.execute<{ region: string; partners: number }>(sql`select r.region, count(distinct p.organization_id)::int as partners
      from partner_profiles p join organizations o on o.id = p.organization_id, unnest(p.regions) as r(region)
      where o.verification_status = 'verified' group by r.region order by partners desc`).then((x) => x.rows);
    const offices = await this.db.select({ brandName: groupCompanies.brandName, city: organizations.city, country: organizations.country }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).where(eq(groupCompanies.status, 'active'));
    const openByRegion = await this.db.execute<{ region: string; open: number }>(sql`select region, count(*)::int as open from opportunities where listed and visibility = 'public' and status in ${OPEN_LIST} and region is not null group by region`).then((x) => x.rows);
    return { coverage, offices, openByRegion };
  }

  @Public()
  @Get('opportunities')
  list(@OptionalCtx() ctx: RequestContext | null, @Query() q: Record<string, string>) {
    return this.svc.list(ctx, filtersFrom(q), Number(q.limit) || 50);
  }

  /** 034 — category browser (counts of visible open opportunities per sector). */
  @Public()
  @Get('opportunities/categories')
  async categories(@OptionalCtx() ctx: RequestContext | null) {
    const rows = await this.svc.list(ctx, {}, 200);
    const by: Record<string, { sector: string; count: number; value: number }> = {};
    for (const o of rows) {
      by[o.sector] ??= { sector: o.sector, count: 0, value: 0 };
      by[o.sector].count++;
      by[o.sector].value += o.estimatedValue ?? 0;
    }
    return Object.values(by).sort((a, b) => b.count - a.count);
  }

  @Public()
  @Get('opportunities/:id')
  async detail(@OptionalCtx() ctx: RequestContext | null, @Param('id', ParseUUIDPipe) id: string) {
    const { view, row, v } = await this.svc.getVisible(ctx, id);
    const saved = ctx ? (await this.db.select().from(savedOpportunities).where(and(eq(savedOpportunities.userId, ctx.userId), eq(savedOpportunities.opportunityId, id))).limit(1)).length > 0 : false;
    const myApplication = ctx?.orgId ? (await this.db.select().from(opportunityApplications).where(and(eq(opportunityApplications.opportunityId, id), eq(opportunityApplications.organizationId, ctx.orgId))).orderBy(desc(opportunityApplications.createdAt)).limit(1))[0] ?? null : null;
    const history = v.platform || v.memberOf.has(row.ownerOrgId) ? await this.db.select().from(opportunityEvents).where(eq(opportunityEvents.opportunityId, id)).orderBy(asc(opportunityEvents.version)) : [];
    return { ...view, saved, myApplication, history };
  }

  @Get('opportunities/:id/eligibility')
  async eligibility(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { row } = await this.svc.getVisible(ctx, id);
    return this.svc.eligibility(ctx, row);
  }

  /** 042 — apply / express interest. Eligibility is re-checked server-side and snapshotted. */
  @Post('opportunities/:id/apply')
  @RequireCaps('opportunity.apply')
  @Idempotent()
  @HttpCode(201)
  async apply(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ApplySchema)) b: { message: string; proposedValue?: number; teamId?: string }) {
    const { row } = await this.svc.getVisible(ctx, id);
    const e = await this.svc.eligibility(ctx, row);
    if (!e.eligible) throw new ForbiddenException({ statusCode: 403, error: 'NotEligible', message: 'You are not eligible for this opportunity', checks: e.checks.filter((c) => c.result === 'fail') });
    const [a] = await this.db.insert(opportunityApplications).values({ opportunityId: id, organizationId: ctx.orgId!, applicantUserId: ctx.userId, message: b.message, proposedValue: b.proposedValue, teamId: b.teamId, eligibilitySnapshot: e.checks }).returning();
    await this.audit.record(ctx, { action: 'opportunity.applied', objectType: 'opportunity_application', objectId: a.id, after: { opportunityId: id, proposedValue: b.proposedValue } });
    await this.mail.emitIntegrationEvent('opportunity.application_submitted', { opportunityId: id, applicationId: a.id });
    return a;
  }

  @Post('opportunities/:id/applications/:appId/withdraw')
  @RequireOrg()
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('appId', ParseUUIDPipe) appId: string) {
    const [a] = await this.db.select().from(opportunityApplications).where(and(eq(opportunityApplications.id, appId), eq(opportunityApplications.opportunityId, id), eq(opportunityApplications.organizationId, ctx.orgId!))).limit(1);
    if (!a) throw new NotFoundException();
    if (!['submitted', 'shortlisted'].includes(a.status)) throw new BadRequestException(`An application that is ${a.status} cannot be withdrawn`);
    await this.db.update(opportunityApplications).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(opportunityApplications.id, appId));
    await this.audit.record(ctx, { action: 'opportunity.application_withdrawn', objectType: 'opportunity_application', objectId: appId, before: { status: a.status }, after: { status: 'withdrawn' } });
    return { status: 'withdrawn' };
  }

  @Get('opportunities/:id/applications')
  async applications(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { row } = await this.svc.getVisible(ctx, id);
    return this.svc.applicants(ctx, row);
  }

  /** Publisher decides on an application; an applicant can never decide on its own application. */
  @Post('opportunities/:id/applications/:appId/decision')
  @Idempotent()
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('appId', ParseUUIDPipe) appId: string, @Body(body(ApplicationDecisionSchema)) b: { status: string; reason: string }) {
    const { row } = await this.svc.getVisible(ctx, id);
    await this.svc.applicants(ctx, row); // authorization
    const [a] = await this.db.select().from(opportunityApplications).where(and(eq(opportunityApplications.id, appId), eq(opportunityApplications.opportunityId, id))).limit(1);
    if (!a) throw new NotFoundException();
    if (viewerOf(ctx).memberOf.has(a.organizationId)) throw new ForbiddenException('You cannot decide on your own organization\'s application');
    const allowed: Record<string, string[]> = { submitted: ['shortlisted', 'accepted', 'rejected'], shortlisted: ['accepted', 'rejected'] };
    if (!allowed[a.status]?.includes(b.status)) throw new BadRequestException(`Cannot move an application from ${a.status} to ${b.status}`);
    await this.db.update(opportunityApplications).set({ status: b.status, decisionReason: b.reason, decidedBy: ctx.userId, updatedAt: new Date() }).where(eq(opportunityApplications.id, appId));
    await this.audit.record(ctx, { action: `opportunity.application_${b.status}`, objectType: 'opportunity_application', objectId: appId, reason: b.reason, before: { status: a.status }, after: { status: b.status } });
    return { id: appId, status: b.status };
  }

  @Post('opportunities/:id/save')
  @HttpCode(200)
  async save(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.getVisible(ctx, id);
    await this.db.insert(savedOpportunities).values({ userId: ctx.userId, opportunityId: id }).onConflictDoNothing();
    return { saved: true };
  }

  @Delete('opportunities/:id/save')
  async unsave(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.delete(savedOpportunities).where(and(eq(savedOpportunities.userId, ctx.userId), eq(savedOpportunities.opportunityId, id)));
    return { saved: false };
  }

  /** 037 — saved opportunities (re-checked against current visibility) and saved searches with alerts. */
  @Get('me/saved')
  async saved(@Ctx() ctx: RequestContext) {
    const ids = (await this.db.select().from(savedOpportunities).where(eq(savedOpportunities.userId, ctx.userId))).map((s) => s.opportunityId);
    const visible = ids.length ? await this.svc.list(ctx, {}, 200) : [];
    const searches = await this.db.select().from(savedSearches).where(eq(savedSearches.userId, ctx.userId)).orderBy(desc(savedSearches.createdAt));
    return { opportunities: visible.filter((o) => ids.includes(o.id)), searches, unavailable: ids.filter((i) => !visible.some((o) => o.id === i)).length };
  }

  @Post('me/saved-searches')
  @HttpCode(201)
  async saveSearch(@Ctx() ctx: RequestContext, @Body(body(SavedSearchSchema)) b: z.infer<typeof SavedSearchSchema>) {
    const count = await this.db.select({ n: sql<number>`count(*)::int` }).from(savedSearches).where(eq(savedSearches.userId, ctx.userId));
    if (count[0].n >= 20) throw new BadRequestException('You can keep up to 20 saved searches');
    const [s] = await this.db.insert(savedSearches).values({ userId: ctx.userId, name: b.name, query: b.query, alert: b.alert }).returning();
    return s;
  }

  @Delete('me/saved-searches/:sid')
  async deleteSearch(@Ctx() ctx: RequestContext, @Param('sid', ParseUUIDPipe) sid: string) {
    const r = await this.db.delete(savedSearches).where(and(eq(savedSearches.id, sid), eq(savedSearches.userId, ctx.userId))).returning();
    if (!r.length) throw new NotFoundException();
    return { deleted: true };
  }

  /** 024 — my applications and the opportunities my organization published or originated. */
  @Get('me/opportunities')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const applications = await this.db.select({ a: opportunityApplications, o: opportunities }).from(opportunityApplications).innerJoin(opportunities, eq(opportunities.id, opportunityApplications.opportunityId))
      .where(eq(opportunityApplications.organizationId, ctx.orgId!)).orderBy(desc(opportunityApplications.createdAt));
    const owned = await this.db.select({ o: opportunities, applicants: sql<number>`(select count(*)::int from opportunity_applications x where x.opportunity_id = ${opportunities.id} and x.status <> 'withdrawn')` })
      .from(opportunities).where(eq(opportunities.ownerOrgId, ctx.orgId!)).orderBy(desc(opportunities.createdAt));
    return {
      applications: applications.map((r) => ({ ...r.a, opportunity: { id: r.o.id, code: r.o.code, title: r.o.title, status: r.o.status, sector: r.o.sector, deadline: r.o.deadline } })),
      owned: owned.map((r) => ({ id: r.o.id, code: r.o.code, title: r.o.title, status: r.o.status, route: r.o.route, sector: r.o.sector, estimatedValue: r.o.estimatedValue, listed: r.o.listed, applicants: r.applicants, createdAt: r.o.createdAt })),
    };
  }

  @Get('me/feed')
  @RequireOrg()
  feed(@Ctx() ctx: RequestContext) {
    return this.svc.feed(ctx);
  }

  @Get('me/dashboard')
  dashboard(@Ctx() ctx: RequestContext) {
    return this.svc.dashboard(ctx);
  }

  @Get('me/notifications')
  async notifications(@Ctx() ctx: RequestContext, @Query('unread') unread?: string) {
    return this.db.select().from(notifications).where(and(eq(notifications.userId, ctx.userId), unread === 'true' ? isNull(notifications.readAt) : undefined)).orderBy(desc(notifications.createdAt)).limit(100);
  }

  @Post('me/notifications/read')
  @HttpCode(200)
  async readAll(@Ctx() ctx: RequestContext, @Body(body(z.object({ ids: z.array(z.string().uuid()).optional() }))) b: { ids?: string[] }) {
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt), b.ids?.length ? inArray(notifications.id, b.ids) : undefined));
    return { ok: true };
  }

  /** 040 — submit a requirement / RFQ (buyers may be anonymous). Enters Unite-first review (Stage 06). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/rfq')
  @HttpCode(201)
  async rfq(@OptionalCtx() ctx: RequestContext | null, @Body(body(RfqCreateSchema)) b: z.infer<typeof RfqCreateSchema>) {
    const [platform] = await this.db.select().from(organizations).where(eq(organizations.type, 'platform')).limit(1);
    const [gc] = await this.db.select().from(groupCompanies).where(sql`${b.sector} = any(${groupCompanies.sectors}) and ${groupCompanies.status} = 'active'`).limit(1);
    const code = await this.svc.nextCode();
    const reference = `RFQ-${randomDigits(8)}`;
    const o = await this.db.transaction(async (tx) => {
      const [o] = await tx.insert(opportunities).values({
        code, title: b.title, summary: [b.description, b.quantity ? `Quantity: ${b.quantity}` : null].filter(Boolean).join('\n'), sector: b.sector, kind: 'rfq', route: 'unite_owned', source: 'rfq',
        city: b.city, estimatedValue: b.budget, deadline: b.neededBy ? new Date(b.neededBy) : null, visibility: 'private', ownerOrgId: platform.id, groupCompanyOrgId: gc?.organizationId ?? null,
        buyerConfidential: true, status: 'draft', createdBy: ctx?.userId ?? null,
      }).returning();
      await tx.insert(rfqRequests).values({ reference, opportunityId: o.id, contactName: b.contactName, contactEmail: b.contactEmail, contactPhone: b.contactPhone, submittedByUserId: ctx?.userId ?? null, consentAt: new Date() });
      await tx.insert(opportunityEvents).values({ opportunityId: o.id, version: 1, fromStatus: null, toStatus: 'draft', reason: 'RFQ received', actorUserId: ctx?.userId ?? null });
      return this.svc.transition(ctx, o.id, 'submitted', 'Buyer requirement submitted with consent', tx as unknown as Db);
    });
    await this.mail.send('email', b.contactEmail, `COLLABIZ requirement ${reference}`, `Thank you, ${b.contactName}. A Unite Group team will review your requirement (${o.code}) and respond.`);
    return { reference, code: o.code };
  }
}

/** Unite Group publishing of route-A opportunities (supports 031/032; admin console). */
@ApiTags('admin')
@Controller('admin/opportunities')
export class AdminOpportunitiesController {
  constructor(@InjectDb() private db: Db, private svc: OpportunitiesService) {}

  @Get()
  @RequireCaps('opportunity.publish')
  async list(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    const scope = ctx.platformRoles.includes('super_admin') || ctx.caps.has('opportunity.moderate') && ctx.platformRoles.includes('routing_owner') ? undefined : inArray(opportunities.ownerOrgId, ctx.memberships.map((m) => m.organizationId));
    return this.db.select({ o: opportunities, ownerName: organizations.displayName, applicants: sql<number>`(select count(*)::int from opportunity_applications x where x.opportunity_id = ${opportunities.id} and x.status <> 'withdrawn')` })
      .from(opportunities).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(scope, status ? eq(opportunities.status, status) : undefined)).orderBy(desc(opportunities.createdAt)).limit(200)
      .then((r) => r.map((x) => ({ ...x.o, ownerName: x.ownerName, applicants: x.applicants })));
  }

  /** Publish a Unite-owned listing (route A) on behalf of the admin's group company. */
  @Post()
  @RequireCaps('opportunity.publish')
  @Idempotent()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(OpportunityCreateSchema.extend({ publish: z.boolean().default(true) }))) b: z.infer<typeof OpportunityCreateSchema> & { publish: boolean }) {
    this.svc.assertDraftable(b, ctx);
    const owner = b.groupCompanyId ?? ctx.memberships.find((m) => m.orgType === 'group_company')?.organizationId;
    if (!owner) throw new BadRequestException('Choose the Unite Group company publishing this opportunity');
    const isSuper = ctx.platformRoles.includes('super_admin');
    if (!isSuper && !ctx.memberships.some((m) => m.organizationId === owner)) throw new ForbiddenException('You can only publish for your own group company');
    const code = await this.svc.nextCode();
    const o = await this.db.transaction(async (tx) => {
      const [o] = await tx.insert(opportunities).values({
        code, title: b.title, summary: b.summary, sector: b.sector, kind: b.kind, route: 'unite_owned', source: 'unite_listing', city: b.city, region: b.region, country: b.country, lat: b.lat, lng: b.lng,
        estimatedValue: b.estimatedValue, currency: b.currency, deadline: b.deadline ? new Date(b.deadline) : null, visibility: b.visibility, minLevel: b.minLevel, requiredCertifications: b.requiredCertifications,
        ownerOrgId: owner, groupCompanyOrgId: owner, status: 'draft', createdBy: ctx.userId,
      }).returning();
      await tx.insert(opportunityEvents).values({ opportunityId: o.id, version: 1, fromStatus: null, toStatus: 'draft', reason: 'Created', actorUserId: ctx.userId });
      if (!b.publish) return o;
      return this.svc.transition(ctx, o.id, 'qualification', 'Unite-owned listing published', tx as unknown as Db, undefined, { listed: true, publishedAt: new Date() });
    });
    if (o.listed) await this.svc.notifySavedSearches(o);
    return o;
  }

  @Post(':id/publish')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async publish(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ expectedVersion: z.number().int() }))) b: { expectedVersion: number }) {
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!o) throw new NotFoundException();
    if (!ctx.platformRoles.includes('super_admin') && !ctx.memberships.some((m) => m.organizationId === o.ownerOrgId)) throw new ForbiddenException();
    const u = await this.svc.transition(ctx, id, 'qualification', 'Published', this.db, b.expectedVersion, { listed: true, publishedAt: new Date() });
    await this.svc.notifySavedSearches(u);
    return u;
  }

  @Post(':id/close')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000) }))) b: { reason: string }) {
    const [o] = await this.db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
    if (!o) throw new NotFoundException();
    if (!ctx.platformRoles.includes('super_admin') && !ctx.memberships.some((m) => m.organizationId === o.ownerOrgId)) throw new ForbiddenException();
    return this.svc.transition(ctx, id, 'lost', b.reason, this.db, undefined, { listed: false });
  }

}

@Module({ controllers: [OpportunitiesController, AdminOpportunitiesController], providers: [OpportunitiesService], exports: [OpportunitiesService] })
export class OpportunitiesModule {}
