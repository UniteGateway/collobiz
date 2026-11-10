/**
 * COLLABIZ plans (tested in test/billing.e2e.ts). Unite sets prices and limits and publishes a plan; until then a plan is a
 * draft no company can choose. A company asks to upgrade; Unite finance activates it once payment arrives by bank transfer
 * (online payment needs a gateway — not connected). Usage is shown against limits; limits are not enforced in this build.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PlanActivateSchema, PlanRequestSchema, PlanUpdateSchema, usageAgainst, yearlySavingPct, type PlanLimits } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { bulkImports, gstDocuments, leadClaims, memberships, notifications, organizations, orgSubscriptions, platformPlans } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { PROVIDERS, providerConnected, requireProvider } from '../../common/providers';

const superAdmin = (ctx: RequestContext) => ctx.platformRoles.includes('super_admin') && !ctx.mfaRequiredButMissing;
const money = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance') && !ctx.mfaRequiredButMissing;
const manager = (ctx: RequestContext, orgId: string) => ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
type Plan = typeof platformPlans.$inferSelect;
const view = (p: Plan) => ({ code: p.code, name: p.name, description: p.description, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly, yearlySavingPct: yearlySavingPct(p.priceMonthly, p.priceYearly), limits: p.limits as PlanLimits, features: p.features, status: p.status, priced: p.priceMonthly != null });

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async subscription(orgId: string) {
    const [s] = await this.db.select().from(orgSubscriptions).where(eq(orgSubscriptions.orgId, orgId));
    return s ?? { orgId, planCode: 'free', status: 'active', requestedPlan: null, requestedCycle: null, cycle: null, periodEnd: null, paymentReference: null, requestedAt: null };
  }
  private async usage(orgId: string, limits: PlanLimits) {
    const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const c = sql<number>`count(*)::int`;
    const [leads] = await this.db.select({ n: c }).from(leadClaims).where(and(eq(leadClaims.introducerOrgId, orgId), gte(leadClaims.createdAt, month)));
    const [team] = await this.db.select({ n: c }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    const [gst] = await this.db.select({ n: c }).from(gstDocuments).where(and(eq(gstDocuments.orgId, orgId), gte(gstDocuments.createdAt, month)));
    const [imp] = await this.db.select({ n: c }).from(bulkImports).where(and(eq(bulkImports.orgId, orgId), eq(bulkImports.status, 'committed'), gte(bulkImports.createdAt, month)));
    return usageAgainst(limits, { leadsPerMonth: leads.n, teamMembers: team.n, gstDocsPerMonth: gst.n, importsPerMonth: imp.n });
  }

  @Get('billing')
  async mine(@Ctx() ctx: RequestContext) {
    if (!ctx.orgId) throw new ForbiddenException('Choose your company first');
    const plans = await this.db.select().from(platformPlans).orderBy(asc(platformPlans.sort));
    const sub = await this.subscription(ctx.orgId);
    const current = plans.find((p) => p.code === sub.planCode)!;
    return {
      subscription: { plan: sub.planCode, planName: current.name, status: sub.status, requestedPlan: sub.requestedPlan, requestedCycle: sub.requestedCycle, cycle: sub.cycle, periodEnd: sub.periodEnd },
      usage: await this.usage(ctx.orgId, current.limits as PlanLimits),
      plans: plans.filter((p) => p.status === 'published').map(view),
      comingSoon: plans.filter((p) => p.status === 'draft').map((p) => ({ code: p.code, name: p.name, description: p.description })),
      canRequest: manager(ctx, ctx.orgId), payments: { connected: providerConnected('payments'), note: PROVIDERS.payments.manual },
      note: 'Usage is shown against your plan for planning. Limits are not enforced yet.',
    };
  }

  @Post('billing/request')
  @HttpCode(200)
  async request(@Ctx() ctx: RequestContext, @Body(body(PlanRequestSchema)) b: z.infer<typeof PlanRequestSchema>) {
    if (!ctx.orgId || !manager(ctx, ctx.orgId)) throw new ForbiddenException('A company owner or admin changes the plan');
    const [p] = await this.db.select().from(platformPlans).where(eq(platformPlans.code, b.plan));
    if (!p || p.status !== 'published') throw new BadRequestException('That plan is not available yet');
    if (p.priceMonthly == null || (b.cycle === 'yearly' && p.priceYearly == null)) throw new BadRequestException('That plan has no price for this billing cycle yet');
    const sub = await this.subscription(ctx.orgId);
    if (sub.planCode === b.plan && sub.status === 'active') throw new ConflictException('You are already on this plan');
    const v = { requestedPlan: b.plan, requestedCycle: b.cycle, requestedBy: ctx.userId, requestedAt: new Date(), status: 'requested', updatedAt: new Date() };
    await this.db.insert(orgSubscriptions).values({ orgId: ctx.orgId, planCode: sub.planCode, ...v }).onConflictDoUpdate({ target: orgSubscriptions.orgId, set: v });
    const fin = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(sql`${memberships.role} in ('finance','super_admin')`, eq(memberships.status, 'active')));
    const [o] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, ctx.orgId));
    if (fin.length) await this.db.insert(notifications).values(fin.map((f) => ({ userId: f.u, kind: 'announcement', title: `Plan request: ${o.n}`, body: `${p.name} (${b.cycle}). Send an invoice and activate when paid.`, link: '/billing' })));
    await this.audit.record(ctx, { action: 'billing.plan_requested', objectType: 'organization', objectId: ctx.orgId, after: b });
    return this.mine(ctx);
  }

  @Post('billing/pay-online')
  @HttpCode(200)
  payOnline() { return requireProvider('payments'); }

  // ---------- Unite ----------
  @Get('admin/billing')
  async admin(@Ctx() ctx: RequestContext) {
    if (!money(ctx)) throw new ForbiddenException('For Unite finance');
    const plans = await this.db.select().from(platformPlans).orderBy(asc(platformPlans.sort));
    const subs = await this.db.select({ s: orgSubscriptions, org: organizations.displayName }).from(orgSubscriptions).innerJoin(organizations, eq(organizations.id, orgSubscriptions.orgId));
    return { plans: plans.map(view), requests: subs.filter((x) => x.s.status === 'requested').map((x) => ({ orgId: x.s.orgId, organization: x.org, current: x.s.planCode, requested: x.s.requestedPlan, cycle: x.s.requestedCycle, at: x.s.requestedAt })),
      paid: subs.filter((x) => x.s.planCode !== 'free' && x.s.status === 'active').map((x) => ({ orgId: x.s.orgId, organization: x.org, plan: x.s.planCode, cycle: x.s.cycle, periodEnd: x.s.periodEnd, paymentReference: x.s.paymentReference })), canEditPlans: superAdmin(ctx) };
  }

  @Put('admin/billing/plans/:code')
  async update(@Ctx() ctx: RequestContext, @Param('code') code: string, @Body(body(PlanUpdateSchema)) b: z.infer<typeof PlanUpdateSchema>) {
    if (!superAdmin(ctx)) throw new ForbiddenException('Only a super admin changes plans and prices');
    const [p] = await this.db.update(platformPlans).set({ ...b, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(platformPlans.code, code)).returning();
    if (!p) throw new NotFoundException('Plan not found');
    await this.audit.record(ctx, { action: 'billing.plan_updated', objectType: 'platform_plan', objectId: ctx.userId, after: { code, ...b } });
    return view(p);
  }

  @Post('admin/billing/plans/:code/publish')
  @HttpCode(200)
  async publish(@Ctx() ctx: RequestContext, @Param('code') code: string) {
    if (!superAdmin(ctx)) throw new ForbiddenException('Only a super admin publishes plans');
    const [p] = await this.db.select().from(platformPlans).where(eq(platformPlans.code, code));
    if (!p) throw new NotFoundException('Plan not found');
    if (p.priceMonthly == null) throw new BadRequestException('Set a monthly price before publishing');
    const [u] = await this.db.update(platformPlans).set({ status: 'published', updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(platformPlans.code, code)).returning();
    await this.audit.record(ctx, { action: 'billing.plan_published', objectType: 'platform_plan', objectId: ctx.userId, after: { code, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly } });
    return view(u);
  }

  @Post('admin/billing/requests/:orgId/activate')
  @HttpCode(200)
  async activate(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(body(PlanActivateSchema)) b: z.infer<typeof PlanActivateSchema>) {
    if (!money(ctx)) throw new ForbiddenException('For Unite finance');
    const [s] = await this.db.select().from(orgSubscriptions).where(eq(orgSubscriptions.orgId, orgId));
    if (!s || s.status !== 'requested' || !s.requestedPlan) throw new ConflictException('No plan request to activate');
    if (b.periodEnd <= new Date().toISOString().slice(0, 10)) throw new BadRequestException('The paid period must end in the future');
    await this.db.update(orgSubscriptions).set({ planCode: s.requestedPlan, cycle: s.requestedCycle, status: 'active', periodEnd: b.periodEnd, paymentReference: b.paymentReference, activatedBy: ctx.userId, activatedAt: new Date(), requestedPlan: null, requestedCycle: null, updatedAt: new Date() }).where(eq(orgSubscriptions.orgId, orgId));
    await this.audit.record(ctx, { action: 'billing.plan_activated', objectType: 'organization', objectId: orgId, after: { plan: s.requestedPlan, ...b } });
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title: 'Your COLLABIZ plan is active', body: `Paid until ${b.periodEnd}.`, link: '/settings/plan' })));
    return { ok: true };
  }
}

@Module({ controllers: [BillingController] })
export class BillingModule {}
