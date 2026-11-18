/**
 * Launch — "Have something? Start something." Matches what a business has to business models (pure rules in
 * @collabiz/types), then to real records: live business offers in the model's categories, approved Unite programmes
 * (open ventures) and other businesses' declared needs. A plan tracks real applications made on COLLABIZ; later steps
 * (discussion, agreement, execution, first payment) are recorded by the business with a note, one step at a time.
 */
import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BUSINESS_MODELS, LAUNCH_STAGES, LaunchProfileSchema, matchBusinessModels, opsStateName, type LaunchProfile } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { businessOffers, collabAssets, collabNeeds, launchPlans, opportunities, opportunityApplications, organizations, uniteVentures, ventureInterests } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { nextCode } from './shared';

const LIVE_OFFER = ['verified', 'active', 'negotiating'];

@ApiTags('launch')
@Controller('launch')
export class LaunchController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async have(ctx: RequestContext, p: LaunchProfile) {
    if (!p.useCollab || !ctx.orgId) return p.have;
    const rows = await this.db.selectDistinct({ k: collabAssets.kind }).from(collabAssets).where(and(eq(collabAssets.orgId, ctx.orgId), sql`${collabAssets.archivedAt} is null`));
    return [...new Set([...p.have, ...rows.map((r) => r.k)])];
  }

  /** Real records for one model: offers, open programmes, and how many other businesses need what it provides. */
  private async records(ctx: RequestContext, code: string, state?: string | null) {
    const m = BUSINESS_MODELS.find((x) => x.code === code)!;
    const offers = await this.db.select({ id: opportunities.id, title: opportunities.title, city: opportunities.city, region: opportunities.region, category: businessOffers.category })
      .from(businessOffers).innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId))
      .where(and(inArray(businessOffers.category, m.offerCategories), inArray(businessOffers.status, LIVE_OFFER), ctx.orgId ? ne(opportunities.ownerOrgId, ctx.orgId) : undefined))
      .orderBy(desc(opportunities.createdAt)).limit(4);
    const programmes = m.ventures.length ? await this.db.select({ slug: uniteVentures.slug, name: uniteVentures.name, tagline: uniteVentures.tagline, open: uniteVentures.open }).from(uniteVentures).where(inArray(uniteVentures.slug, m.ventures)) : [];
    const [{ n }] = await this.db.select({ n: sql<number>`count(distinct ${collabNeeds.orgId})::int` }).from(collabNeeds)
      .where(and(inArray(collabNeeds.kind, m.servesNeeds), sql`${collabNeeds.archivedAt} is null`, ctx.orgId ? ne(collabNeeds.orgId, ctx.orgId) : undefined,
        state ? sql`(cardinality(${collabNeeds.regions}) = 0 or ${'IN-' + state} = any(${collabNeeds.regions}))` : undefined));
    return { offers, programmes: programmes.filter((p) => p.open).concat(programmes.filter((p) => !p.open)), lookingFor: Number(n) };
  }

  @Post('match')
  @HttpCode(200)
  async match(@Ctx() ctx: RequestContext, @Body(body(LaunchProfileSchema)) p: LaunchProfile) {
    const have = await this.have(ctx, p);
    const ranked = matchBusinessModels({ have, invest: p.invest, time: p.time }).slice(0, 6);
    return {
      have, place: p.city ? `${p.city}, ${opsStateName(p.state)}` : opsStateName(p.state),
      models: await Promise.all(ranked.map(async (r) => ({ code: r.model.code, title: r.model.title, summary: r.model.summary, earns: r.model.earns, firstSteps: r.model.firstSteps, score: r.score, uses: r.uses, gaps: r.gaps, ...(await this.records(ctx, r.model.code, p.state)) }))),
      note: 'Scores compare what you have with what each model needs. They are guidance, not a forecast of income.',
    };
  }

  @Post('plans')
  @RequireOrg()
  @HttpCode(201)
  async start(@Ctx() ctx: RequestContext, @Body(body(z.object({ model: z.string(), profile: LaunchProfileSchema }))) b: { model: string; profile: LaunchProfile }) {
    if (!BUSINESS_MODELS.some((m) => m.code === b.model)) throw new BadRequestException('Unknown business model');
    const code = await nextCode(this.db, launchPlans, 'LCH', 971000);
    const [p] = await this.db.insert(launchPlans).values({ code, orgId: ctx.orgId!, model: b.model, profile: b.profile, history: [{ stage: 0, at: new Date().toISOString(), by: ctx.userId, note: 'Plan started' }], createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'launch.plan_started', objectType: 'launch_plan', objectId: p.id, after: { code, model: b.model } });
    return { id: p.id, code };
  }

  /** Applications this business made since the plan started, to offers in the model's categories or to its programmes. */
  private async applications(orgId: string, code: string, since: Date) {
    const m = BUSINESS_MODELS.find((x) => x.code === code)!;
    const offers = await this.db.select({ id: opportunityApplications.id, status: opportunityApplications.status, title: opportunities.title, opportunityId: opportunities.id, at: opportunityApplications.createdAt })
      .from(opportunityApplications).innerJoin(opportunities, eq(opportunities.id, opportunityApplications.opportunityId)).innerJoin(businessOffers, eq(businessOffers.opportunityId, opportunities.id))
      .where(and(eq(opportunityApplications.organizationId, orgId), inArray(businessOffers.category, m.offerCategories), gte(opportunityApplications.createdAt, since)));
    const programmes = m.ventures.length ? await this.db.select({ id: ventureInterests.id, status: ventureInterests.status, title: uniteVentures.name, slug: uniteVentures.slug, at: ventureInterests.createdAt })
      .from(ventureInterests).innerJoin(uniteVentures, eq(uniteVentures.id, ventureInterests.ventureId)).where(and(eq(ventureInterests.organizationId, orgId), inArray(uniteVentures.slug, m.ventures), gte(ventureInterests.createdAt, since))) : [];
    return [...offers.map((o) => ({ kind: 'offer', id: o.id, title: o.title, status: o.status, href: `/opportunities/${o.opportunityId}`, at: o.at })), ...programmes.map((v) => ({ kind: 'programme', id: v.id, title: v.title, status: v.status, href: `/ventures/${v.slug}`, at: v.at }))];
  }
  private effective(stage: number, apps: number) { return Math.max(stage, apps ? 1 : 0); }

  @Get('plans')
  @RequireOrg()
  async plans(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(launchPlans).where(eq(launchPlans.orgId, ctx.orgId!)).orderBy(desc(launchPlans.createdAt));
    return Promise.all(rows.map(async (p) => {
      const apps = await this.applications(p.orgId, p.model, p.createdAt); const st = this.effective(p.stage, apps.length);
      return { id: p.id, code: p.code, model: p.model, modelTitle: BUSINESS_MODELS.find((m) => m.code === p.model)?.title ?? p.model, stage: st, stageLabel: LAUNCH_STAGES[st], applications: apps.length, status: p.status, createdAt: p.createdAt };
    }));
  }

  @Get('plans/:id')
  @RequireOrg()
  async plan(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [p] = await this.db.select().from(launchPlans).where(and(eq(launchPlans.id, id), eq(launchPlans.orgId, ctx.orgId!))).limit(1);
    if (!p) throw new NotFoundException('Plan not found');
    const m = BUSINESS_MODELS.find((x) => x.code === p.model)!;
    const apps = await this.applications(p.orgId, p.model, p.createdAt); const st = this.effective(p.stage, apps.length);
    const profile = p.profile as LaunchProfile;
    return { id: p.id, code: p.code, status: p.status, model: { code: m.code, title: m.title, summary: m.summary, earns: m.earns, firstSteps: m.firstSteps }, profile, stage: st, stages: LAUNCH_STAGES, applications: apps, history: p.history, createdAt: p.createdAt, ...(await this.records(ctx, m.code, profile.state)) };
  }

  @Post('plans/:id/stage')
  @RequireOrg()
  @HttpCode(200)
  async stage(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ stage: z.number().int().min(2).max(LAUNCH_STAGES.length - 1), note: z.string().trim().min(5, 'Say what happened (at least 5 characters)').max(500) }))) b: { stage: number; note: string }) {
    const [p] = await this.db.select().from(launchPlans).where(and(eq(launchPlans.id, id), eq(launchPlans.orgId, ctx.orgId!))).limit(1);
    if (!p) throw new NotFoundException('Plan not found');
    const apps = await this.applications(p.orgId, p.model, p.createdAt); const cur = this.effective(p.stage, apps.length);
    if (cur < 1) throw new BadRequestException('Apply to an offer or programme first — that is recorded automatically');
    if (b.stage !== cur + 1 && b.stage !== cur - 1) throw new BadRequestException('Move one step at a time');
    const history = [...(p.history as unknown[]), { stage: b.stage, at: new Date().toISOString(), by: ctx.userId, note: b.note }];
    await this.db.update(launchPlans).set({ stage: b.stage, history, updatedAt: new Date() }).where(eq(launchPlans.id, id));
    await this.audit.record(ctx, { action: 'launch.stage', objectType: 'launch_plan', objectId: id, before: { stage: cur }, after: { stage: b.stage, note: b.note } });
    return { id, stage: b.stage, stageLabel: LAUNCH_STAGES[b.stage] };
  }

  /** Org names for UI pickers (Commit) — verified businesses only, name and city. */
  @Get('directory')
  async directory() {
    return this.db.select({ id: organizations.id, name: organizations.displayName, city: organizations.city }).from(organizations).where(eq(organizations.verificationStatus, 'verified')).orderBy(organizations.displayName).limit(500);
  }
}
