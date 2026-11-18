/**
 * Demand pools — buyers combine quantities to reach a bulk price. Suppliers see the combined quantity, never who the
 * buyers are. Each buyer accepts a quote for itself (only when the pool's committed total meets the quote's minimum),
 * which creates its own contract relationship with the supplier; only then does that supplier learn that buyer's name.
 * No buyer is ever responsible for another buyer's order or payment.
 */
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DemandPoolSchema, PoolQuoteSchema, opsStateName, poolQuoteApplies } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { demandPools, organizations, poolMembers, poolQuotes } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { mustBeVerified, nextCode, notifyOrg, today } from './shared';

type Pool = typeof demandPools.$inferSelect;
const qty = z.object({ qty: z.number().positive() });

@ApiTags('pools')
@Controller('pools')
export class PoolsController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async totals(ids: string[]) {
    if (!ids.length) return new Map<string, { committed: number; buyers: number }>();
    const rows = await this.db.select({ p: poolMembers.poolId, q: sql<number>`sum(${poolMembers.qty})::float`, n: sql<number>`count(*)::int` }).from(poolMembers).where(and(inArray(poolMembers.poolId, ids), eq(poolMembers.status, 'joined'))).groupBy(poolMembers.poolId);
    return new Map(rows.map((r) => [r.p, { committed: Number(r.q), buyers: Number(r.n) }]));
  }
  private async view(p: Pool, ctx: RequestContext, t?: { committed: number; buyers: number }) {
    const [me] = ctx.orgId ? await this.db.select().from(poolMembers).where(and(eq(poolMembers.poolId, p.id), eq(poolMembers.orgId, ctx.orgId), eq(poolMembers.status, 'joined'))).limit(1) : [];
    const joinable = p.status === 'open' && p.joinBy >= today();
    return { id: p.id, code: p.code, title: p.title, spec: p.spec, unit: p.unit, state: p.state, stateName: opsStateName(p.state), targetQty: p.targetQty, committed: t?.committed ?? 0, buyers: t?.buyers ?? 0,
      joinBy: p.joinBy, neededBy: p.neededBy, status: joinable ? 'open' : p.status === 'open' ? 'closed_to_joining' : p.status, demo: p.demo, myQty: me?.qty ?? null, myAcceptedQuoteId: me?.acceptedQuoteId ?? null, isStarter: p.orgId === ctx.orgId, createdAt: p.createdAt };
  }
  private async load(id: string) {
    const [p] = await this.db.select().from(demandPools).where(eq(demandPools.id, id)).limit(1);
    if (!p) throw new NotFoundException('Pool not found');
    return p;
  }

  @Get()
  async list(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(demandPools).where(eq(demandPools.status, 'open')).orderBy(demandPools.joinBy).limit(200);
    const t = await this.totals(rows.map((r) => r.id));
    return Promise.all(rows.map((p) => this.view(p, ctx, t.get(p.id))));
  }

  @Post()
  @RequireOrg()
  @HttpCode(201)
  async start(@Ctx() ctx: RequestContext, @Body(body(DemandPoolSchema)) b: z.infer<typeof DemandPoolSchema>) {
    mustBeVerified(ctx, 'start a pool');
    if (b.joinBy < today()) throw new BadRequestException('Joining must close today or later');
    if (b.neededBy && b.neededBy < b.joinBy) throw new BadRequestException('“Needed by” must be after joining closes');
    const code = await nextCode(this.db, demandPools, 'POOL', 500000);
    const [p] = await this.db.insert(demandPools).values({ code, orgId: ctx.orgId!, title: b.title, spec: b.spec, unit: b.unit, state: b.state, targetQty: b.targetQty, joinBy: b.joinBy, neededBy: b.neededBy ?? null, createdBy: ctx.userId }).returning();
    await this.db.insert(poolMembers).values({ poolId: p.id, orgId: ctx.orgId!, qty: b.myQty, createdBy: ctx.userId });
    await this.audit.record(ctx, { action: 'pool.started', objectType: 'demand_pool', objectId: p.id, after: { code, target: b.targetQty, mine: b.myQty } });
    return this.view(p, ctx, { committed: b.myQty, buyers: 1 });
  }

  @Get('mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const joined = await this.db.select({ p: demandPools }).from(poolMembers).innerJoin(demandPools, eq(demandPools.id, poolMembers.poolId)).where(and(eq(poolMembers.orgId, ctx.orgId!), eq(poolMembers.status, 'joined'))).orderBy(desc(demandPools.createdAt));
    const quoted = await this.db.select({ p: demandPools, q: poolQuotes }).from(poolQuotes).innerJoin(demandPools, eq(demandPools.id, poolQuotes.poolId)).where(eq(poolQuotes.supplierOrgId, ctx.orgId!)).orderBy(desc(poolQuotes.createdAt));
    const t = await this.totals([...joined.map((r) => r.p.id), ...quoted.map((r) => r.p.id)]);
    return {
      pools: await Promise.all(joined.map((r) => this.view(r.p, ctx, t.get(r.p.id)))),
      quotes: await Promise.all(quoted.map(async (r) => ({ pool: await this.view(r.p, ctx, t.get(r.p.id)), quote: { id: r.q.id, unitPriceRs: r.q.unitPriceRs, minQty: r.q.minQty, validUntil: r.q.validUntil, status: r.q.status } }))),
    };
  }

  @Get(':id')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.load(id);
    const t = (await this.totals([id])).get(id);
    const v = await this.view(p, ctx, t);
    const member = v.myQty !== null;
    const quotes = await this.db.select({ q: poolQuotes, supplier: organizations.displayName }).from(poolQuotes).innerJoin(organizations, eq(organizations.id, poolQuotes.supplierOrgId)).where(and(eq(poolQuotes.poolId, id), eq(poolQuotes.status, 'open'))).orderBy(poolQuotes.unitPriceRs);
    const mine = quotes.find((q) => q.q.supplierOrgId === ctx.orgId);
    const acceptedBuyers = mine ? await this.db.select({ org: organizations.displayName, qty: poolMembers.qty, at: poolMembers.acceptedAt }).from(poolMembers).innerJoin(organizations, eq(organizations.id, poolMembers.orgId)).where(and(eq(poolMembers.poolId, id), eq(poolMembers.acceptedQuoteId, mine.q.id), eq(poolMembers.status, 'joined'))) : [];
    const shape = (x: (typeof quotes)[number]) => ({ id: x.q.id, supplier: x.supplier, unitPriceRs: x.q.unitPriceRs, minQty: x.q.minQty, validUntil: x.q.validUntil, terms: x.q.terms, applies: poolQuoteApplies(v.committed, x.q.minQty), expired: x.q.validUntil < today() });
    return { ...v, quotes: member ? quotes.map(shape) : [], quoteCount: quotes.length, myQuote: mine ? { ...shape(mine), acceptedBuyers } : null, canQuote: !!ctx.orgId && !member && !mine && p.status === 'open' };
  }

  @Post(':id/join')
  @RequireOrg()
  @HttpCode(200)
  async join(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(qty)) b: { qty: number }) {
    mustBeVerified(ctx, 'join a pool');
    const p = await this.load(id);
    if (p.status !== 'open' || p.joinBy < today()) throw new ConflictException('Joining has closed for this pool');
    const [q] = await this.db.select({ id: poolQuotes.id }).from(poolQuotes).where(and(eq(poolQuotes.poolId, id), eq(poolQuotes.supplierOrgId, ctx.orgId!))).limit(1);
    if (q) throw new BadRequestException('You quoted on this pool as a supplier');
    const [cur] = await this.db.select().from(poolMembers).where(and(eq(poolMembers.poolId, id), eq(poolMembers.orgId, ctx.orgId!))).limit(1);
    if (cur?.acceptedQuoteId && cur.status === 'joined') throw new ConflictException('You already accepted a quote — your quantity is fixed');
    if (cur) await this.db.update(poolMembers).set({ qty: b.qty, status: 'joined', updatedAt: new Date() }).where(eq(poolMembers.id, cur.id));
    else await this.db.insert(poolMembers).values({ poolId: id, orgId: ctx.orgId!, qty: b.qty, createdBy: ctx.userId });
    await this.audit.record(ctx, { action: cur ? 'pool.quantity_changed' : 'pool.joined', objectType: 'demand_pool', objectId: id, after: { qty: b.qty } });
    if (!cur && p.orgId !== ctx.orgId) await notifyOrg(this.db, p.orgId, 'pool', `${p.code}: a buyer joined`, `Another verified buyer added ${b.qty} ${p.unit}.`, `/pools/${id}`);
    return this.detail(ctx, id);
  }

  @Post(':id/leave')
  @RequireOrg()
  @HttpCode(200)
  async leave(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [m] = await this.db.select().from(poolMembers).where(and(eq(poolMembers.poolId, id), eq(poolMembers.orgId, ctx.orgId!), eq(poolMembers.status, 'joined'))).limit(1);
    if (!m) throw new NotFoundException('You are not in this pool');
    if (m.acceptedQuoteId) throw new ConflictException('You accepted a quote — settle any change directly with the supplier');
    await this.db.update(poolMembers).set({ status: 'left', updatedAt: new Date() }).where(eq(poolMembers.id, m.id));
    await this.audit.record(ctx, { action: 'pool.left', objectType: 'demand_pool', objectId: id });
    return { id, left: true };
  }

  @Post(':id/quotes')
  @RequireOrg()
  @HttpCode(201)
  async quote(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PoolQuoteSchema)) b: z.infer<typeof PoolQuoteSchema>) {
    mustBeVerified(ctx, 'quote');
    const p = await this.load(id);
    if (p.status !== 'open') throw new ConflictException('This pool is closed');
    if (b.validUntil < today()) throw new BadRequestException('“Valid until” is in the past');
    const [m] = await this.db.select({ id: poolMembers.id }).from(poolMembers).where(and(eq(poolMembers.poolId, id), eq(poolMembers.orgId, ctx.orgId!), eq(poolMembers.status, 'joined'))).limit(1);
    if (m) throw new BadRequestException('Buyers in the pool cannot quote on it');
    const [q] = await this.db.insert(poolQuotes).values({ poolId: id, supplierOrgId: ctx.orgId!, unitPriceRs: b.unitPriceRs, minQty: b.minQty, validUntil: b.validUntil, terms: b.terms, createdBy: ctx.userId }).onConflictDoNothing().returning();
    if (!q) throw new ConflictException('You already quoted on this pool');
    await this.audit.record(ctx, { action: 'pool.quoted', objectType: 'demand_pool', objectId: id, after: { unitPriceRs: b.unitPriceRs, minQty: b.minQty } });
    const buyers = await this.db.select({ o: poolMembers.orgId }).from(poolMembers).where(and(eq(poolMembers.poolId, id), eq(poolMembers.status, 'joined')));
    for (const x of buyers) await notifyOrg(this.db, x.o, 'pool', `${p.code}: new quote`, `₹${b.unitPriceRs.toLocaleString('en-IN')} per ${p.unit.replace(/s$/, '')} from ${b.minQty} ${p.unit}.`, `/pools/${id}`);
    return { id: q.id };
  }

  @Post(':id/quotes/:qid/accept')
  @RequireOrg()
  @HttpCode(200)
  async accept(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('qid', ParseUUIDPipe) qid: string) {
    const p = await this.load(id);
    const [m] = await this.db.select().from(poolMembers).where(and(eq(poolMembers.poolId, id), eq(poolMembers.orgId, ctx.orgId!), eq(poolMembers.status, 'joined'))).limit(1);
    if (!m) throw new NotFoundException('You are not in this pool');
    if (m.acceptedQuoteId) throw new ConflictException('You already accepted a quote');
    const [q] = await this.db.select().from(poolQuotes).where(and(eq(poolQuotes.id, qid), eq(poolQuotes.poolId, id), eq(poolQuotes.status, 'open'))).limit(1);
    if (!q) throw new NotFoundException('Quote not found');
    if (q.validUntil < today()) throw new ConflictException('This quote has expired');
    const committed = (await this.totals([id])).get(id)?.committed ?? 0;
    if (!poolQuoteApplies(committed, q.minQty)) throw new ConflictException(`This price needs ${q.minQty.toLocaleString('en-IN')} ${p.unit} in the pool — ${committed.toLocaleString('en-IN')} so far`);
    await this.db.update(poolMembers).set({ acceptedQuoteId: qid, acceptedAt: new Date(), updatedAt: new Date() }).where(eq(poolMembers.id, m.id));
    await this.audit.record(ctx, { action: 'pool.quote_accepted', objectType: 'demand_pool', objectId: id, after: { quote: qid, qty: m.qty, unitPriceRs: q.unitPriceRs } });
    const [me] = await this.db.select({ n: organizations.displayName }).from(organizations).where(eq(organizations.id, ctx.orgId!));
    await notifyOrg(this.db, q.supplierOrgId, 'pool', `${p.code}: quote accepted`, `${me?.n ?? 'A buyer'} accepted your quote for ${m.qty} ${p.unit}. Contract and invoice them directly.`, `/pools/${id}`);
    return this.detail(ctx, id);
  }
}
