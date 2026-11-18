/**
 * Commit — conditional agreements between several businesses. Nothing binds anyone until every party has pledged and
 * every condition (buyer orders, capacity, permits, financing…) is verified before the deadline. A condition's owner
 * posts evidence; a different party verifies it. After the deadline an incomplete commitment lapses automatically.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { CommitmentSchema, commitmentState, conditionKindLabel } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { commitmentConditions, commitmentParties, commitments, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { isManager, mustBeVerified, nextCode, notifyOrg, today } from './shared';

const STATE_LABEL = { draft: 'Waiting for pledges', pledging: 'Pledging', binding: 'Binding — all conditions met', lapsed: 'Lapsed — deadline passed', withdrawn: 'Withdrawn' } as const;

@ApiTags('commit')
@Controller('commit')
export class CommitController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async full(id: string) {
    const [c] = await this.db.select().from(commitments).where(eq(commitments.id, id)).limit(1);
    if (!c) throw new NotFoundException('Commitment not found');
    const parties = await this.db.select({ p: commitmentParties, name: organizations.displayName }).from(commitmentParties).innerJoin(organizations, eq(organizations.id, commitmentParties.orgId)).where(eq(commitmentParties.commitmentId, id)).orderBy(commitmentParties.role);
    const conds = await this.db.select().from(commitmentConditions).where(eq(commitmentConditions.commitmentId, id)).orderBy(commitmentConditions.kind);
    const names = new Map(parties.map((p) => [p.p.orgId, p.name]));
    const state = commitmentState({ withdrawn: c.withdrawn, deadline: c.deadline, parties: parties.map((p) => ({ pledgedAt: p.p.pledgedAt?.toISOString() ?? null, declined: p.p.declined })), conditions: conds.map((x) => ({ verifiedAt: x.verifiedAt?.toISOString() ?? null })) }, today());
    return { c, parties, conds, names, state };
  }
  private shape(f: Awaited<ReturnType<CommitController['full']>>, ctx: RequestContext) {
    const { c, parties, conds, names, state } = f;
    return {
      id: c.id, code: c.code, title: c.title, purpose: c.purpose, deadline: c.deadline, state, stateLabel: STATE_LABEL[state], boundAt: c.boundAt, isCreator: c.orgId === ctx.orgId, history: c.history,
      parties: parties.map((p) => ({ id: p.p.id, orgId: p.p.orgId, name: p.name, role: p.p.role, pledge: p.p.pledge, pledgedAt: p.p.pledgedAt, declined: p.p.declined, isMe: p.p.orgId === ctx.orgId })),
      conditions: conds.map((x) => ({ id: x.id, kind: x.kind, kindLabel: conditionKindLabel(x.kind), text: x.text, owner: names.get(x.ownerOrgId) ?? null, ownerOrgId: x.ownerOrgId, evidence: x.evidence, evidenceAt: x.evidenceAt, verifiedAt: x.verifiedAt, verifiedBy: x.verifiedByOrg ? names.get(x.verifiedByOrg) ?? null : null,
        iOwn: x.ownerOrgId === ctx.orgId, canVerify: !!x.evidence && !x.verifiedAt && x.ownerOrgId !== ctx.orgId && state !== 'lapsed' && state !== 'withdrawn' })),
      pledged: parties.filter((p) => p.p.pledgedAt).length, verified: conds.filter((x) => x.verifiedAt).length,
    };
  }
  private async partyOf(id: string, ctx: RequestContext) {
    const f = await this.full(id);
    if (!f.parties.some((p) => p.p.orgId === ctx.orgId)) throw new NotFoundException('Commitment not found');
    return f;
  }
  private async log(c: typeof commitments.$inferSelect, ctx: RequestContext, note: string) {
    await this.db.update(commitments).set({ history: [...(c.history as unknown[]), { at: new Date().toISOString(), by: ctx.userId, org: ctx.orgId, note }], updatedAt: new Date() }).where(eq(commitments.id, c.id));
  }
  /** After any change: mark binding the first time all pledges and conditions are in, and tell every party. */
  private async settle(id: string, ctx: RequestContext) {
    const f = await this.full(id);
    if (f.state === 'binding' && !f.c.boundAt) {
      await this.db.update(commitments).set({ boundAt: new Date(), updatedAt: new Date() }).where(eq(commitments.id, id));
      await this.audit.record(ctx, { action: 'commit.binding', objectType: 'commitment', objectId: id });
      for (const p of f.parties) await notifyOrg(this.db, p.p.orgId, 'commit', `${f.c.code} is now binding`, 'Every party pledged and every condition is verified. Proceed with the agreed contracts.', `/commit/${id}`);
    }
    return this.shape(await this.full(id), ctx);
  }
  private open(state: string) { if (state === 'lapsed' || state === 'withdrawn' || state === 'binding') throw new ConflictException(`This commitment is ${state}`); }

  @Post()
  @RequireOrg()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(CommitmentSchema)) b: z.infer<typeof CommitmentSchema>) {
    mustBeVerified(ctx, 'create a commitment');
    if (!isManager(ctx, ctx.orgId!)) throw new ForbiddenException('Only an owner or admin can commit your business');
    if (b.deadline <= today()) throw new BadRequestException('The deadline must be in the future');
    const ids = b.parties.map((p) => p.orgId);
    if (ids.includes(ctx.orgId!) || new Set(ids).size !== ids.length) throw new BadRequestException('List each other business once, and not your own');
    const ok = await this.db.select({ id: organizations.id }).from(organizations).where(and(inArray(organizations.id, ids), eq(organizations.verificationStatus, 'verified')));
    if (ok.length !== ids.length) throw new BadRequestException('Every party must be a verified business on COLLABIZ');
    const all = new Set([ctx.orgId!, ...ids]);
    if (b.conditions.some((x) => !all.has(x.ownerOrgId))) throw new BadRequestException('Each condition must be owned by one of the parties');
    const code = await nextCode(this.db, commitments, 'CMT', 700000);
    const [c] = await this.db.insert(commitments).values({ code, orgId: ctx.orgId!, title: b.title, purpose: b.purpose, deadline: b.deadline, history: [{ at: new Date().toISOString(), by: ctx.userId, org: ctx.orgId, note: 'Commitment created' }], createdBy: ctx.userId }).returning();
    await this.db.insert(commitmentParties).values([{ commitmentId: c.id, orgId: ctx.orgId!, role: b.myRole, pledge: b.myPledge, pledgedAt: new Date(), pledgedBy: ctx.userId }, ...b.parties.map((p) => ({ commitmentId: c.id, orgId: p.orgId, role: p.role, pledge: p.pledge }))]);
    await this.db.insert(commitmentConditions).values(b.conditions.map((x) => ({ commitmentId: c.id, kind: x.kind, text: x.text, ownerOrgId: x.ownerOrgId })));
    await this.audit.record(ctx, { action: 'commit.created', objectType: 'commitment', objectId: c.id, after: { code, parties: ids.length + 1, conditions: b.conditions.length, deadline: b.deadline } });
    for (const p of ids) await notifyOrg(this.db, p, 'commit', `Pledge requested: ${code}`, `${b.title} — pledge or decline by ${b.deadline}. Nothing binds until every party pledges and every condition is verified.`, `/commit/${c.id}`);
    return this.shape(await this.full(c.id), ctx);
  }

  @Get('mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const ids = (await this.db.select({ id: commitmentParties.commitmentId }).from(commitmentParties).where(eq(commitmentParties.orgId, ctx.orgId!))).map((r) => r.id);
    if (!ids.length) return [];
    const rows = await this.db.select({ id: commitments.id }).from(commitments).where(inArray(commitments.id, ids)).orderBy(desc(commitments.createdAt));
    return Promise.all(rows.map(async (r) => { const s = this.shape(await this.full(r.id), ctx); return { id: s.id, code: s.code, title: s.title, deadline: s.deadline, state: s.state, stateLabel: s.stateLabel, parties: s.parties.length, pledged: s.pledged, conditions: s.conditions.length, verified: s.verified, myPledged: !!s.parties.find((p) => p.isMe)?.pledgedAt }; }));
  }

  @Get(':id')
  @RequireOrg()
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) { return this.shape(await this.partyOf(id, ctx), ctx); }

  @Post(':id/pledge')
  @RequireOrg()
  @HttpCode(200)
  async pledge(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['pledge', 'decline']), note: z.string().trim().max(500).optional() }))) b: { decision: 'pledge' | 'decline'; note?: string }) {
    const f = await this.partyOf(id, ctx); this.open(f.state);
    if (!isManager(ctx, ctx.orgId!)) throw new ForbiddenException('Only an owner or admin can pledge for your business');
    const me = f.parties.find((p) => p.p.orgId === ctx.orgId)!;
    if (me.p.pledgedAt || me.p.declined) throw new ConflictException('Your business already answered');
    await this.db.update(commitmentParties).set(b.decision === 'pledge' ? { pledgedAt: new Date(), pledgedBy: ctx.userId } : { declined: true, pledgedBy: ctx.userId }).where(eq(commitmentParties.id, me.p.id));
    await this.log(f.c, ctx, `${me.name} ${b.decision === 'pledge' ? 'pledged' : 'declined'}${b.note ? ` — ${b.note}` : ''}`);
    await this.audit.record(ctx, { action: `commit.${b.decision === 'pledge' ? 'pledged' : 'declined'}`, objectType: 'commitment', objectId: id });
    for (const p of f.parties.filter((x) => x.p.orgId !== ctx.orgId)) await notifyOrg(this.db, p.p.orgId, 'commit', `${f.c.code}: ${me.name} ${b.decision === 'pledge' ? 'pledged' : 'declined'}`, b.note ?? f.c.title, `/commit/${id}`);
    return this.settle(id, ctx);
  }

  @Post('conditions/:cid/evidence')
  @RequireOrg()
  @HttpCode(200)
  async evidence(@Ctx() ctx: RequestContext, @Param('cid', ParseUUIDPipe) cid: string, @Body(body(z.object({ evidence: z.string().trim().min(10, 'Describe the evidence: order number, permit reference, sanction letter…').max(2000) }))) b: { evidence: string }) {
    const [x] = await this.db.select().from(commitmentConditions).where(eq(commitmentConditions.id, cid)).limit(1);
    if (!x) throw new NotFoundException('Condition not found');
    const f = await this.partyOf(x.commitmentId, ctx); this.open(f.state);
    if (x.ownerOrgId !== ctx.orgId) throw new ForbiddenException('Only the business responsible for this condition can post evidence');
    if (x.verifiedAt) throw new ConflictException('Already verified');
    await this.db.update(commitmentConditions).set({ evidence: b.evidence, evidenceAt: new Date() }).where(eq(commitmentConditions.id, cid));
    await this.log(f.c, ctx, `Evidence posted for “${x.text}”`);
    await this.audit.record(ctx, { action: 'commit.evidence', objectType: 'commitment_condition', objectId: cid });
    for (const p of f.parties.filter((y) => y.p.orgId !== ctx.orgId)) await notifyOrg(this.db, p.p.orgId, 'commit', `${f.c.code}: evidence to verify`, x.text, `/commit/${f.c.id}`);
    return this.settle(f.c.id, ctx);
  }

  @Post('conditions/:cid/verify')
  @RequireOrg()
  @HttpCode(200)
  async verify(@Ctx() ctx: RequestContext, @Param('cid', ParseUUIDPipe) cid: string) {
    const [x] = await this.db.select().from(commitmentConditions).where(eq(commitmentConditions.id, cid)).limit(1);
    if (!x) throw new NotFoundException('Condition not found');
    const f = await this.partyOf(x.commitmentId, ctx); this.open(f.state);
    if (x.ownerOrgId === ctx.orgId) throw new ForbiddenException('Another party must verify your own condition');
    if (!x.evidence) throw new ConflictException('No evidence posted yet');
    if (x.verifiedAt) throw new ConflictException('Already verified');
    await this.db.update(commitmentConditions).set({ verifiedAt: new Date(), verifiedByOrg: ctx.orgId!, verifiedBy: ctx.userId }).where(eq(commitmentConditions.id, cid));
    await this.log(f.c, ctx, `${f.names.get(ctx.orgId!) ?? 'A party'} verified “${x.text}”`);
    await this.audit.record(ctx, { action: 'commit.verified', objectType: 'commitment_condition', objectId: cid });
    return this.settle(f.c.id, ctx);
  }

  @Post(':id/withdraw')
  @RequireOrg()
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    const f = await this.partyOf(id, ctx); this.open(f.state);
    if (f.c.orgId !== ctx.orgId || !isManager(ctx, ctx.orgId!)) throw new ForbiddenException('Only the business that created it can withdraw');
    await this.db.update(commitments).set({ withdrawn: true, updatedAt: new Date() }).where(eq(commitments.id, id));
    await this.log(f.c, ctx, `Withdrawn — ${b.reason}`);
    await this.audit.record(ctx, { action: 'commit.withdrawn', objectType: 'commitment', objectId: id, after: { reason: b.reason } });
    for (const p of f.parties.filter((x) => x.p.orgId !== ctx.orgId)) await notifyOrg(this.db, p.p.orgId, 'commit', `${f.c.code} withdrawn`, b.reason, `/commit/${id}`);
    return this.shape(await this.full(id), ctx);
  }
}
