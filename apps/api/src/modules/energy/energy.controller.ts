/**
 * Unite Green Park — renewable energy marketplace (tested in test/energy.e2e.ts).
 *  - Verified businesses register plants/capacity or power demand; COLLABIZ checks each listing before it is live.
 *  - Buyer identity and site details stay private until the buyer accepts an introduction; confidential plant owners
 *    stay anonymous likewise. Introductions are time-stamped to the business that asked.
 *  - Accepted introductions track 19 deal stages; either party records progress, one step at a time, with a note.
 *  - Licensed-trader directory: entries are checked by Unite staff (licence number, authority, validity).
 * COLLABIZ facilitates introductions and agreed brokerage only; it is not a licensed electricity trader.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ENERGY_DEAL_STAGES, ENERGY_DISCLAIMER, ENERGY_MODEL_LABELS, EnergyBuyerSchema, EnergyPlantSchema, EnergyTraderSchema, energyCategoryLabel, energyStateName, stateBalance,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { energyIntroductions, energyListings, energyTraders, memberships, notifications, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

type Listing = typeof energyListings.$inferSelect;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const manager = (ctx: RequestContext, org: string) => ctx.memberships.some((m) => m.organizationId === org && ['org_owner', 'org_admin'].includes(m.role));
const ListingBody = z.union([EnergyPlantSchema, EnergyBuyerSchema]);

@ApiTags('energy')
@Controller('energy')
export class EnergyController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active'), inArray(memberships.role, ['org_owner', 'org_admin', 'unite_admin'])));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'energy', title, body: text, link })));
  }
  /** What a viewer may see of a listing. */
  private async view(l: Listing, ctx: RequestContext, orgName?: string | null, intro?: typeof energyIntroductions.$inferSelect | null) {
    const own = !!ctx.orgId && l.orgId === ctx.orgId;
    const revealed = own || staff(ctx) || intro?.status === 'accepted';
    const hideOwner = l.side === 'buyer' || l.confidential;
    return {
      id: l.id, code: l.code, side: l.side, category: l.category, categoryLabel: energyCategoryLabel(l.category), title: l.title, state: l.state, stateName: energyStateName(l.state),
      district: l.side === 'buyer' && !revealed ? null : l.district, source: l.source, stage: l.stage, capacityMw: l.capacityMw, availableMw: l.availableMw, tariffRsKwh: l.tariffRsKwh, targetRsKwh: l.targetRsKwh,
      ppaYears: l.ppaYears, models: l.models.map((m) => ENERGY_MODEL_LABELS[m] ?? m), description: l.description, status: l.status, demo: l.demo, isOwner: own, moderationNote: own || staff(ctx) ? l.moderationNote : null,
      owner: hideOwner && !revealed ? (l.side === 'buyer' ? 'Confidential buyer' : 'Confidential business') : orgName ?? null,
      private: revealed ? l.private : null, createdAt: l.createdAt,
    };
  }

  @Get('summary')
  async summary() {
    const [s] = await this.db.select({
      plants: sql<number>`count(*) filter (where ${energyListings.side} = 'plant')::int`, buyers: sql<number>`count(*) filter (where ${energyListings.side} = 'buyer')::int`,
      mwAvailable: sql<number>`coalesce(sum(coalesce(${energyListings.availableMw}, ${energyListings.capacityMw})) filter (where ${energyListings.side} = 'plant'), 0)::float`,
      mwDemanded: sql<number>`coalesce(sum(${energyListings.capacityMw}) filter (where ${energyListings.side} = 'buyer'), 0)::float`,
    }).from(energyListings).where(eq(energyListings.status, 'live'));
    return { ...s, disclaimer: ENERGY_DISCLAIMER, note: 'Declared by businesses — indicative' };
  }

  @Get('listings')
  async list(@Ctx() ctx: RequestContext, @Query('side') side?: string, @Query('category') category?: string, @Query('state') state?: string, @Query('q') q?: string) {
    const rows = await this.db.select({ l: energyListings, org: organizations.displayName }).from(energyListings).innerJoin(organizations, eq(organizations.id, energyListings.orgId))
      .where(and(eq(energyListings.status, 'live'), side ? eq(energyListings.side, side) : undefined, category ? eq(energyListings.category, category) : undefined, state ? eq(energyListings.state, state) : undefined,
        q ? sql`(${energyListings.title} ilike ${'%' + q + '%'} or ${energyListings.description} ilike ${'%' + q + '%'})` : undefined))
      .orderBy(desc(energyListings.capacityMw)).limit(200);
    return Promise.all(rows.map((r) => this.view(r.l, ctx, r.org)));
  }

  @Get('map')
  async map() {
    const rows = await this.db.select({ state: energyListings.state, side: energyListings.side, mw: sql<number>`coalesce(${energyListings.availableMw}, ${energyListings.capacityMw})` }).from(energyListings).where(eq(energyListings.status, 'live'));
    return stateBalance(rows.map((r) => ({ state: r.state, side: r.side as 'plant' | 'buyer', mw: Number(r.mw) })));
  }

  @Get('mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const listings = await this.db.select().from(energyListings).where(eq(energyListings.orgId, ctx.orgId!)).orderBy(desc(energyListings.createdAt));
    const intros = await this.db.select({ i: energyIntroductions, l: energyListings, from: organizations.displayName }).from(energyIntroductions).innerJoin(energyListings, eq(energyListings.id, energyIntroductions.listingId))
      .innerJoin(organizations, eq(organizations.id, energyIntroductions.fromOrgId)).where(or(eq(energyIntroductions.fromOrgId, ctx.orgId!), eq(energyListings.orgId, ctx.orgId!))).orderBy(desc(energyIntroductions.updatedAt));
    return {
      listings: await Promise.all(listings.map((l) => this.view(l, ctx, null))),
      introductions: intros.map((r) => ({ id: r.i.id, listingId: r.l.id, code: r.l.code, title: r.l.title, direction: r.i.fromOrgId === ctx.orgId ? 'sent' : 'received', from: r.i.fromOrgId === ctx.orgId ? null : r.from,
        status: r.i.status, stage: r.i.stage, stageLabel: ENERGY_DEAL_STAGES[r.i.stage], message: r.i.message, createdAt: r.i.createdAt })),
    };
  }

  @Get('listings/:id')
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [r] = await this.db.select({ l: energyListings, org: organizations.displayName }).from(energyListings).innerJoin(organizations, eq(organizations.id, energyListings.orgId)).where(eq(energyListings.id, id)).limit(1);
    if (!r) throw new NotFoundException('Listing not found');
    const own = ctx.orgId === r.l.orgId;
    if (r.l.status !== 'live' && !own && !staff(ctx)) throw new NotFoundException('Listing not found');
    const [intro] = ctx.orgId && !own ? await this.db.select().from(energyIntroductions).where(and(eq(energyIntroductions.listingId, id), eq(energyIntroductions.fromOrgId, ctx.orgId))).limit(1) : [];
    const received = own ? await this.db.select({ i: energyIntroductions, from: organizations.displayName, city: organizations.city }).from(energyIntroductions).innerJoin(organizations, eq(organizations.id, energyIntroductions.fromOrgId)).where(eq(energyIntroductions.listingId, id)).orderBy(desc(energyIntroductions.createdAt)) : [];
    return {
      ...(await this.view(r.l, ctx, r.org, intro ?? null)), stages: ENERGY_DEAL_STAGES, disclaimer: ENERGY_DISCLAIMER,
      myIntroduction: intro ? { id: intro.id, status: intro.status, stage: intro.stage, history: intro.history } : null,
      introductions: received.map((x) => ({ id: x.i.id, from: x.from, city: x.city, message: x.i.message, status: x.i.status, stage: x.i.stage, history: x.i.history, createdAt: x.i.createdAt })),
    };
  }

  /** Register a plant or a power requirement. Verified businesses only; checked by COLLABIZ before it is published. */
  @Post('listings')
  @RequireOrg()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(ListingBody)) b: z.infer<typeof ListingBody>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Complete your business verification (KYB) before listing on the energy marketplace');
    if (!manager(ctx, ctx.orgId!)) throw new ForbiddenException('Only an owner or admin of your business can list');
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(energyListings);
    const code = `UGP-${new Date().getFullYear()}-${String(200001 + Number(n)).padStart(6, '0')}`;
    const common = { code, side: b.side, category: b.category, orgId: ctx.orgId!, title: b.title, state: b.state, district: b.district, source: b.source, description: b.description, models: b.models, createdBy: ctx.userId };
    const values = b.side === 'plant'
      ? { ...common, stage: b.stage, capacityMw: b.capacityMw, availableMw: b.availableMw ?? null, tariffRsKwh: b.tariffRsKwh ?? null, ppaYears: b.ppaYears ?? null, confidential: b.confidential, private: { voltageKv: b.voltageKv ?? null } }
      : { ...common, capacityMw: b.requiredMw, tariffRsKwh: b.currentTariffRsKwh, targetRsKwh: b.targetRsKwh ?? null, ppaYears: b.ppaYears, confidential: true,
        private: { company: b.company, industry: b.industry, discom: b.discom, consumerCategory: b.consumerCategory, contractDemandMva: b.contractDemandMva ?? null, voltageKv: b.voltageKv ?? null, monthlyMwh: b.monthlyMwh ?? null, startBy: b.startBy ?? null, openAccessEligible: b.openAccessEligible, storageRequired: b.storageRequired } };
    const [l] = await this.db.insert(energyListings).values(values).returning();
    await this.audit.record(ctx, { action: 'energy.listed', objectType: 'energy_listing', objectId: l.id, after: { code, side: b.side, category: b.category, mw: l.capacityMw } });
    return this.view(l, ctx, null);
  }

  @Post('listings/:id/close')
  @HttpCode(200)
  async close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [l] = await this.db.select().from(energyListings).where(eq(energyListings.id, id)).limit(1);
    if (!l || l.orgId !== ctx.orgId || !manager(ctx, l.orgId)) throw new NotFoundException('Listing not found');
    const [u] = await this.db.update(energyListings).set({ status: 'closed', updatedAt: new Date() }).where(eq(energyListings.id, id)).returning();
    await this.audit.record(ctx, { action: 'energy.closed', objectType: 'energy_listing', objectId: id });
    return this.view(u, ctx, null);
  }

  // ------------------------------------------------------------------ introductions and deal stages
  @Post('listings/:id/introductions')
  @RequireOrg()
  @HttpCode(201)
  async introduce(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ message: z.string().trim().min(20, 'Say who you are and what you propose (at least 20 characters)').max(2000) }))) b: { message: string }) {
    const [l] = await this.db.select().from(energyListings).where(eq(energyListings.id, id)).limit(1);
    if (!l || l.status !== 'live') throw new NotFoundException('Listing not found');
    if (l.orgId === ctx.orgId) throw new BadRequestException('This is your own listing');
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified businesses can request introductions');
    const [i] = await this.db.insert(energyIntroductions).values({ listingId: id, fromOrgId: ctx.orgId!, message: b.message, requestedBy: ctx.userId, history: [{ stage: 0, by: ctx.userId, at: new Date().toISOString(), note: 'Introduction requested' }] })
      .onConflictDoNothing().returning();
    if (!i) throw new ConflictException('You have already asked for an introduction to this listing');
    await this.audit.record(ctx, { action: 'energy.introduction_requested', objectType: 'energy_listing', objectId: id, after: { introduction: i.id } });
    await this.notifyOrg(l.orgId, `Introduction request: ${l.code}`, 'A verified business asked for an introduction on your energy listing. Accept to share details, or decline.', `/energy/listings/${id}`);
    return { id: i.id, status: i.status, stage: i.stage };
  }

  @Post('introductions/:id/decide')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['accept', 'decline']) }))) b: { decision: 'accept' | 'decline' }) {
    const [r] = await this.db.select({ i: energyIntroductions, l: energyListings }).from(energyIntroductions).innerJoin(energyListings, eq(energyListings.id, energyIntroductions.listingId)).where(eq(energyIntroductions.id, id)).limit(1);
    if (!r || r.l.orgId !== ctx.orgId || !manager(ctx, r.l.orgId)) throw new NotFoundException('Introduction not found');
    if (r.i.status !== 'requested') throw new ConflictException('Already decided');
    const accept = b.decision === 'accept';
    const history = [...(r.i.history as unknown[]), { stage: accept ? 1 : 0, by: ctx.userId, at: new Date().toISOString(), note: accept ? 'Introduction accepted' : 'Introduction declined' }];
    await this.db.update(energyIntroductions).set({ status: accept ? 'accepted' : 'declined', stage: accept ? 1 : 0, history, decidedBy: ctx.userId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(energyIntroductions.id, id));
    await this.audit.record(ctx, { action: `energy.introduction_${accept ? 'accepted' : 'declined'}`, objectType: 'energy_introduction', objectId: id });
    await this.notifyOrg(r.i.fromOrgId, `${r.l.code}: introduction ${accept ? 'accepted' : 'declined'}`, accept ? 'Details are now shared with you. Continue in the deal room.' : 'The owner declined this introduction.', `/energy/listings/${r.l.id}`);
    return { id, status: accept ? 'accepted' : 'declined' };
  }

  /** Move an accepted deal one stage forward (or back) with a note. Both parties can; every change is recorded. */
  @Post('introductions/:id/stage')
  @HttpCode(200)
  async stage(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ stage: z.number().int().min(1).max(ENERGY_DEAL_STAGES.length - 1), note: z.string().trim().min(3).max(500) }))) b: { stage: number; note: string }) {
    const [r] = await this.db.select({ i: energyIntroductions, l: energyListings }).from(energyIntroductions).innerJoin(energyListings, eq(energyListings.id, energyIntroductions.listingId)).where(eq(energyIntroductions.id, id)).limit(1);
    const party = !!r && (ctx.orgId === r.l.orgId || ctx.orgId === r.i.fromOrgId);
    if (!r || !party) throw new NotFoundException('Deal not found');
    if (r.i.status !== 'accepted') throw new ConflictException('The introduction must be accepted first');
    if (Math.abs(b.stage - r.i.stage) !== 1) throw new BadRequestException('Move one stage at a time');
    const history = [...(r.i.history as unknown[]), { stage: b.stage, by: ctx.userId, at: new Date().toISOString(), note: b.note }];
    await this.db.update(energyIntroductions).set({ stage: b.stage, history, updatedAt: new Date() }).where(eq(energyIntroductions.id, id));
    await this.audit.record(ctx, { action: 'energy.deal_stage', objectType: 'energy_introduction', objectId: id, before: { stage: r.i.stage }, after: { stage: b.stage, note: b.note } });
    const other = ctx.orgId === r.l.orgId ? r.i.fromOrgId : r.l.orgId;
    await this.notifyOrg(other, `${r.l.code}: ${ENERGY_DEAL_STAGES[b.stage]}`, b.note, `/energy/listings/${r.l.id}`);
    return { id, stage: b.stage, stageLabel: ENERGY_DEAL_STAGES[b.stage] };
  }

  // ------------------------------------------------------------------ traders
  @Get('traders')
  async traders() {
    const rows = await this.db.select().from(energyTraders).orderBy(desc(energyTraders.verified), energyTraders.name);
    const today = new Date().toISOString().slice(0, 10);
    return rows.map((t) => ({ id: t.id, name: t.name, licenceNo: t.licenceNo, authority: t.authority, state: t.state, category: t.category, validUntil: t.validUntil, website: t.website, demo: t.demo,
      status: t.demo ? 'Demo — not verified' : !t.verified ? 'Not yet checked' : t.validUntil < today ? 'Licence expired' : 'Valid · checked', checkedAt: t.checkedAt }));
  }

  // ------------------------------------------------------------------ Unite staff
  @Get('admin/listings')
  async queue(@Ctx() ctx: RequestContext, @Query('status') status = 'pending') {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const rows = await this.db.select({ l: energyListings, org: organizations.displayName, kyb: organizations.verificationStatus }).from(energyListings).innerJoin(organizations, eq(organizations.id, energyListings.orgId))
      .where(status === 'all' ? undefined : eq(energyListings.status, status)).orderBy(desc(energyListings.createdAt)).limit(300);
    return Promise.all(rows.map(async (r) => ({ ...(await this.view(r.l, ctx, r.org)), owner: r.org, ownerKyb: r.kyb })));
  }

  @Post('admin/listings/:id/moderate')
  @HttpCode(200)
  async moderate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(1000).optional() }).refine((x) => x.decision === 'approve' || (x.note?.length ?? 0) >= 5, { message: 'Give the reason', path: ['note'] }))) b: { decision: 'approve' | 'reject'; note?: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [l] = await this.db.select().from(energyListings).where(eq(energyListings.id, id)).limit(1);
    if (!l) throw new NotFoundException();
    if (ctx.memberships.some((m) => m.organizationId === l.orgId)) throw new ForbiddenException('You cannot check your own organisation’s listing');
    const [u] = await this.db.update(energyListings).set({ status: b.decision === 'approve' ? 'live' : 'rejected', moderationNote: b.note ?? null, moderatedBy: ctx.userId, moderatedAt: new Date(), updatedAt: new Date() }).where(eq(energyListings.id, id)).returning();
    await this.audit.record(ctx, { action: `energy.${b.decision === 'approve' ? 'approved' : 'rejected'}`, objectType: 'energy_listing', objectId: id, after: { note: b.note ?? null } });
    await this.notifyOrg(l.orgId, `${l.code}: ${b.decision === 'approve' ? 'live on Unite Green Park' : 'not approved'}`, b.note ?? (b.decision === 'approve' ? 'Your energy listing is now visible to verified businesses.' : ''), `/energy/listings/${id}`);
    return this.view(u, ctx, null);
  }

  @Post('admin/traders')
  @HttpCode(201)
  async addTrader(@Ctx() ctx: RequestContext, @Body(body(EnergyTraderSchema.and(z.object({ verified: z.boolean().default(false) })))) b: z.infer<typeof EnergyTraderSchema> & { verified: boolean }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [t] = await this.db.insert(energyTraders).values({ ...b, state: b.state ?? null, website: b.website ?? null, verified: b.verified, checkedBy: b.verified ? ctx.userId : null, checkedAt: b.verified ? new Date() : null, createdBy: ctx.userId })
      .onConflictDoNothing().returning();
    if (!t) throw new ConflictException('This licence is already listed');
    await this.audit.record(ctx, { action: 'energy.trader_added', objectType: 'energy_trader', objectId: t.id, after: { licence: b.licenceNo, authority: b.authority, verified: b.verified } });
    return t;
  }
}

@Module({ controllers: [EnergyController] })
export class EnergyModule {}
