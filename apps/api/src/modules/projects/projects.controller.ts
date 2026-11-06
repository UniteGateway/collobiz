/**
 * Stage 11a — Project execution (screens 075–084).
 *
 * Gate: evidence-based certification and change logs.
 *  - A milestone can be submitted only with evidence: at least one photo, test report or document linked to it, and
 *    100% reported progress. Submission seals an evidence hash over that evidence.
 *  - Certification is done by the owner (client) organization, never by the submitter. It requires a passing
 *    inspection recorded by the owner's own team for every inspection kind the milestone requires, no open failed
 *    inspection, and the evidence to be unchanged since submission (hash re-check). A certified milestone's amount,
 *    evidence and certification are locked by a database trigger.
 *  - Every change to schedule, value, scope, allocation, materials and documents is written to an append-only
 *    change log (trigger) with before/after values, the person, their organization and — once the baseline is
 *    approved — a mandatory reason.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertTransition, CertifySchema, InspectionSchema, InvoicePaidSchema, MaterialSchema, MaterialUpdateSchema, MilestoneChangeSchema, MilestoneMachine, MilestoneSchema, MilestoneSubmitSchema,
  ProgressUpdateSchema, ProjectFromContractSchema, ProjectHoldSchema, ProjectMachine, ProjectMemberSchema, type MilestoneState, type ProjectState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  contracts, inspections, memberships, milestones, notifications, organizations, projectChangeLog, projectDocuments, projectInvoices, projectMaterials, projectMembers, projects, projectUpdates, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { canonicalJson, randomDigits, sha256 } from '../../common/crypto';
import { Idempotent } from '../../common/idempotency';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';
import { CommissionsModule, CommissionsService } from '../commissions/commissions.controller';

type Project = typeof projects.$inferSelect;
type Milestone = typeof milestones.$inferSelect;
type Role = 'owner' | 'lead' | 'subcontractor';
type UploadFile = { buffer: Buffer; mimetype: string; originalname: string };
const DOC_CATEGORIES = ['drawing', 'permit', 'photo', 'test_report', 'handover', 'other'] as const;
const EVIDENCE_CATEGORIES = ['photo', 'test_report', 'handover', 'other', 'drawing'];
const PLAN_EDITABLE: MilestoneState[] = ['planned', 'in_progress', 'rejected'];
const year = () => new Date().getUTCFullYear();

@Injectable()
export class ProjectsService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async load(ctx: RequestContext, id: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!p) throw new NotFoundException('Project not found');
    const role = await this.role(ctx, p);
    if (!role) throw new NotFoundException('Project not found');
    return { p, role };
  }
  async role(ctx: RequestContext, p: Project): Promise<Role | null> {
    if (!ctx.orgId) return null;
    const [m] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, p.id), eq(projectMembers.organizationId, ctx.orgId), eq(projectMembers.status, 'active'))).limit(1);
    return (m?.role as Role) ?? null;
  }
  assertRole(role: Role, allowed: Role[], ctx: RequestContext, action: string) {
    if (!allowed.includes(role)) throw new ForbiddenException(`Only the project ${allowed.join(' or ')} can ${action}`);
    if (!ctx.caps.has('project.manage')) throw new ForbiddenException('You need project management rights in your organization');
  }
  financials(role: Role) {
    return role === 'owner' || role === 'lead';
  }
  /** Append-only change log entry (gate). Once the baseline is approved (project not in planning), a reason is mandatory. */
  async log(ctx: RequestContext, p: Project, e: { entity: string; entityId: string; field: string; before?: unknown; after?: unknown; reason?: string }, tx: Db = this.db) {
    if (p.status !== 'planning' && e.entity !== 'project' && ['dueDate', 'amount', 'scope', 'allocatedValue', 'assignedOrgId', 'title', 'removed', 'added'].includes(e.field) && !e.reason) {
      throw new BadRequestException({ message: 'Give a reason — the baseline schedule is approved, so changes must be justified', fields: { reason: 'Required after the baseline is approved' } });
    }
    await tx.insert(projectChangeLog).values({ projectId: p.id, entity: e.entity, entityId: e.entityId, field: e.field, before: e.before === undefined ? null : e.before, after: e.after === undefined ? null : e.after, reason: e.reason, userId: ctx.userId, organizationId: ctx.orgId! });
  }
  async setProject(ctx: RequestContext, p: Project, to: ProjectState, reason: string | undefined, extra: Partial<Project> = {}, tx: Db = this.db) {
    assertTransition(ProjectMachine, p.status as ProjectState, to);
    const [u] = await tx.update(projects).set({ ...extra, status: to, version: p.version + 1, updatedAt: new Date() }).where(and(eq(projects.id, p.id), eq(projects.version, p.version))).returning();
    if (!u) throw new ConflictException('The project was changed concurrently. Reload and try again.');
    await tx.insert(projectChangeLog).values({ projectId: p.id, entity: 'project', entityId: p.id, field: 'status', before: p.status, after: to, reason, userId: ctx.userId, organizationId: ctx.orgId! });
    await this.audit.record(ctx, { action: `project.${to}`, objectType: 'project', objectId: p.id, reason, before: { status: p.status }, after: { status: to } }, tx);
    return u;
  }
  async setMilestone(ctx: RequestContext, p: Project, m: Milestone, to: MilestoneState, extra: Partial<Milestone> = {}, reason?: string, tx: Db = this.db) {
    assertTransition(MilestoneMachine, m.status as MilestoneState, to);
    const [u] = await tx.update(milestones).set({ ...extra, status: to, version: m.version + 1, updatedAt: new Date() }).where(and(eq(milestones.id, m.id), eq(milestones.version, m.version))).returning();
    if (!u) throw new ConflictException('The milestone was changed concurrently. Reload and try again.');
    await tx.insert(projectChangeLog).values({ projectId: p.id, entity: 'milestone', entityId: m.id, field: 'status', before: m.status, after: to, reason, userId: ctx.userId, organizationId: ctx.orgId! });
    await this.audit.record(ctx, { action: `milestone.${to}`, objectType: 'milestone', objectId: m.id, reason, before: { status: m.status }, after: { status: to } }, tx);
    return u;
  }
  async milestone(p: Project, mid: string) {
    const [m] = await this.db.select().from(milestones).where(and(eq(milestones.id, mid), eq(milestones.projectId, p.id))).limit(1);
    if (!m) throw new NotFoundException('Milestone not found');
    return m;
  }
  /** Evidence for a milestone: documents linked directly or through a progress update. */
  async evidence(p: Project, m: Milestone) {
    const docs = await this.db.select().from(projectDocuments).where(and(eq(projectDocuments.projectId, p.id), eq(projectDocuments.milestoneId, m.id))).orderBy(asc(projectDocuments.createdAt));
    const docsEvidence = docs.filter((d) => EVIDENCE_CATEGORIES.includes(d.category));
    const hash = sha256(JSON.stringify(docsEvidence.map((d) => [d.id, d.sha256]).sort()));
    return { docs: docsEvidence, hash };
  }
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind: 'project', title, body: text, link });
  }
  async members(projectId: string) {
    return this.db.select({ m: projectMembers, name: organizations.displayName }).from(projectMembers).innerJoin(organizations, eq(organizations.id, projectMembers.organizationId)).where(eq(projectMembers.projectId, projectId)).orderBy(asc(projectMembers.createdAt));
  }
  async summary(p: Project, role: Role) {
    const ms = await this.db.select().from(milestones).where(eq(milestones.projectId, p.id)).orderBy(asc(milestones.seq));
    const certified = ms.filter((m) => m.certifiedAt).reduce((a, m) => a + (m.certifiedAmount ?? 0), 0);
    const reported = p.value ? Math.round(ms.reduce((a, m) => a + m.amount * (m.status === 'certified' || m.status === 'invoiced' ? 100 : m.progressPct), 0) / p.value) : 0;
    const invoices = await this.db.select().from(projectInvoices).where(eq(projectInvoices.projectId, p.id));
    const next = ms.find((m) => !['certified', 'invoiced'].includes(m.status));
    const today = new Date().toISOString().slice(0, 10);
    return {
      progressPct: Math.min(100, reported), certifiedPct: p.value ? Math.round((certified / p.value) * 100) : 0,
      milestones: { total: ms.length, byStatus: Object.fromEntries(['planned', 'in_progress', 'submitted', 'certified', 'rejected', 'invoiced'].map((s) => [s, ms.filter((m) => m.status === s).length])), overdue: ms.filter((m) => m.dueDate < today && !['certified', 'invoiced'].includes(m.status)).length },
      nextMilestone: next ? { id: next.id, title: next.title, dueDate: next.dueDate, status: next.status } : null,
      ...(this.financials(role) ? { financials: { value: p.value, planned: ms.reduce((a, m) => a + m.amount, 0), certified, invoiced: invoices.reduce((a, i) => a + i.amount, 0), paid: invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0) } } : {}),
    };
  }
}

function publicProject(p: Project) {
  const { completionSnapshot: _s, createdBy: _c, ...rest } = p;
  return rest;
}

@ApiTags('projects')
@Controller()
@RequireOrg()
export class ProjectsController {
  constructor(@InjectDb() private db: Db, private svc: ProjectsService, private audit: AuditService, private storage: StorageService, private commissions: CommissionsService) {}

  /** 075 — portfolio of projects my organization takes part in. */
  @Get('projects')
  async portfolio(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ p: projects, role: projectMembers.role }).from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .where(and(eq(projectMembers.organizationId, ctx.orgId!), eq(projectMembers.status, 'active'))).orderBy(desc(projects.createdAt));
    const names = rows.length ? await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [...new Set(rows.flatMap((r) => [r.p.ownerOrgId, r.p.leadOrgId]))])) : [];
    return Promise.all(rows.map(async (r) => {
      const s = await this.svc.summary(r.p, r.role as Role);
      return { id: r.p.id, code: r.p.code, title: r.p.title, status: r.p.status, role: r.role, owner: names.find((n) => n.id === r.p.ownerOrgId)?.name, lead: names.find((n) => n.id === r.p.leadOrgId)?.name,
        site: r.p.site, endDate: r.p.endDate, progressPct: s.progressPct, certifiedPct: s.certifiedPct, overdue: s.milestones.overdue, nextMilestone: s.nextMilestone, ...(this.svc.financials(r.role as Role) ? { value: r.p.value, currency: r.p.currency } : {}) };
    }));
  }

  /** Start a project from an executed contract (owner = contract issuer, lead = counterparty). */
  @Post('contracts/:id/project')
  @HttpCode(201)
  async fromContract(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) contractId: string, @Body(body(ProjectFromContractSchema)) b: z.infer<typeof ProjectFromContractSchema>) {
    const [c] = await this.db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
    if (!c || !ctx.memberships.some((m) => m.organizationId === c.issuerOrgId || m.organizationId === c.counterpartyOrgId)) throw new NotFoundException('Contract not found');
    if (ctx.orgId !== c.issuerOrgId || !ctx.caps.has('project.manage')) throw new ForbiddenException('Only the contract issuer can start the project');
    if (c.status !== 'executed') throw new ConflictException('A project can start only from an executed contract');
    if (c.value == null) throw new BadRequestException('The contract has no value');
    const code = `PRJ-${year()}-${randomDigits(6)}`;
    const p = await this.db.transaction(async (tx) => {
      const [p] = await tx.insert(projects).values({ code, title: b.title ?? c.title.replace(/^(Letter of Intent|Work Order|Contract) — /, ''), ownerOrgId: c.issuerOrgId, leadOrgId: c.counterpartyOrgId, contractId: c.id, tenderId: c.tenderId, value: c.value!, currency: c.currency, site: b.site, region: b.region, startDate: b.startDate, endDate: b.endDate, createdBy: ctx.userId }).returning();
      await tx.insert(projectMembers).values([
        { projectId: p.id, organizationId: c.issuerOrgId, role: 'owner', scope: 'Client: approves baseline, inspects, certifies and pays', addedBy: ctx.userId },
        { projectId: p.id, organizationId: c.counterpartyOrgId, role: 'lead', scope: 'Executing partner: plans, delivers and submits milestones', allocatedValue: c.value, addedBy: ctx.userId },
      ]);
      await tx.insert(projectChangeLog).values({ projectId: p.id, entity: 'project', entityId: p.id, field: 'created', after: { code, contract: c.code, value: c.value }, userId: ctx.userId, organizationId: ctx.orgId! });
      await this.audit.record(ctx, { action: 'project.created', objectType: 'project', objectId: p.id, after: { code, contractId } }, tx as unknown as Db);
      return p;
    });
    await this.svc.notifyOrg(c.counterpartyOrgId, `Project started: ${code}`, `${p.title} has started. Plan the milestones so the client can approve the baseline.`, `/projects/${p.id}/milestones`);
    return publicProject(p);
  }

  /** 076 — overview dashboard. */
  @Get('projects/:id')
  async overview(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    const [summary, members, updates, ncrs, changes] = await Promise.all([
      this.svc.summary(p, role),
      this.svc.members(id),
      this.db.select({ u: projectUpdates, author: users.fullName, org: organizations.displayName }).from(projectUpdates).innerJoin(users, eq(users.id, projectUpdates.authorUserId)).innerJoin(organizations, eq(organizations.id, projectUpdates.organizationId)).where(eq(projectUpdates.projectId, id)).orderBy(desc(projectUpdates.createdAt)).limit(5),
      this.db.select({ id: inspections.id, kind: inspections.kind, createdAt: inspections.createdAt, correctiveAction: inspections.correctiveAction }).from(inspections).where(and(eq(inspections.projectId, id), eq(inspections.result, 'fail'), isNull(inspections.closedAt))),
      this.db.select({ c: projectChangeLog, who: users.fullName }).from(projectChangeLog).innerJoin(users, eq(users.id, projectChangeLog.userId)).where(eq(projectChangeLog.projectId, id)).orderBy(desc(projectChangeLog.createdAt)).limit(8),
    ]);
    const fin = this.svc.financials(role);
    return {
      ...publicProject(p), ...(fin ? {} : { value: undefined }), role, canManage: ctx.caps.has('project.manage'), ...summary,
      owner: members.find((m) => m.m.role === 'owner')?.name, lead: members.find((m) => m.m.role === 'lead')?.name,
      members: members.filter((m) => m.m.status === 'active').map((m) => ({ organizationId: m.m.organizationId, name: m.name, role: m.m.role, scope: m.m.scope, ...(fin || m.m.organizationId === ctx.orgId ? { allocatedValue: m.m.allocatedValue } : {}) })),
      recentUpdates: updates.map((u) => ({ id: u.u.id, note: u.u.note, progressPct: u.u.progressPct, author: u.author, org: u.org, createdAt: u.u.createdAt })),
      openNcrs: ncrs, recentChanges: changes.map((c) => ({ ...c.c, who: c.who })),
    };
  }

  @Post('projects/:id/activate')
  @HttpCode(200)
  async activate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner'], ctx, 'approve the baseline');
    const ms = await this.db.select().from(milestones).where(eq(milestones.projectId, id));
    const planned = ms.reduce((a, m) => a + m.amount, 0);
    const problems: string[] = [];
    if (!ms.length) problems.push('Add at least one milestone');
    if (planned !== p.value) problems.push(`Milestone amounts (${planned / 100}) must add up to the project value (${p.value / 100})`);
    if (problems.length) throw new BadRequestException({ message: 'The baseline schedule is not ready', problems });
    const u = await this.svc.setProject(ctx, p, 'active', 'Baseline schedule approved by the owner');
    await this.svc.notifyOrg(p.leadOrgId, `Baseline approved: ${p.code}`, 'The schedule is now the baseline. Further changes need a reason and are logged.', `/projects/${id}`);
    return publicProject(u);
  }

  @Post('projects/:id/status')
  @HttpCode(200)
  async hold(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ProjectHoldSchema)) b: z.infer<typeof ProjectHoldSchema>) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner'], ctx, 'pause or resume the project');
    return publicProject(await this.svc.setProject(ctx, p, b.status, b.reason));
  }

  @Get('projects/:id/changes')
  async changes(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { role } = await this.svc.load(ctx, id);
    const rows = await this.db.select({ c: projectChangeLog, who: users.fullName, org: organizations.displayName }).from(projectChangeLog).innerJoin(users, eq(users.id, projectChangeLog.userId)).innerJoin(organizations, eq(organizations.id, projectChangeLog.organizationId))
      .where(eq(projectChangeLog.projectId, id)).orderBy(desc(projectChangeLog.createdAt)).limit(500);
    const hideMoney = !this.svc.financials(role);
    return rows.map((r) => ({ ...r.c, who: r.who, org: r.org, ...(hideMoney && ['amount', 'allocatedValue', 'certifiedAmount'].includes(r.c.field) ? { before: null, after: null } : {}) }));
  }

  // ---------- 077 milestones ----------
  @Get('projects/:id/milestones')
  async milestones(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    const ms = await this.db.select({ m: milestones, org: organizations.displayName }).from(milestones).leftJoin(organizations, eq(organizations.id, milestones.assignedOrgId)).where(eq(milestones.projectId, id)).orderBy(asc(milestones.seq));
    const fin = this.svc.financials(role);
    const evidenceCounts = await this.db.select({ mid: projectDocuments.milestoneId, n: sql<number>`count(*)::int` }).from(projectDocuments).where(and(eq(projectDocuments.projectId, id), isNotNull(projectDocuments.milestoneId))).groupBy(projectDocuments.milestoneId);
    return {
      project: { id: p.id, code: p.code, title: p.title, status: p.status, value: fin ? p.value : undefined, startDate: p.startDate, endDate: p.endDate }, role,
      milestones: ms.map((r) => ({ ...r.m, assignedOrg: r.org, evidenceCount: evidenceCounts.find((e) => e.mid === r.m.id)?.n ?? 0,
        ...(fin || r.m.assignedOrgId === ctx.orgId ? {} : { amount: undefined, certifiedAmount: undefined }) })),
    };
  }

  @Post('projects/:id/milestones')
  @HttpCode(201)
  async addMilestone(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(MilestoneSchema.extend({ reason: z.string().trim().min(5).max(1000).optional() }))) b: z.infer<typeof MilestoneSchema> & { reason?: string }) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 'plan milestones');
    if (!['planning', 'active', 'on_hold'].includes(p.status)) throw new ConflictException('Milestones cannot be added to a completed project');
    await this.assertAssignable(p, b.assignedOrgId);
    const total = (await this.db.select({ s: sql<number>`coalesce(sum(amount),0)::bigint` }).from(milestones).where(eq(milestones.projectId, id)))[0].s;
    if (Number(total) + b.amount > p.value) throw new BadRequestException({ message: 'Milestone amounts would exceed the project value', fields: { amount: `At most ${(p.value - Number(total)) / 100} remains` } });
    const [{ n }] = await this.db.select({ n: sql<number>`coalesce(max(seq),0)::int` }).from(milestones).where(eq(milestones.projectId, id));
    const m = await this.db.transaction(async (tx) => {
      const { reason: _r, ...fields } = b;
      const [m] = await tx.insert(milestones).values({ ...fields, projectId: id, seq: n + 1 }).returning();
      await this.svc.log(ctx, p, { entity: 'milestone', entityId: m.id, field: 'added', after: { title: m.title, dueDate: m.dueDate, amount: m.amount }, reason: b.reason }, tx as unknown as Db);
      return m;
    });
    return m;
  }

  /** Re-plan a milestone. Every changed field is logged before/after; after baseline approval a reason is required. */
  @Patch('projects/:id/milestones/:mid')
  async changeMilestone(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('mid', ParseUUIDPipe) mid: string, @Body(body(MilestoneChangeSchema)) b: z.infer<typeof MilestoneChangeSchema>) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 're-plan milestones');
    const m = await this.svc.milestone(p, mid);
    if (!PLAN_EDITABLE.includes(m.status as MilestoneState)) throw new ConflictException('Submitted or certified milestones cannot be re-planned');
    if (b.assignedOrgId) await this.assertAssignable(p, b.assignedOrgId);
    if (b.amount !== undefined) {
      const total = Number((await this.db.select({ s: sql<number>`coalesce(sum(amount),0)::bigint` }).from(milestones).where(and(eq(milestones.projectId, id), ne(milestones.id, mid))))[0].s);
      if (total + b.amount > p.value) throw new BadRequestException({ message: 'Milestone amounts would exceed the project value', fields: { amount: `At most ${(p.value - total) / 100} is available` } });
    }
    const fields = (['title', 'description', 'dueDate', 'amount', 'assignedOrgId', 'requiresInspection'] as const).filter((f) => b[f] !== undefined && b[f] !== m[f]);
    if (!fields.length) return m;
    return this.db.transaction(async (tx) => {
      for (const f of fields) await this.svc.log(ctx, p, { entity: 'milestone', entityId: mid, field: f, before: m[f], after: b[f], reason: b.reason }, tx as unknown as Db);
      const [u] = await tx.update(milestones).set({ ...Object.fromEntries(fields.map((f) => [f, b[f]])), version: m.version + 1, updatedAt: new Date() }).where(and(eq(milestones.id, mid), eq(milestones.version, m.version))).returning();
      if (!u) throw new ConflictException('The milestone was changed concurrently. Reload and try again.');
      return u;
    });
  }

  @Post('projects/:id/milestones/:mid/start')
  @HttpCode(200)
  async start(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('mid', ParseUUIDPipe) mid: string) {
    const { p, role } = await this.svc.load(ctx, id);
    const m = await this.svc.milestone(p, mid);
    if (!(role === 'lead' || (role === 'subcontractor' && m.assignedOrgId === ctx.orgId))) throw new ForbiddenException('Only the lead or the assigned subcontractor can start this milestone');
    if (p.status !== 'active') throw new ConflictException('Work can start once the owner approves the baseline');
    return this.svc.setMilestone(ctx, p, m, 'in_progress');
  }

  private async assertAssignable(p: Project, orgId?: string) {
    if (!orgId) return;
    const [mem] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, p.id), eq(projectMembers.organizationId, orgId), eq(projectMembers.status, 'active'))).limit(1);
    if (!mem || mem.role === 'owner') throw new BadRequestException({ message: 'Check the highlighted fields', fields: { assignedOrgId: 'Assign to the lead or a subcontractor on this project' } });
  }

  // ---------- 078 allocation & subcontractors ----------
  @Get('projects/:id/members')
  async membersList(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    const rows = await this.svc.members(id);
    const fin = this.svc.financials(role);
    const allocated = rows.filter((r) => r.m.status === 'active' && r.m.role === 'subcontractor').reduce((a, r) => a + (r.m.allocatedValue ?? 0), 0);
    return { role, value: fin ? p.value : undefined, subcontracted: fin ? allocated : undefined,
      members: rows.map((r) => ({ id: r.m.id, organizationId: r.m.organizationId, name: r.name, role: r.m.role, scope: r.m.scope, status: r.m.status, ...(fin || r.m.organizationId === ctx.orgId ? { allocatedValue: r.m.allocatedValue } : {}) })) };
  }

  @Post('projects/:id/members')
  @HttpCode(201)
  async addSub(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ProjectMemberSchema.extend({ reason: z.string().trim().min(5).max(1000).optional() }))) b: z.infer<typeof ProjectMemberSchema> & { reason?: string }) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 'allocate work to subcontractors');
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, b.organizationId)).limit(1);
    if (!o || o.verificationStatus !== 'verified' || !['partner_company', 'partner_individual'].includes(o.type)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { organizationId: 'Subcontractors must be verified partner organizations' } });
    if ([p.ownerOrgId, p.leadOrgId].includes(b.organizationId)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { organizationId: 'This organization is already the owner or lead' } });
    await this.assertAllocation(p, b.allocatedValue ?? 0, null);
    const [existing] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, id), eq(projectMembers.organizationId, b.organizationId))).limit(1);
    const row = await this.db.transaction(async (tx) => {
      const r = existing
        ? (await tx.update(projectMembers).set({ status: 'active', scope: b.scope, allocatedValue: b.allocatedValue }).where(eq(projectMembers.id, existing.id)).returning())[0]
        : (await tx.insert(projectMembers).values({ projectId: id, organizationId: b.organizationId, role: 'subcontractor', scope: b.scope, allocatedValue: b.allocatedValue, addedBy: ctx.userId }).returning())[0];
      await this.svc.log(ctx, p, { entity: 'member', entityId: r.id, field: 'added', after: { organization: o.displayName, scope: b.scope, allocatedValue: b.allocatedValue }, reason: b.reason }, tx as unknown as Db);
      return r;
    });
    await this.svc.notifyOrg(b.organizationId, `Work allocated: ${p.code}`, `You have been added as a subcontractor on ${p.title}: ${b.scope}`, `/projects/${id}`);
    return row;
  }

  @Patch('projects/:id/members/:memberId')
  async changeSub(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(body(z.object({ scope: z.string().trim().min(5).max(2000).optional(), allocatedValue: z.number().int().nonnegative().optional(), reason: z.string().trim().min(5).max(1000).optional() }))) b: { scope?: string; allocatedValue?: number; reason?: string }) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 'change allocations');
    const [m] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, id))).limit(1);
    if (!m || m.role !== 'subcontractor' || m.status !== 'active') throw new NotFoundException('Subcontractor not found');
    if (b.allocatedValue !== undefined) await this.assertAllocation(p, b.allocatedValue, m.id);
    return this.db.transaction(async (tx) => {
      if (b.scope !== undefined && b.scope !== m.scope) await this.svc.log(ctx, p, { entity: 'member', entityId: m.id, field: 'scope', before: m.scope, after: b.scope, reason: b.reason }, tx as unknown as Db);
      if (b.allocatedValue !== undefined && b.allocatedValue !== m.allocatedValue) await this.svc.log(ctx, p, { entity: 'member', entityId: m.id, field: 'allocatedValue', before: m.allocatedValue, after: b.allocatedValue, reason: b.reason }, tx as unknown as Db);
      const [u] = await tx.update(projectMembers).set({ scope: b.scope ?? m.scope, allocatedValue: b.allocatedValue ?? m.allocatedValue }).where(eq(projectMembers.id, m.id)).returning();
      return u;
    });
  }

  @Delete('projects/:id/members/:memberId')
  async removeSub(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000).optional() }).default({}))) b: { reason?: string }) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 'remove subcontractors');
    const [m] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, id))).limit(1);
    if (!m || m.role !== 'subcontractor' || m.status !== 'active') throw new NotFoundException('Subcontractor not found');
    const open = await this.db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.projectId, id), eq(milestones.assignedOrgId, m.organizationId), inArray(milestones.status, ['in_progress', 'submitted']))).limit(1);
    if (open.length) throw new ConflictException('Reassign this subcontractor’s in-progress or submitted milestones first');
    await this.db.transaction(async (tx) => {
      await this.svc.log(ctx, p, { entity: 'member', entityId: m.id, field: 'removed', before: { scope: m.scope, allocatedValue: m.allocatedValue }, reason: b.reason }, tx as unknown as Db);
      await tx.update(projectMembers).set({ status: 'removed' }).where(eq(projectMembers.id, m.id));
    });
    return { ok: true };
  }

  private async assertAllocation(p: Project, value: number, excludeId: string | null) {
    const rows = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, p.id), eq(projectMembers.role, 'subcontractor'), eq(projectMembers.status, 'active')));
    const other = rows.filter((r) => r.id !== excludeId).reduce((a, r) => a + (r.allocatedValue ?? 0), 0);
    if (other + value > p.value) throw new BadRequestException({ message: 'Allocations would exceed the project value', fields: { allocatedValue: `At most ${(p.value - other) / 100} can be allocated` } });
  }

  // ---------- 079 site progress & photos ----------
  @Get('projects/:id/updates')
  async updates(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(ctx, id);
    const ups = await this.db.select({ u: projectUpdates, author: users.fullName, org: organizations.displayName, milestone: milestones.title }).from(projectUpdates)
      .innerJoin(users, eq(users.id, projectUpdates.authorUserId)).innerJoin(organizations, eq(organizations.id, projectUpdates.organizationId)).leftJoin(milestones, eq(milestones.id, projectUpdates.milestoneId))
      .where(eq(projectUpdates.projectId, id)).orderBy(desc(projectUpdates.createdAt)).limit(100);
    const docs = ups.length ? await this.db.select().from(projectDocuments).where(inArray(projectDocuments.updateId, ups.map((u) => u.u.id))) : [];
    return ups.map((u) => ({ id: u.u.id, note: u.u.note, progressPct: u.u.progressPct, milestoneId: u.u.milestoneId, milestone: u.milestone, author: u.author, org: u.org, createdAt: u.u.createdAt,
      attachments: docs.filter((d) => d.updateId === u.u.id).map(({ objectKey: _k, ...d }) => d) }));
  }

  @Post('projects/:id/updates')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 } }))
  @HttpCode(201)
  async postUpdate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: UploadFile[] | undefined, @Body() raw: Record<string, string>) {
    const { p, role } = await this.svc.load(ctx, id);
    const parsed = ProgressUpdateSchema.safeParse({ note: raw.note, progressPct: raw.progressPct === '' || raw.progressPct == null ? undefined : raw.progressPct, milestoneId: raw.milestoneId || undefined });
    if (!parsed.success) throw new BadRequestException({ message: 'Check the highlighted fields', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    const b = parsed.data;
    if (!['active', 'on_hold'].includes(p.status)) throw new ConflictException('Progress updates are recorded on active projects');
    let m: Milestone | null = null;
    if (b.milestoneId) {
      m = await this.svc.milestone(p, b.milestoneId);
      if (role === 'subcontractor' && m.assignedOrgId !== ctx.orgId) throw new ForbiddenException('Subcontractors report only on milestones assigned to them');
      if (b.progressPct !== undefined && !['in_progress', 'rejected'].includes(m.status)) throw new ConflictException('Progress can be reported only on milestones in progress');
    } else if (b.progressPct !== undefined) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { milestoneId: 'Choose the milestone this progress applies to' } });
    const stored = await Promise.all((files ?? []).map(async (f) => ({ f, s: await this.storage.put(f.buffer, f.mimetype, `projects/${id}`) })));
    const u = await this.db.transaction(async (tx) => {
      const [u] = await tx.insert(projectUpdates).values({ projectId: id, milestoneId: m?.id, organizationId: ctx.orgId!, authorUserId: ctx.userId, note: b.note, progressPct: b.progressPct }).returning();
      for (const { f, s } of stored) {
        await tx.insert(projectDocuments).values({ projectId: id, milestoneId: m?.id, updateId: u.id, category: s.mime.startsWith('image/') ? 'photo' : 'test_report', title: `Site update ${new Date().toISOString().slice(0, 10)}`, fileName: f.originalname.slice(0, 200), objectKey: s.key, sha256: s.sha256, size: s.size, mime: s.mime, organizationId: ctx.orgId!, uploadedBy: ctx.userId });
      }
      if (m && b.progressPct !== undefined) await tx.update(milestones).set({ progressPct: b.progressPct, updatedAt: new Date() }).where(eq(milestones.id, m.id));
      return u;
    });
    await this.audit.record(ctx, { action: 'project.progress_update', objectType: 'project', objectId: id, after: { milestoneId: m?.id, progressPct: b.progressPct, files: stored.map((x) => x.s.sha256) } });
    return { ...u, attachments: stored.length };
  }

  // ---------- 081 documents ----------
  @Get('projects/:id/documents')
  async documents(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(ctx, id);
    const rows = await this.db.select({ d: projectDocuments, org: organizations.displayName, by: users.fullName, milestone: milestones.title }).from(projectDocuments)
      .innerJoin(organizations, eq(organizations.id, projectDocuments.organizationId)).innerJoin(users, eq(users.id, projectDocuments.uploadedBy)).leftJoin(milestones, eq(milestones.id, projectDocuments.milestoneId))
      .where(eq(projectDocuments.projectId, id)).orderBy(desc(projectDocuments.createdAt));
    const superseded = new Set(rows.map((r) => r.d.supersedesId).filter(Boolean));
    return rows.map(({ d: { objectKey: _k, ...d }, org, by, milestone }) => ({ ...d, org, uploadedByName: by, milestone, current: !superseded.has(d.id) }));
  }

  @Post('projects/:id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @HttpCode(201)
  async upload(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadFile | undefined, @Body() raw: Record<string, string>) {
    const { p, role } = await this.svc.load(ctx, id);
    if (!file) throw new BadRequestException('Attach a file');
    const parsed = z.object({ title: z.string().trim().min(3).max(200), category: z.enum(DOC_CATEGORIES), milestoneId: z.string().uuid().optional(), supersedesId: z.string().uuid().optional(), reason: z.string().trim().max(1000).optional() })
      .safeParse({ title: raw.title, category: raw.category, milestoneId: raw.milestoneId || undefined, supersedesId: raw.supersedesId || undefined, reason: raw.reason || undefined });
    if (!parsed.success) throw new BadRequestException({ message: 'Check the highlighted fields', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    const b = parsed.data;
    if (p.status === 'closed') throw new ConflictException('The project is closed');
    if (b.milestoneId) {
      const m = await this.svc.milestone(p, b.milestoneId);
      if (role === 'subcontractor' && m.assignedOrgId !== ctx.orgId) throw new ForbiddenException('Subcontractors add evidence only to milestones assigned to them');
      if (['certified', 'invoiced'].includes(m.status)) throw new ConflictException('Certified milestones are locked; their evidence cannot change');
    }
    let prev: typeof projectDocuments.$inferSelect | undefined;
    if (b.supersedesId) {
      [prev] = await this.db.select().from(projectDocuments).where(and(eq(projectDocuments.id, b.supersedesId), eq(projectDocuments.projectId, id))).limit(1);
      if (!prev) throw new NotFoundException('Document to replace not found');
      if (prev.milestoneId) { const pm = await this.svc.milestone(p, prev.milestoneId); if (['submitted', 'certified', 'invoiced'].includes(pm.status)) throw new ConflictException('Evidence for a submitted or certified milestone cannot be replaced'); }
    }
    const s = await this.storage.put(file.buffer, file.mimetype, `projects/${id}`);
    return this.db.transaction(async (tx) => {
      const [d] = await tx.insert(projectDocuments).values({ projectId: id, milestoneId: b.milestoneId, category: b.category, title: b.title, fileName: file.originalname.slice(0, 200), objectKey: s.key, sha256: s.sha256, size: s.size, mime: s.mime, supersedesId: b.supersedesId, organizationId: ctx.orgId!, uploadedBy: ctx.userId }).returning();
      await tx.insert(projectChangeLog).values({ projectId: id, entity: 'document', entityId: d.id, field: prev ? 'superseded' : 'uploaded', before: prev ? { id: prev.id, sha256: prev.sha256 } : null, after: { title: d.title, sha256: d.sha256, category: d.category }, reason: b.reason, userId: ctx.userId, organizationId: ctx.orgId! });
      const { objectKey: _k, ...out } = d;
      return out;
    });
  }

  @Get('projects/:id/documents/:docId/url')
  async docUrl(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('docId', ParseUUIDPipe) docId: string) {
    await this.svc.load(ctx, id);
    const [d] = await this.db.select().from(projectDocuments).where(and(eq(projectDocuments.id, docId), eq(projectDocuments.projectId, id))).limit(1);
    if (!d) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'project.document_accessed', objectType: 'project_document', objectId: docId });
    return { url: this.storage.signedUrl(d.objectKey, 300) };
  }

  // ---------- 080 materials ----------
  @Get('projects/:id/materials')
  async materials(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(ctx, id);
    return this.db.select().from(projectMaterials).where(eq(projectMaterials.projectId, id)).orderBy(asc(projectMaterials.neededBy), asc(projectMaterials.createdAt));
  }

  @Post('projects/:id/materials')
  @HttpCode(201)
  async addMaterial(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(MaterialSchema)) b: z.infer<typeof MaterialSchema>) {
    const { role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 'plan materials');
    return this.db.transaction(async (tx) => {
      const [m] = await tx.insert(projectMaterials).values({ ...b, projectId: id }).returning();
      await tx.insert(projectChangeLog).values({ projectId: id, entity: 'material', entityId: m.id, field: 'added', after: { item: m.item, quantity: m.quantity, unit: m.unit }, userId: ctx.userId, organizationId: ctx.orgId! });
      return m;
    });
  }

  @Patch('projects/:id/materials/:matId')
  async changeMaterial(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('matId', ParseUUIDPipe) matId: string, @Body(body(MaterialUpdateSchema)) b: z.infer<typeof MaterialUpdateSchema>) {
    const { role } = await this.svc.load(ctx, id);
    if (role === 'owner') throw new ForbiddenException('Materials are tracked by the executing team');
    const [m] = await this.db.select().from(projectMaterials).where(and(eq(projectMaterials.id, matId), eq(projectMaterials.projectId, id))).limit(1);
    if (!m) throw new NotFoundException('Material not found');
    if (b.deliveredQty !== undefined && b.deliveredQty > m.quantity) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { deliveredQty: `Cannot exceed the ordered quantity (${m.quantity})` } });
    const fields = (['status', 'deliveredQty', 'supplier', 'notes'] as const).filter((f) => b[f] !== undefined && b[f] !== m[f]);
    return this.db.transaction(async (tx) => {
      for (const f of fields) await tx.insert(projectChangeLog).values({ projectId: id, entity: 'material', entityId: matId, field: f, before: m[f], after: b[f], userId: ctx.userId, organizationId: ctx.orgId! });
      const [u] = await tx.update(projectMaterials).set({ ...Object.fromEntries(fields.map((f) => [f, b[f]])), version: m.version + 1, updatedAt: new Date() }).where(and(eq(projectMaterials.id, matId), eq(projectMaterials.version, m.version))).returning();
      if (!u) throw new ConflictException('The material was changed concurrently. Reload and try again.');
      return u;
    });
  }

  // ---------- 082 inspections ----------
  @Get('projects/:id/inspections')
  async inspections(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.load(ctx, id);
    const rows = await this.db.select({ i: inspections, inspector: users.fullName, org: organizations.displayName, milestone: milestones.title }).from(inspections)
      .innerJoin(users, eq(users.id, inspections.inspectorUserId)).innerJoin(organizations, eq(organizations.id, inspections.inspectorOrgId)).leftJoin(milestones, eq(milestones.id, inspections.milestoneId))
      .where(eq(inspections.projectId, id)).orderBy(desc(inspections.createdAt));
    return rows.map((r) => ({ ...r.i, inspector: r.inspector, org: r.org, milestone: r.milestone }));
  }

  @Post('projects/:id/inspections')
  @HttpCode(201)
  async inspect(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(InspectionSchema)) b: z.infer<typeof InspectionSchema>) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner', 'lead'], ctx, 'record inspections');
    if (!['active', 'on_hold', 'completed'].includes(p.status)) throw new ConflictException('Inspections are recorded on active projects');
    if (b.milestoneId) await this.svc.milestone(p, b.milestoneId);
    const result = b.checklist.some((c) => c.result === 'fail') ? 'fail' : 'pass';
    const [i] = await this.db.insert(inspections).values({ projectId: id, milestoneId: b.milestoneId, kind: b.kind, checklist: b.checklist, result, observations: b.observations, correctiveAction: b.correctiveAction, inspectorUserId: ctx.userId, inspectorOrgId: ctx.orgId! }).returning();
    await this.audit.record(ctx, { action: `project.inspection_${result}`, objectType: 'project', objectId: id, after: { inspectionId: i.id, kind: b.kind, milestoneId: b.milestoneId } });
    if (result === 'fail') await this.svc.notifyOrg(role === 'owner' ? p.leadOrgId : p.ownerOrgId, `Non-conformance on ${p.code}`, `A ${b.kind} inspection failed: ${b.correctiveAction}`, `/projects/${id}/inspections`);
    return i;
  }

  /** Closing a non-conformance needs the inspecting organization to confirm the corrective action. */
  @Post('projects/:id/inspections/:iid/close')
  @HttpCode(200)
  async closeNcr(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('iid', ParseUUIDPipe) iid: string, @Body(body(z.object({ note: z.string().trim().min(5).max(2000) }))) b: { note: string }) {
    await this.svc.load(ctx, id);
    const [i] = await this.db.select().from(inspections).where(and(eq(inspections.id, iid), eq(inspections.projectId, id))).limit(1);
    if (!i) throw new NotFoundException('Inspection not found');
    if (i.result !== 'fail' || i.closedAt) throw new ConflictException('Only open non-conformances can be closed');
    if (i.inspectorOrgId !== ctx.orgId) throw new ForbiddenException('Only the inspecting organization can close this non-conformance');
    const [u] = await this.db.update(inspections).set({ closedAt: new Date(), closedBy: ctx.userId, observations: `${i.observations ?? ''}\nClosed: ${b.note}`.trim() }).where(eq(inspections.id, iid)).returning();
    await this.audit.record(ctx, { action: 'project.ncr_closed', objectType: 'project', objectId: id, after: { inspectionId: iid }, reason: b.note });
    return u;
  }

  // ---------- 083 submission, certification, invoicing ----------
  @Post('projects/:id/milestones/:mid/submit')
  @HttpCode(200)
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('mid', ParseUUIDPipe) mid: string, @Body(body(MilestoneSubmitSchema)) b: z.infer<typeof MilestoneSubmitSchema>) {
    const { p, role } = await this.svc.load(ctx, id);
    const m = await this.svc.milestone(p, mid);
    if (!(role === 'lead' || (role === 'subcontractor' && m.assignedOrgId === ctx.orgId))) throw new ForbiddenException('Only the lead or the assigned subcontractor can submit this milestone');
    if (p.status !== 'active') throw new ConflictException('Milestones can be submitted on active projects only');
    const ev = await this.svc.evidence(p, m);
    const problems: string[] = [];
    if (m.progressPct < 100) problems.push('Report 100% progress before submitting');
    if (!ev.docs.length) problems.push('Attach at least one photo, test report or document as evidence');
    if (problems.length) throw new BadRequestException({ message: 'This milestone is not ready for certification', problems });
    const u = await this.svc.setMilestone(ctx, p, m, 'submitted', { submittedAt: new Date(), submittedBy: ctx.userId, submissionNote: b.note, evidenceHash: ev.hash, rejectionReason: null }, b.note);
    await this.svc.notifyOrg(p.ownerOrgId, `Certification requested: ${p.code}`, `${m.title} was submitted with ${ev.docs.length} evidence file(s).`, `/projects/${id}/certification`);
    return u;
  }

  @Get('projects/:id/certification')
  async certification(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    if (!this.svc.financials(role)) throw new ForbiddenException('Certification is handled by the owner and the lead');
    const ms = await this.db.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(asc(milestones.seq));
    const insp = await this.db.select().from(inspections).where(eq(inspections.projectId, id));
    const invoices = await this.db.select().from(projectInvoices).where(eq(projectInvoices.projectId, id));
    const out = [];
    for (const m of ms) {
      const ev = await this.svc.evidence(p, m);
      out.push({ ...m, evidence: ev.docs.map(({ objectKey: _k, ...d }) => d), evidenceUnchanged: m.evidenceHash ? m.evidenceHash === ev.hash : null, checks: this.certChecks(p, m, insp, ev.hash), invoice: invoices.find((i) => i.milestoneId === m.id) ?? null });
    }
    return { role, project: { id: p.id, code: p.code, title: p.title, status: p.status, value: p.value, currency: p.currency, ownerOrgId: p.ownerOrgId }, milestones: out };
  }

  private certChecks(p: Project, m: Milestone, insp: (typeof inspections.$inferSelect)[], evidenceHash: string) {
    const mine = insp.filter((i) => i.milestoneId === m.id);
    const kinds = m.requiresInspection === 'both' ? ['quality', 'safety'] : m.requiresInspection === 'none' ? [] : [m.requiresInspection];
    return [
      { key: 'submitted', label: 'Submitted with evidence', ok: !!m.submittedAt && !!m.evidenceHash },
      { key: 'evidence_unchanged', label: 'Evidence unchanged since submission', ok: !!m.evidenceHash && m.evidenceHash === evidenceHash },
      ...kinds.map((k) => ({ key: `inspection_${k}`, label: `Passing ${k} inspection by the owner`, ok: mine.some((i) => i.kind === k && i.result === 'pass' && i.inspectorOrgId === p.ownerOrgId) })),
      { key: 'no_open_ncr', label: 'No open non-conformance on this milestone', ok: !mine.some((i) => i.result === 'fail' && !i.closedAt) },
    ];
  }

  @Post('projects/:id/milestones/:mid/certify')
  @Idempotent()
  @HttpCode(200)
  async certify(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('mid', ParseUUIDPipe) mid: string, @Body(body(CertifySchema)) b: z.infer<typeof CertifySchema>) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner'], ctx, 'certify milestones');
    const m = await this.svc.milestone(p, mid);
    if (m.status !== 'submitted') throw new ConflictException('Only submitted milestones can be certified or rejected');
    if (m.submittedBy === ctx.userId) throw new ForbiddenException('You submitted this milestone, so someone else must certify it');
    if (b.decision === 'reject') {
      const u = await this.svc.setMilestone(ctx, p, m, 'rejected', { rejectionReason: b.note }, b.note);
      await this.svc.notifyOrg(m.assignedOrgId ?? p.leadOrgId, `Certification rejected: ${m.title}`, b.note, `/projects/${id}/certification`);
      return u;
    }
    const ev = await this.svc.evidence(p, m);
    const insp = await this.db.select().from(inspections).where(eq(inspections.projectId, id));
    const failed = this.certChecks(p, m, insp, ev.hash).filter((c) => !c.ok);
    if (failed.length) throw new ConflictException({ message: 'Certification needs complete evidence', problems: failed.map((c) => c.label) });
    const amount = b.certifiedAmount ?? m.amount;
    if (amount > m.amount) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { certifiedAmount: 'Cannot exceed the milestone amount' } });
    if (amount < m.amount && b.note.length < 10) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { note: 'Explain the deduction' } });
    const u = await this.svc.setMilestone(ctx, p, m, 'certified', { certifiedAt: new Date(), certifiedBy: ctx.userId, certifiedAmount: amount, certificationNote: b.note }, b.note);
    await this.commissions.onMilestoneCertified(u); // introducer commission becomes eligible (earned only on payment)
    await this.audit.record(ctx, { action: 'milestone.certification_evidence', objectType: 'milestone', objectId: mid, after: { evidenceHash: ev.hash, files: ev.docs.map((d) => d.sha256), certifiedAmount: amount } });
    await this.svc.notifyOrg(p.leadOrgId, `Milestone certified: ${m.title}`, `Certified for ${amount / 100}. You can now raise the invoice.`, `/projects/${id}/certification`);
    return u;
  }

  @Post('projects/:id/milestones/:mid/invoice')
  @Idempotent()
  @HttpCode(201)
  async invoice(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('mid', ParseUUIDPipe) mid: string) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['lead'], ctx, 'raise invoices');
    const m = await this.svc.milestone(p, mid);
    if (m.status !== 'certified') throw new ConflictException('Only certified milestones can be invoiced');
    return this.db.transaction(async (tx) => {
      const [inv] = await tx.insert(projectInvoices).values({ number: `INV-${year()}-${randomDigits(6)}`, projectId: id, milestoneId: mid, amount: m.certifiedAmount!, issuedByOrgId: ctx.orgId! }).returning();
      await this.svc.setMilestone(ctx, p, m, 'invoiced', {}, `Invoice ${inv.number}`, tx as unknown as Db);
      return inv;
    });
  }

  /** The owner records the customer payment — the contractual trigger for introducer commissions (Stage 12). */
  @Post('projects/:id/invoices/:iid/paid')
  @Idempotent()
  @HttpCode(200)
  async paid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('iid', ParseUUIDPipe) iid: string, @Body(body(InvoicePaidSchema)) b: z.infer<typeof InvoicePaidSchema>) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner'], ctx, 'record payments');
    const [inv] = await this.db.select().from(projectInvoices).where(and(eq(projectInvoices.id, iid), eq(projectInvoices.projectId, id))).limit(1);
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === 'paid') throw new ConflictException('This invoice is already marked paid');
    const [u] = await this.db.update(projectInvoices).set({ status: 'paid', paidAt: new Date(), paymentReference: b.paymentReference }).where(and(eq(projectInvoices.id, iid), eq(projectInvoices.status, 'issued'))).returning();
    if (!u) throw new ConflictException('This invoice is already marked paid');
    await this.commissions.onInvoicePaid(u); // the customer payment is the only event that earns commission
    await this.audit.record(ctx, { action: 'project.invoice_paid', objectType: 'project_invoice', objectId: iid, after: { number: inv.number, amount: inv.amount, projectId: p.id, reference: b.paymentReference } });
    await this.svc.notifyOrg(p.leadOrgId, `Payment recorded: ${inv.number}`, `Reference ${b.paymentReference}.`, `/projects/${id}/certification`);
    return u;
  }

  // ---------- 084 closure ----------
  @Get('projects/:id/closure')
  async closure(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    return { role, project: publicProject(p), checks: await this.closureChecks(p), certificate: p.completionCode ? { code: p.completionCode, hash: p.completionHash, completedAt: p.completedAt, snapshot: p.completionSnapshot } : null };
  }

  private async closureChecks(p: Project) {
    const ms = await this.db.select().from(milestones).where(eq(milestones.projectId, p.id));
    const ncr = await this.db.select({ id: inspections.id }).from(inspections).where(and(eq(inspections.projectId, p.id), eq(inspections.result, 'fail'), isNull(inspections.closedAt)));
    const handover = await this.db.select({ id: projectDocuments.id }).from(projectDocuments).where(and(eq(projectDocuments.projectId, p.id), eq(projectDocuments.category, 'handover')));
    const invoices = await this.db.select().from(projectInvoices).where(eq(projectInvoices.projectId, p.id));
    const mats = await this.db.select().from(projectMaterials).where(eq(projectMaterials.projectId, p.id));
    return [
      { key: 'milestones', label: 'Every milestone certified and invoiced', ok: ms.length > 0 && ms.every((m) => m.status === 'invoiced') },
      { key: 'ncr', label: 'No open non-conformances', ok: ncr.length === 0 },
      { key: 'handover', label: 'Handover documents uploaded (as-built drawings, manuals, warranties)', ok: handover.length > 0 },
      { key: 'materials', label: 'All materials delivered or installed', ok: mats.every((m) => ['delivered', 'installed'].includes(m.status)) },
      { key: 'paid', label: 'Every invoice paid (required to close)', ok: invoices.length > 0 && invoices.every((i) => i.status === 'paid'), closeOnly: true },
    ];
  }

  /** Completion certificate: a hashed snapshot of milestones, certified amounts, evidence hashes and inspections. */
  @Post('projects/:id/complete')
  @Idempotent()
  @HttpCode(200)
  async complete(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner'], ctx, 'issue the completion certificate');
    if (p.status !== 'active') throw new ConflictException('Only active projects can be completed');
    const checks = await this.closureChecks(p);
    const failing = checks.filter((c) => !c.ok && !c.closeOnly);
    if (failing.length) throw new ConflictException({ message: 'The project is not ready for completion', problems: failing.map((c) => c.label) });
    const ms = await this.db.select().from(milestones).where(eq(milestones.projectId, id)).orderBy(asc(milestones.seq));
    const insp = await this.db.select().from(inspections).where(eq(inspections.projectId, id));
    const snapshot = { project: p.code, title: p.title, value: p.value, currency: p.currency, ownerOrgId: p.ownerOrgId, leadOrgId: p.leadOrgId, completedAt: new Date().toISOString(),
      milestones: ms.map((m) => ({ seq: m.seq, title: m.title, amount: m.amount, certifiedAmount: m.certifiedAmount, certifiedAt: m.certifiedAt, evidenceHash: m.evidenceHash })),
      inspections: { total: insp.length, passed: insp.filter((i) => i.result === 'pass').length, nonConformancesClosed: insp.filter((i) => i.result === 'fail').length } };
    const code = `CMP-${year()}-${randomDigits(6)}`;
    const hash = sha256(canonicalJson(snapshot));
    const u = await this.svc.setProject(ctx, p, 'completed', 'Completion certificate issued', { completedAt: new Date(), completionCode: code, completionHash: hash, completionSnapshot: snapshot });
    await this.svc.notifyOrg(p.leadOrgId, `Completion certificate: ${p.code}`, `Certificate ${code} issued.`, `/projects/${id}/closure`);
    return { ...publicProject(u), certificate: { code, hash, snapshot } };
  }

  @Post('projects/:id/close')
  @HttpCode(200)
  async close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { p, role } = await this.svc.load(ctx, id);
    this.svc.assertRole(role, ['owner'], ctx, 'close the project');
    if (p.status !== 'completed') throw new ConflictException('Complete the project before closing it');
    const failing = (await this.closureChecks(p)).filter((c) => !c.ok);
    if (failing.length) throw new ConflictException({ message: 'The project cannot be closed yet', problems: failing.map((c) => c.label) });
    return publicProject(await this.svc.setProject(ctx, p, 'closed', 'All invoices paid', { closedAt: new Date() }));
  }
}

@Module({ imports: [CommissionsModule], controllers: [ProjectsController], providers: [ProjectsService] })
export class ProjectsModule {}
