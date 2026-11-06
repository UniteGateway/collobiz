import { BadRequestException, Body, Controller, ConflictException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CrmActivitySchema, CrmCustomerSchema, CrmDealSchema, CrmMoveSchema, PIPELINE_STAGES, TaskSchema } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { auditEvents, crmActivities, crmDeals, crmTasks, customers, disputes, leadClaims, leadDocuments, memberships, notifications, opportunities, opportunityEvents, routingEvents, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

const CLOSED = new Set(['won', 'lost']);

/** Screens 028, 030, 052, 053, 054 — every query is scoped to the caller's organization. */
@ApiTags('crm')
@Controller()
@RequireOrg()
export class CrmController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async ownCustomer(ctx: RequestContext, id: string) {
    const [c] = await this.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.organizationId, ctx.orgId!))).limit(1);
    if (!c) throw new NotFoundException('Customer not found');
    return c;
  }
  private async ownDeal(ctx: RequestContext, id: string) {
    const [d] = await this.db.select().from(crmDeals).where(and(eq(crmDeals.id, id), eq(crmDeals.organizationId, ctx.orgId!))).limit(1);
    if (!d) throw new NotFoundException('Deal not found');
    return d;
  }
  private async ownSubject(ctx: RequestContext, type: string, id: string) {
    if (type === 'customer') return this.ownCustomer(ctx, id);
    if (type === 'deal') return this.ownDeal(ctx, id);
    const [l] = await this.db.select().from(leadClaims).where(and(eq(leadClaims.id, id), eq(leadClaims.introducerOrgId, ctx.orgId!))).limit(1);
    if (!l) throw new NotFoundException('Lead not found');
    return l;
  }
  private log(ctx: RequestContext, subjectType: string, subjectId: string, kind: string, text: string, tx: Db = this.db) {
    return tx.insert(crmActivities).values({ organizationId: ctx.orgId!, subjectType, subjectId, kind, body: text, actorUserId: ctx.userId });
  }

  // ---- Customers (052) ----
  @Get('crm/customers')
  @RequireCaps('crm.manage')
  customers(@Ctx() ctx: RequestContext, @Query('q') q?: string) {
    return this.db.select({ c: customers, deals: sql<number>`(select count(*)::int from crm_deals d where d.customer_id = ${customers.id})`, leads: sql<number>`(select count(*)::int from lead_claims l where l.customer_id = ${customers.id})` })
      .from(customers).where(and(eq(customers.organizationId, ctx.orgId!), q ? or(ilike(customers.legalName, `%${q}%`), ilike(customers.city, `%${q}%`)) : undefined)).orderBy(asc(customers.legalName))
      .then((r) => r.map((x) => ({ ...x.c, deals: x.deals, leads: x.leads })));
  }

  @Post('crm/customers')
  @RequireCaps('crm.manage')
  @HttpCode(201)
  async createCustomer(@Ctx() ctx: RequestContext, @Body(body(CrmCustomerSchema)) b: z.infer<typeof CrmCustomerSchema>) {
    const [c] = await this.db.insert(customers).values({ ...b, organizationId: ctx.orgId!, consentProvenance: { method: 'crm_entry', obtainedAt: new Date().toISOString(), disclosureScope: 'restricted' }, restrictedContacts: true }).returning();
    await this.log(ctx, 'customer', c.id, 'system', 'Customer record created');
    await this.audit.record(ctx, { action: 'crm.customer_created', objectType: 'customer', objectId: c.id });
    return c;
  }

  @Get('crm/customers/:id')
  @RequireCaps('crm.manage')
  async customer(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.ownCustomer(ctx, id);
    const deals = await this.db.select().from(crmDeals).where(eq(crmDeals.customerId, id)).orderBy(desc(crmDeals.updatedAt));
    const leads = await this.db.select({ id: leadClaims.id, status: leadClaims.status, code: opportunities.code, title: opportunities.title, opportunityStatus: opportunities.status, createdAt: leadClaims.createdAt })
      .from(leadClaims).innerJoin(opportunities, eq(opportunities.id, leadClaims.opportunityId)).where(eq(leadClaims.customerId, id));
    const ids = [id, ...deals.map((d) => d.id), ...leads.map((l) => l.id)];
    const activities = await this.db.select({ a: crmActivities, actor: users.fullName }).from(crmActivities).leftJoin(users, eq(users.id, crmActivities.actorUserId))
      .where(and(eq(crmActivities.organizationId, ctx.orgId!), inArray(crmActivities.subjectId, ids))).orderBy(desc(crmActivities.at)).limit(200);
    const tasks = await this.db.select().from(crmTasks).where(and(eq(crmTasks.organizationId, ctx.orgId!), or(eq(crmTasks.customerId, id), deals.length ? inArray(crmTasks.dealId, deals.map((d) => d.id)) : sql`false`))).orderBy(asc(crmTasks.dueAt));
    const pipelineValue = deals.filter((d) => !CLOSED.has(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0);
    const wonValue = deals.filter((d) => d.stage === 'won').reduce((s, d) => s + (d.value ?? 0), 0);
    return { customer: c, deals, leads, activities: activities.map((x) => ({ ...x.a, actor: x.actor })), tasks, metrics: { pipelineValue, wonValue, openDeals: deals.filter((d) => !CLOSED.has(d.stage)).length } };
  }

  @Patch('crm/customers/:id')
  @RequireCaps('crm.manage')
  async updateCustomer(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CrmCustomerSchema.partial())) b: Partial<z.infer<typeof CrmCustomerSchema>>) {
    const before = await this.ownCustomer(ctx, id);
    const [after] = await this.db.update(customers).set({ ...b, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    await this.log(ctx, 'customer', id, 'system', `Customer details updated (${Object.keys(b).join(', ')})`);
    await this.audit.record(ctx, { action: 'crm.customer_updated', objectType: 'customer', objectId: id, before, after });
    return after;
  }

  // ---- Pipeline (053) ----
  @Get('crm/pipeline')
  @RequireCaps('crm.manage')
  async pipeline(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ d: crmDeals, customer: customers.legalName, owner: users.fullName }).from(crmDeals).innerJoin(customers, eq(customers.id, crmDeals.customerId)).leftJoin(users, eq(users.id, crmDeals.ownerUserId))
      .where(eq(crmDeals.organizationId, ctx.orgId!)).orderBy(desc(crmDeals.updatedAt));
    const deals = rows.map((r) => ({ ...r.d, customer: r.customer, owner: r.owner }));
    const columns = PIPELINE_STAGES.map((stage) => ({ stage, deals: deals.filter((d) => d.stage === stage), value: deals.filter((d) => d.stage === stage).reduce((s, d) => s + (d.value ?? 0), 0) }));
    const closed = deals.filter((d) => CLOSED.has(d.stage));
    return { columns, metrics: { open: deals.length - closed.length, openValue: deals.filter((d) => !CLOSED.has(d.stage)).reduce((s, d) => s + (d.value ?? 0), 0), winRate: closed.length ? Math.round((closed.filter((d) => d.stage === 'won').length / closed.length) * 100) : null } };
  }

  @Post('crm/deals')
  @RequireCaps('crm.manage')
  @HttpCode(201)
  async createDeal(@Ctx() ctx: RequestContext, @Body(body(CrmDealSchema)) b: z.infer<typeof CrmDealSchema>) {
    await this.ownCustomer(ctx, b.customerId);
    const [d] = await this.db.insert(crmDeals).values({ organizationId: ctx.orgId!, customerId: b.customerId, title: b.title, value: b.value, expectedClose: b.expectedClose ? new Date(b.expectedClose) : null, ownerUserId: ctx.userId }).returning();
    await this.log(ctx, 'deal', d.id, 'system', `Deal created in "new"`);
    await this.audit.record(ctx, { action: 'crm.deal_created', objectType: 'crm_deal', objectId: d.id, after: b });
    return d;
  }

  /** Stage transition with optimistic locking; every move is written to the activity history and audit log. */
  @Post('crm/deals/:id/move')
  @RequireCaps('crm.manage')
  @HttpCode(200)
  async move(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CrmMoveSchema)) b: z.infer<typeof CrmMoveSchema>) {
    const d = await this.ownDeal(ctx, id);
    if (CLOSED.has(d.stage)) throw new BadRequestException(`This deal is already ${d.stage}. Create a new deal to re-open the opportunity.`);
    if (b.stage === d.stage) throw new BadRequestException('The deal is already in that stage');
    if (b.expectedVersion != null && b.expectedVersion !== d.version) throw new ConflictException('This deal was changed by someone else. Reload and try again.');
    const [u] = await this.db.update(crmDeals).set({ stage: b.stage, lostReason: b.stage === 'lost' ? b.lostReason : null, version: d.version + 1, updatedAt: new Date() })
      .where(and(eq(crmDeals.id, id), eq(crmDeals.version, d.version))).returning();
    if (!u) throw new ConflictException('Concurrent update detected. Reload and try again.');
    await this.log(ctx, 'deal', id, 'stage_change', `${d.stage} → ${b.stage}${b.note ? ` — ${b.note}` : ''}${b.lostReason ? ` (lost: ${b.lostReason})` : ''}`);
    await this.audit.record(ctx, { action: 'crm.deal_stage_changed', objectType: 'crm_deal', objectId: id, before: { stage: d.stage, version: d.version }, after: { stage: b.stage, version: u.version }, reason: b.note ?? b.lostReason });
    return u;
  }

  // ---- Activities (052/054) ----
  @Post('crm/activities')
  @RequireCaps('crm.manage')
  @HttpCode(201)
  async activity(@Ctx() ctx: RequestContext, @Body(body(CrmActivitySchema)) b: z.infer<typeof CrmActivitySchema>) {
    await this.ownSubject(ctx, b.subjectType, b.subjectId);
    const [a] = await this.log(ctx, b.subjectType, b.subjectId, b.kind, b.body).returning();
    return a;
  }

  /** 030 — Quick actions & activity centre: CRM activity, organization audit trail and notifications in one feed. */
  @Get('crm/activity')
  async feed(@Ctx() ctx: RequestContext, @Query('limit') limit = '60') {
    const n = Math.min(200, Number(limit) || 60);
    const crm = await this.db.select({ a: crmActivities, actor: users.fullName }).from(crmActivities).leftJoin(users, eq(users.id, crmActivities.actorUserId)).where(eq(crmActivities.organizationId, ctx.orgId!)).orderBy(desc(crmActivities.at)).limit(n);
    const audit = await this.db.select({ id: auditEvents.id, at: auditEvents.at, action: auditEvents.action, objectType: auditEvents.objectType, actor: users.fullName }).from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorUserId)).where(eq(auditEvents.organizationId, ctx.orgId!)).orderBy(desc(auditEvents.seq)).limit(n);
    const notes = await this.db.select().from(notifications).where(eq(notifications.userId, ctx.userId)).orderBy(desc(notifications.createdAt)).limit(20);
    const items = [
      ...crm.map((x) => ({ id: x.a.id, at: x.a.at, source: 'crm', title: `${x.a.kind.replace('_', ' ')} · ${x.a.subjectType}`, detail: x.a.body, actor: x.actor })),
      ...audit.map((x) => ({ id: x.id, at: x.at, source: 'audit', title: x.action.replace(/[._]/g, ' '), detail: x.objectType, actor: x.actor })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, n);
    const [due] = await this.db.execute<{ overdue: number; today: number }>(sql`select count(*) filter (where due_at < now())::int as overdue, count(*) filter (where due_at >= now() and due_at < now() + interval '1 day')::int as today
      from crm_tasks where organization_id = ${ctx.orgId!} and status = 'open'`).then((r) => r.rows);
    return { items, notifications: notes, tasks: due };
  }

  // ---- Tasks (028) ----
  @Get('crm/tasks')
  @RequireCaps('crm.manage')
  tasks(@Ctx() ctx: RequestContext, @Query('from') from?: string, @Query('to') to?: string, @Query('status') status?: string) {
    return this.db.select({ t: crmTasks, assignee: users.fullName, customer: customers.legalName }).from(crmTasks).innerJoin(users, eq(users.id, crmTasks.assigneeUserId)).leftJoin(customers, eq(customers.id, crmTasks.customerId))
      .where(and(eq(crmTasks.organizationId, ctx.orgId!), from ? gte(crmTasks.dueAt, new Date(from)) : undefined, to ? lte(crmTasks.dueAt, new Date(to)) : undefined, status ? eq(crmTasks.status, status) : undefined))
      .orderBy(asc(crmTasks.dueAt)).then((r) => r.map((x) => ({ ...x.t, assignee: x.assignee, customer: x.customer })));
  }

  @Post('crm/tasks')
  @RequireCaps('crm.manage')
  @HttpCode(201)
  async createTask(@Ctx() ctx: RequestContext, @Body(body(TaskSchema)) b: z.infer<typeof TaskSchema>) {
    if (b.customerId) await this.ownCustomer(ctx, b.customerId);
    if (b.dealId) await this.ownDeal(ctx, b.dealId);
    if (b.leadClaimId) await this.ownSubject(ctx, 'lead', b.leadClaimId);
    const assignee = b.assigneeUserId ?? ctx.userId;
    const [m] = await this.db.select().from(memberships).where(and(eq(memberships.userId, assignee), eq(memberships.organizationId, ctx.orgId!), eq(memberships.status, 'active'))).limit(1);
    if (!m) throw new BadRequestException('Tasks can only be assigned to members of your organization');
    const [t] = await this.db.insert(crmTasks).values({ organizationId: ctx.orgId!, title: b.title, dueAt: new Date(b.dueAt), assigneeUserId: assignee, customerId: b.customerId, dealId: b.dealId, leadClaimId: b.leadClaimId, createdBy: ctx.userId }).returning();
    if (assignee !== ctx.userId) await this.db.insert(notifications).values({ userId: assignee, kind: 'task', title: `New follow-up: ${b.title}`, body: `Due ${new Date(b.dueAt).toLocaleString()}`, link: '/tasks' });
    return t;
  }

  @Patch('crm/tasks/:id')
  @RequireCaps('crm.manage')
  async updateTask(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['open', 'done']).optional(), dueAt: z.string().datetime().optional() }))) b: { status?: string; dueAt?: string }) {
    const [t] = await this.db.select().from(crmTasks).where(and(eq(crmTasks.id, id), eq(crmTasks.organizationId, ctx.orgId!))).limit(1);
    if (!t) throw new NotFoundException();
    const [u] = await this.db.update(crmTasks).set({ ...(b.status ? { status: b.status, completedAt: b.status === 'done' ? new Date() : null } : {}), ...(b.dueAt ? { dueAt: new Date(b.dueAt) } : {}) }).where(eq(crmTasks.id, id)).returning();
    const subject = t.dealId ? ['deal', t.dealId] : t.customerId ? ['customer', t.customerId] : t.leadClaimId ? ['lead', t.leadClaimId] : null;
    if (subject && b.status === 'done') await this.log(ctx, subject[0], subject[1], 'system', `Follow-up completed: ${t.title}`);
    return u;
  }

  // ---- 054 Lead follow-up & conversion timeline ----
  @Get('leads/:id/timeline')
  async timeline(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [claim] = await this.db.select().from(leadClaims).where(and(eq(leadClaims.id, id), eq(leadClaims.introducerOrgId, ctx.orgId!))).limit(1);
    if (!claim) throw new NotFoundException('Lead not found');
    const [deal] = await this.db.select().from(crmDeals).where(eq(crmDeals.leadClaimId, id)).limit(1);
    const ev = await this.db.select().from(opportunityEvents).where(eq(opportunityEvents.opportunityId, claim.opportunityId));
    const rt = await this.db.select().from(routingEvents).where(eq(routingEvents.opportunityId, claim.opportunityId));
    const docs = await this.db.select({ id: leadDocuments.id, at: leadDocuments.createdAt, fileName: leadDocuments.fileName }).from(leadDocuments).where(eq(leadDocuments.claimId, id));
    const dsp = await this.db.select().from(disputes).where(eq(disputes.subjectId, id));
    const acts = await this.db.select({ a: crmActivities, actor: users.fullName }).from(crmActivities).leftJoin(users, eq(users.id, crmActivities.actorUserId))
      .where(and(eq(crmActivities.organizationId, ctx.orgId!), inArray(crmActivities.subjectId, [id, claim.customerId, ...(deal ? [deal.id] : [])])));
    const items = [
      ...ev.map((e) => ({ id: e.id, at: e.at, kind: 'status', title: `Opportunity v${e.version}: ${e.fromStatus ?? '—'} → ${e.toStatus}`, detail: e.reason })),
      ...rt.flatMap((r) => [{ id: `${r.id}-s`, at: r.startAt, kind: 'routing', title: 'Unite first review started', detail: `Due ${r.dueAt.toISOString()}` }, ...(r.decidedAt ? [{ id: `${r.id}-d`, at: r.decidedAt, kind: 'routing', title: `Unite decision: ${r.decision}`, detail: r.reason }] : [])]),
      ...docs.map((d) => ({ id: d.id, at: d.at, kind: 'document', title: 'Evidence uploaded', detail: d.fileName })),
      ...dsp.map((d) => ({ id: d.id, at: d.createdAt, kind: 'dispute', title: `Dispute ${d.code} (${d.status})`, detail: d.outcome ?? undefined })),
      ...acts.map((x) => ({ id: x.a.id, at: x.a.at, kind: x.a.kind, title: `${x.a.kind.replace('_', ' ')}${x.actor ? ` · ${x.actor}` : ''}`, detail: x.a.body })),
    ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
    return { claimId: id, deal: deal ?? null, conversion: { registered: claim.createdAt, protectedFrom: claim.protectedFrom, stage: deal?.stage ?? null }, items };
  }
}

@Module({ controllers: [CrmController] })
export class CrmModule {}
