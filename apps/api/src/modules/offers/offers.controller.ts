/**
 * Direct offers — a Unite Group company sends work, products to sell or a market to develop straight to partners
 * (all verified partners, a chosen list, or a filtered group such as "partners with an office and idle manpower").
 *
 * Rules (tested in test/offers.e2e.ts):
 *  - Only Unite Group administrators of the issuing group company (or a super admin) create, manage and select.
 *  - Offers reach verified partners only; a hand-picked list is refused if it names anyone else.
 *  - A partner sees an offer only if it was sent to them, and never sees other partners' responses.
 *  - Pricing: "unite_price" — partners accept Unite's stated terms; "partner_quote" — partners must quote; "either" — both.
 *  - Rewards a partner proposes must be among the models the offer allows. Profit share and equity are indicative until
 *    a signed agreement exists in Contracts; the API says so in every response that carries them.
 *  - Responses can be edited until the deadline and until a decision. Selecting freezes the agreed terms with a hash;
 *    when the places are filled (one place if exclusive) the offer closes and everyone else is told.
 *  - Everything is audited; partners are notified at each step.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AGREEMENT_REWARDS, LOOKING_FOR, OFFER_KINDS, OFFER_PRICING, PARTNER_TYPES, PERCENT_REWARDS, PRICE_UNITS, REWARD_MODELS, SECTOR_CODES, rewardText } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { directOfferRecipients, directOfferResponses, directOffers, memberships, notifications, organizations, partnerCapacity, partnerProfiles } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { Idempotent } from '../../common/idempotency';
import { AuditService } from '../../common/audit.service';
import { randomDigits, sha256 } from '../../common/crypto';

const textArray = (xs: string[]) => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
const PARTNER_ORG = ['partner_company', 'partner_individual'];
const amount = z.number().int().min(1).max(1e15);
const place = z.string().trim().min(2).max(6).toUpperCase();
const RewardSchema = z.object({ model: z.enum(REWARD_MODELS), bps: z.number().int().min(1).max(10000).optional(), amount: amount.optional() })
  .refine((r) => (PERCENT_REWARDS.has(r.model) ? r.bps != null : r.amount != null), { message: 'Give a percentage for shares, commission and margin, or an amount for a fixed fee', path: ['bps'] });
type Reward = z.infer<typeof RewardSchema>;
const TargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('selected'), organizationIds: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({
    mode: z.literal('filtered'), sectors: z.array(z.enum(SECTOR_CODES)).max(12).default([]), regions: z.array(place).max(40).default([]),
    partnerTypes: z.array(z.enum(PARTNER_TYPES)).max(9).default([]), hasOffice: z.boolean().optional(), minIdleManpower: z.number().int().min(1).max(100000).optional(),
    lookingFor: z.array(z.enum(LOOKING_FOR)).max(7).default([]),
  }),
]);
type Target = z.infer<typeof TargetSchema>;
const OfferSchema = z.object({
  groupCompanyId: z.string().uuid().optional(),
  title: z.string().trim().min(5).max(200), summary: z.string().trim().min(30).max(5000),
  kind: z.enum(OFFER_KINDS), sector: z.enum(SECTOR_CODES), regions: z.array(place).max(40).default([]),
  target: TargetSchema,
  pricing: z.enum(OFFER_PRICING), unitePrice: amount.optional(), priceUnit: z.enum(PRICE_UNITS).optional(), uniteReward: RewardSchema.optional(),
  rewardModels: z.array(z.enum(REWARD_MODELS)).min(1).max(6),
  needsOffice: z.boolean().default(false), minManpower: z.number().int().min(1).max(100000).optional(),
  exclusive: z.boolean().default(false), maxSelections: z.number().int().min(1).max(100).default(1),
  deadline: z.string().datetime(),
}).superRefine((v, c) => {
  if (v.pricing !== 'partner_quote' && !v.uniteReward) c.addIssue({ code: 'custom', path: ['uniteReward'], message: 'State the reward you are offering, or let partners quote' });
  if (v.uniteReward && !v.rewardModels.includes(v.uniteReward.model)) c.addIssue({ code: 'custom', path: ['rewardModels'], message: 'Include your own reward model in the allowed list' });
  if (v.unitePrice != null && !v.priceUnit) c.addIssue({ code: 'custom', path: ['priceUnit'], message: 'Say what the price is for' });
  if (new Date(v.deadline).getTime() < Date.now() + 3600_000) c.addIssue({ code: 'custom', path: ['deadline'], message: 'Give partners at least an hour to respond' });
  if (v.exclusive && v.maxSelections > 1) c.addIssue({ code: 'custom', path: ['maxSelections'], message: 'An exclusive offer has one place' });
});
type OfferInput = z.infer<typeof OfferSchema>;
const ResponseSchema = z.object({
  mode: z.enum(['accept_terms', 'proposal']), price: amount.optional(), priceUnit: z.enum(PRICE_UNITS).optional(), reward: RewardSchema.optional(),
  manpower: z.number().int().min(0).max(100000).optional(), hasOffice: z.boolean().default(false), officeLocation: z.string().trim().min(2).max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), message: z.string().trim().min(20).max(3000),
});
const CapacitySchema = z.object({
  hasOffice: z.boolean(), officeLocations: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
  totalManpower: z.number().int().min(0).max(1000000), idleManpower: z.number().int().min(0).max(1000000),
  idleSkills: z.array(z.string().trim().min(2).max(80)).max(30).default([]), availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lookingFor: z.array(z.enum(LOOKING_FOR)).max(7).default([]), notes: z.string().trim().max(2000).optional(),
}).refine((v) => v.idleManpower <= v.totalManpower, { message: 'Idle people cannot exceed your total team', path: ['idleManpower'] })
  .refine((v) => !v.hasOffice || v.officeLocations.length > 0, { message: 'Add at least one office location', path: ['officeLocations'] });

type Offer = typeof directOffers.$inferSelect;
const AGREEMENT_NOTE = 'Profit share and equity are indicative. They become binding only through an agreement drafted and signed in Contracts.';
const needsAgreement = (o: { rewardModels: string[] }) => o.rewardModels.some((m) => AGREEMENT_REWARDS.has(m));
const open = (o: Offer) => o.status === 'open' && o.deadline.getTime() > Date.now();

@Injectable()
export class OffersService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  isVerifiedPartner(o?: { type: string; verificationStatus: string } | null) { return !!o && PARTNER_ORG.includes(o.type) && o.verificationStatus === 'verified'; }

  /** Organizations an offer would reach. Every path returns verified partners only. */
  async audience(t: Target): Promise<{ ids: string[]; refused: string[] }> {
    const base = and(inArray(organizations.type, PARTNER_ORG), eq(organizations.verificationStatus, 'verified'));
    if (t.mode === 'all') return { ids: (await this.db.select({ id: organizations.id }).from(organizations).where(base)).map((r) => r.id), refused: [] };
    if (t.mode === 'selected') {
      const ok = (await this.db.select({ id: organizations.id }).from(organizations).where(and(base, inArray(organizations.id, t.organizationIds)))).map((r) => r.id);
      return { ids: ok, refused: t.organizationIds.filter((x) => !ok.includes(x)) };
    }
    const conds = [base];
    if (t.sectors.length) conds.push(sql`${partnerProfiles.sectors} && ${textArray(t.sectors)}`);
    if (t.regions.length) conds.push(sql`(${partnerProfiles.regions} && ${textArray(t.regions)} or ${organizations.country} = any(${textArray(t.regions)}))`);
    if (t.partnerTypes.length) conds.push(sql`${organizations.partnerTypes} && ${textArray(t.partnerTypes)}`);
    if (t.hasOffice) conds.push(eq(partnerCapacity.hasOffice, true));
    if (t.minIdleManpower) conds.push(sql`${partnerCapacity.idleManpower} >= ${t.minIdleManpower}`);
    if (t.lookingFor.length) conds.push(sql`${partnerCapacity.lookingFor} && ${textArray(t.lookingFor)}`);
    const rows = await this.db.select({ id: organizations.id }).from(organizations)
      .leftJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id)).leftJoin(partnerCapacity, eq(partnerCapacity.organizationId, organizations.id)).where(and(...conds));
    return { ids: rows.map((r) => r.id), refused: [] };
  }

  async notifyOrgs(orgIds: string[], title: string, text: string, link: string, tx: Db = this.db) {
    if (!orgIds.length) return;
    const users = await tx.selectDistinct({ userId: memberships.userId }).from(memberships).where(and(inArray(memberships.organizationId, orgIds), eq(memberships.status, 'active')));
    if (users.length) await tx.insert(notifications).values(users.map((u) => ({ userId: u.userId, kind: 'offer', title, body: text, link })));
  }

  async loadForIssuer(ctx: RequestContext, id: string) {
    const [o] = await this.db.select().from(directOffers).where(eq(directOffers.id, id)).limit(1);
    if (!o) throw new NotFoundException();
    if (!ctx.platformRoles.includes('super_admin') && !ctx.memberships.some((m) => m.organizationId === o.issuerOrgId)) throw new NotFoundException();
    return o;
  }

  /** Partner view of one offer: 404 unless it was sent to the caller's organization. */
  async loadForPartner(ctx: RequestContext, id: string) {
    const [r] = await this.db.select({ o: directOffers, rec: directOfferRecipients, issuer: organizations.displayName }).from(directOfferRecipients)
      .innerJoin(directOffers, eq(directOffers.id, directOfferRecipients.offerId)).innerJoin(organizations, eq(organizations.id, directOffers.issuerOrgId))
      .where(and(eq(directOfferRecipients.offerId, id), eq(directOfferRecipients.organizationId, ctx.orgId!))).limit(1);
    if (!r || r.o.status === 'withdrawn') throw new NotFoundException();
    return r;
  }

  publicOffer(o: Offer, issuer: string) {
    return {
      id: o.id, code: o.code, title: o.title, summary: o.summary, kind: o.kind, sector: o.sector, regions: o.regions, issuer,
      pricing: o.pricing, unitePrice: o.unitePrice, priceUnit: o.priceUnit,
      uniteReward: o.uniteRewardModel ? { model: o.uniteRewardModel, bps: o.uniteRewardBps, amount: o.uniteRewardAmount, text: rewardText(o.uniteRewardModel, o.uniteRewardBps, o.uniteRewardAmount) } : null,
      rewardModels: o.rewardModels, needsOffice: o.needsOffice, minManpower: o.minManpower, exclusive: o.exclusive, places: o.maxSelections,
      deadline: o.deadline, status: o.status, open: open(o), createdAt: o.createdAt,
      agreementNote: needsAgreement(o) ? AGREEMENT_NOTE : null,
    };
  }
}

@ApiTags('offers')
@Controller()
export class OffersController {
  constructor(@InjectDb() private db: Db, private svc: OffersService, private audit: AuditService) {}

  // ---------- Partner capacity ----------
  @Get('me/capacity')
  @RequireOrg()
  async capacity(@Ctx() ctx: RequestContext) {
    const [c] = await this.db.select().from(partnerCapacity).where(eq(partnerCapacity.organizationId, ctx.orgId!)).limit(1);
    return c ?? { organizationId: ctx.orgId, hasOffice: false, officeLocations: [], totalManpower: 0, idleManpower: 0, idleSkills: [], availableFrom: null, lookingFor: [], notes: null, updatedAt: null };
  }

  @Put('me/capacity')
  @RequireOrg()
  async saveCapacity(@Ctx() ctx: RequestContext, @Body(body(CapacitySchema)) b: z.infer<typeof CapacitySchema>) {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    if (!org || !PARTNER_ORG.includes(org.type)) throw new ForbiddenException('Capacity is declared by partner companies');
    const values = { ...b, officeLocations: b.hasOffice ? b.officeLocations : [], availableFrom: b.availableFrom ?? null, notes: b.notes ?? null, updatedBy: ctx.userId, updatedAt: new Date() };
    const [c] = await this.db.insert(partnerCapacity).values({ organizationId: ctx.orgId!, ...values }).onConflictDoUpdate({ target: partnerCapacity.organizationId, set: values }).returning();
    await this.audit.record(ctx, { action: 'capacity.updated', objectType: 'organization', objectId: ctx.orgId!, after: { hasOffice: c.hasOffice, totalManpower: c.totalManpower, idleManpower: c.idleManpower, lookingFor: c.lookingFor } });
    return c;
  }

  // ---------- Partner side ----------
  @Get('offers')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ o: directOffers, rec: directOfferRecipients, issuer: organizations.displayName, resp: directOfferResponses }).from(directOfferRecipients)
      .innerJoin(directOffers, eq(directOffers.id, directOfferRecipients.offerId)).innerJoin(organizations, eq(organizations.id, directOffers.issuerOrgId))
      .leftJoin(directOfferResponses, and(eq(directOfferResponses.offerId, directOffers.id), eq(directOfferResponses.organizationId, ctx.orgId!)))
      .where(and(eq(directOfferRecipients.organizationId, ctx.orgId!), sql`${directOffers.status} <> 'withdrawn'`)).orderBy(desc(directOffers.createdAt)).limit(200);
    return rows.map((r) => ({ ...this.svc.publicOffer(r.o, r.issuer), myStatus: r.rec.status, myResponse: r.resp ? { status: r.resp.status, mode: r.resp.mode, reward: rewardText(r.resp.rewardModel, r.resp.rewardBps, r.resp.rewardAmount), price: r.resp.price } : null }));
  }

  @Get('offers/:id')
  @RequireOrg()
  async one(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.svc.loadForPartner(ctx, id);
    if (r.rec.status === 'sent') await this.db.update(directOfferRecipients).set({ status: 'viewed', viewedAt: new Date() }).where(eq(directOfferRecipients.id, r.rec.id));
    const [resp] = await this.db.select().from(directOfferResponses).where(and(eq(directOfferResponses.offerId, id), eq(directOfferResponses.organizationId, ctx.orgId!))).limit(1);
    const [cap] = await this.db.select().from(partnerCapacity).where(eq(partnerCapacity.organizationId, ctx.orgId!)).limit(1);
    return {
      ...this.svc.publicOffer(r.o, r.issuer), myStatus: r.rec.status === 'sent' ? 'viewed' : r.rec.status, declineReason: r.rec.declineReason,
      myResponse: resp ? { ...resp, rewardText: rewardText(resp.rewardModel, resp.rewardBps, resp.rewardAmount) } : null,
      myCapacity: cap ? { hasOffice: cap.hasOffice, officeLocations: cap.officeLocations, idleManpower: cap.idleManpower } : null,
    };
  }

  @Post('offers/:id/respond')
  @RequireOrg()
  @Idempotent()
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ResponseSchema)) b: z.infer<typeof ResponseSchema>) {
    const { o, rec } = await this.svc.loadForPartner(ctx, id);
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    if (!this.svc.isVerifiedPartner(org)) throw new ForbiddenException('Only verified partners can respond');
    if (!open(o)) throw new ConflictException('This offer is no longer taking responses');
    if (rec.status === 'declined') throw new ConflictException('You declined this offer');
    let reward: Reward; let price = b.price ?? null; let priceUnit: string | null = b.priceUnit ?? null;
    if (b.mode === 'accept_terms') {
      if (o.pricing === 'partner_quote') throw new BadRequestException('This offer asks partners to quote; send a proposal');
      reward = { model: o.uniteRewardModel!, bps: o.uniteRewardBps ?? undefined, amount: o.uniteRewardAmount ?? undefined } as Reward;
      price = o.unitePrice; priceUnit = o.priceUnit;
    } else {
      if (o.pricing === 'unite_price') throw new BadRequestException('This offer has fixed terms; accept them or decline');
      if (!b.reward) throw new BadRequestException({ message: 'Propose your reward', issues: [{ path: 'reward', message: 'Choose a reward model and value' }] });
      if (!o.rewardModels.includes(b.reward.model)) throw new BadRequestException({ message: 'That reward model is not offered here', issues: [{ path: 'reward', message: `Choose one of: ${o.rewardModels.join(', ')}` }] });
      if (o.pricing === 'partner_quote' && price == null) throw new BadRequestException({ message: 'Quote your price', issues: [{ path: 'price', message: 'Enter your price' }] });
      if (price != null && !priceUnit) throw new BadRequestException({ message: 'Say what the price is for', issues: [{ path: 'priceUnit', message: 'Choose a unit' }] });
      reward = b.reward;
    }
    if (o.needsOffice && !(b.hasOffice && b.officeLocation)) throw new BadRequestException({ message: 'This offer needs an existing office or setup', issues: [{ path: 'officeLocation', message: 'Give your office location' }] });
    if (o.minManpower && (b.manpower ?? 0) < o.minManpower) throw new BadRequestException({ message: `This offer needs at least ${o.minManpower} people`, issues: [{ path: 'manpower', message: `At least ${o.minManpower}` }] });
    const values = {
      mode: b.mode, price, priceUnit, rewardModel: reward.model, rewardBps: PERCENT_REWARDS.has(reward.model) ? reward.bps ?? null : null, rewardAmount: PERCENT_REWARDS.has(reward.model) ? null : reward.amount ?? null,
      manpower: b.manpower ?? null, hasOffice: b.hasOffice, officeLocation: b.hasOffice ? b.officeLocation ?? null : null, startDate: b.startDate ?? null, message: b.message, submittedBy: ctx.userId,
    };
    const resp = await this.db.transaction(async (tx) => {
      const [prev] = await tx.select().from(directOfferResponses).where(and(eq(directOfferResponses.offerId, id), eq(directOfferResponses.organizationId, ctx.orgId!))).limit(1).for('update');
      if (prev && ['selected', 'not_selected'].includes(prev.status)) throw new ConflictException('A decision has already been made on your response');
      const [r] = prev
        ? await tx.update(directOfferResponses).set({ ...values, status: 'submitted', version: prev.version + 1, updatedAt: new Date() }).where(eq(directOfferResponses.id, prev.id)).returning()
        : await tx.insert(directOfferResponses).values({ offerId: id, organizationId: ctx.orgId!, ...values }).returning();
      await tx.update(directOfferRecipients).set({ status: 'responded' }).where(eq(directOfferRecipients.id, rec.id));
      await this.audit.record(ctx, { action: prev ? 'offer.response_updated' : 'offer.responded', objectType: 'direct_offer', objectId: id, after: { mode: r.mode, price: r.price, reward: rewardText(r.rewardModel, r.rewardBps, r.rewardAmount), version: r.version } }, tx);
      await this.svc.notifyOrgs([o.issuerOrgId], `${prev ? 'Updated response' : 'New response'}: ${o.code}`, `${org!.displayName} · ${rewardText(r.rewardModel, r.rewardBps, r.rewardAmount)}`, `/offers/${id}`, tx as unknown as Db);
      return r;
    });
    return { ...resp, rewardText: rewardText(resp.rewardModel, resp.rewardBps, resp.rewardAmount), agreementNote: AGREEMENT_REWARDS.has(resp.rewardModel) ? AGREEMENT_NOTE : null };
  }

  @Post('offers/:id/decline')
  @RequireOrg()
  @HttpCode(200)
  async decline(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000) }))) b: { reason: string }) {
    const { o, rec } = await this.svc.loadForPartner(ctx, id);
    if (['selected', 'not_selected'].includes(rec.status)) throw new ConflictException('A decision has already been made');
    await this.db.update(directOfferRecipients).set({ status: 'declined', declineReason: b.reason }).where(eq(directOfferRecipients.id, rec.id));
    await this.db.update(directOfferResponses).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(directOfferResponses.offerId, id), eq(directOfferResponses.organizationId, ctx.orgId!), eq(directOfferResponses.status, 'submitted')));
    await this.audit.record(ctx, { action: 'offer.declined', objectType: 'direct_offer', objectId: id, reason: b.reason });
    await this.svc.notifyOrgs([o.issuerOrgId], `Declined: ${o.code}`, b.reason, `/offers/${id}`);
    return { status: 'declined' };
  }

  // ---------- Unite Group side ----------
  @Post('admin/offers/audience')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async preview(@Body(body(z.object({ target: TargetSchema }))) b: { target: Target }) {
    const a = await this.svc.audience(b.target);
    const names = a.ids.length ? await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, a.ids.slice(0, 50))) : [];
    return { count: a.ids.length, partners: names, refused: a.refused.length };
  }

  /** Verified partners with their declared capacity, for hand-picking recipients. */
  @Get('admin/offers/partners')
  @RequireCaps('opportunity.publish')
  async partners(@Query('q') q?: string) {
    const rows = await this.db.select({ o: organizations, p: partnerProfiles, c: partnerCapacity }).from(organizations)
      .leftJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id)).leftJoin(partnerCapacity, eq(partnerCapacity.organizationId, organizations.id))
      .where(and(inArray(organizations.type, PARTNER_ORG), eq(organizations.verificationStatus, 'verified'), q ? sql`${organizations.displayName} ilike ${'%' + q + '%'}` : undefined))
      .orderBy(organizations.displayName).limit(200);
    return rows.map((r) => ({
      id: r.o.id, name: r.o.displayName, city: r.o.city, country: r.o.country, level: r.o.membershipLevel, partnerTypes: r.o.partnerTypes, sectors: r.p?.sectors ?? [], regions: r.p?.regions ?? [],
      capacity: r.c ? { hasOffice: r.c.hasOffice, officeLocations: r.c.officeLocations, totalManpower: r.c.totalManpower, idleManpower: r.c.idleManpower, lookingFor: r.c.lookingFor } : null,
    }));
  }

  @Get('admin/offers')
  @RequireCaps('opportunity.publish')
  async list(@Ctx() ctx: RequestContext) {
    const scope = ctx.platformRoles.includes('super_admin') ? undefined : inArray(directOffers.issuerOrgId, ctx.memberships.map((m) => m.organizationId).concat('00000000-0000-0000-0000-000000000000'));
    const rows = await this.db.select({
      o: directOffers, issuer: organizations.displayName,
      sent: sql<number>`(select count(*)::int from direct_offer_recipients r where r.offer_id = ${directOffers.id})`,
      viewed: sql<number>`(select count(*)::int from direct_offer_recipients r where r.offer_id = ${directOffers.id} and r.status <> 'sent')`,
      responses: sql<number>`(select count(*)::int from direct_offer_responses x where x.offer_id = ${directOffers.id} and x.status <> 'withdrawn')`,
      selected: sql<number>`(select count(*)::int from direct_offer_responses x where x.offer_id = ${directOffers.id} and x.status = 'selected')`,
    }).from(directOffers).innerJoin(organizations, eq(organizations.id, directOffers.issuerOrgId)).where(scope).orderBy(desc(directOffers.createdAt)).limit(200);
    return rows.map((r) => ({ ...this.svc.publicOffer(r.o, r.issuer), targetMode: r.o.targetMode, sent: r.sent, viewed: r.viewed, responses: r.responses, selected: r.selected }));
  }

  @Post('admin/offers')
  @RequireCaps('opportunity.publish')
  @Idempotent()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(OfferSchema)) b: OfferInput) {
    const issuer = b.groupCompanyId ?? ctx.memberships.find((m) => m.orgType === 'group_company')?.organizationId;
    if (!issuer) throw new BadRequestException('Choose the Unite Group company sending this offer');
    const [gc] = await this.db.select().from(organizations).where(eq(organizations.id, issuer)).limit(1);
    if (!gc || gc.type !== 'group_company') throw new BadRequestException('Offers are sent by a Unite Group company');
    if (!ctx.platformRoles.includes('super_admin') && !ctx.memberships.some((m) => m.organizationId === issuer)) throw new ForbiddenException('You can only send offers for your own group company');
    const a = await this.svc.audience(b.target);
    if (a.refused.length) throw new BadRequestException({ message: 'Offers go to verified partners only', issues: [{ path: 'target', message: `${a.refused.length} selected organization(s) are not verified partners` }] });
    if (!a.ids.length) throw new BadRequestException({ message: 'No verified partner matches this audience', issues: [{ path: 'target', message: 'Widen the filter or choose partners' }] });
    const code = `DO-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const o = await this.db.transaction(async (tx) => {
      const [o] = await tx.insert(directOffers).values({
        code, issuerOrgId: issuer, title: b.title, summary: b.summary, kind: b.kind, sector: b.sector, regions: b.regions,
        targetMode: b.target.mode, targetFilter: b.target.mode === 'filtered' ? b.target : null, pricing: b.pricing,
        unitePrice: b.pricing === 'partner_quote' ? null : b.unitePrice ?? null, priceUnit: b.pricing === 'partner_quote' ? null : b.priceUnit ?? null,
        uniteRewardModel: b.uniteReward?.model ?? null, uniteRewardBps: b.uniteReward && PERCENT_REWARDS.has(b.uniteReward.model) ? b.uniteReward.bps ?? null : null,
        uniteRewardAmount: b.uniteReward && !PERCENT_REWARDS.has(b.uniteReward.model) ? b.uniteReward.amount ?? null : null,
        rewardModels: b.rewardModels, needsOffice: b.needsOffice, minManpower: b.minManpower ?? null, exclusive: b.exclusive, maxSelections: b.exclusive ? 1 : b.maxSelections,
        deadline: new Date(b.deadline), createdBy: ctx.userId,
      }).returning();
      await tx.insert(directOfferRecipients).values(a.ids.map((orgId) => ({ offerId: o.id, organizationId: orgId })));
      await this.audit.record(ctx, { action: 'offer.created', objectType: 'direct_offer', objectId: o.id, after: { code, target: b.target.mode, recipients: a.ids.length, pricing: b.pricing, rewardModels: b.rewardModels } }, tx);
      await this.svc.notifyOrgs(a.ids, `New offer from ${gc.displayName}`, b.title, `/offers/${o.id}`, tx as unknown as Db);
      return o;
    });
    return { ...this.svc.publicOffer(o, gc.displayName), recipients: a.ids.length };
  }

  @Get('admin/offers/:id')
  @RequireCaps('opportunity.publish')
  async detail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const o = await this.svc.loadForIssuer(ctx, id);
    const [issuer] = await this.db.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, o.issuerOrgId));
    const recipients = await this.db.select({ r: directOfferRecipients, name: organizations.displayName }).from(directOfferRecipients).innerJoin(organizations, eq(organizations.id, directOfferRecipients.organizationId))
      .where(eq(directOfferRecipients.offerId, id)).orderBy(organizations.displayName);
    const responses = await this.db.select({ x: directOfferResponses, org: organizations, cap: partnerCapacity }).from(directOfferResponses)
      .innerJoin(organizations, eq(organizations.id, directOfferResponses.organizationId)).leftJoin(partnerCapacity, eq(partnerCapacity.organizationId, directOfferResponses.organizationId))
      .where(and(eq(directOfferResponses.offerId, id), sql`${directOfferResponses.status} <> 'withdrawn'`)).orderBy(directOfferResponses.createdAt);
    return {
      ...this.svc.publicOffer(o, issuer.name), targetMode: o.targetMode, targetFilter: o.targetFilter,
      recipients: recipients.map((r) => ({ organizationId: r.r.organizationId, name: r.name, status: r.r.status, declineReason: r.r.declineReason, viewedAt: r.r.viewedAt })),
      responses: responses.map((r) => ({
        id: r.x.id, organizationId: r.org.id, partner: r.org.displayName, city: r.org.city, country: r.org.country, level: r.org.membershipLevel,
        mode: r.x.mode, price: r.x.price, priceUnit: r.x.priceUnit, rewardModel: r.x.rewardModel, rewardBps: r.x.rewardBps, rewardAmount: r.x.rewardAmount, rewardText: rewardText(r.x.rewardModel, r.x.rewardBps, r.x.rewardAmount),
        manpower: r.x.manpower, hasOffice: r.x.hasOffice, officeLocation: r.x.officeLocation, startDate: r.x.startDate, message: r.x.message, status: r.x.status, version: r.x.version,
        termsHash: r.x.termsHash, decisionNote: r.x.decisionNote, decidedAt: r.x.decidedAt, submittedAt: r.x.updatedAt,
        idleManpower: r.cap?.idleManpower ?? null,
      })),
    };
  }

  @Post('admin/offers/:id/responses/:rid/select')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async select(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('rid', ParseUUIDPipe) rid: string, @Body(body(z.object({ note: z.string().trim().min(5).max(1000) }))) b: { note: string }) {
    const o = await this.svc.loadForIssuer(ctx, id);
    if (o.status !== 'open') throw new ConflictException('This offer is closed');
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(directOfferResponses).where(and(eq(directOfferResponses.id, rid), eq(directOfferResponses.offerId, id))).limit(1).for('update');
      if (!r) throw new NotFoundException();
      if (r.status !== 'submitted') throw new ConflictException(`This response is ${r.status.replace('_', ' ')}`);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(directOfferResponses).where(and(eq(directOfferResponses.offerId, id), eq(directOfferResponses.status, 'selected')));
      if (n >= o.maxSelections) throw new ConflictException('All places on this offer are filled');
      const [org] = await tx.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, r.organizationId));
      const decidedAt = new Date();
      const terms = { offer: o.code, issuerOrgId: o.issuerOrgId, partnerOrgId: r.organizationId, partner: org.name, mode: r.mode, price: r.price, priceUnit: r.priceUnit, rewardModel: r.rewardModel, rewardBps: r.rewardBps, rewardAmount: r.rewardAmount, manpower: r.manpower, officeLocation: r.officeLocation, startDate: r.startDate, version: r.version, selectedAt: decidedAt.toISOString() };
      const termsHash = sha256(JSON.stringify(terms));
      const [u] = await tx.update(directOfferResponses).set({ status: 'selected', termsHash, decidedBy: ctx.userId, decisionNote: b.note, decidedAt, updatedAt: decidedAt }).where(eq(directOfferResponses.id, rid)).returning();
      await tx.update(directOfferRecipients).set({ status: 'selected' }).where(and(eq(directOfferRecipients.offerId, id), eq(directOfferRecipients.organizationId, r.organizationId)));
      await this.audit.record(ctx, { action: 'offer.selected', objectType: 'direct_offer', objectId: id, reason: b.note, after: { ...terms, termsHash } }, tx);
      const agreement = AGREEMENT_REWARDS.has(r.rewardModel);
      await this.svc.notifyOrgs([r.organizationId], `Selected: ${o.code}`, `${o.title}. Agreed terms: ${rewardText(r.rewardModel, r.rewardBps, r.rewardAmount)}.${agreement ? ' An agreement will be drafted in Contracts for signature.' : ''}`, `/offers/${id}`, tx as unknown as Db);
      let closed = false;
      if (n + 1 >= o.maxSelections) {
        closed = true;
        await tx.update(directOffers).set({ status: 'closed', closedReason: o.exclusive ? 'Awarded exclusively' : 'All places filled', updatedAt: new Date() }).where(eq(directOffers.id, id));
        const others = await tx.update(directOfferResponses).set({ status: 'not_selected', decidedBy: ctx.userId, decisionNote: 'All places on this offer were filled', decidedAt, updatedAt: decidedAt })
          .where(and(eq(directOfferResponses.offerId, id), eq(directOfferResponses.status, 'submitted'))).returning({ org: directOfferResponses.organizationId });
        if (others.length) {
          await tx.update(directOfferRecipients).set({ status: 'not_selected' }).where(and(eq(directOfferRecipients.offerId, id), inArray(directOfferRecipients.organizationId, others.map((x) => x.org))));
          await this.svc.notifyOrgs(others.map((x) => x.org), `Offer closed: ${o.code}`, 'Thank you for responding. All places on this offer have been filled.', `/offers/${id}`, tx as unknown as Db);
        }
      }
      return { ...u, rewardText: rewardText(u.rewardModel, u.rewardBps, u.rewardAmount), offerClosed: closed, agreementNote: agreement ? AGREEMENT_NOTE : null };
    });
  }

  @Post('admin/offers/:id/responses/:rid/reject')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async reject(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('rid', ParseUUIDPipe) rid: string, @Body(body(z.object({ note: z.string().trim().min(5).max(1000) }))) b: { note: string }) {
    const o = await this.svc.loadForIssuer(ctx, id);
    const [r] = await this.db.select().from(directOfferResponses).where(and(eq(directOfferResponses.id, rid), eq(directOfferResponses.offerId, id))).limit(1);
    if (!r) throw new NotFoundException();
    if (r.status !== 'submitted') throw new ConflictException(`This response is ${r.status.replace('_', ' ')}`);
    await this.db.update(directOfferResponses).set({ status: 'not_selected', decidedBy: ctx.userId, decisionNote: b.note, decidedAt: new Date(), updatedAt: new Date() }).where(eq(directOfferResponses.id, rid));
    await this.db.update(directOfferRecipients).set({ status: 'not_selected' }).where(and(eq(directOfferRecipients.offerId, id), eq(directOfferRecipients.organizationId, r.organizationId)));
    await this.audit.record(ctx, { action: 'offer.not_selected', objectType: 'direct_offer', objectId: id, reason: b.note, after: { organizationId: r.organizationId } });
    await this.svc.notifyOrgs([r.organizationId], `Not selected: ${o.code}`, b.note, `/offers/${id}`);
    return { status: 'not_selected' };
  }

  @Post('admin/offers/:id/close')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async close(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000), withdraw: z.boolean().default(false) }))) b: { reason: string; withdraw: boolean }) {
    const o = await this.svc.loadForIssuer(ctx, id);
    if (o.status !== 'open') throw new ConflictException('This offer is already closed');
    const status = b.withdraw ? 'withdrawn' : 'closed';
    await this.db.update(directOffers).set({ status, closedReason: b.reason, updatedAt: new Date() }).where(eq(directOffers.id, id));
    await this.audit.record(ctx, { action: `offer.${status}`, objectType: 'direct_offer', objectId: id, reason: b.reason });
    const rec = await this.db.select({ org: directOfferRecipients.organizationId }).from(directOfferRecipients).where(and(eq(directOfferRecipients.offerId, id), inArray(directOfferRecipients.status, ['sent', 'viewed', 'responded'])));
    await this.svc.notifyOrgs(rec.map((r) => r.org), `Offer ${status}: ${o.code}`, b.reason, '/offers');
    return { status };
  }
}

@Module({ controllers: [OffersController], providers: [OffersService] })
export class OffersModule {}
