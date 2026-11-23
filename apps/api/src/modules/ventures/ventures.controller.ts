/**
 * Unite Group businesses (ventures) — the catalogue partners use to promote every Unite business, not only solar.
 *
 * Rules (tested in test/ventures.e2e.ts):
 *  - Regulated ventures (lending, investment, payments, digital currency, prize schemes, health/wealth cards) are hidden from
 *    partners and the public and cannot be opened or used in offers until a super admin records regulatory clearance.
 *  - The public partner directory lists only businesses open to partners. The public product pages (/businesses) show every
 *    business that is not regulator-locked, with its stage, and take customer/partner enquiries into the enquiries table.
 *    Partners see open and "coming soon" businesses.
 *  - Only verified partners ask to promote a business, and only an open one. Unite admins of the operating company
 *    (or platform Unite admins) approve or decline; approved partners become the business's promoters and can be reached
 *    with direct offers addressed to "approved promoters".
 *  - Internal portfolio ratings and history notes are never stored or shown.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MICRO_SOURCES, VENTURE_ROLES, VENTURE_STAGES, ventureAvailability } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { courses, crmActivities, crmDeals, customers, microContracts, propertyProjects, propertyUnits, directOfferRecipients, directOffers, enquiries, memberships, solarReferralCodes, notifications, offerSales, organizations, uniteVentures, ventureInterests } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireCaps, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService } from '../../common/adapters';
import { randomDigits } from '../../common/crypto';
import { SolarModule, SolarService } from '../solar/solar.controller';
import { ConnectorService } from './connectors';

type Venture = typeof uniteVentures.$inferSelect;
/** Unite products whose pages show live data from a COLLABIZ module. */
const SHOWCASE: Record<string, 'property' | 'courses'> = { prodeal: 'property', 'real-bricks': 'property', unitif: 'property', 'unite-learning': 'courses', startsmart: 'courses', 'ai-teacher': 'courses' };
const PARTNER_ORG = ['partner_company', 'partner_individual'];
const regulatedLocked = (v: Venture) => !!v.regulatedReason && !v.clearedAt;
const InterestSchema = z.object({ roles: z.array(z.enum(VENTURE_ROLES)).min(1).max(8), regions: z.array(z.string().trim().min(2).max(6)).max(40).default([]), message: z.string().trim().min(20).max(2000) });
export const BusinessEnquirySchema = z.object({
  kind: z.enum(['customer', 'partner', 'interest']),
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(20).regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number').optional().or(z.literal('').transform(() => undefined)),
  city: z.string().trim().max(80).optional().transform((v) => v || undefined),
  organization: z.string().trim().max(200).optional().transform((v) => v || undefined),
  message: z.string().trim().min(10, 'Please tell us a little more (at least 10 characters)').max(2000),
  consent: z.literal(true, { message: 'Consent is required so we can reply' }),
  website: z.string().max(0).optional(),
  projectId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date').optional().or(z.literal('').transform(() => undefined)),
  ref: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/).optional().or(z.literal('').transform(() => undefined)),
  /** Wave 3: the listed item (capacity, offer, energy project, product) the visitor is asking about. */
  itemId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
});
const EnquiryStatusSchema = z.object({ status: z.enum(['open', 'handled']) });
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
  constructor(@InjectDb() private db: Db, private svc: VenturesService, private audit: AuditService, private mail: MailService, private solar: SolarService, private connectors: ConnectorService) {}

  // ---------- Public ----------
  @Public()
  @Get('public/ventures')
  async publicList() {
    const rows = await this.db.select({ v: uniteVentures, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId))
      .where(and(eq(uniteVentures.open, true), or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt)))).orderBy(asc(uniteVentures.num));
    return rows.map((r) => { const { roles: _r, rewardNote: _n, ...v } = this.svc.view(r.v, r.company); return v; });
  }

  /** Product directory: every business that is not waiting for regulatory clearance, with its stage. */
  @Public()
  @Get('public/products')
  async products() {
    const rows = await this.db.select({ v: uniteVentures, company: organizations.displayName }).from(uniteVentures).leftJoin(organizations, eq(organizations.id, uniteVentures.groupCompanyOrgId))
      .where(or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt))).orderBy(asc(uniteVentures.num));
    return rows.map((r) => { const { roles: _r, rewardNote: _n, ...v } = this.svc.view(r.v, r.company); return v; });
  }

  @Public()
  @Get('public/products/:slug')
  async product(@Param('slug') slug: string) {
    const r = await this.svc.bySlug(slug);
    if (!r || regulatedLocked(r.v)) throw new NotFoundException();
    const { roles: _r, rewardNote: _n, ...v } = this.svc.view(r.v, r.company);
    const related = await this.db.select().from(uniteVentures)
      .where(and(eq(uniteVentures.sector, r.v.sector), sql`${uniteVentures.id} <> ${r.v.id}`, or(isNull(uniteVentures.regulatedReason), isNotNull(uniteVentures.clearedAt)))).orderBy(asc(uniteVentures.num)).limit(4);
    // XPERT, Partimer and ZUPPO post work as COLLABIZ micro-contracts: show how many are open (counts only, no details).
    const work = (MICRO_SOURCES as readonly string[]).includes(slug)
      ? (await this.db.select({ open: sql<number>`count(*) filter (where ${microContracts.status} = 'open')::int`, done: sql<number>`count(*) filter (where ${microContracts.status} in ('paid', 'accepted'))::int` }).from(microContracts).where(eq(microContracts.source, slug)))[0]
      : null;
    const showcase = SHOWCASE[slug] === 'property' ? { kind: 'property' as const, items: await this.openProjects() }
      : SHOWCASE[slug] === 'courses' ? { kind: 'courses' as const, items: (await this.db.select().from(courses).where(eq(courses.status, 'published')).orderBy(courses.level, courses.title).limit(9))
        .map((c) => ({ id: c.id, title: c.title, summary: c.summary, level: c.level, minutes: c.minutes, modules: (c.modules as unknown[]).length })) }
      : null;
    const connector = await this.connectors.forPage(slug);
    return { ...v, work, showcase, connector, related: related.map((x) => ({ slug: x.slug, name: x.name, sector: x.sector, tagline: x.tagline, stage: x.stage })) };
  }

  /** Enquiry from a business page. Stored with the business; its operating company (or Unite admins) is notified. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('public/products/:slug/enquiries')
  @HttpCode(201)
  async productEnquiry(@Param('slug') slug: string, @Body(body(BusinessEnquirySchema)) b: z.infer<typeof BusinessEnquirySchema>) {
    const r = await this.svc.bySlug(slug);
    if (!r || regulatedLocked(r.v)) throw new NotFoundException();
    let details: { projectId: string; projectName: string; visitDate: string | null } | null = null;
    if (b.projectId || b.visitDate) {
      if (SHOWCASE[slug] !== 'property') throw new BadRequestException('Site visits are only for property businesses');
      const project = b.projectId ? (await this.openProjects()).find((x) => x.id === b.projectId) : undefined;
      if (!project) throw new BadRequestException('Choose one of the projects listed on this page');
      if (b.visitDate) {
        const today = new Date().toISOString().slice(0, 10); const max = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
        if (b.visitDate < today || b.visitDate > max) throw new BadRequestException('Choose a visit date in the next 90 days');
      }
      details = { projectId: project.id, projectName: project.name, visitDate: b.visitDate ?? null };
    }
    let item: Awaited<ReturnType<ConnectorService['find']>> = null;
    if (b.itemId) {
      item = await this.connectors.find(slug, b.itemId);
      if (!item) throw new BadRequestException('Choose one of the items listed on this page');
    }
    const reference = `BIZ-${new Date().getFullYear()}-${randomDigits(6)}`;
    // Partner attribution: only a partner's personal code counts (house and customer codes do not).
    const [code] = b.ref ? await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.code, b.ref)).limit(1) : [];
    const introducer = code?.ownerUserId ? code : null;
    await this.db.insert(enquiries).values({ reference, name: b.name, email: b.email, organization: b.organization, topic: 'business', message: b.message, ventureId: r.v.id, kind: b.kind, phone: b.phone, city: b.city, referralCodeId: introducer?.id ?? null, details: item ? { ...(details ?? {}), item: { type: item.type, id: item.id, title: item.title } } : details });
    if (introducer?.ownerOrgId) {
      const team = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, introducer.ownerOrgId), eq(memberships.status, 'active')));
      if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.userId, kind: 'venture', title: `Your ${r.v.name} link brought an enquiry`, body: `${b.name.split(' ')[0]}${b.city ? ` · ${b.city}` : ''} (${reference}). It is recorded as introduced by you.`, link: `/ventures/${r.v.slug}` })));
    }
    // Introduction to the item's owner: what was asked about and from where — never the visitor's contact details.
    if (item?.ownerOrgId) {
      const team = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, item.ownerOrgId), eq(memberships.status, 'active')));
      if (team.length) await this.db.insert(notifications).values(team.map((m) => ({ userId: m.userId, kind: 'venture', title: `${r.v.name}: interest in “${item!.title}”`, body: `A visitor${b.city ? ` from ${b.city}` : ''} asked about your listing through ${r.v.name} (${reference}). The ${r.v.name} team will introduce you.`, link: '/notifications' })));
    }
    const label = details?.visitDate ? 'site-visit request' : b.kind === 'partner' ? 'partnership enquiry' : b.kind === 'interest' ? 'registration of interest' : 'enquiry';
    await this.mail.send('email', b.email, `${r.v.name} ${label} ${reference}`, `Thank you ${b.name}. ${r.v.name} received your ${label} (${reference}). The team will reply by email.`);
    const users = await this.svc.deciders(r.v);
    if (users.length) await this.db.insert(notifications).values(users.map((u) => ({ userId: u, kind: 'venture', title: `New ${label} for ${r.v.name}`, body: `${b.name}${b.city ? ` · ${b.city}` : ''}${item ? ` · about “${item.title}”` : ''}${details ? ` · ${details.projectName}${details.visitDate ? ` on ${details.visitDate}` : ''}` : ''}: ${b.message.slice(0, 160)}`, link: `/ventures/${r.v.id}` })));
    return { reference };
  }

  /** Unite property projects open to partners and selling: public facts only (no commission, no buyer data). */
  private async openProjects() {
    const ps = await this.db.select().from(propertyProjects).where(and(eq(propertyProjects.openToPartners, true), eq(propertyProjects.status, 'selling'))).orderBy(asc(propertyProjects.name)).limit(12);
    if (!ps.length) return [];
    const us = await this.db.select({ projectId: propertyUnits.projectId, price: propertyUnits.price, status: propertyUnits.status }).from(propertyUnits).where(inArray(propertyUnits.projectId, ps.map((p) => p.id)));
    return ps.map((p) => {
      const avail = us.filter((u) => u.projectId === p.id && u.status === 'available').map((u) => u.price);
      return { id: p.id, name: p.name, kind: p.kind, city: p.city, region: p.region, reraNumber: p.reraNumber, available: avail.length, priceFrom: avail.length ? Math.min(...avail) : null, priceTo: avail.length ? Math.max(...avail) : null };
    });
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
    const code = await this.solar.codeFor(ctx.userId, ctx.orgId ?? null);
    const [intro] = await this.db.select({ n: sql<number>`count(*)::int`, converted: sql<number>`count(*) filter (where ${enquiries.crmDealId} is not null)::int` }).from(enquiries)
      .where(and(eq(enquiries.ventureId, r.v.id), eq(enquiries.referralCodeId, code.id)));
    return { ...this.svc.view(r.v, r.company), myLink: { code: code.code, path: `/businesses/${r.v.slug}?ref=${code.code}`, enquiries: intro.n, converted: intro.converted }, myInterest: interest ? { status: interest.status, roles: interest.roles, regions: interest.regions, message: interest.message, decisionNote: interest.decisionNote } : null, offers, promoters: promoters.n };
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
      enquiries: (await this.db.select({ e: enquiries, by: solarReferralCodes.ownerName, byOrg: organizations.displayName }).from(enquiries)
        .leftJoin(solarReferralCodes, eq(solarReferralCodes.id, enquiries.referralCodeId)).leftJoin(organizations, eq(organizations.id, solarReferralCodes.ownerOrgId))
        .where(eq(enquiries.ventureId, id)).orderBy(desc(enquiries.createdAt)).limit(100))
        .map(({ e, by, byOrg }) => ({ id: e.id, reference: e.reference, kind: e.kind, name: e.name, email: e.email, phone: e.phone, city: e.city, organization: e.organization, message: e.message, status: e.status, createdAt: e.createdAt, introducedBy: by ? (byOrg ? `${by} · ${byOrg}` : by) : null, crmDealId: e.crmDealId, details: e.details })),
    };
  }

  @Post('admin/ventures/:id/enquiries/:eid/status')
  @RequireCaps('opportunity.publish')
  async enquiryStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('eid', ParseUUIDPipe) eid: string, @Body(body(EnquiryStatusSchema)) b: z.infer<typeof EnquiryStatusSchema>) {
    const [v] = await this.db.select().from(uniteVentures).where(eq(uniteVentures.id, id)).limit(1);
    if (!v) throw new NotFoundException();
    if (!this.svc.canManage(ctx, v)) throw new ForbiddenException('Only the operating company or a super admin can handle these enquiries');
    const [e] = await this.db.update(enquiries).set({ status: b.status }).where(and(eq(enquiries.id, eid), eq(enquiries.ventureId, id))).returning();
    if (!e) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'venture.enquiry_status', objectType: 'enquiry', objectId: eid, after: { status: b.status } });
    return { status: e.status };
  }

  /**
   * LeadDNA hand-off: a website enquiry becomes a customer and a "new" deal in the operating company's CRM pipeline.
   * The introducing partner (if any) is recorded on the deal's activity history; any reward follows that partner's
   * signed agreement — nothing is paid automatically.
   */
  @Post('admin/ventures/:id/enquiries/:eid/convert')
  @RequireCaps('opportunity.publish')
  @HttpCode(201)
  async convertEnquiry(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('eid', ParseUUIDPipe) eid: string) {
    const [v] = await this.db.select().from(uniteVentures).where(eq(uniteVentures.id, id)).limit(1);
    if (!v) throw new NotFoundException();
    if (!this.svc.canManage(ctx, v)) throw new ForbiddenException('Only the operating company or a super admin can convert these enquiries');
    if (!v.groupCompanyOrgId) throw new ConflictException(`Assign an operating company to ${v.name} first — its CRM receives the lead`);
    const [e] = await this.db.select().from(enquiries).where(and(eq(enquiries.id, eid), eq(enquiries.ventureId, id))).limit(1);
    if (!e) throw new NotFoundException();
    if (e.crmDealId) throw new ConflictException('This enquiry is already in the CRM pipeline');
    const [code] = e.referralCodeId ? await this.db.select({ c: solarReferralCodes, org: organizations.displayName }).from(solarReferralCodes).leftJoin(organizations, eq(organizations.id, solarReferralCodes.ownerOrgId)).where(eq(solarReferralCodes.id, e.referralCodeId)).limit(1) : [];
    const org = v.groupCompanyOrgId;
    const [c] = await this.db.insert(customers).values({ organizationId: org, legalName: e.organization ?? e.name, contactName: e.name, contactEmail: e.email, contactPhone: e.phone, city: e.city,
      consentProvenance: { method: 'website_enquiry', reference: e.reference, obtainedAt: e.createdAt.toISOString(), disclosureScope: 'restricted' }, restrictedContacts: true }).returning();
    const kind = e.kind === 'partner' ? 'partnership' : e.kind === 'interest' ? 'launch interest' : 'customer enquiry';
    const [d] = await this.db.insert(crmDeals).values({ organizationId: org, customerId: c.id, title: `${v.name}: ${kind} — ${e.name}`, ownerUserId: ctx.userId }).returning();
    const notes = [`Created from website enquiry ${e.reference} on the ${v.name} page.`, `Message: ${e.message}`];
    const det = e.details as { projectName?: string; visitDate?: string | null } | null;
    if (det?.projectName) notes.push(`Project: ${det.projectName}${det.visitDate ? ` — preferred site visit ${det.visitDate}` : ''}.`);
    if (code) notes.push(`Introduced by ${code.c.ownerName}${code.org ? ` (${code.org})` : ''} through their partner link. Any reward follows their signed agreement.`);
    await this.db.insert(crmActivities).values(notes.map((body) => ({ organizationId: org, subjectType: 'deal', subjectId: d.id, kind: 'system', body, actorUserId: ctx.userId })));
    await this.db.update(enquiries).set({ crmDealId: d.id, status: 'handled' }).where(eq(enquiries.id, eid));
    await this.audit.record(ctx, { action: 'venture.enquiry_converted', objectType: 'enquiry', objectId: eid, after: { dealId: d.id, organizationId: org } });
    return { dealId: d.id, customerId: c.id };
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

@Module({ imports: [SolarModule], controllers: [VenturesController], providers: [VenturesService, ConnectorService] })
export class VenturesModule {}
