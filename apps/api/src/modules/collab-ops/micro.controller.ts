/**
 * Micro-contracts — small fixed-price jobs (₹100–₹50,000). Poster picks one applicant, the worker submits, the poster
 * accepts (or asks for a revision) against the stated acceptance test, pays the worker directly and records the
 * payment reference; the worker confirms receipt. COLLABIZ never holds or moves the money. Paid and confirmed jobs
 * are the verified work history shown in the Proof passport.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MICRO_FLOW, MicroContractSchema, microKindLabel, opsStateName } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { microApplications, microContracts, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { isManager, mustBeVerified, nextCode, notifyOrg, today } from './shared';

type Micro = typeof microContracts.$inferSelect;
type Step = { status: string; at: string; by: string; note?: string };

@ApiTags('micro')
@Controller('micro')
export class MicroController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private view(m: Micro, ctx: RequestContext, poster: string | null) {
    const party = m.orgId === ctx.orgId || (!!m.workerOrgId && m.workerOrgId === ctx.orgId);
    const hist = m.history as Step[];
    return { id: m.id, code: m.code, kind: m.kind, kindLabel: microKindLabel(m.kind), state: m.state, stateName: m.state ? opsStateName(m.state) : 'Remote / anywhere', title: m.title, scope: m.scope, acceptance: m.acceptance,
      quantity: m.quantity, unit: m.unit, priceRs: m.priceRs, due: m.due, status: m.status, poster, isPoster: m.orgId === ctx.orgId, isWorker: !!m.workerOrgId && m.workerOrgId === ctx.orgId, demo: m.demo,
      delivery: party ? m.delivery : null, paymentRef: party ? m.paymentRef : null, paymentConfirmed: hist.some((h) => h.status === 'payment_confirmed'), history: party ? hist : [], createdAt: m.createdAt };
  }
  private async load(id: string) {
    const [r] = await this.db.select({ m: microContracts, org: organizations.displayName }).from(microContracts).innerJoin(organizations, eq(organizations.id, microContracts.orgId)).where(eq(microContracts.id, id)).limit(1);
    if (!r) throw new NotFoundException('Micro-contract not found');
    return r;
  }
  private async move(ctx: RequestContext, m: Micro, to: string, set: Partial<Micro>, note?: string) {
    if (to !== 'payment_confirmed' && !MICRO_FLOW[m.status]?.includes(to)) throw new ConflictException(`A ${m.status} micro-contract cannot become ${to}`);
    const history = [...(m.history as Step[]), { status: to, at: new Date().toISOString(), by: ctx.userId, ...(note ? { note } : {}) }];
    const [u] = await this.db.update(microContracts).set({ ...set, ...(to === 'payment_confirmed' ? {} : { status: to }), history, updatedAt: new Date() }).where(and(eq(microContracts.id, m.id), eq(microContracts.status, m.status))).returning();
    if (!u) throw new ConflictException('This micro-contract changed — reload and try again');
    await this.audit.record(ctx, { action: `micro.${to}`, objectType: 'micro_contract', objectId: m.id, before: { status: m.status }, after: { status: u.status, note: note ?? null } });
    return u;
  }

  @Get()
  async open(@Ctx() ctx: RequestContext, @Query('kind') kind?: string) {
    const rows = await this.db.select({ m: microContracts, org: organizations.displayName }).from(microContracts).innerJoin(organizations, eq(organizations.id, microContracts.orgId))
      .where(and(eq(microContracts.status, 'open'), sql`${microContracts.due} >= ${today()}`, kind ? eq(microContracts.kind, kind) : undefined)).orderBy(microContracts.due).limit(200);
    const applied = ctx.orgId && rows.length ? new Set((await this.db.select({ c: microApplications.contractId }).from(microApplications).where(and(eq(microApplications.orgId, ctx.orgId), inArray(microApplications.contractId, rows.map((r) => r.m.id))))).map((x) => x.c)) : new Set<string>();
    return rows.map((r) => ({ ...this.view(r.m, ctx, r.org), applied: applied.has(r.m.id) }));
  }

  @Post()
  @RequireOrg()
  @HttpCode(201)
  async post(@Ctx() ctx: RequestContext, @Body(body(MicroContractSchema)) b: z.infer<typeof MicroContractSchema>) {
    mustBeVerified(ctx, 'post work');
    if (b.due < today()) throw new BadRequestException('The due date is in the past');
    const code = await nextCode(this.db, microContracts, 'MIC', 300000);
    const [m] = await this.db.insert(microContracts).values({ code, orgId: ctx.orgId!, kind: b.kind, state: b.state ?? null, title: b.title, scope: b.scope, acceptance: b.acceptance, quantity: b.quantity, unit: b.unit, priceRs: b.priceRs, due: b.due,
      history: [{ status: 'open', at: new Date().toISOString(), by: ctx.userId }], createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'micro.posted', objectType: 'micro_contract', objectId: m.id, after: { code, priceRs: b.priceRs } });
    return this.view(m, ctx, null);
  }

  @Get('mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const posted = await this.db.select({ m: microContracts, apps: sql<number>`(select count(*)::int from ${microApplications} a where a.contract_id = ${microContracts.id} and a.status = 'applied')` }).from(microContracts).where(eq(microContracts.orgId, ctx.orgId!)).orderBy(desc(microContracts.createdAt));
    const working = await this.db.select({ m: microContracts, org: organizations.displayName, app: microApplications.status }).from(microApplications).innerJoin(microContracts, eq(microContracts.id, microApplications.contractId)).innerJoin(organizations, eq(organizations.id, microContracts.orgId))
      .where(eq(microApplications.orgId, ctx.orgId!)).orderBy(desc(microApplications.createdAt));
    return { posted: posted.map((r) => ({ ...this.view(r.m, ctx, null), applications: r.apps })), working: working.map((r) => ({ ...this.view(r.m, ctx, r.org), application: r.app })) };
  }

  @Get(':id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.load(id);
    const isPoster = r.m.orgId === ctx.orgId;
    const apps = isPoster ? await this.db.select({ id: microApplications.id, org: organizations.displayName, city: organizations.city, kyb: organizations.verificationStatus, message: microApplications.message, status: microApplications.status, createdAt: microApplications.createdAt,
      done: sql<number>`(select count(*)::int from ${microContracts} x where x.worker_org_id = ${microApplications.orgId} and x.status = 'paid')` })
      .from(microApplications).innerJoin(organizations, eq(organizations.id, microApplications.orgId)).where(eq(microApplications.contractId, id)).orderBy(microApplications.createdAt) : [];
    const [mine] = ctx.orgId && !isPoster ? await this.db.select().from(microApplications).where(and(eq(microApplications.contractId, id), eq(microApplications.orgId, ctx.orgId))).limit(1) : [];
    if (r.m.status !== 'open' && !isPoster && r.m.workerOrgId !== ctx.orgId && !mine) throw new NotFoundException('Micro-contract not found');
    const worker = r.m.workerOrgId && (isPoster || r.m.workerOrgId === ctx.orgId) ? (await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, r.m.workerOrgId)))[0]?.n ?? null : null;
    return { ...this.view(r.m, ctx, r.org), worker, applications: apps, myApplication: mine ? { status: mine.status, message: mine.message } : null };
  }

  @Post(':id/apply')
  @RequireOrg()
  @HttpCode(201)
  async apply(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ message: z.string().trim().min(20, 'Say why you can do this well and by when (at least 20 characters)').max(1000) }))) b: { message: string }) {
    mustBeVerified(ctx, 'apply for work');
    const { m } = await this.load(id);
    if (m.status !== 'open') throw new ConflictException('This work is no longer open');
    if (m.orgId === ctx.orgId) throw new BadRequestException('This is your own micro-contract');
    const [a] = await this.db.insert(microApplications).values({ contractId: id, orgId: ctx.orgId!, message: b.message, createdBy: ctx.userId }).onConflictDoNothing().returning();
    if (!a) throw new ConflictException('You have already applied');
    await this.audit.record(ctx, { action: 'micro.applied', objectType: 'micro_contract', objectId: id });
    await notifyOrg(this.db, m.orgId, 'micro', `New applicant: ${m.code}`, m.title, `/micro/${id}`);
    return { id: a.id, status: a.status };
  }

  @Post(':id/assign')
  @RequireOrg()
  @HttpCode(200)
  async assign(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ applicationId: z.string().uuid() }))) b: { applicationId: string }) {
    const { m } = await this.load(id);
    if (m.orgId !== ctx.orgId || !isManager(ctx, m.orgId)) throw new ForbiddenException('Only the poster’s owner or admin can choose');
    const [a] = await this.db.select().from(microApplications).where(and(eq(microApplications.id, b.applicationId), eq(microApplications.contractId, id), eq(microApplications.status, 'applied'))).limit(1);
    if (!a) throw new NotFoundException('Application not found');
    const u = await this.move(ctx, m, 'assigned', { workerOrgId: a.orgId });
    await this.db.update(microApplications).set({ status: 'chosen' }).where(eq(microApplications.id, a.id));
    const others = await this.db.update(microApplications).set({ status: 'not_chosen' }).where(and(eq(microApplications.contractId, id), ne(microApplications.id, a.id), eq(microApplications.status, 'applied'))).returning();
    await notifyOrg(this.db, a.orgId, 'micro', `You were chosen: ${m.code}`, `${m.title} — due ${m.due}. Submit the work from the micro-contract page.`, `/micro/${id}`);
    for (const o of others) await notifyOrg(this.db, o.orgId, 'micro', `${m.code}: another business was chosen`, m.title, '/micro/mine');
    return this.view(u, ctx, null);
  }

  @Post(':id/submit')
  @RequireOrg()
  @HttpCode(200)
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ delivery: z.string().trim().min(10, 'Describe what you delivered and where to find it').max(3000) }))) b: { delivery: string }) {
    const { m } = await this.load(id);
    if (m.workerOrgId !== ctx.orgId) throw new ForbiddenException('Only the chosen business can submit');
    const u = await this.move(ctx, m, 'submitted', { delivery: b.delivery });
    await notifyOrg(this.db, m.orgId, 'micro', `Work submitted: ${m.code}`, 'Check it against your acceptance test, then accept or ask for a revision.', `/micro/${id}`);
    return this.view(u, ctx, null);
  }

  @Post(':id/review')
  @RequireOrg()
  @HttpCode(200)
  async review(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'revise']), note: z.string().trim().max(1000).optional() }).refine((x) => x.decision === 'accept' || (x.note?.length ?? 0) >= 10, { message: 'Say what needs to change', path: ['note'] }))) b: { decision: 'accept' | 'revise'; note?: string }) {
    const { m } = await this.load(id);
    if (m.orgId !== ctx.orgId || !isManager(ctx, m.orgId)) throw new ForbiddenException('Only the poster’s owner or admin can review');
    const u = await this.move(ctx, m, b.decision === 'accept' ? 'accepted' : 'assigned', {}, b.note);
    await notifyOrg(this.db, m.workerOrgId!, 'micro', b.decision === 'accept' ? `Work accepted: ${m.code}` : `Revision requested: ${m.code}`, b.note ?? `₹${m.priceRs.toLocaleString('en-IN')} is due from the poster directly.`, `/micro/${id}`);
    return this.view(u, ctx, null);
  }

  @Post(':id/paid')
  @RequireOrg()
  @HttpCode(200)
  async paid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ paymentRef: z.string().trim().min(4, 'Enter the UTR or payment reference').max(80) }))) b: { paymentRef: string }) {
    const { m } = await this.load(id);
    if (m.orgId !== ctx.orgId || !isManager(ctx, m.orgId)) throw new ForbiddenException('Only the poster’s owner or admin can record payment');
    const u = await this.move(ctx, m, 'paid', { paymentRef: b.paymentRef }, `Payment reference ${b.paymentRef}`);
    await notifyOrg(this.db, m.workerOrgId!, 'micro', `Payment recorded: ${m.code}`, `The poster recorded payment ref ${b.paymentRef}. Confirm once it reaches your account.`, `/micro/${id}`);
    return this.view(u, ctx, null);
  }

  @Post(':id/confirm-payment')
  @RequireOrg()
  @HttpCode(200)
  async confirm(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { m } = await this.load(id);
    if (m.workerOrgId !== ctx.orgId) throw new ForbiddenException('Only the business that did the work can confirm payment');
    if (m.status !== 'paid') throw new ConflictException('The poster has not recorded a payment yet');
    if ((m.history as Step[]).some((h) => h.status === 'payment_confirmed')) throw new ConflictException('Already confirmed');
    const u = await this.move(ctx, m, 'payment_confirmed', {});
    return this.view(u, ctx, null);
  }

  @Post(':id/cancel')
  @RequireOrg()
  @HttpCode(200)
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    const { m } = await this.load(id);
    if (m.orgId !== ctx.orgId || !isManager(ctx, m.orgId)) throw new ForbiddenException('Only the poster’s owner or admin can cancel');
    const u = await this.move(ctx, m, 'cancelled', {}, b.reason);
    const apps = await this.db.select({ o: microApplications.orgId }).from(microApplications).where(and(eq(microApplications.contractId, id), or(eq(microApplications.status, 'applied'), eq(microApplications.status, 'chosen'))));
    for (const a of apps) await notifyOrg(this.db, a.o, 'micro', `Cancelled: ${m.code}`, b.reason, '/micro/mine');
    return this.view(u, ctx, null);
  }
}
