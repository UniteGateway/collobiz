/**
 * COLLAB + BUSINESS OFFERS — the core journey (tested in test/collab.e2e.ts):
 *
 *   What I have → What I need → Matching → Application → Commercial proposal → Agreement → Execution → Earnings
 *
 *  - Assets and needs are an organisation's own; resources marked "verified partners" are visible to verified partners
 *    for reverse matching. Verification of a resource covers that resource only.
 *  - A business offer is ONE opportunity record (route `partner_listing`) plus its offer details. Partners draft; only
 *    verified organisations submit; COLLABIZ moderators approve with the checks they actually did. Regulated categories
 *    (business sale, acquisition, urgent exit, investment) are discovery only and never transacted here.
 *  - Applications reuse the opportunity application flow. Once the owner shortlists or accepts, either party may send a
 *    proposal; rounds alternate; the receiving party accepts. Acceptance by both parties is recorded as the approval of
 *    the agreement, which is generated in Contracts (issuer = the paying party) and then signed there. Projects,
 *    milestones, invoices and payments use the existing Projects flow.
 *  - Earnings for a collaboration separate pipeline value, contract value, invoiced and collected — never mixed.
 */
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  ASSET_LABELS, BusinessOfferSchema, CollabAssetSchema, CollabNeedSchema, CollabProposalSchema, NEED_LABELS, OFFER_CATEGORY_CODES, OFFER_OPEN, OFFER_STATUS_LABELS, PRICING_LABELS,
  canOfferMove, isRegulatedCategory, nextProposalTurn, offerCategoryLabel, reverseMatches, scoreOffer, scoreProgram, sectorName,
  type AssetKind, type MatchAsset, type MatchNeed, type NeedKind, type OfferCategory, type OfferStatus,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  businessOffers, collabAssets, collabNeeds, collabProposals, contractVersions, contracts, memberships, notifications, opportunities, opportunityApplications, opportunityEvents, organizations,
  partnerCapacity, projectInvoices, projects, uniteVentures,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { Idempotent } from '../../common/idempotency';
import { randomDigits, sha256 } from '../../common/crypto';
import { viewerOf } from '../../common/viewer';
import { OpportunitiesModule } from '../opportunities/opportunities.controller';
import { OpportunitiesService } from '../opportunities/opportunities.service';

type Offer = typeof businessOffers.$inferSelect;
type Opp = typeof opportunities.$inferSelect;
type Proposal = typeof collabProposals.$inferSelect;
type ProposalTerms = z.infer<typeof CollabProposalSchema>;
const today = () => new Date().toISOString().slice(0, 10);
const inr = (paise?: number | null) => (paise == null ? 'to be agreed' : `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
const MODERATION_CHECKS = ['publisher_kyb_verified', 'authority_to_offer_confirmed', 'documents_reviewed', 'duplicate_check_done', 'category_permitted'] as const;
export const CHECK_LABELS: Record<string, string> = {
  publisher_kyb_verified: 'Publisher’s business verification (KYB) is complete', authority_to_offer_confirmed: 'Publisher confirmed authority to make this offer',
  documents_reviewed: 'Supporting documents were reviewed', duplicate_check_done: 'Checked for duplicate listings', category_permitted: 'Category is permitted on COLLABIZ',
};
const ModerateSchema = z.object({ decision: z.enum(['approve', 'reject', 'suspend', 'reinstate']), checks: z.array(z.enum(MODERATION_CHECKS)).default([]), note: z.string().trim().max(2000).optional() })
  .refine((x) => x.decision !== 'approve' || x.checks.includes('publisher_kyb_verified'), { message: 'Approval needs at least the publisher’s KYB check', path: ['checks'] })
  .refine((x) => x.decision === 'approve' || x.decision === 'reinstate' || (x.note?.length ?? 0) >= 5, { message: 'Give the reason', path: ['note'] });

@ApiTags('collab')
@Controller()
export class CollabController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private opps: OpportunitiesService) {}

  // ------------------------------------------------------------------ helpers
  private org(ctx: RequestContext) {
    if (!ctx.orgId) throw new ForbiddenException('Choose or create your business account first');
    return ctx.orgId;
  }
  private manager(ctx: RequestContext, orgId: string) {
    return ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
  }
  private moderator(ctx: RequestContext) {
    return viewerOf(ctx).platform && (ctx.caps.has('opportunity.moderate') || ctx.platformRoles.includes('super_admin'));
  }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }
  /** Offers past their expiry stop being listed. Run before every read; cheap and idempotent. */
  private async sweepExpired() {
    const gone = await this.db.update(businessOffers).set({ status: 'expired', updatedAt: new Date() }).where(and(inArray(businessOffers.status, ['active', 'negotiating', 'verified', 'under_review']), lt(businessOffers.expiresOn, today()))).returning({ id: businessOffers.opportunityId });
    if (gone.length) await this.db.update(opportunities).set({ listed: false, updatedAt: new Date() }).where(inArray(opportunities.id, gone.map((g) => g.id)));
  }
  private async setOfferStatus(ctx: RequestContext, o: Offer, to: OfferStatus, extra: Partial<Offer> = {}, tx: Db = this.db) {
    if (!canOfferMove(o.status, to)) throw new ConflictException(`An offer cannot move from ${OFFER_STATUS_LABELS[o.status as OfferStatus]} to ${OFFER_STATUS_LABELS[to]}`);
    const [u] = await tx.update(businessOffers).set({ ...extra, status: to, updatedAt: new Date() }).where(and(eq(businessOffers.opportunityId, o.opportunityId), eq(businessOffers.status, o.status))).returning();
    if (!u) throw new ConflictException('This offer was changed by someone else. Reload and try again.');
    const listed = OFFER_OPEN.includes(to);
    await tx.update(opportunities).set({ listed, ...(listed ? { publishedAt: sql`coalesce(${opportunities.publishedAt}, now())` } : {}), updatedAt: new Date() } as never).where(eq(opportunities.id, o.opportunityId));
    await this.audit.record(ctx, { action: `business_offer.${to}`, objectType: 'opportunity', objectId: o.opportunityId, before: { status: o.status }, after: { status: to } }, tx);
    return u;
  }
  private async loadOffer(id: string) {
    const [r] = await this.db.select({ b: businessOffers, o: opportunities, owner: organizations.displayName, ownerCity: organizations.city }).from(businessOffers)
      .innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId)).where(eq(businessOffers.opportunityId, id)).limit(1);
    if (!r) throw new NotFoundException('Offer not found');
    return r;
  }
  private present(r: { b: Offer; o: Opp; owner: string }, ctx: RequestContext | null) {
    const own = !!ctx && ctx.memberships.some((m) => m.organizationId === r.o.ownerOrgId);
    return {
      id: r.o.id, code: r.o.code, title: r.o.title, summary: r.o.summary, sector: r.o.sector, sectorName: sectorName(r.o.sector), city: r.o.city, region: r.o.region, country: r.o.country,
      estimatedValue: r.o.estimatedValue, category: r.b.category, categoryLabel: offerCategoryLabel(r.b.category), side: r.b.side, status: r.b.status, statusLabel: OFFER_STATUS_LABELS[r.b.status as OfferStatus],
      expiresOn: r.b.expiresOn, upfrontRequired: r.b.upfrontRequired, upfrontAmount: r.b.upfrontAmount, eligibility: r.b.eligibility, territory: r.b.territory, regulated: isRegulatedCategory(r.b.category),
      checks: r.b.checks.map((c) => CHECK_LABELS[c] ?? c), publisher: own || !r.o.buyerConfidential ? r.owner : 'Confidential — revealed after the publisher accepts your application',
      confidential: r.o.buyerConfidential, isOwner: own, publishedAt: r.o.publishedAt, moderationNote: own ? r.b.moderationNote : null, renewals: r.b.renewals,
    };
  }
  private async myProfile(orgId: string) {
    const [assets, needs] = await Promise.all([
      this.db.select().from(collabAssets).where(and(eq(collabAssets.orgId, orgId), isNull(collabAssets.archivedAt))).orderBy(desc(collabAssets.createdAt)),
      this.db.select().from(collabNeeds).where(and(eq(collabNeeds.orgId, orgId), isNull(collabNeeds.archivedAt))).orderBy(desc(collabNeeds.createdAt)),
    ]);
    return { assets, needs };
  }
  private asMatchAsset(a: typeof collabAssets.$inferSelect): MatchAsset & { visibility: string } {
    return { id: a.id, orgId: a.orgId, kind: a.kind as AssetKind, region: a.region, city: a.city, country: a.country, sectors: a.sectors, models: a.models, capacity: a.capacity, available: a.available, visibility: a.visibility };
  }
  private asMatchNeed(n: typeof collabNeeds.$inferSelect): MatchNeed {
    return { id: n.id, orgId: n.orgId, kind: n.kind as NeedKind, sectors: n.sectors, regions: n.regions, zeroUpfrontOnly: n.zeroUpfrontOnly };
  }

  // ------------------------------------------------------------------ 1–2. what I have / what I need
  @Get('collab/profile')
  @RequireOrg()
  async profile(@Ctx() ctx: RequestContext) {
    const orgId = this.org(ctx);
    const p = await this.myProfile(orgId);
    const [cap] = await this.db.select().from(partnerCapacity).where(eq(partnerCapacity.organizationId, orgId)).limit(1);
    return { ...p, capacity: cap ?? null, verified: ctx.orgVerificationStatus === 'verified', canEdit: this.manager(ctx, orgId) };
  }

  @Post('collab/assets')
  @RequireOrg()
  @Idempotent()
  @HttpCode(201)
  async addAsset(@Ctx() ctx: RequestContext, @Body(body(CollabAssetSchema)) b: z.infer<typeof CollabAssetSchema>) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('Only the owner or an admin of your business can declare its resources');
    const n = await this.db.$count(collabAssets, and(eq(collabAssets.orgId, orgId), isNull(collabAssets.archivedAt)));
    if (n >= 50) throw new ConflictException('You can list up to 50 resources. Archive one you no longer offer.');
    const [a] = await this.db.insert(collabAssets).values({ ...b, orgId, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'collab.asset_added', objectType: 'collab_asset', objectId: a.id, after: { kind: b.kind, title: b.title } });
    return a;
  }

  @Patch('collab/assets/:id')
  @RequireOrg()
  async updateAsset(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CollabAssetSchema)) b: z.infer<typeof CollabAssetSchema>) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('Only the owner or an admin of your business can edit its resources');
    const [a] = await this.db.select().from(collabAssets).where(and(eq(collabAssets.id, id), eq(collabAssets.orgId, orgId), isNull(collabAssets.archivedAt))).limit(1);
    if (!a) throw new NotFoundException('Resource not found');
    // A material change to a verified resource needs fresh verification.
    const material = a.kind !== b.kind || a.capacity !== (b.capacity ?? null) || a.title !== b.title;
    const [u] = await this.db.update(collabAssets).set({ ...b, ...(material && a.verification === 'verified' ? { verification: 'self_declared', verifiedAt: null, verifiedBy: null } : {}), updatedAt: new Date() }).where(eq(collabAssets.id, id)).returning();
    await this.audit.record(ctx, { action: 'collab.asset_updated', objectType: 'collab_asset', objectId: id, before: { kind: a.kind, capacity: a.capacity, verification: a.verification }, after: { kind: u.kind, capacity: u.capacity, verification: u.verification } });
    return u;
  }

  @Delete('collab/assets/:id')
  @RequireOrg()
  @HttpCode(200)
  async archiveAsset(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException();
    const [u] = await this.db.update(collabAssets).set({ archivedAt: new Date(), available: false }).where(and(eq(collabAssets.id, id), eq(collabAssets.orgId, orgId), isNull(collabAssets.archivedAt))).returning({ id: collabAssets.id });
    if (!u) throw new NotFoundException('Resource not found');
    await this.audit.record(ctx, { action: 'collab.asset_archived', objectType: 'collab_asset', objectId: id });
    return { ok: true };
  }

  @Post('collab/needs')
  @RequireOrg()
  @Idempotent()
  @HttpCode(201)
  async addNeed(@Ctx() ctx: RequestContext, @Body(body(CollabNeedSchema)) b: z.infer<typeof CollabNeedSchema>) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('Only the owner or an admin of your business can add what it needs');
    const n = await this.db.$count(collabNeeds, and(eq(collabNeeds.orgId, orgId), isNull(collabNeeds.archivedAt)));
    if (n >= 30) throw new ConflictException('You can list up to 30 needs. Archive one that is met.');
    const [r] = await this.db.insert(collabNeeds).values({ ...b, orgId, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'collab.need_added', objectType: 'collab_need', objectId: r.id, after: { kind: b.kind } });
    return r;
  }

  @Delete('collab/needs/:id')
  @RequireOrg()
  @HttpCode(200)
  async archiveNeed(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException();
    const [u] = await this.db.update(collabNeeds).set({ archivedAt: new Date() }).where(and(eq(collabNeeds.id, id), eq(collabNeeds.orgId, orgId), isNull(collabNeeds.archivedAt))).returning({ id: collabNeeds.id });
    if (!u) throw new NotFoundException('Need not found');
    return { ok: true };
  }

  // ------------------------------------------------------------------ 3. matching
  /** Offers, Unite programmes and (for verified partners) other partners' resources, each with the reasons it matched. */
  @Get('collab/matches')
  @RequireOrg()
  async matches(@Ctx() ctx: RequestContext) {
    await this.sweepExpired();
    const orgId = this.org(ctx);
    const { assets, needs } = await this.myProfile(orgId);
    const A = assets.map((a) => this.asMatchAsset(a)), N = needs.map((n) => this.asMatchNeed(n));
    if (!A.length && !N.length) return { offers: [], programs: [], partners: [], empty: true, note: 'Tell us what you have and what you need to see matches.' };
    const rows = await this.db.select({ b: businessOffers, o: opportunities, owner: organizations.displayName }).from(businessOffers)
      .innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(inArray(businessOffers.status, OFFER_OPEN), ne(opportunities.ownerOrgId, orgId))).limit(500);
    const t = today();
    const offers = rows.map((r) => ({ r, m: scoreOffer({ id: r.o.id, orgId: r.o.ownerOrgId, category: r.b.category as OfferCategory, side: r.b.side as 'offering' | 'seeking', sector: r.o.sector, region: r.o.region, city: r.o.city, country: r.o.country, upfrontRequired: r.b.upfrontRequired, status: r.b.status, expiresOn: r.b.expiresOn }, A, N, t) }))
      .filter((x) => x.m).sort((a, b) => b.m!.score - a.m!.score).slice(0, 30).map((x) => ({ offer: this.present(x.r, ctx), score: x.m!.score, reasons: x.m!.reasons }));
    const vs = await this.db.select().from(uniteVentures).limit(200);
    const programs = vs.map((v) => ({ v, m: scoreProgram({ id: v.id, name: v.name, sector: v.sector, roles: v.roles, open: v.open && (!v.regulatedReason || !!v.clearedAt) }, A, N) }))
      .filter((x) => x.m).sort((a, b) => b.m!.score - a.m!.score).slice(0, 12)
      .map((x) => ({ program: { id: x.v.id, slug: x.v.slug, name: x.v.name, tagline: x.v.tagline, sector: x.v.sector, sectorName: sectorName(x.v.sector) }, score: x.m!.score, reasons: x.m!.reasons }));
    // Reverse matching: only verified partners see other partners' published resources, and never private ones.
    let partners: unknown[] = [];
    if (viewerOf(ctx).verified && N.length) {
      const others = await this.db.select({ a: collabAssets, org: organizations.displayName, city: organizations.city }).from(collabAssets).innerJoin(organizations, eq(organizations.id, collabAssets.orgId))
        .where(and(isNull(collabAssets.archivedAt), eq(collabAssets.visibility, 'verified_partners'), eq(collabAssets.available, true), ne(collabAssets.orgId, orgId), eq(organizations.verificationStatus, 'verified'))).limit(1000);
      const found = reverseMatches(N.map((n) => ({ kind: n.kind, sectors: n.sectors, regions: n.regions, orgId })), others.map((o) => this.asMatchAsset(o.a)));
      partners = found.map((f) => { const o = others.find((x) => x.a.id === f.item.id)!; return { resource: { id: o.a.id, kind: o.a.kind, kindLabel: ASSET_LABELS[o.a.kind as AssetKind], title: o.a.title, description: o.a.description, city: o.a.city, region: o.a.region, capacity: o.a.capacity, verification: o.a.verification }, organization: o.org, score: f.score, reasons: f.reasons, forNeed: NEED_LABELS[f.via as NeedKind] ?? f.via }; });
    }
    return { offers, programs, partners, empty: false, note: 'Matches are suggestions from the rules shown with each one. They are not offers of work or guarantees of income.' };
  }

  // ------------------------------------------------------------------ 4. business offers
  @Get('business-offers')
  async listOffers(@Ctx() ctx: RequestContext, @Query('category') category?: string, @Query('q') q?: string, @Query('region') region?: string, @Query('side') side?: string, @Query('zeroUpfront') zero?: string, @Query('sector') sector?: string) {
    await this.sweepExpired();
    if (category && !(OFFER_CATEGORY_CODES as readonly string[]).includes(category)) throw new BadRequestException('Unknown category');
    const rows = await this.db.select({ b: businessOffers, o: opportunities, owner: organizations.displayName }).from(businessOffers)
      .innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(inArray(businessOffers.status, OFFER_OPEN), category ? eq(businessOffers.category, category) : undefined, side ? eq(businessOffers.side, side) : undefined,
        region ? eq(opportunities.region, region) : undefined, sector ? eq(opportunities.sector, sector) : undefined, zero === '1' ? eq(businessOffers.upfrontRequired, false) : undefined,
        q ? or(sql`${opportunities.title} ilike ${'%' + q + '%'}`, sql`${opportunities.summary} ilike ${'%' + q + '%'}`, eq(opportunities.code, q.toUpperCase())) : undefined))
      .orderBy(desc(opportunities.publishedAt)).limit(200);
    const counts = await this.db.select({ c: businessOffers.category, n: sql<number>`count(*)::int` }).from(businessOffers).where(inArray(businessOffers.status, OFFER_OPEN)).groupBy(businessOffers.category);
    return { items: rows.map((r) => this.present(r, ctx)), counts: Object.fromEntries(counts.map((c) => [c.c, Number(c.n)])) };
  }

  @Get('business-offers/mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    await this.sweepExpired();
    const orgId = this.org(ctx);
    const rows = await this.db.select({ b: businessOffers, o: opportunities, owner: organizations.displayName, applicants: sql<number>`(select count(*)::int from opportunity_applications x where x.opportunity_id = ${opportunities.id} and x.status <> 'withdrawn')` })
      .from(businessOffers).innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(eq(opportunities.ownerOrgId, orgId)).orderBy(desc(businessOffers.updatedAt));
    return rows.map((r) => ({ ...this.present(r, ctx), applicants: Number(r.applicants) }));
  }

  @Post('business-offers')
  @RequireOrg()
  @Idempotent()
  @HttpCode(201)
  async createOffer(@Ctx() ctx: RequestContext, @Body(body(BusinessOfferSchema.and(z.object({ submit: z.boolean().default(false) })))) b: z.infer<typeof BusinessOfferSchema> & { submit: boolean }) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('Only the owner or an admin of your business can publish offers');
    if (b.submit && ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Complete your business verification (KYB) before publishing offers. You can save a draft meanwhile.');
    if (b.expiresOn <= today()) throw new BadRequestException('Choose an expiry date in the future');
    if (b.expiresOn > new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10)) throw new BadRequestException('Offers can run for up to a year; renew them after that');
    if (b.assetIds.length) {
      const own = await this.db.select({ id: collabAssets.id }).from(collabAssets).where(and(inArray(collabAssets.id, b.assetIds), eq(collabAssets.orgId, orgId)));
      if (own.length !== new Set(b.assetIds).size) throw new BadRequestException('Link only your own resources');
    }
    // Duplicate detection: same publisher, category and title already open or pending.
    const dup = await this.db.select({ id: opportunities.id }).from(businessOffers).innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId))
      .where(and(eq(opportunities.ownerOrgId, orgId), eq(businessOffers.category, b.category), sql`lower(${opportunities.title}) = lower(${b.title})`, inArray(businessOffers.status, ['draft', 'pending_verification', 'verified', 'under_review', 'active', 'negotiating']))).limit(1);
    if (dup.length) throw new ConflictException('You already have this offer. Edit or renew it instead of creating another.');
    const code = await this.opps.nextCode();
    const id = await this.db.transaction(async (tx) => {
      const [o] = await tx.insert(opportunities).values({
        code, title: b.title, summary: b.summary, sector: b.sector, kind: b.side === 'offering' ? 'service' : 'project', route: 'partner_listing', source: 'partner_listing', city: b.city, region: b.region, country: b.country,
        estimatedValue: b.estimatedValue, visibility: 'verified_partners', minLevel: 'verified', ownerOrgId: orgId, status: 'draft', listed: false, buyerConfidential: b.confidential, createdBy: ctx.userId,
      }).returning();
      await tx.insert(opportunityEvents).values({ opportunityId: o.id, version: 1, fromStatus: null, toStatus: 'draft', reason: 'Business offer drafted', actorUserId: ctx.userId });
      await tx.insert(businessOffers).values({ opportunityId: o.id, category: b.category, side: b.side, expiresOn: b.expiresOn, upfrontRequired: b.upfrontRequired, upfrontAmount: b.upfrontAmount ?? null, eligibility: b.eligibility, territory: b.territory, assetIds: b.assetIds, uniteFirstConsent: b.uniteFirstConsent });
      await this.audit.record(ctx, { action: 'business_offer.created', objectType: 'opportunity', objectId: o.id, after: { code, category: b.category } }, tx as unknown as Db);
      return o.id;
    });
    if (b.submit) await this.submitOffer(ctx, id);
    return this.offerDetail(ctx, id);
  }

  /** Submit for verification. Only verified businesses can publish; a regulated category is accepted for discovery only. */
  @Post('business-offers/:id/submit')
  @RequireOrg()
  @HttpCode(200)
  async submitOffer(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.loadOffer(id);
    if (!this.manager(ctx, r.o.ownerOrgId)) throw new ForbiddenException('Only the owner or an admin of the publishing business can submit');
    if (ctx.orgId !== r.o.ownerOrgId || ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Complete your business verification (KYB) before publishing offers');
    await this.setOfferStatus(ctx, r.b, 'pending_verification');
    return this.offerDetail(ctx, id);
  }

  @Post('business-offers/:id/renew')
  @RequireOrg()
  @HttpCode(200)
  async renew(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))) b: { expiresOn: string }) {
    const r = await this.loadOffer(id);
    if (!this.manager(ctx, r.o.ownerOrgId)) throw new ForbiddenException();
    if (r.b.status !== 'expired') throw new ConflictException('Only expired offers are renewed');
    if (b.expiresOn <= today()) throw new BadRequestException('Choose an expiry date in the future');
    await this.setOfferStatus(ctx, r.b, 'pending_verification', { expiresOn: b.expiresOn, renewals: r.b.renewals + 1, checks: [] });
    return this.offerDetail(ctx, id);
  }

  @Post('business-offers/:id/close')
  @RequireOrg()
  @HttpCode(200)
  async closeOffer(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000) }))) b: { reason: string }) {
    const r = await this.loadOffer(id);
    if (!this.manager(ctx, r.o.ownerOrgId)) throw new ForbiddenException();
    await this.db.transaction(async (tx) => {
      await this.setOfferStatus(ctx, r.b, 'closed', {}, tx as unknown as Db);
      if (['qualification', 'proposal', 'negotiation'].includes(r.o.status)) await this.opps.transition(ctx, id, 'lost', `Offer closed by the publisher: ${b.reason}`, tx as unknown as Db, undefined, { listed: false });
    });
    return this.offerDetail(ctx, id);
  }

  /** Detail. Non-owners see only open offers; the owner also sees applications and suggested partners. */
  @Get('business-offers/:id')
  async offerDetail(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.sweepExpired();
    const r = await this.loadOffer(id);
    const own = ctx.memberships.some((m) => m.organizationId === r.o.ownerOrgId);
    const party = ctx.orgId ? (await this.db.select({ id: opportunityApplications.id }).from(opportunityApplications).where(and(eq(opportunityApplications.opportunityId, id), eq(opportunityApplications.organizationId, ctx.orgId))).limit(1))[0] : undefined;
    if (!own && !this.moderator(ctx) && !OFFER_OPEN.includes(r.b.status as OfferStatus) && !party) throw new NotFoundException('Offer not found');
    const view = this.present(r, ctx);
    const assets = r.b.assetIds.length ? await this.db.select().from(collabAssets).where(and(inArray(collabAssets.id, r.b.assetIds), isNull(collabAssets.archivedAt))) : [];
    const applyCheck = ctx.orgId && !own ? await this.opps.eligibility(ctx, r.o) : null;
    const myApplication = ctx.orgId && !own ? (await this.db.select().from(opportunityApplications).where(and(eq(opportunityApplications.opportunityId, id), eq(opportunityApplications.organizationId, ctx.orgId), ne(opportunityApplications.status, 'withdrawn'))).limit(1))[0] ?? null : null;
    let applications: unknown[] = [], suggested: unknown[] = [];
    if (own) {
      applications = await this.opps.applicants(ctx, r.o);
      if (viewerOf(ctx).verified && OFFER_OPEN.includes(r.b.status as OfferStatus)) {
        const others = await this.db.select({ a: collabAssets, org: organizations.displayName }).from(collabAssets).innerJoin(organizations, eq(organizations.id, collabAssets.orgId))
          .where(and(isNull(collabAssets.archivedAt), eq(collabAssets.visibility, 'verified_partners'), ne(collabAssets.orgId, r.o.ownerOrgId), eq(organizations.verificationStatus, 'verified'))).limit(1000);
        suggested = reverseMatches([{ category: r.b.category as OfferCategory, side: r.b.side as 'offering' | 'seeking', sectors: [r.o.sector], regions: r.o.region ? [r.o.region] : [], orgId: r.o.ownerOrgId }], others.map((o) => this.asMatchAsset(o.a)), 8)
          .map((f) => { const o = others.find((x) => x.a.id === f.item.id)!; return { organization: o.org, resource: { kind: o.a.kind, kindLabel: ASSET_LABELS[o.a.kind as AssetKind], title: o.a.title, city: o.a.city, capacity: o.a.capacity, verification: o.a.verification }, score: f.score, reasons: f.reasons }; });
      }
    }
    return { ...view, assets: assets.map((a) => ({ id: a.id, kind: a.kind, kindLabel: ASSET_LABELS[a.kind as AssetKind], title: a.title, capacity: a.capacity, verification: a.verification })), applyCheck, myApplication, applications, suggested,
      notice: view.regulated ? 'Business sales, acquisitions, exits and investments are listed for discovery only. COLLABIZ does not arrange or execute these transactions; they continue through an appropriately licensed channel.' : null };
  }

  // ------------------------------------------------------------------ moderation (COLLABIZ staff)
  @Get('admin/business-offers')
  async queue(@Ctx() ctx: RequestContext, @Query('status') status = 'pending_verification') {
    if (!this.moderator(ctx)) throw new ForbiddenException('Moderators only');
    await this.sweepExpired();
    const rows = await this.db.select({ b: businessOffers, o: opportunities, owner: organizations.displayName, kyb: organizations.verificationStatus }).from(businessOffers)
      .innerJoin(opportunities, eq(opportunities.id, businessOffers.opportunityId)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(status === 'all' ? undefined : eq(businessOffers.status, status)).orderBy(desc(businessOffers.updatedAt)).limit(300);
    return rows.map((r) => ({ ...this.present(r, ctx), publisher: r.owner, publisherKyb: r.kyb }));
  }

  @Post('admin/business-offers/:id/moderate')
  @HttpCode(200)
  async moderate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ModerateSchema)) b: z.infer<typeof ModerateSchema>) {
    if (!this.moderator(ctx)) throw new ForbiddenException('Moderators only');
    const r = await this.loadOffer(id);
    if (ctx.memberships.some((m) => m.organizationId === r.o.ownerOrgId)) throw new ForbiddenException('You cannot moderate your own organisation’s offer');
    const stamp = { moderatedBy: ctx.userId, moderatedAt: new Date(), moderationNote: b.note ?? null };
    await this.db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      if (b.decision === 'approve') {
        const [org] = await t.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, r.o.ownerOrgId));
        if (org?.v !== 'verified') throw new ConflictException('The publisher is no longer verified');
        const v = await this.setOfferStatus(ctx, r.b, 'verified', { ...stamp, checks: b.checks }, t);
        await this.setOfferStatus(ctx, v, 'active', {}, t);
        if (r.o.status === 'draft') await this.opps.transition(ctx, id, 'qualification', 'Business offer verified and published', t, undefined, { listed: true, publishedAt: new Date() });
      } else if (b.decision === 'reject') await this.setOfferStatus(ctx, r.b, 'rejected', stamp, t);
      else if (b.decision === 'suspend') await this.setOfferStatus(ctx, r.b, 'suspended', stamp, t);
      else await this.setOfferStatus(ctx, r.b, 'active', stamp, t);
    });
    await this.notifyOrg(r.o.ownerOrgId, `Your offer ${r.o.code}: ${b.decision === 'approve' ? 'published' : b.decision === 'reinstate' ? 'reinstated' : b.decision === 'reject' ? 'not approved' : 'suspended'}`, b.note ?? 'Your business offer has been reviewed.', `/business-offers/${id}`);
    return this.offerDetail(ctx, id);
  }

  // ------------------------------------------------------------------ 5–7. proposal room and agreement
  private async room(ctx: RequestContext, appId: string) {
    const [a] = await this.db.select().from(opportunityApplications).where(eq(opportunityApplications.id, appId)).limit(1);
    if (!a) throw new NotFoundException('Application not found');
    const r = await this.loadOffer(a.opportunityId);
    const mine = new Set(ctx.memberships.map((m) => m.organizationId));
    const side = mine.has(r.o.ownerOrgId) && ctx.orgId === r.o.ownerOrgId ? 'owner' : mine.has(a.organizationId) && ctx.orgId === a.organizationId ? 'applicant' : null;
    if (!side) throw new NotFoundException('Application not found');
    return { a, r, side: side as 'owner' | 'applicant', myOrg: ctx.orgId! };
  }

  @Get('collab/applications/:id/room')
  @RequireOrg()
  async getRoom(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) appId: string) {
    const { a, r, side, myOrg } = await this.room(ctx, appId);
    const rounds = await this.db.select().from(collabProposals).where(eq(collabProposals.applicationId, appId)).orderBy(collabProposals.round);
    const turn = nextProposalTurn(rounds, r.o.ownerOrgId, a.organizationId);
    const [applicant] = await this.db.select({ name: organizations.displayName, kyb: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, a.organizationId));
    const accepted = rounds.find((x) => x.status === 'accepted');
    const contract = accepted?.contractId ? (await this.db.select().from(contracts).where(eq(contracts.id, accepted.contractId)).limit(1))[0] : undefined;
    const project = contract ? (await this.db.select().from(projects).where(eq(projects.contractId, contract.id)).limit(1))[0] : undefined;
    const invoices = project ? await this.db.select().from(projectInvoices).where(eq(projectInvoices.projectId, project.id)) : [];
    const canAct = this.manager(ctx, myOrg) || ctx.caps.has('contract.manage');
    const open = ['shortlisted', 'accepted'].includes(a.status) && !accepted;
    return {
      side, offer: this.present(r, ctx), application: { id: a.id, status: a.status, message: a.message, proposedValue: a.proposedValue, createdAt: a.createdAt, applicant: applicant?.name, applicantKyb: applicant?.kyb },
      rounds: rounds.map((x) => ({ id: x.id, round: x.round, from: x.fromOrgId === r.o.ownerOrgId ? 'owner' : 'applicant', mine: x.fromOrgId === myOrg, status: x.status, terms: x.terms as ProposalTerms, pricingLabel: PRICING_LABELS[(x.terms as ProposalTerms).pricingModel], createdAt: x.createdAt, decidedAt: x.decidedAt })),
      can: { propose: open && canAct && turn.canPropose.includes(myOrg), accept: open && canAct && turn.canAccept.includes(myOrg), decline: open && canAct && turn.canAccept.includes(myOrg), withdraw: open && canAct && rounds.some((x) => x.status === 'sent' && x.fromOrgId === myOrg) },
      waitingFor: !open ? null : rounds.some((x) => x.status === 'sent') ? (turn.canAccept.includes(myOrg) ? 'you' : 'them') : 'first_proposal',
      stage: project ? 'execution' : contract ? (contract.status === 'executed' ? 'agreement_signed' : 'agreement') : accepted ? 'agreement' : rounds.length ? 'proposal' : a.status === 'submitted' ? 'application' : 'shortlisted',
      agreement: contract ? { id: contract.id, code: contract.code, status: contract.status, value: contract.value, issuer: contract.issuerOrgId === myOrg ? 'you' : 'them' } : null,
      project: project ? { id: project.id, code: project.code, status: project.status } : null,
      money: this.money(rounds, contract?.value ?? null, invoices),
      prerequisite: a.status === 'submitted' ? (side === 'owner' ? 'Shortlist or accept this application to open the proposal room.' : 'The publisher will shortlist your application before proposals can be exchanged.') : null,
    };
  }

  /** Keep these four apart; they are not interchangeable revenue numbers. */
  private money(rounds: Proposal[], contractValue: number | null, invoices: (typeof projectInvoices.$inferSelect)[]) {
    const live = [...rounds].reverse().find((x) => x.status === 'sent' || x.status === 'accepted');
    return {
      pipelineValue: contractValue == null && live ? (live.terms as ProposalTerms).value : 0,
      contractValue: contractValue ?? 0,
      invoiced: invoices.reduce((s, i) => s + i.amount, 0),
      collected: invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
    };
  }

  @Post('collab/applications/:id/proposals')
  @RequireOrg()
  @Idempotent()
  @HttpCode(201)
  async propose(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) appId: string, @Body(body(CollabProposalSchema)) b: ProposalTerms) {
    const { a, r, myOrg } = await this.room(ctx, appId);
    if (!(this.manager(ctx, myOrg) || ctx.caps.has('contract.manage'))) throw new ForbiddenException('Only an owner, admin or contract manager can send proposals');
    if (!['shortlisted', 'accepted'].includes(a.status)) throw new ConflictException('Proposals open once the publisher shortlists or accepts the application');
    if (!OFFER_OPEN.includes(r.b.status as OfferStatus)) throw new ConflictException(`This offer is ${OFFER_STATUS_LABELS[r.b.status as OfferStatus].toLowerCase()}`);
    if (isRegulatedCategory(r.b.category)) throw new ConflictException('This category is discovery only. Agreements for business sales, acquisitions and investments are made outside COLLABIZ through a licensed channel.');
    if (b.startDate < today()) throw new BadRequestException('The start date cannot be in the past');
    const rounds = await this.db.select().from(collabProposals).where(eq(collabProposals.applicationId, appId)).orderBy(collabProposals.round);
    if (rounds.some((x) => x.status === 'accepted')) throw new ConflictException('A proposal has already been accepted');
    const turn = nextProposalTurn(rounds, r.o.ownerOrgId, a.organizationId);
    if (!turn.canPropose.includes(myOrg)) throw new ConflictException('Wait for the other party to respond to your proposal');
    const other = myOrg === r.o.ownerOrgId ? a.organizationId : r.o.ownerOrgId;
    const p = await this.db.transaction(async (tx) => {
      await tx.update(collabProposals).set({ status: 'superseded', decidedBy: ctx.userId, decidedAt: new Date() }).where(and(eq(collabProposals.applicationId, appId), eq(collabProposals.status, 'sent')));
      const [p] = await tx.insert(collabProposals).values({ applicationId: appId, opportunityId: r.o.id, round: rounds.length + 1, fromOrgId: myOrg, toOrgId: other, terms: b, createdBy: ctx.userId }).returning();
      if (r.b.status === 'active') await this.setOfferStatus(ctx, r.b, 'negotiating', {}, tx as unknown as Db);
      if (r.o.status === 'qualification') await this.opps.transition(ctx, r.o.id, 'proposal', 'Commercial proposal exchanged', tx as unknown as Db);
      await this.audit.record(ctx, { action: 'collab.proposal_sent', objectType: 'collab_proposal', objectId: p.id, after: { round: p.round, value: b.value, pricingModel: b.pricingModel } }, tx as unknown as Db);
      return p;
    });
    await this.notifyOrg(other, `${rounds.length ? 'Counter-proposal' : 'Proposal'} on ${r.o.code}`, `${PRICING_LABELS[b.pricingModel]}, ${inr(b.value)} over ${b.durationMonths} months. Review and respond.`, `/collab/room/${appId}`);
    return { id: p.id, round: p.round };
  }

  @Post('collab/proposals/:id/withdraw')
  @RequireOrg()
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [p] = await this.db.select().from(collabProposals).where(eq(collabProposals.id, id)).limit(1);
    if (!p) throw new NotFoundException();
    const { myOrg } = await this.room(ctx, p.applicationId);
    if (p.fromOrgId !== myOrg || p.status !== 'sent') throw new ConflictException('Only your own open proposal can be withdrawn');
    await this.db.update(collabProposals).set({ status: 'withdrawn', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(collabProposals.id, id));
    await this.audit.record(ctx, { action: 'collab.proposal_withdrawn', objectType: 'collab_proposal', objectId: id });
    return { ok: true };
  }

  @Post('collab/proposals/:id/decline')
  @RequireOrg()
  @HttpCode(200)
  async decline(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(1000) }))) b: { reason: string }) {
    const [p] = await this.db.select().from(collabProposals).where(eq(collabProposals.id, id)).limit(1);
    if (!p) throw new NotFoundException();
    const { r, myOrg } = await this.room(ctx, p.applicationId);
    if (p.toOrgId !== myOrg || p.status !== 'sent') throw new ConflictException('Only an open proposal sent to you can be declined');
    await this.db.update(collabProposals).set({ status: 'declined', decidedBy: ctx.userId, decidedAt: new Date() }).where(eq(collabProposals.id, id));
    await this.audit.record(ctx, { action: 'collab.proposal_declined', objectType: 'collab_proposal', objectId: id, reason: b.reason });
    await this.notifyOrg(p.fromOrgId, `Proposal declined on ${r.o.code}`, b.reason, `/collab/room/${p.applicationId}`);
    return { ok: true };
  }

  /**
   * The receiving party accepts the live round. Both parties have now agreed the same terms, so the agreement is created in
   * Contracts with that version approved (the acceptance is the approval) and is ready for both parties to sign.
   */
  @Post('collab/proposals/:id/accept')
  @RequireOrg()
  @Idempotent()
  @HttpCode(200)
  async accept(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [p] = await this.db.select().from(collabProposals).where(eq(collabProposals.id, id)).limit(1);
    if (!p) throw new NotFoundException();
    const { a, r, myOrg } = await this.room(ctx, p.applicationId);
    if (!(this.manager(ctx, myOrg) || ctx.caps.has('contract.manage'))) throw new ForbiddenException('Only an owner, admin or contract manager can accept');
    if (p.toOrgId !== myOrg) throw new ForbiddenException('Only the party that received this proposal can accept it');
    if (p.status !== 'sent') throw new ConflictException('This proposal is no longer open');
    if (!OFFER_OPEN.includes(r.b.status as OfferStatus)) throw new ConflictException('This offer is no longer open');
    const t = p.terms as ProposalTerms;
    const payer = t.payer === 'owner' ? r.o.ownerOrgId : a.organizationId;
    const provider = payer === r.o.ownerOrgId ? a.organizationId : r.o.ownerOrgId;
    const names = await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [payer, provider]));
    const nm = (x: string) => names.find((n) => n.id === x)?.name ?? '—';
    const code = `CTR-${new Date().getUTCFullYear()}-${randomDigits(6)}`;
    const share = t.sharePercent != null ? ` (${t.sharePercent}% ${t.pricingModel === 'commission' ? 'commission on sales' : 'revenue share'})` : '';
    const text = [
      `COLLABORATION AGREEMENT — ${code}`, 'DRAFT TEMPLATE — SUBJECT TO LEGAL REVIEW BEFORE USE', '',
      `Client (pays): ${nm(payer)}`, `Provider (delivers): ${nm(provider)}`, `Reference: business offer ${r.o.code} — ${r.o.title} (${offerCategoryLabel(r.b.category)}), proposal round ${p.round}`, '',
      'Scope', t.scope, '', 'Deliverables', t.deliverables, '',
      'Consideration', `Pricing: ${PRICING_LABELS[t.pricingModel]}${share}. Total value for the term: ${inr(t.value)} (exclusive of applicable taxes).`, `Payment terms: ${t.paymentTerms}`, '',
      'Term', `${t.durationMonths} months from ${t.startDate}, unless ended earlier in writing.`, '',
      'General', 'Each party is responsible for its own taxes, licences and statutory compliance. Invoices are raised against certified milestones in the project created under this agreement. Disputes go first to the COLLABIZ Resolution Centre. COLLABIZ is not a party to this agreement and does not guarantee performance or payment.',
    ].join('\n');
    const contractId = await this.db.transaction(async (tx) => {
      const [u] = await tx.update(collabProposals).set({ status: 'accepted', decidedBy: ctx.userId, decidedAt: new Date() }).where(and(eq(collabProposals.id, id), eq(collabProposals.status, 'sent'))).returning();
      if (!u) throw new ConflictException('This proposal is no longer open');
      const [c] = await tx.insert(contracts).values({ code, kind: 'contract', title: `Collaboration agreement — ${r.o.title}`, issuerOrgId: payer, counterpartyOrgId: provider, value: t.value, status: 'approved', opportunityId: r.o.id, collabProposalId: id, createdBy: ctx.userId }).returning();
      const now = new Date();
      await tx.insert(contractVersions).values({ contractId: c.id, versionNo: 1, body: text, terms: { value: t.value, startDate: t.startDate, paymentTerms: t.paymentTerms, deliverables: t.deliverables }, bodyHash: sha256(text), changeNote: `Generated from proposal round ${p.round} accepted by both parties`, authorUserId: p.createdBy, submittedAt: now, approvedAt: now, approvedBy: ctx.userId, reviewNote: 'Terms proposed by one party and accepted by the other in the COLLABIZ proposal room' });
      await tx.update(collabProposals).set({ contractId: c.id }).where(eq(collabProposals.id, id));
      if (a.status === 'shortlisted') await tx.update(opportunityApplications).set({ status: 'accepted', decidedBy: ctx.userId, decisionReason: 'Proposal accepted', updatedAt: now }).where(eq(opportunityApplications.id, a.id));
      if (r.b.status === 'negotiating') await this.setOfferStatus(ctx, r.b, 'active', {}, tx as unknown as Db);
      if (r.o.status === 'proposal') await this.opps.transition(ctx, r.o.id, 'awarded', `Agreement ${code} generated`, tx as unknown as Db);
      await this.audit.record(ctx, { action: 'collab.proposal_accepted', objectType: 'collab_proposal', objectId: id, after: { contractId: c.id, code, value: t.value, payer, provider } }, tx as unknown as Db);
      return c.id;
    });
    for (const org of [payer, provider]) await this.notifyOrg(org, `Ready to sign: ${code}`, `The collaboration agreement for ${r.o.title} has been generated from the accepted proposal. Review and sign it.`, `/vault?contract=${contractId}`);
    return { contractId, code };
  }

  // ------------------------------------------------------------------ 8. my collaborations and earnings
  @Get('collab/workspace')
  @RequireOrg()
  async workspace(@Ctx() ctx: RequestContext) {
    const orgId = this.org(ctx);
    const apps = await this.db.select({ a: opportunityApplications, o: opportunities, b: businessOffers, owner: organizations.displayName }).from(opportunityApplications)
      .innerJoin(opportunities, eq(opportunities.id, opportunityApplications.opportunityId)).innerJoin(businessOffers, eq(businessOffers.opportunityId, opportunities.id)).innerJoin(organizations, eq(organizations.id, opportunities.ownerOrgId))
      .where(and(ne(opportunityApplications.status, 'withdrawn'), or(eq(opportunityApplications.organizationId, orgId), eq(opportunities.ownerOrgId, orgId)))).orderBy(desc(opportunityApplications.updatedAt)).limit(200);
    if (!apps.length) return { items: [], totals: { pipelineValue: 0, contractValue: 0, invoiced: 0, collected: 0, toReceive: 0, toPay: 0 } };
    const ids = apps.map((x) => x.a.id);
    const [rounds, partners] = await Promise.all([
      this.db.select().from(collabProposals).where(inArray(collabProposals.applicationId, ids)).orderBy(collabProposals.round),
      this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [...new Set(apps.map((x) => x.a.organizationId))])),
    ]);
    const cids = rounds.map((x) => x.contractId).filter(Boolean) as string[];
    const cs = cids.length ? await this.db.select().from(contracts).where(inArray(contracts.id, cids)) : [];
    const ps = cids.length ? await this.db.select().from(projects).where(inArray(projects.contractId, cids)) : [];
    const inv = ps.length ? await this.db.select().from(projectInvoices).where(inArray(projectInvoices.projectId, ps.map((p) => p.id))) : [];
    const totals = { pipelineValue: 0, contractValue: 0, invoiced: 0, collected: 0, toReceive: 0, toPay: 0 };
    const items = apps.map(({ a, o, b, owner }) => {
      const rs = rounds.filter((x) => x.applicationId === a.id);
      const acc = rs.find((x) => x.status === 'accepted');
      const c = acc ? cs.find((x) => x.id === acc.contractId) : undefined;
      const p = c ? ps.find((x) => x.contractId === c.id) : undefined;
      const m = this.money(rs, c?.value ?? null, p ? inv.filter((i) => i.projectId === p.id) : []);
      const role = c ? (c.counterpartyOrgId === orgId ? 'provider' : 'client') : null;
      totals.pipelineValue += m.pipelineValue; totals.contractValue += m.contractValue; totals.invoiced += m.invoiced; totals.collected += m.collected;
      if (role === 'provider') totals.toReceive += m.invoiced - m.collected; else if (role === 'client') totals.toPay += m.invoiced - m.collected;
      const live = rs.find((x) => x.status === 'sent');
      return {
        applicationId: a.id, offerId: o.id, code: o.code, title: o.title, category: offerCategoryLabel(b.category), side: o.ownerOrgId === orgId ? 'publisher' : 'applicant',
        counterparty: o.ownerOrgId === orgId ? partners.find((x) => x.id === a.organizationId)?.name : owner, applicationStatus: a.status, role,
        stage: p ? 'execution' : c ? (c.status === 'executed' ? 'agreement_signed' : 'agreement') : rs.length ? 'proposal' : a.status === 'submitted' ? 'application' : 'shortlisted',
        waitingOnYou: !!live && live.toOrgId === orgId, agreement: c ? { id: c.id, code: c.code, status: c.status } : null, project: p ? { id: p.id, code: p.code, status: p.status } : null, money: m, updatedAt: a.updatedAt,
      };
    });
    return { items, totals, note: 'Pipeline is the value of proposals not yet agreed. Contract value is signed or ready-to-sign agreements. Invoiced and collected come from certified project milestones. They are tracked separately and are not interchangeable.' };
  }
}

@Module({ imports: [OpportunitiesModule], controllers: [CollabController] })
export class CollabModule {}
