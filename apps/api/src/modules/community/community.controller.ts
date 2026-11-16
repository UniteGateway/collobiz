/**
 * Community and group investments (tested in test/community.e2e.ts).
 *  - Presence: the app sends a heartbeat each minute; members seen in the last 3 minutes show as online unless they chose to
 *    hide it. Only signed-in members of an organisation see who is online.
 *  - Wall: verified members post thoughts, questions and opportunities; anyone signed in reads, likes and comments.
 *    Reports reach Unite moderators, who can remove a post. Private conversations use the existing encrypted chat.
 *  - Group investments: Unite lists offers (e.g. a property share sold per sq ft with rent shared pro rata). Members register
 *    non-binding interest only. No money is taken and no units are allotted in COLLABIZ; a super admin records the
 *    regulatory clearance (e.g. SEBI SM REIT registration) before Unite contacts interested members.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  CommunityCommentSchema, CommunityPostSchema, INVESTMENT_KIND_LABELS, INVESTMENT_NOTICE, INVEST_OFFER_STATUS_LABELS, InvestmentInterestSchema, InvestmentOfferSchema, ONLINE_WINDOW_SECONDS,
  POST_TOPIC_LABELS, grossYieldPct, rentShare,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { communityComments, communityLikes, communityPosts, investmentInterests, investmentOffers, memberships, notifications, organizations, partnerProfiles, userPresence, users } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';
import { OpportunitiesModule } from '../opportunities/opportunities.controller';
import { SearchController } from './search.controller';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin' || r === 'moderator');
const superAdmin = (ctx: RequestContext) => ctx.platformRoles.includes('super_admin');
const since = () => new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000);
type Offer = typeof investmentOffers.$inferSelect;

@ApiTags('community')
@Controller()
export class CommunityController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  // ---------------------------------------------------------------- presence
  @Post('community/heartbeat')
  @HttpCode(200)
  async heartbeat(@Ctx() ctx: RequestContext) {
    await this.db.insert(userPresence).values({ userId: ctx.userId, lastSeenAt: new Date() }).onConflictDoUpdate({ target: userPresence.userId, set: { lastSeenAt: new Date() } });
    return { ok: true };
  }
  @Post('community/presence')
  @HttpCode(200)
  async presence(@Ctx() ctx: RequestContext, @Body(body(z.object({ visible: z.boolean() }))) b: { visible: boolean }) {
    await this.db.insert(userPresence).values({ userId: ctx.userId, visible: b.visible }).onConflictDoUpdate({ target: userPresence.userId, set: { visible: b.visible } });
    return { ok: true, visible: b.visible };
  }
  /** Members online now, with their company and main sectors — for starting a conversation. */
  @Get('community/online')
  @RequireOrg()
  async online(@Ctx() ctx: RequestContext) {
    const rows = await this.db.selectDistinctOn([users.id], { id: users.id, name: users.fullName, org: organizations.displayName, orgType: organizations.type, verified: organizations.verificationStatus, city: organizations.city, sectors: partnerProfiles.sectors, seen: userPresence.lastSeenAt })
      .from(userPresence).innerJoin(users, eq(users.id, userPresence.userId)).innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.status, 'active')))
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId)).leftJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(gt(userPresence.lastSeenAt, since()), eq(userPresence.visible, true), inArray(organizations.type, ['partner_company', 'partner_individual', 'group_company']))).orderBy(users.id).limit(200);
    const [me] = await this.db.select({ visible: userPresence.visible }).from(userPresence).where(eq(userPresence.userId, ctx.userId));
    return { visible: me?.visible ?? true, members: rows.filter((r) => r.id !== ctx.userId).map((r) => ({ userId: r.id, name: r.name, org: r.org, city: r.city, verified: r.verified === 'verified', sectors: (r.sectors ?? []).slice(0, 3), unite: r.orgType === 'group_company' })) };
  }

  // ---------------------------------------------------------------- wall
  @Get('community/posts')
  @RequireOrg()
  async posts(@Ctx() ctx: RequestContext, @Query('topic') topic?: string) {
    const rows = await this.db.select({ p: communityPosts, author: users.fullName, org: organizations.displayName, liked: sql<boolean>`exists(select 1 from community_likes l where l.post_id = ${communityPosts.id} and l.user_id = ${ctx.userId})` })
      .from(communityPosts).innerJoin(users, eq(users.id, communityPosts.authorUserId)).innerJoin(organizations, eq(organizations.id, communityPosts.orgId))
      .where(and(eq(communityPosts.status, 'visible'), topic ? eq(communityPosts.topic, topic) : undefined)).orderBy(desc(communityPosts.createdAt)).limit(60);
    return rows.map((r) => ({ id: r.p.id, body: r.p.body, topic: r.p.topic, topicLabel: POST_TOPIC_LABELS[r.p.topic] ?? r.p.topic, likes: r.p.likes, comments: r.p.comments, liked: r.liked, author: r.author, authorUserId: r.p.authorUserId, org: r.org, mine: r.p.authorUserId === ctx.userId, createdAt: r.p.createdAt }));
  }
  @Post('community/posts')
  @RequireOrg()
  async post(@Ctx() ctx: RequestContext, @Body(body(CommunityPostSchema)) b: z.infer<typeof CommunityPostSchema>) {
    if (ctx.orgVerificationStatus !== 'verified' && !staff(ctx)) throw new ForbiddenException('Verify your organisation to post in the community');
    const [recent] = await this.db.select({ n: sql<number>`count(*)::int` }).from(communityPosts).where(and(eq(communityPosts.authorUserId, ctx.userId), gt(communityPosts.createdAt, new Date(Date.now() - 3600_000))));
    if (recent.n >= 10) throw new ConflictException('You have posted a lot in the last hour — please wait a little');
    const [p] = await this.db.insert(communityPosts).values({ authorUserId: ctx.userId, orgId: ctx.orgId!, body: b.body, topic: b.topic }).returning();
    await this.audit.record(ctx, { action: 'community.posted', objectType: 'community_post', objectId: p.id, after: { topic: b.topic } });
    return p;
  }
  @Post('community/posts/:id/like')
  @HttpCode(200)
  @RequireOrg()
  async like(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select({ id: communityPosts.id }).from(communityPosts).where(and(eq(communityPosts.id, id), eq(communityPosts.status, 'visible'))).for('update');
      if (!p) throw new NotFoundException('Post not found');
      const del = await tx.delete(communityLikes).where(and(eq(communityLikes.postId, id), eq(communityLikes.userId, ctx.userId))).returning();
      if (!del.length) await tx.insert(communityLikes).values({ postId: id, userId: ctx.userId });
      const [u] = await tx.update(communityPosts).set({ likes: sql`${communityPosts.likes} + ${del.length ? -1 : 1}` }).where(eq(communityPosts.id, id)).returning({ likes: communityPosts.likes });
      return { liked: !del.length, likes: u.likes };
    });
  }
  @Get('community/posts/:id/comments')
  @RequireOrg()
  async comments(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.select({ id: communityComments.id, body: communityComments.body, author: users.fullName, createdAt: communityComments.createdAt }).from(communityComments).innerJoin(users, eq(users.id, communityComments.authorUserId)).where(eq(communityComments.postId, id)).orderBy(communityComments.createdAt).limit(200);
  }
  @Post('community/posts/:id/comments')
  @RequireOrg()
  async comment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(CommunityCommentSchema)) b: { body: string }) {
    const [p] = await this.db.select().from(communityPosts).where(and(eq(communityPosts.id, id), eq(communityPosts.status, 'visible')));
    if (!p) throw new NotFoundException('Post not found');
    const [c] = await this.db.insert(communityComments).values({ postId: id, authorUserId: ctx.userId, body: b.body }).returning();
    await this.db.update(communityPosts).set({ comments: sql`${communityPosts.comments} + 1` }).where(eq(communityPosts.id, id));
    if (p.authorUserId !== ctx.userId) await this.db.insert(notifications).values({ userId: p.authorUserId, kind: 'announcement', title: 'New comment on your post', body: b.body.slice(0, 140), link: '/community' });
    return c;
  }
  @Post('community/posts/:id/report')
  @HttpCode(200)
  @RequireOrg()
  async report(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    const [p] = await this.db.update(communityPosts).set({ reports: sql`${communityPosts.reports} + 1` }).where(eq(communityPosts.id, id)).returning();
    if (!p) throw new NotFoundException('Post not found');
    await this.audit.record(ctx, { action: 'community.reported', objectType: 'community_post', objectId: id, after: { reason: b.reason } });
    return { ok: true };
  }
  @Post('community/posts/:id/remove')
  @HttpCode(200)
  async remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    const [p] = await this.db.select().from(communityPosts).where(eq(communityPosts.id, id));
    if (!p) throw new NotFoundException('Post not found');
    if (p.authorUserId !== ctx.userId && !staff(ctx)) throw new ForbiddenException('Only the author or a moderator can remove a post');
    await this.db.update(communityPosts).set({ status: 'removed' }).where(eq(communityPosts.id, id));
    await this.audit.record(ctx, { action: 'community.removed', objectType: 'community_post', objectId: id, after: { reason: b.reason, byAuthor: p.authorUserId === ctx.userId } });
    return { ok: true };
  }
  @Get('admin/community/reported')
  async reported(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Moderators only');
    return this.db.select({ p: communityPosts, author: users.fullName }).from(communityPosts).innerJoin(users, eq(users.id, communityPosts.authorUserId)).where(and(gt(communityPosts.reports, 0), eq(communityPosts.status, 'visible'))).orderBy(desc(communityPosts.reports)).then((r) => r.map((x) => ({ ...x.p, author: x.author })));
  }

  // ---------------------------------------------------------------- group investments
  private view(o: Offer, book?: { units: number; members: number }, mine?: { units: number; status: string } | null) {
    const available = Math.max(0, o.totalUnits - (book?.units ?? 0));
    return {
      id: o.id, code: o.code, title: o.title, kind: o.kind, kindLabel: INVESTMENT_KIND_LABELS[o.kind] ?? o.kind, summary: o.summary, location: o.location, unitLabel: o.unitLabel,
      totalUnits: o.totalUnits, unitPrice: o.unitPrice, minUnits: o.minUnits, assetValue: o.totalUnits * o.unitPrice, projectedMonthlyRent: o.projectedMonthlyRent,
      rentPerUnitMonth: rentShare(o.projectedMonthlyRent, 1, o.totalUnits), grossYieldPct: grossYieldPct(o.projectedMonthlyRent, o.totalUnits, o.unitPrice), lockInMonths: o.lockInMonths, sponsor: o.sponsor, documentsUrl: o.documentsUrl,
      status: o.status, statusLabel: INVEST_OFFER_STATUS_LABELS[o.status], regulatoryStatus: o.regulatoryStatus, clearanceReference: o.regulatoryStatus === 'cleared' ? o.clearanceReference : null,
      interestUnits: book?.units ?? 0, interestedMembers: book?.members ?? 0, availableUnits: available, subscribedPct: o.totalUnits ? Math.min(100, Math.round(((book?.units ?? 0) / o.totalUnits) * 100)) : 0,
      mine: mine && mine.status === 'interested' ? { units: mine.units, monthlyRentShare: rentShare(o.projectedMonthlyRent, mine.units, o.totalUnits), amount: mine.units * o.unitPrice } : null,
      notice: INVESTMENT_NOTICE,
    };
  }
  private async books(ids: string[]) {
    if (!ids.length) return new Map<string, { units: number; members: number }>();
    const rows = await this.db.select({ offerId: investmentInterests.offerId, units: sql<number>`coalesce(sum(${investmentInterests.units}), 0)::bigint`, members: sql<number>`count(*)::int` }).from(investmentInterests).where(and(inArray(investmentInterests.offerId, ids), eq(investmentInterests.status, 'interested'))).groupBy(investmentInterests.offerId);
    return new Map(rows.map((r) => [r.offerId, { units: Number(r.units), members: r.members }]));
  }

  @Get('invest/offers')
  @RequireOrg()
  async offers(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(investmentOffers).where(inArray(investmentOffers.status, ['interest_open', 'closed'])).orderBy(desc(investmentOffers.createdAt));
    const books = await this.books(rows.map((r) => r.id));
    const mine = rows.length ? await this.db.select().from(investmentInterests).where(and(eq(investmentInterests.userId, ctx.userId), inArray(investmentInterests.offerId, rows.map((r) => r.id)))) : [];
    return rows.map((o) => this.view(o, books.get(o.id), mine.find((m) => m.offerId === o.id) ?? null));
  }
  @Get('invest/offers/:id')
  @RequireOrg()
  async offer(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [o] = await this.db.select().from(investmentOffers).where(eq(investmentOffers.id, id));
    if (!o || (o.status === 'draft' && !staff(ctx))) throw new NotFoundException('Offer not found');
    const [m] = await this.db.select().from(investmentInterests).where(and(eq(investmentInterests.offerId, id), eq(investmentInterests.userId, ctx.userId)));
    return this.view(o, (await this.books([id])).get(id), m ?? null);
  }
  /** Non-binding expression of interest (no payment, no allotment). Updating it replaces the earlier figure. */
  @Post('invest/offers/:id/interest')
  @HttpCode(200)
  @RequireOrg()
  async interest(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(InvestmentInterestSchema)) b: z.infer<typeof InvestmentInterestSchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Complete your verification (KYC) to register interest in an investment');
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select().from(investmentOffers).where(eq(investmentOffers.id, id)).for('update');
      if (!o || o.status !== 'interest_open') throw new ConflictException('This offer is not taking expressions of interest');
      if (b.units < o.minUnits) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'units', message: `The minimum is ${o.minUnits} ${o.unitLabel}` }] });
      const [others] = await tx.select({ u: sql<number>`coalesce(sum(${investmentInterests.units}), 0)::bigint` }).from(investmentInterests).where(and(eq(investmentInterests.offerId, id), eq(investmentInterests.status, 'interested'), sql`${investmentInterests.userId} <> ${ctx.userId}`));
      if (Number(others.u) + b.units > o.totalUnits) throw new BadRequestException({ statusCode: 400, message: 'Please correct the highlighted fields', issues: [{ path: 'units', message: `Only ${o.totalUnits - Number(others.u)} ${o.unitLabel} are still available` }] });
      await tx.insert(investmentInterests).values({ offerId: id, userId: ctx.userId, orgId: ctx.orgId, units: b.units, note: b.note ?? null })
        .onConflictDoUpdate({ target: [investmentInterests.offerId, investmentInterests.userId], set: { units: b.units, note: b.note ?? null, status: 'interested', updatedAt: new Date() } });
      await this.audit.record(ctx, { action: 'invest.interest', objectType: 'investment_offer', objectId: id, after: { units: b.units } }, tx);
      return { ok: true, units: b.units, monthlyRentShare: rentShare(o.projectedMonthlyRent, b.units, o.totalUnits), amount: b.units * o.unitPrice, notice: INVESTMENT_NOTICE };
    });
  }
  @Post('invest/offers/:id/withdraw')
  @HttpCode(200)
  @RequireOrg()
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.db.update(investmentInterests).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(investmentInterests.offerId, id), eq(investmentInterests.userId, ctx.userId))).returning();
    if (!r.length) throw new NotFoundException('No interest registered');
    await this.audit.record(ctx, { action: 'invest.withdrawn', objectType: 'investment_offer', objectId: id });
    return { ok: true };
  }

  // Unite admins
  @Get('admin/invest/offers')
  async adminOffers(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const rows = await this.db.select().from(investmentOffers).orderBy(desc(investmentOffers.createdAt));
    const books = await this.books(rows.map((r) => r.id));
    return rows.map((o) => this.view(o, books.get(o.id)));
  }
  @Post('admin/invest/offers')
  async create(@Ctx() ctx: RequestContext, @Body(body(InvestmentOfferSchema)) b: z.infer<typeof InvestmentOfferSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [o] = await this.db.insert(investmentOffers).values({ ...b, documentsUrl: b.documentsUrl || null, code: `INV-${new Date().getUTCFullYear()}-${randomDigits(5)}`, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'invest.offer_created', objectType: 'investment_offer', objectId: o.id, after: { title: b.title, totalUnits: b.totalUnits, unitPrice: b.unitPrice } });
    return this.view(o);
  }
  @Post('admin/invest/offers/:id/status')
  @HttpCode(200)
  async status(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ to: z.enum(['interest_open', 'closed']) }))) b: { to: string }) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [o] = await this.db.update(investmentOffers).set({ status: b.to, updatedAt: new Date() }).where(eq(investmentOffers.id, id)).returning();
    if (!o) throw new NotFoundException('Offer not found');
    await this.audit.record(ctx, { action: `invest.${b.to}`, objectType: 'investment_offer', objectId: id });
    return this.view(o, (await this.books([id])).get(id));
  }
  /** Regulatory clearance is recorded by a super admin with its reference (e.g. SM REIT registration / legal opinion). */
  @Post('admin/invest/offers/:id/clearance')
  @HttpCode(200)
  async clearance(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reference: z.string().trim().min(5).max(200), note: z.string().trim().min(10).max(1000) }))) b: { reference: string; note: string }) {
    if (!superAdmin(ctx)) throw new ForbiddenException('Only a super admin records regulatory clearance');
    const [o] = await this.db.update(investmentOffers).set({ regulatoryStatus: 'cleared', clearanceReference: b.reference, clearedBy: ctx.userId, clearedAt: new Date(), updatedAt: new Date() }).where(eq(investmentOffers.id, id)).returning();
    if (!o) throw new NotFoundException('Offer not found');
    await this.audit.record(ctx, { action: 'invest.cleared', objectType: 'investment_offer', objectId: id, after: b });
    return this.view(o, (await this.books([id])).get(id));
  }
  @Get('admin/invest/offers/:id/interests')
  async book(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException('Unite administrators only');
    const [o] = await this.db.select().from(investmentOffers).where(eq(investmentOffers.id, id));
    if (!o) throw new NotFoundException('Offer not found');
    const rows = await this.db.select({ i: investmentInterests, name: users.fullName, email: users.email, org: organizations.displayName }).from(investmentInterests).innerJoin(users, eq(users.id, investmentInterests.userId)).leftJoin(organizations, eq(organizations.id, investmentInterests.orgId)).where(eq(investmentInterests.offerId, id)).orderBy(desc(investmentInterests.units));
    return rows.map((r) => ({ ...r.i, name: r.name, email: r.email, org: r.org, monthlyRentShare: rentShare(o.projectedMonthlyRent, r.i.units, o.totalUnits) }));
  }
}

@Module({ imports: [OpportunitiesModule], controllers: [CommunityController, SearchController] })
export class CommunityModule {}
