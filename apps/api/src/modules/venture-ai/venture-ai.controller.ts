/**
 * COLLABIZ VENTURE AI API (tested in test/venture-ai.e2e.ts). Feature flag FEATURE_VENTURE_AI.
 *
 * Flow: opportunity (with evidence, score, concept, finance) → submitted → Unite admin approves → a Venture Room is created
 * with the proposer as owner → members are matched per role and invited → they accept or decline (consent) → tasks,
 * approvals and agent runs inside the room. Binding agreements, money, purchase orders and material public claims always need
 * a human approval record. Numbers come from the deterministic engines in @collabiz/types.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  VAI_ROLES, VaiAgentRunSchema, VaiCapabilitySchema, VaiConveyorSchema, VaiEvidenceSchema, VaiFinanceSchema, VaiInviteSchema, VaiOpportunitySchema, VaiScoreInputSchema, VaiTaskSchema,
  financialModel, matchRole, scoreOpportunity, sizeSolarConveyor, vaiSensitivity, type VaiCheck, type VaiCriterion, type VaiRole,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { memberships, notifications, organizations, siteSettings, users, vaiAgentRuns, vaiApprovals, vaiCapabilities, vaiEvidence, vaiMembers, vaiOpportunities, vaiTasks, vaiVentures } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { config } from '../../config';
import { AGENTS, VentureAiProvider, type AgentKey } from './provider';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const code = (p: string) => `${p}-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
type Opp = typeof vaiOpportunities.$inferSelect;
interface Settings { killSwitch: boolean; monthlyBudgetPaise: number }
const APPROVAL_KINDS = ['binding_agreement', 'financial_commitment', 'payment', 'purchase_order', 'public_claim', 'data_sharing', 'production_release', 'safety_engineering'] as const;

@ApiTags('venture-ai')
@Controller()
export class VentureAiController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private ai: VentureAiProvider) {}

  private on() { if (!config().FEATURE_VENTURE_AI) throw new NotFoundException('VENTURE AI is not enabled'); }
  private admin(ctx: RequestContext) { const m = ctx.memberships?.find((x) => x.organizationId === ctx.orgId); if (m && !['org_owner', 'org_admin'].includes(m.role)) throw new ForbiddenException('Only owners and admins of your business can do this'); }
  private async settings(): Promise<Settings> { const [s] = await this.db.select().from(siteSettings).where(eq(siteSettings.key, 'venture_ai')).limit(1); return { killSwitch: false, monthlyBudgetPaise: 0, ...((s?.value as Partial<Settings>) ?? {}) }; }
  private async opp(id: string) { const [o] = await this.db.select().from(vaiOpportunities).where(or(eq(vaiOpportunities.id, id), eq(vaiOpportunities.code, id))).limit(1); if (!o) throw new NotFoundException('Opportunity not found'); return o; }
  private canSee(ctx: RequestContext, o: Opp) { if (o.status !== 'approved' && o.orgId !== ctx.orgId && !staff(ctx)) throw new NotFoundException('Opportunity not found'); }
  private canEditOpp(ctx: RequestContext, o: Opp) { if (o.orgId !== ctx.orgId && !staff(ctx)) throw new ForbiddenException(); if (!['draft', 'in_review'].includes(o.status) && !staff(ctx)) throw new ConflictException('Approved opportunities are changed through a new version by Unite'); }
  private async room(ctx: RequestContext, id: string) {
    const [v] = await this.db.select().from(vaiVentures).where(or(eq(vaiVentures.id, id), eq(vaiVentures.code, id))).limit(1);
    if (!v) throw new NotFoundException('Venture Room not found');
    const [me] = await this.db.select().from(vaiMembers).where(and(eq(vaiMembers.ventureId, v.id), eq(vaiMembers.orgId, ctx.orgId ?? '00000000-0000-0000-0000-000000000000'), inArray(vaiMembers.status, ['owner', 'accepted']))).limit(1);
    if (!me && !staff(ctx)) throw new NotFoundException('Venture Room not found');
    return { v, me: me ?? null, owner: me?.status === 'owner' || staff(ctx) };
  }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const team = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin'])));
    if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.u, kind: 'venture_ai', title, body: text, link })));
  }
  private view(o: Opp) { return { ...o, roles: o.roles as { role: VaiRole; count: number; categories: string[]; countries: string[]; note?: string }[] }; }

  // ------------------------------------------------------------------ dashboard
  @Get('venture-ai/dashboard')
  @RequireOrg()
  async dashboard(@Ctx() ctx: RequestContext) {
    this.on();
    const opps = await this.db.select().from(vaiOpportunities).where(or(eq(vaiOpportunities.status, 'approved'), eq(vaiOpportunities.orgId, ctx.orgId!))).orderBy(desc(vaiOpportunities.updatedAt)).limit(50);
    const mine = await this.db.select({ m: vaiMembers, v: vaiVentures }).from(vaiMembers).innerJoin(vaiVentures, eq(vaiVentures.id, vaiMembers.ventureId)).where(eq(vaiMembers.orgId, ctx.orgId!)).orderBy(desc(vaiMembers.createdAt));
    const [cap] = await this.db.select({ id: vaiCapabilities.id, roles: vaiCapabilities.roles }).from(vaiCapabilities).where(eq(vaiCapabilities.orgId, ctx.orgId!)).limit(1);
    const s = await this.settings();
    return {
      capability: cap ?? null, provider: this.ai.available() ? 'anthropic' : 'rules', killSwitch: s.killSwitch,
      opportunities: opps.map((o) => ({ id: o.id, code: o.code, title: o.title, type: o.type, status: o.status, score: (o.score as { result?: { score: number | null; label: string } } | null)?.result ?? null, investmentPaise: o.investmentPaise, roles: (o.roles as unknown[]).length, sample: o.sample, mine: o.orgId === ctx.orgId })),
      ventures: mine.filter((x) => ['owner', 'accepted'].includes(x.m.status)).map((x) => ({ id: x.v.id, code: x.v.code, name: x.v.name, status: x.v.status, role: x.m.role, sample: x.v.sample })),
      invitations: mine.filter((x) => x.m.status === 'invited').map((x) => ({ id: x.m.id, venture: x.v.name, role: x.m.role, message: x.m.message, investmentPaise: x.m.investmentPaise, earningsNote: x.m.earningsNote, risksNote: x.m.risksNote, matchReasons: x.m.matchReasons })),
    };
  }

  // ------------------------------------------------------------------ member capabilities
  @Get('venture-ai/capabilities')
  @RequireOrg()
  async myCapability(@Ctx() ctx: RequestContext) { this.on(); const [c] = await this.db.select().from(vaiCapabilities).where(eq(vaiCapabilities.orgId, ctx.orgId!)).limit(1); return { capability: c ?? null }; }

  @Put('venture-ai/capabilities')
  @RequireOrg()
  async saveCapability(@Ctx() ctx: RequestContext, @Body(body(VaiCapabilitySchema)) b: z.infer<typeof VaiCapabilitySchema>) {
    this.on(); this.admin(ctx);
    if (b.investmentMinPaise != null && b.investmentMaxPaise != null && b.investmentMinPaise > b.investmentMaxPaise) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { investmentMaxPaise: 'Maximum is below minimum' } });
    const v = { ...b, locations: b.locations ?? null, capacity: b.capacity ?? null, spareCapacity: b.spareCapacity ?? null, machinery: b.machinery ?? null, technology: b.technology ?? null, moq: b.moq ?? null, experience: b.experience ?? null, investmentMinPaise: b.investmentMinPaise ?? null, investmentMaxPaise: b.investmentMaxPaise ?? null, updatedBy: ctx.userId };
    const [c] = await this.db.insert(vaiCapabilities).values({ orgId: ctx.orgId!, ...v }).onConflictDoUpdate({ target: vaiCapabilities.orgId, set: { ...v, updatedAt: new Date() } }).returning();
    return c;
  }

  // ------------------------------------------------------------------ opportunities
  @Post('venture-ai/opportunities')
  @RequireOrg()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(VaiOpportunitySchema)) b: z.infer<typeof VaiOpportunitySchema>) {
    this.on(); this.admin(ctx);
    const o = await this.db.transaction(async (tx) => {
      const [o] = await tx.insert(vaiOpportunities).values({ code: code('VAI'), title: b.title, type: b.type, problem: b.problem, marketGap: b.marketGap, targetCustomers: b.targetCustomers, proposedSolution: b.proposedSolution,
        competitors: b.competitors ?? null, technology: b.technology ?? null, manufacturing: b.manufacturing ?? null, investmentPaise: b.investmentPaise ?? null, marginPct: b.marginPct ?? null, countries: b.countries,
        risks: b.risks ?? null, regulatory: b.regulatory ?? null, roles: b.roles, origin: staff(ctx) ? 'admin' : 'member', orgId: ctx.orgId!, createdBy: ctx.userId }).returning();
      if (b.evidence.length) await tx.insert(vaiEvidence).values(b.evidence.map((e) => ({ opportunityId: o.id, kind: e.kind, statement: e.statement, source: e.source ?? null, sourceDate: e.sourceDate ?? null, addedBy: ctx.userId })));
      return o;
    });
    await this.audit.record(ctx, { action: 'venture_ai.opportunity_created', objectType: 'vai_opportunity', objectId: o.id, after: { code: o.code } });
    return { id: o.id, code: o.code, status: o.status };
  }

  @Get('venture-ai/opportunities/:id')
  @RequireOrg()
  async detail(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    this.on();
    const o = await this.opp(id); this.canSee(ctx, o);
    const evidence = await this.db.select().from(vaiEvidence).where(eq(vaiEvidence.opportunityId, o.id)).orderBy(vaiEvidence.createdAt);
    const [venture] = await this.db.select({ id: vaiVentures.id, code: vaiVentures.code }).from(vaiVentures).where(eq(vaiVentures.opportunityId, o.id)).limit(1);
    const [org] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, o.orgId)).limit(1);
    return { ...this.view(o), proposer: org?.n, evidence, venture: venture ?? null, mine: o.orgId === ctx.orgId, staff: staff(ctx) };
  }

  @Post('venture-ai/opportunities/:id/evidence')
  @RequireOrg()
  @HttpCode(201)
  async addEvidence(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiEvidenceSchema)) b: z.infer<typeof VaiEvidenceSchema>) {
    this.on(); const o = await this.opp(id); this.canEditOpp(ctx, o);
    const [e] = await this.db.insert(vaiEvidence).values({ opportunityId: o.id, kind: b.kind, statement: b.statement, source: b.source ?? null, sourceDate: b.sourceDate ?? null, addedBy: ctx.userId }).returning();
    return e;
  }

  @Post('venture-ai/opportunities/:id/score')
  @RequireOrg()
  @HttpCode(200)
  async score(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiScoreInputSchema)) b: z.infer<typeof VaiScoreInputSchema>) {
    this.on(); const o = await this.opp(id); this.canEditOpp(ctx, o);
    const result = scoreOpportunity(b.criteria as Partial<Record<VaiCriterion, { value: number | null; evidence: 'strong' | 'some' | 'none' }>>, {}, b.checks as Partial<Record<VaiCheck, 'pass' | 'fail' | 'pending'>>);
    await this.db.update(vaiOpportunities).set({ score: { inputs: b.criteria, checks: b.checks, result }, updatedAt: new Date() }).where(eq(vaiOpportunities.id, o.id));
    return result;
  }

  @Post('venture-ai/opportunities/:id/finance')
  @RequireOrg()
  @HttpCode(200)
  async finance(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiFinanceSchema)) b: z.infer<typeof VaiFinanceSchema>) {
    this.on(); const o = await this.opp(id); this.canEditOpp(ctx, o);
    const result = financialModel(b); const sens = vaiSensitivity(b);
    const prev = (o.finance as { versions?: number } | null)?.versions ?? 0;
    await this.db.update(vaiOpportunities).set({ finance: { inputs: b, result, sensitivity: sens, versions: prev + 1, at: new Date().toISOString(), by: ctx.userId }, updatedAt: new Date() }).where(eq(vaiOpportunities.id, o.id));
    return { result, sensitivity: sens, version: prev + 1 };
  }

  /** Solar Conveyor combination sizing (the pilot combination workflow). */
  @Post('venture-ai/opportunities/:id/conveyor')
  @RequireOrg()
  @HttpCode(200)
  async conveyor(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiConveyorSchema)) b: z.infer<typeof VaiConveyorSchema>) {
    this.on(); const o = await this.opp(id); this.canEditOpp(ctx, o);
    const result = sizeSolarConveyor(b);
    await this.db.update(vaiOpportunities).set({ concept: { ...((o.concept as object) ?? {}), conveyor: { inputs: b, result } }, updatedAt: new Date() }).where(eq(vaiOpportunities.id, o.id));
    return result;
  }

  @Post('venture-ai/opportunities/:id/submit')
  @RequireOrg()
  @HttpCode(200)
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const o = await this.opp(id);
    if (o.orgId !== ctx.orgId) throw new ForbiddenException();
    if (o.status !== 'draft') throw new ConflictException('Already submitted');
    if (!(o.roles as unknown[]).length) throw new BadRequestException('Add the roles this business needs before submitting');
    if (!o.score) throw new BadRequestException('Score the opportunity before submitting');
    await this.db.update(vaiOpportunities).set({ status: 'in_review', updatedAt: new Date() }).where(eq(vaiOpportunities.id, o.id));
    return { status: 'in_review' };
  }

  /** Candidates for each required role, from member capability profiles. Contact details are never returned. */
  @Get('venture-ai/opportunities/:id/matches')
  @RequireOrg()
  async matches(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const o = await this.opp(id); this.canSee(ctx, o);
    const caps = await this.db.select({ c: vaiCapabilities, org: organizations.displayName, verified: organizations.verificationStatus }).from(vaiCapabilities).innerJoin(organizations, eq(organizations.id, vaiCapabilities.orgId)).where(ne(vaiCapabilities.orgId, o.orgId));
    const done = await this.db.select({ orgId: vaiMembers.orgId, n: sql<number>`count(*)::int` }).from(vaiMembers).innerJoin(vaiVentures, eq(vaiVentures.id, vaiMembers.ventureId)).where(and(eq(vaiMembers.status, 'accepted'), eq(vaiVentures.status, 'closed'))).groupBy(vaiMembers.orgId);
    const doneBy = new Map(done.map((d) => [d.orgId, d.n]));
    return { roles: this.view(o).roles.map((r) => ({ role: r.role, label: VAI_ROLES[r.role], count: r.count,
      candidates: caps.map(({ c, org, verified }) => { const m = matchRole({ role: r.role, categories: r.categories ?? [], countries: r.countries?.length ? r.countries : o.countries, investmentPaise: r.role === 'investor' ? o.investmentPaise : null }, { ...c, verified: verified === 'verified', completedCollaborations: doneBy.get(c.orgId) ?? 0 });
        return m ? { capabilityId: c.id, org, countries: c.countries, ...m } : null; }).filter(Boolean).sort((a, b) => b!.percent - a!.percent).slice(0, 8) })),
      note: 'Match percentage = points for role, categories, countries, investment, certifications, availability, verification and track record — each reason is listed. Contact details are shared only after a member accepts.' };
  }

  // ------------------------------------------------------------------ admin decision → Venture Room
  @Post('admin/venture-ai/opportunities/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(600).optional() }))) b: { decision: 'approve' | 'reject'; note?: string }) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException('Unite admins approve opportunities');
    const o = await this.opp(id);
    if (o.status !== 'in_review') throw new ConflictException('Only opportunities in review can be decided');
    const r = (o.score as { result?: { classification: string } } | null)?.result;
    if (b.decision === 'approve' && r?.classification === 'blocked') throw new ConflictException('A failed mandatory check blocks approval');
    const out = await this.db.transaction(async (tx) => {
      await tx.update(vaiOpportunities).set({ status: b.decision === 'approve' ? 'approved' : 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: b.note ?? null, updatedAt: new Date() }).where(eq(vaiOpportunities.id, o.id));
      if (b.decision !== 'approve') return null;
      const [v] = await tx.insert(vaiVentures).values({ code: code('VR'), opportunityId: o.id, name: o.title, sample: o.sample, createdBy: ctx.userId }).returning();
      await tx.insert(vaiMembers).values({ ventureId: v.id, orgId: o.orgId, role: 'business_owner', status: 'owner', respondedBy: o.createdBy, respondedAt: new Date() });
      return v;
    });
    await this.notifyOrg(o.orgId, b.decision === 'approve' ? `${o.title}: approved — your Venture Room is open` : `${o.title}: not approved`, b.note ?? (b.decision === 'approve' ? 'Find members for each role and invite them.' : ''), out ? `/venture-ai/rooms/${out.id}` : `/venture-ai/opportunities/${o.id}`);
    await this.audit.record(ctx, { action: `venture_ai.opportunity_${b.decision === 'approve' ? 'approved' : 'rejected'}`, objectType: 'vai_opportunity', objectId: o.id });
    return { status: b.decision === 'approve' ? 'approved' : 'rejected', ventureId: out?.id ?? null };
  }

  // ------------------------------------------------------------------ invitations (consent)
  @Post('venture-ai/rooms/:id/invitations')
  @RequireOrg()
  @HttpCode(201)
  async invite(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiInviteSchema)) b: z.infer<typeof VaiInviteSchema>) {
    this.on(); const { v, owner } = await this.room(ctx, id); if (!owner) throw new ForbiddenException('Only the venture owner invites members'); this.admin(ctx);
    const [c] = await this.db.select().from(vaiCapabilities).where(eq(vaiCapabilities.id, b.capabilityId)).limit(1);
    if (!c) throw new NotFoundException('Member not found');
    const o = await this.opp(v.opportunityId);
    const need = this.view(o).roles.find((r) => r.role === b.role);
    if (!need) throw new BadRequestException('This role is not part of the venture');
    const [org] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, c.orgId)).limit(1);
    const m = matchRole({ role: b.role, categories: need.categories ?? [], countries: need.countries?.length ? need.countries : o.countries, investmentPaise: b.role === 'investor' ? o.investmentPaise : null }, { ...c, verified: org?.v === 'verified', completedCollaborations: 0 });
    if (!m) throw new BadRequestException('This member does not offer that role');
    const [x] = await this.db.insert(vaiMembers).values({ ventureId: v.id, orgId: c.orgId, role: b.role, message: b.message, investmentPaise: b.investmentPaise ?? null, earningsNote: b.earningsNote ?? null, risksNote: b.risksNote ?? null, matchPercent: m.percent, matchReasons: m.reasons, invitedBy: ctx.userId })
      .onConflictDoNothing().returning();
    if (!x) throw new ConflictException('This member is already invited for this role');
    await this.notifyOrg(c.orgId, `Invitation: ${VAI_ROLES[b.role]} in ${v.name}`, b.message.slice(0, 160), '/venture-ai');
    await this.audit.record(ctx, { action: 'venture_ai.member_invited', objectType: 'vai_member', objectId: x.id, after: { role: b.role } });
    return { id: x.id, status: 'invited' };
  }

  @Post('venture-ai/invitations/:id/respond')
  @RequireOrg()
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'decline']) }))) b: { decision: 'accept' | 'decline' }) {
    this.on(); this.admin(ctx);
    const [m] = await this.db.select().from(vaiMembers).where(and(eq(vaiMembers.id, id), eq(vaiMembers.orgId, ctx.orgId!))).limit(1);
    if (!m) throw new NotFoundException('Invitation not found');
    if (m.status !== 'invited') throw new ConflictException('Already answered');
    await this.db.update(vaiMembers).set({ status: b.decision === 'accept' ? 'accepted' : 'declined', respondedBy: ctx.userId, respondedAt: new Date() }).where(eq(vaiMembers.id, id));
    const [v] = await this.db.select().from(vaiVentures).where(eq(vaiVentures.id, m.ventureId)).limit(1);
    const [owner] = await this.db.select({ orgId: vaiMembers.orgId }).from(vaiMembers).where(and(eq(vaiMembers.ventureId, m.ventureId), eq(vaiMembers.status, 'owner'))).limit(1);
    if (owner) await this.notifyOrg(owner.orgId, `${v.name}: ${VAI_ROLES[m.role as VaiRole]} ${b.decision === 'accept' ? 'accepted' : 'declined'}`, '', `/venture-ai/rooms/${v.id}`);
    await this.audit.record(ctx, { action: `venture_ai.invitation_${b.decision === 'accept' ? 'accepted' : 'declined'}`, objectType: 'vai_member', objectId: id });
    return { status: b.decision === 'accept' ? 'accepted' : 'declined', ventureId: b.decision === 'accept' ? v.id : null };
  }

  // ------------------------------------------------------------------ Venture Room
  @Get('venture-ai/rooms/:id')
  @RequireOrg()
  async roomView(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    this.on(); const { v, me, owner } = await this.room(ctx, id);
    const o = await this.opp(v.opportunityId);
    const members = await this.db.select({ m: vaiMembers, org: organizations.displayName }).from(vaiMembers).innerJoin(organizations, eq(organizations.id, vaiMembers.orgId)).where(eq(vaiMembers.ventureId, v.id)).orderBy(vaiMembers.createdAt);
    const tasks = await this.db.select().from(vaiTasks).where(eq(vaiTasks.ventureId, v.id)).orderBy(vaiTasks.createdAt);
    const approvals = await this.db.select().from(vaiApprovals).where(eq(vaiApprovals.ventureId, v.id)).orderBy(desc(vaiApprovals.createdAt));
    const runs = await this.db.select().from(vaiAgentRuns).where(eq(vaiAgentRuns.ventureId, v.id)).orderBy(desc(vaiAgentRuns.createdAt)).limit(20);
    const evidence = await this.db.select().from(vaiEvidence).where(eq(vaiEvidence.opportunityId, o.id));
    return { venture: v, opportunity: this.view(o), evidence, owner, myRole: me?.role ?? null,
      members: members.map(({ m, org }) => ({ id: m.id, org, role: m.role, roleLabel: VAI_ROLES[m.role as VaiRole], status: m.status, matchPercent: m.matchPercent, matchReasons: m.matchReasons, mine: m.orgId === ctx.orgId })),
      tasks, approvals, runs, agents: Object.entries(AGENTS).map(([key, a]) => ({ key, ...a, estimate: this.ai.estimate(key as AgentKey) })), provider: this.ai.available() ? 'anthropic' : 'rules' };
  }

  @Post('venture-ai/rooms/:id/tasks')
  @RequireOrg()
  @HttpCode(201)
  async addTask(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiTaskSchema)) b: z.infer<typeof VaiTaskSchema>) {
    this.on(); const { v } = await this.room(ctx, id);
    if (b.assigneeMemberId) { const [m] = await this.db.select().from(vaiMembers).where(and(eq(vaiMembers.id, b.assigneeMemberId), eq(vaiMembers.ventureId, v.id), inArray(vaiMembers.status, ['owner', 'accepted']))).limit(1); if (!m) throw new BadRequestException('Assign the task to a member of this Venture Room'); }
    const [t] = await this.db.insert(vaiTasks).values({ ventureId: v.id, title: b.title, assigneeMemberId: b.assigneeMemberId ?? null, dueOn: b.dueOn ?? null, milestone: b.milestone, createdBy: ctx.userId }).returning();
    return t;
  }

  @Post('venture-ai/tasks/:id/done')
  @RequireOrg()
  @HttpCode(200)
  async taskDone(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.on(); const [t] = await this.db.select().from(vaiTasks).where(eq(vaiTasks.id, id)).limit(1); if (!t) throw new NotFoundException();
    await this.room(ctx, t.ventureId);
    await this.db.update(vaiTasks).set({ status: 'done', doneBy: ctx.userId, doneAt: new Date() }).where(eq(vaiTasks.id, id));
    return { status: 'done' };
  }

  /** Request a human approval (binding agreements, money, POs, public claims…). Decided by the venture owner or Unite. */
  @Post('venture-ai/rooms/:id/approvals')
  @RequireOrg()
  @HttpCode(201)
  async requestApproval(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ kind: z.enum(APPROVAL_KINDS), title: z.string().trim().min(5).max(160), detail: z.string().trim().max(1000).optional(), amountPaise: z.number().int().min(0).optional() }))) b: { kind: (typeof APPROVAL_KINDS)[number]; title: string; detail?: string; amountPaise?: number }) {
    this.on(); const { v } = await this.room(ctx, id);
    const [a] = await this.db.insert(vaiApprovals).values({ ventureId: v.id, kind: b.kind, title: b.title, detail: b.detail ?? null, amountPaise: b.amountPaise ?? null, requestedBy: ctx.userId }).returning();
    return a;
  }

  @Post('venture-ai/approvals/:id/decide')
  @RequireOrg()
  @HttpCode(200)
  async decideApproval(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(400).optional() }))) b: { decision: 'approve' | 'reject'; note?: string }) {
    this.on(); const [a] = await this.db.select().from(vaiApprovals).where(eq(vaiApprovals.id, id)).limit(1); if (!a) throw new NotFoundException();
    const { owner } = await this.room(ctx, a.ventureId);
    if (!owner) throw new ForbiddenException('Only the venture owner or Unite decides approvals');
    if (a.requestedBy === ctx.userId && !staff(ctx)) throw new ForbiddenException('Someone other than the requester must approve');
    if (a.status !== 'pending') throw new ConflictException('Already decided');
    await this.db.update(vaiApprovals).set({ status: b.decision === 'approve' ? 'approved' : 'rejected', decidedBy: ctx.userId, decidedAt: new Date(), note: b.note ?? null }).where(eq(vaiApprovals.id, id));
    await this.audit.record(ctx, { action: `venture_ai.approval_${b.decision}`, objectType: 'vai_approval', objectId: id, after: { kind: a.kind } });
    return { status: b.decision === 'approve' ? 'approved' : 'rejected' };
  }

  // ------------------------------------------------------------------ AI agents
  @Post('venture-ai/rooms/:id/agent-runs')
  @RequireOrg()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(201)
  async runAgent(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(VaiAgentRunSchema)) b: z.infer<typeof VaiAgentRunSchema>) {
    this.on(); const { v } = await this.room(ctx, id);
    const s = await this.settings();
    const est = this.ai.estimate(b.agent);
    const base = { ventureId: v.id, opportunityId: v.opportunityId, agent: b.agent, instruction: b.instruction, orgId: ctx.orgId!, createdBy: ctx.userId };
    if (s.killSwitch) { const [r] = await this.db.insert(vaiAgentRuns).values({ ...base, provider: est.provider, model: est.model, status: 'blocked', error: 'AI agents are paused by the Unite admin (kill switch).' }).returning(); return r; }
    if (est.provider === 'anthropic') {
      const spent = Number((await this.db.select({ s: sql<number>`coalesce(sum(${vaiAgentRuns.costPaise}),0)::bigint` }).from(vaiAgentRuns).where(gte(vaiAgentRuns.createdAt, sql`date_trunc('month', now())`)))[0].s);
      const budget = Math.max(s.monthlyBudgetPaise, 0);
      if (!budget || spent + (est.costPaise ?? 0) > budget) { const [r] = await this.db.insert(vaiAgentRuns).values({ ...base, provider: est.provider, model: est.model, status: 'blocked', error: budget ? 'Monthly AI budget reached.' : 'No monthly AI budget set by the Unite admin.' }).returning(); return r; }
    }
    const o = await this.opp(v.opportunityId);
    const members = await this.db.select({ role: vaiMembers.role, status: vaiMembers.status, org: organizations.displayName }).from(vaiMembers).innerJoin(organizations, eq(organizations.id, vaiMembers.orgId)).where(eq(vaiMembers.ventureId, v.id));
    const evidence = await this.db.select({ kind: vaiEvidence.kind, statement: vaiEvidence.statement }).from(vaiEvidence).where(eq(vaiEvidence.opportunityId, o.id));
    const fin = (o.finance as { result?: { unitContributionPaise: number; paybackYear: number | null } } | null)?.result ?? null;
    try {
      const out = await this.ai.run(b.agent, b.instruction, { title: o.title, type: o.type, problem: o.problem, marketGap: o.marketGap, targetCustomers: o.targetCustomers, proposedSolution: o.proposedSolution, countries: o.countries,
        roles: this.view(o).roles.map((r) => ({ role: r.role, count: r.count })), members, evidence, score: (o.score as { result?: { score: number | null; label: string; missing: string[] } } | null)?.result ?? null, finance: fin });
      const [r] = await this.db.insert(vaiAgentRuns).values({ ...base, provider: out.provider, model: out.model, status: 'completed', output: out.text, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costPaise: out.costPaise }).returning();
      return r;
    } catch (e) {
      const [r] = await this.db.insert(vaiAgentRuns).values({ ...base, provider: est.provider, model: est.model, status: 'failed', error: (e as Error).message.slice(0, 300) }).returning();
      return r;
    }
  }

  // ------------------------------------------------------------------ admin
  @Get('admin/venture-ai/overview')
  async adminOverview(@Ctx() ctx: RequestContext) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const review = await this.db.select({ o: vaiOpportunities, org: organizations.displayName }).from(vaiOpportunities).innerJoin(organizations, eq(organizations.id, vaiOpportunities.orgId)).where(eq(vaiOpportunities.status, 'in_review')).orderBy(desc(vaiOpportunities.updatedAt));
    const counts = (await this.db.execute(sql`select (select count(*) from vai_opportunities where not sample)::int opportunities, (select count(*) from vai_ventures where not sample)::int ventures, (select count(*) from vai_capabilities)::int members,
      (select coalesce(sum(cost_paise),0) from vai_agent_runs where created_at >= date_trunc('month', now()))::bigint ai_cost_month, (select count(*) from vai_agent_runs where created_at >= date_trunc('month', now()))::int runs_month`) as unknown as { rows: Record<string, number>[] }).rows[0];
    const runs = await this.db.select({ r: vaiAgentRuns, by: users.fullName }).from(vaiAgentRuns).innerJoin(users, eq(users.id, vaiAgentRuns.createdBy)).orderBy(desc(vaiAgentRuns.createdAt)).limit(30);
    return { counts, settings: await this.settings(), provider: this.ai.available() ? 'anthropic' : 'rules', review: review.map(({ o, org }) => ({ ...this.view(o), proposer: org })), runs: runs.map(({ r, by }) => ({ ...r, by })) };
  }

  @Put('admin/venture-ai/settings')
  async saveSettings(@Ctx() ctx: RequestContext, @Body(body(z.object({ killSwitch: z.boolean(), monthlyBudgetPaise: z.number().int().min(0).max(1e12) }))) b: Settings) {
    this.on(); if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin changes AI settings');
    await this.db.insert(siteSettings).values({ key: 'venture_ai', value: b, updatedBy: ctx.userId }).onConflictDoUpdate({ target: siteSettings.key, set: { value: b, updatedBy: ctx.userId, updatedAt: new Date() } });
    await this.audit.record(ctx, { action: 'venture_ai.settings', objectType: 'site_settings', objectId: 'venture_ai', after: b });
    return b;
  }

  /** Creates the demonstration pilots (marked Sample) for the admin's own organization. Idempotent per title. */
  @Post('admin/venture-ai/pilots')
  @RequireOrg()
  @HttpCode(201)
  async pilots(@Ctx() ctx: RequestContext) {
    this.on(); if (!staff(ctx)) throw new ForbiddenException();
    const made: string[] = [];
    for (const p of PILOTS) {
      const [exists] = await this.db.select({ id: vaiOpportunities.id }).from(vaiOpportunities).where(and(eq(vaiOpportunities.title, p.title), eq(vaiOpportunities.sample, true))).limit(1);
      if (exists) continue;
      const [o] = await this.db.insert(vaiOpportunities).values({ code: code('VAI'), ...p.fields, countries: p.countries, roles: p.roles, origin: 'pilot', sample: true, orgId: ctx.orgId!, createdBy: ctx.userId,
        concept: p.conveyor ? { names: p.names, conveyor: { inputs: p.conveyor, result: sizeSolarConveyor(p.conveyor) } } : { names: p.names } }).returning();
      await this.db.insert(vaiEvidence).values(p.assumptions.map((a) => ({ opportunityId: o.id, kind: 'assumption', statement: a, addedBy: ctx.userId })));
      made.push(o.code);
    }
    return { created: made.length, codes: made };
  }
}

const R = (role: VaiRole, count = 1, categories: string[] = []) => ({ role, count, categories, countries: [] as string[] });
const PILOTS: { title: string; countries: string[]; names: string[]; fields: Pick<Opp, 'title' | 'type' | 'problem' | 'marketGap' | 'targetCustomers' | 'proposedSolution'> & Partial<Opp>; roles: ReturnType<typeof R>[]; assumptions: string[]; conveyor?: z.infer<typeof VaiConveyorSchema> }[] = [
  { title: 'Solar Conveyor — solar-assisted industrial material handling', countries: ['IN'], names: ['Solar Conveyor', 'SunMove Conveyor', 'Unite SolarBelt'],
    fields: { title: 'Solar Conveyor — solar-assisted industrial material handling', type: 'combination', problem: 'Conveyors at mines, quarries, warehouses and plants run on grid or diesel power for long hours, and power cost is a large share of their operating cost.', marketGap: 'Conveyor makers and solar EPC companies sell separately; few offer a conveyor packaged with solar, battery and drives as one product.', targetCustomers: 'Mines, quarries, cement and aggregate plants, warehouses and bulk-handling yards', proposedSolution: 'Combine a conveyor manufacturer, a solar EPC partner, a battery supplier and an automation/drive supplier into one packaged, solar-assisted conveyor with remote monitoring.', technology: 'High-efficiency motors and VFDs, PV array, LFP battery, energy management controller', manufacturing: 'Conveyor fabrication by an OEM; PV and battery integrated by the EPC partner', investmentPaise: 25_00_00_000, regulatory: 'Electrical safety approvals, structural design sign-off, DISCOM rules if grid-connected' },
    roles: [R('manufacturer', 1, ['Conveyors']), R('installer', 1, ['Solar EPC']), R('raw_material', 1, ['Batteries']), R('technology', 1, ['Automation']), R('engineer', 1), R('investor', 1), R('distributor', 2), R('logistics', 1)],
    assumptions: ['Customers run conveyors 8–12 hours a day on most days of the year', 'A pilot site will share load data for sizing', 'Component costs below are assumptions until suppliers quote'],
    conveyor: { motorKw: 22, hoursPerDay: 10, loadFactorPct: 70, daysPerYear: 300, peakSunHours: 5, performanceRatioPct: 78, batteryHours: 2, depthOfDischargePct: 80, solarCostPaisePerWp: 3800, batteryCostPaisePerKwh: 1800000, gridTariffPaisePerKwh: 850 } },
  { title: 'SUNORA Paints — international technology, Indian OEM, regional dealers', countries: ['IN'], names: ['SUNORA Paints', 'SUNORA Luxe', 'SUNORA Pro'],
    fields: { title: 'SUNORA Paints — international technology, Indian OEM, regional dealers', type: 'combination', problem: 'Regional buyers want premium-quality paints at mid-market prices.', marketGap: 'An asset-light brand using licensed formulations and OEM manufacturing can reach dealers without building a plant.', targetCustomers: 'Homeowners, painters, contractors and builders through paint and hardware dealers', proposedSolution: 'License a paint technology, manufacture through an Indian OEM, brand as SUNORA and sell through district distributors and dealers.', investmentPaise: 50_00_00_000 },
    roles: [R('technology', 1, ['Paints']), R('oem', 1, ['Paints']), R('raw_material', 1), R('designer', 1), R('investor', 1), R('distributor', 3, ['Paints']), R('dealer', 10, ['Paints']), R('logistics', 1), R('quality', 1), R('legal', 1)],
    assumptions: ['A technology partner is willing to license formulations', 'OEM capacity is available for the first-year volume'] },
  { title: 'SUNORA Furniture — private label through dealers', countries: ['IN'], names: ['SUNORA Furniture', 'SUNORA Living'],
    fields: { title: 'SUNORA Furniture — private label through dealers', type: 'combination', problem: 'Furniture buyers face uneven quality from unbranded makers.', marketGap: 'A private-label brand with consistent specifications from several OEMs, sold through dealers.', targetCustomers: 'Homes, offices, hotels and institutions', proposedSolution: 'Several furniture OEMs make to one SUNORA specification; dealers and stores sell it.', investmentPaise: 50_00_00_000 },
    roles: [R('oem', 3, ['Furniture']), R('designer', 1, ['Furniture']), R('raw_material', 1), R('dealer', 10, ['Furniture']), R('warehouse', 1), R('investor', 1)], assumptions: ['Three OEMs can meet one specification'] },
  { title: 'Unite Solar industrial projects — EPC teams', countries: ['IN'], names: ['Unite Solar Industrial'],
    fields: { title: 'Unite Solar industrial projects — EPC teams', type: 'demand', problem: 'Industrial buyers need complete solar projects with one accountable team.', marketGap: 'Assembling EPC, structures, transformers and finance partners per project.', targetCustomers: 'Factories and commercial buildings', proposedSolution: 'Form project teams from COLLABIZ members for each Unite Solar industrial project.' },
    roles: [R('installer', 2, ['Solar EPC']), R('manufacturer', 1, ['Structures']), R('manufacturer', 1, ['Transformers']), R('finance', 1)], assumptions: ['Projects are sourced by the Unite Solar desk'] },
  { title: 'Unite Powertek products — industrial B2B sales', countries: ['IN'], names: ['Unite Powertek'],
    fields: { title: 'Unite Powertek products — industrial B2B sales', type: 'demand', problem: 'Industrial buyers need reliable power products with local support.', marketGap: 'Distribution and service partners in more districts.', targetCustomers: 'Factories, contractors and utilities', proposedSolution: 'Recruit distributors, sales agents and service partners for Powertek products.' },
    roles: [R('distributor', 5), R('sales_agent', 10), R('service', 3)], assumptions: ['Product supply is available from Unite Powertek'] },
  { title: 'UNITE EXIM — international trading opportunities', countries: ['IN', 'AE'], names: ['Unite EXIM'],
    fields: { title: 'UNITE EXIM — international trading opportunities', type: 'demand', problem: 'Manufacturers want export buyers; importers want reliable sources.', marketGap: 'A trusted network linking verified exporters, importers and logistics.', targetCustomers: 'Exporters and importers', proposedSolution: 'Match COLLABIZ manufacturers with export buyers and logistics partners through UNITE EXIM.' },
    roles: [R('exporter', 2), R('importer', 2), R('logistics', 1), R('legal', 1)], assumptions: ['Export documentation support is available'] },
];

@Module({ controllers: [VentureAiController], providers: [VentureAiProvider] })
export class VentureAiModule {}
