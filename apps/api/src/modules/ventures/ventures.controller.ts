/**
 * Unite Group businesses (ventures) — the catalogue partners use to promote every Unite business, not only solar.
 *
 * Rules (tested in test/ventures.e2e.ts):
 *  - Regulated ventures (lending, investment, payments, digital currency, prize schemes, health/wealth cards) are hidden from
 *    partners and the public and cannot be opened or used in offers until a super admin records regulatory clearance.
 *  - The public site lists only businesses open to partners. Partners see open and "coming soon" businesses.
 *  - Only verified partners ask to promote a business, and only an open one. Unite admins of the operating company
 *    (or platform Unite admins) approve or decline; approved partners become the business's promoters and can be reached
 *    with direct offers addressed to "approved promoters".
 *  - Internal portfolio ratings and history notes are never stored or shown.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { VENTURE_ROLES, VENTURE_STAGES, ventureAvailability } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { directOfferRecipients, directOffers, memberships, notifications, offerSales, organizations, uniteVentures, ventureInterests } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';

type Venture = typeof uniteVentures.$inferSelect;
const PARTNER_ORG = ['partner_company', 'partner_individual'];
const regulatedLocked = (v: Venture) => !!v.regulatedReason && !v.clearedAt;
const InterestSchema = z.object({ roles: z.array(z.enum(VENTURE_ROLES)).min(1).max(8), regions: z.array(z.string().trim().min(2).max(6)).max(40).default([]), message: z.string().trim().min(20).max(2000) });
const UpdateSchema = z.object({
  open: z.boolean().optional(), stage: z.enum(VENTURE_STAGES).optional(), groupCompanyId: z.string().uuid().nullable().optional(),
  tagline: z.string().trim().min(3).max(160).optional(), summary: z.string().trim().min(30).max(1200).optional(),
  roles: z.array(z.enum(VENTURE_ROLES)).min(1).max(8).optional(), rewardNote: z.string().trim().max(400).nullable().optional(),
});

@Injectable()
export class VenturesService {
  constructor(@InjectDb() private db: Db) {}

  view(v: Venture, company?: string | null) {
    return {
      id: v.id, slug: v.slug, name: v.name, category: v.category, sector: v.sector, tagline: v.tagline, summary: v.summary, stage: v.stage, roles: v.roles,
      open: v.open && !regulatedLocked(v), availability: ventureAvailability({ open: v.open, regulated: !!v.regulatedReason, cleared: !!v.clearedAt }),
      company: company ?? null, rewardNote: v.rewardNote,
    };
  }

  async bySlug(slug: string) {
    const [r] = await this.db.select({ v: uniteVentures, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId)).where(eq(uniteVentures.slug, slug)).limit(1);
    return r;
  }

  /** Unite staff who decide on a venture: members of its operating company, else every Unite admin. */
  async deciders(v: Venture) {
    if (v.groupCompanyOrgId) {
      const rows = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, v.groupCompanyOrgId), eq(memberships.status, 'active')));
      if (rows.length) return rows.map((r) => r.userId);
    }
    return (await this.db.selectDistinct({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.role, 'unite_admin'), eq(memberships.status, 'active')))).map((r) => r.userId);
  }

  canManage(ctx: RequestContext, v: Venture) {
    if (ctx.platformRoles.includes('super_admin')) return true;
    if (!ctx.caps.has('opportunity.publish')) return false;
    return !v.groupCompanyOrgId || ctx.memberships.some((m) => m.organizationId === v.groupCompanyOrgId);
  }
}

@ApiTags('ventures')
@Controller()
export class VenturesController {
  constructor(@InjectDb() private db: Db, private svc: VenturesService, private audit: AuditService) {}

  // ---------- Public ----------
  @Public()
  @Get('public/ventures')
  async publicList() {
    const rows = await this.db.select({ v: uniteVentures, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId))
      .where(and(eq(uniteVentures.open, true), or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt)))).orderBy(asc(uniteVentures.num));
    return rows.map((r) => { const { roles: _r, rewardNote: _n, ...v } = this.svc.view(r.v, r.company); return v; });
  }

  // ---------- Partners ----------
  @Get('ventures')
  @RequireOrg()
  async list(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ v: uniteVentures, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId))
      .where(or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt))).orderBy(asc(uniteVentures.num));
    const mine = await this.db.select({ ventureId: ventureInterests.ventureId, status: ventureInterests.status }).from(ventureInterests).where(eq(ventureInterests.organizationId, ctx.orgId!));
    const offers = await this.db.select({ ventureId: directOffers.ventureId, n: sql<number>`count(*)::int` }).from(directOfferRecipients).innerJoin(directOffers, eq(directOffers.id, directOfferRecipients.offerId))
      .where(and(eq(directOfferRecipients.organizationId, ctx.orgId!), eq(directOffers.status, 'open'), isNotNull(directOffers.ventureId))).groupBy(directOffers.ventureId);
    return rows.map((r) => ({ ...this.svc.view(r.v, r.company), myInterest: mine.find((m) => m.ventureId === r.v.id)?.status ?? null, openOffers: offers.find((o) => o.ventureId === r.v.id)?.n ?? 0 }));
  }

  @Get('ventures/:slug')
  @RequireOrg()
  async one(@Ctx() ctx: RequestContext, @Param('slug') slug: string) {
    const r = await this.svc.bySlug(slug);
    if (!r || regulatedLocked(r.v)) throw new NotFoundException();
    const [interest] = await this.db.select().from(ventureInterests).where(and(eq(ventureInterests.ventureId, r.v.id), eq(ventureInterests.organizationId, ctx.orgId!))).limit(1);
    const offers = await this.db.select({ id: directOffers.id, code: directOffers.code, title: directOffers.title, deadline: directOffers.deadline, status: directOffers.status, myStatus: directOfferRecipients.status })
      .from(directOfferRecipients).innerJoin(directOffers, eq(directOffers.id, directOfferRecipients.offerId))
      .where(and(eq(directOfferRecipients.organizationId, ctx.orgId!), eq(directOffers.ventureId, r.v.id), sql`${directOffers.status} <> 'withdrawn'`)).orderBy(desc(directOffers.createdAt));
    const [promoters] = await this.db.select({ n: sql<number>`count(*)::int` }).from(ventureInterests).where(and(eq(ventureInterests.ventureId, r.v.id), eq(ventureInterests.status, 'approved')));
    return { ...this.svc.view(r.v, r.company), myInterest: interest ? { status: interest.status, roles: interest.roles, regions: interest.regions, message: interest.message, decisionNote: interest.decisionNote } : null, offers, promoters: promoters.n };
  }

  @Post('ventures/:slug/interest')
  @RequireOrg()
  @HttpCode(200)
  async interest(@Ctx() ctx: RequestContext, @Param('slug') slug: string, @Body(body(InterestSchema)) b: z.infer<typeof InterestSchema>) {
    const r = await this.svc.bySlug(slug);
    if (!r || regulatedLocked(r.v)) throw new NotFoundException();
    if (!r.v.open) throw new ConflictException(`${r.v.name} is not open to partners yet`);
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, ctx.orgId!)).limit(1);
    if (!org || !PARTNER_ORG.includes(org.type) || org.verificationStatus !== 'verified') throw new ForbiddenException('Only verified partners can promote Unite businesses');
    const bad = b.roles.filter((x) => !r.v.roles.includes(x));
    if (bad.length) throw new BadRequestException({ message: `${r.v.name} does not need that`, issues: [{ path: 'roles', message: 'Choose from what this business needs' }] });
    const [prev] = await this.db.select().from(ventureInterests).where(and(eq(ventureInterests.ventureId, r.v.id), eq(ventureInterests.organizationId, ctx.orgId!))).limit(1);
    if (prev?.status === 'approved') throw new ConflictException('You are already an approved promoter of this business');
    const values = { roles: b.roles, regions: b.regions, message: b.message, status: 'pending', decidedBy: null, decisionNote: null, decidedAt: null, createdBy: ctx.userId, updatedAt: new Date() };
    const [i] = prev
      ? await this.db.update(ventureInterests).set(values).where(eq(ventureInterests.id, prev.id)).returning()
      : await this.db.insert(ventureInterests).values({ ventureId: r.v.id, organizationId: ctx.orgId!, ...values }).returning();
    await this.audit.record(ctx, { action: 'venture.interest', objectType: 'unite_venture', objectId: r.v.id, after: { roles: b.roles, regions: b.regions } });
    const users = await this.svc.deciders(r.v);
    if (users.length) await this.db.insert(notifications).values(users.map((u) => ({ userId: u, kind: 'venture', title: `${org.displayName} wants to promote ${r.v.name}`, body: b.message.slice(0, 200), link: `/ventures/${r.v.id}` })));
    return { status: i.status };
  }

  @Post('ventures/:slug/interest/withdraw')
  @RequireOrg()
  @HttpCode(200)
  async withdraw(@Ctx() ctx: RequestContext, @Param('slug') slug: string) {
    const r = await this.svc.bySlug(slug);
    if (!r) throw new NotFoundException();
    const [i] = await this.db.update(ventureInterests).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(ventureInterests.ventureId, r.v.id), eq(ventureInterests.organizationId, ctx.orgId!), inArray(ventureInterests.status, ['pending', 'approved']))).returning();
    if (!i) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'venture.interest_withdrawn', objectType: 'unite_venture', objectId: r.v.id });
    return { status: 'withdrawn' };
  }

  // ---------- Unite Group ----------
  @Get('admin/ventures')
  @RequireCaps('opportunity.publish')
  async adminList() {
    const rows = await this.db.select({
      v: uniteVentures, company: organizations.displayName,
      pending: sql<number>`(select count(*)::int from venture_interests i where i.venture_id = ${uniteVentures.id} and i.status = 'pending')`,
      promoters: sql<number>`(select count(*)::int from venture_interests i where i.venture_id = ${uniteVentures.id} and i.status = 'approved')`,
      offers: sql<number>`(select count(*)::int from direct_offers o where o.venture_id = ${uniteVentures.id} and o.status <> 'withdrawn')`,
      wonValue: sql<number>`(select coalesce(sum(s.sale_value), 0)::bigint from offer_sales s join direct_offers o on o.id = s.offer_id where o.venture_id = ${uniteVentures.id} and s.status in ('won', 'paid'))`,
    }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId)).orderBy(asc(uniteVentures.num));
    return rows.map((r) => ({ ...this.svc.view(r.v, r.company), num: r.v.num, regulated: !!r.v.regulatedReason, regulatedReason: r.v.regulatedReason, cleared: !!r.v.clearedAt, groupCompanyOrgId: r.v.groupCompanyOrgId, pending: r.pending, promoters: r.promoters, offers: r.offers, wonValue: Number(r.wonValue) }));
  }

  @Get('admin/ventures/:id')
  @RequireCaps('opportunity.publish')
  async adminOne(@Param('id', ParseUUIDPipe) id: string) {
    const [r] = await this.db.select({ v: uniteVentures, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId)).where(eq(uniteVentures.id, id)).limit(1);
    if (!r) throw new NotFoundException();
    const interests = await this.db.select({ i: ventureInterests, org: organizations }).from(ventureInterests).innerJoin(organizations, eq(organizations.id, ventureInterests.organizationId))
      .where(eq(ventureInterests.ventureId, id)).orderBy(desc(ventureInterests.updatedAt));
    const offers = await this.db.select({ id: directOffers.id, code: directOffers.code, title: directOffers.title, status: directOffers.status, deadline: directOffers.deadline }).from(directOffers).where(eq(directOffers.ventureId, id)).orderBy(desc(directOffers.createdAt));
    const [sales] = await this.db.select({ leads: sql<number>`count(*)::int`, won: sql<number>`count(*) filter (where ${offerSales.status} in ('won','paid'))::int`, wonValue: sql<number>`coalesce(sum(${offerSales.saleValue}) filter (where ${offerSales.status} in ('won','paid')), 0)::bigint` })
      .from(offerSales).innerJoin(directOffers, eq(directOffers.id, offerSales.offerId)).where(and(eq(directOffers.ventureId, id), sql`${offerSales.status} <> 'withdrawn'`));
    return {
      ...this.svc.view(r.v, r.company), num: r.v.num, regulated: !!r.v.regulatedReason, regulatedReason: r.v.regulatedReason, cleared: !!r.v.clearedAt, clearanceNote: r.v.clearanceNote, groupCompanyOrgId: r.v.groupCompanyOrgId,
      interests: interests.map((x) => ({ id: x.i.id, partner: x.org.displayName, city: x.org.city, level: x.org.membershipLevel, roles: x.i.roles, regions: x.i.regions, message: x.i.message, status: x.i.status, decisionNote: x.i.decisionNote, updatedAt: x.i.updatedAt })),
      offers, sales: { leads: sales.leads, won: sales.won, wonValue: Number(sales.wonValue) },
    };
  }

  @Patch('admin/ventures/:id')
  @RequireCaps('opportunity.publish')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(UpdateSchema)) b: z.infer<typeof UpdateSchema>) {
    const [v] = await this.db.select().from(uniteVentures).where(eq(uniteVentures.id, id)).limit(1);
    if (!v) throw new NotFoundException();
    if (!this.svc.canManage(ctx, v)) throw new ForbiddenException('Only the operating company or a super admin can change this business');
    if (b.open && regulatedLocked(v)) throw new ConflictException(`${v.name} needs regulatory review before partners can promote it: ${v.regulatedReason}`);
    if (b.groupCompanyId) {
      const [gc] = await this.db.select().from(organizations).where(eq(organizations.id, b.groupCompanyId)).limit(1);
      if (!gc || gc.type !== 'group_company') throw new BadRequestException('Choose a Unite Group company');
    }
    const { groupCompanyId, ...rest } = b;
    const [u] = await this.db.update(uniteVentures).set({ ...rest, ...(groupCompanyId !== undefined ? { groupCompanyOrgId: groupCompanyId } : {}), updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(uniteVentures.id, id)).returning();
    await this.audit.record(ctx, { action: 'venture.updated', objectType: 'unite_venture', objectId: id, before: { open: v.open, stage: v.stage }, after: b });
    return this.svc.view(u);
  }

  /** Super admin records that legal/regulatory review is complete; only then can the business open to partners. */
  @Post('admin/ventures/:id/clearance')
  @HttpCode(200)
  async clear(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(20).max(1000) }))) b: { note: string }) {
    if (!ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Only a super admin records regulatory clearance');
    const [v] = await this.db.select().from(uniteVentures).where(eq(uniteVentures.id, id)).limit(1);
    if (!v) throw new NotFoundException();
    if (!v.regulatedReason) throw new BadRequestException('This business does not need regulatory clearance');
    await this.db.update(uniteVentures).set({ clearedAt: new Date(), clearedBy: ctx.userId, clearanceNote: b.note, updatedAt: new Date() }).where(eq(uniteVentures.id, id));
    await this.audit.record(ctx, { action: 'venture.cleared', objectType: 'unite_venture', objectId: id, reason: b.note });
    return { cleared: true };
  }

  @Post('admin/ventures/:id/interests/:iid/decide')
  @RequireCaps('opportunity.publish')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('iid', ParseUUIDPipe) iid: string, @Body(body(z.object({ decision: z.enum(['approved', 'declined']), note: z.string().trim().min(5).max(1000) }))) b: { decision: 'approved' | 'declined'; note: string }) {
    const [v] = await this.db.select().from(uniteVentures).where(eq(uniteVentures.id, id)).limit(1);
    if (!v) throw new NotFoundException();
    if (!this.svc.canManage(ctx, v)) throw new ForbiddenException('Only the operating company or a super admin decides');
    const [i] = await this.db.select().from(ventureInterests).where(and(eq(ventureInterests.id, iid), eq(ventureInterests.ventureId, id))).limit(1);
    if (!i) throw new NotFoundException();
    if (i.status !== 'pending') throw new ConflictException(`This request is already ${i.status}`);
    await this.db.update(ventureInterests).set({ status: b.decision, decidedBy: ctx.userId, decisionNote: b.note, decidedAt: new Date(), updatedAt: new Date() }).where(eq(ventureInterests.id, iid));
    await this.audit.record(ctx, { action: `venture.interest_${b.decision}`, objectType: 'unite_venture', objectId: id, reason: b.note, after: { organizationId: i.organizationId } });
    const users = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, i.organizationId), eq(memberships.status, 'active')));
    if (users.length) await this.db.insert(notifications).values(users.map((u) => ({ userId: u.userId, kind: 'venture', title: b.decision === 'approved' ? `You can now promote ${v.name}` : `${v.name}: request not approved`, body: b.note, link: `/ventures/${v.slug}` })));
    return { status: b.decision };
  }
}

@Module({ controllers: [VenturesController], providers: [VenturesService] })
export class VenturesModule {}
