/**
 * UNITE INDUSTRY CLUB — OEM products under the Unite Powertek brand, free-power bundles, buying green power, member pages
 * (tested in test/club.e2e.ts).
 *
 *  - Members draft products; only a verified business submits. Only Unite staff approve, and approval needs every check
 *    including a signed brand licence (signed outside COLLABIZ and recorded here). No fee or royalty is charged here: terms
 *    live in the licence.
 *  - Approval publishes ONE item in the Unite Powertek catalogue, so the existing product-sales flow (any partner can sell,
 *    commissions by rule) handles sales. The maker's identity stays in the club record; the catalogue shows the brand.
 *  - Power requests go to the energy desk; COLLABIZ does not sell power itself and quotes no tariff here.
 *  - A member page is public only when the member switches it on, and shows only approved products.
 */
import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  disputeText, marketsLabel, CLUB_BRAND_OPTIONS, CLUB_POWER_NEEDS, CLUB_POWER_STATUS, CLUB_PRODUCT_STATUS, ClubPowerRequestSchema, ClubPowerStatusSchema, ClubProductSchema, ClubReviewSchema, sectorName, type SectorCode,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { catalogItems, clubPowerRequests, clubProducts, collabJoinProfiles, groupCompanies, memberships, notifications, organizations } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';
import { ClubLegalService } from './club-agreements.controller';

type Product = typeof clubProducts.$inferSelect;
const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const hist = (by: string, status: string, note?: string | null) => sql`history || ${JSON.stringify([{ at: new Date().toISOString(), by, status, note: note ?? null }])}::jsonb`;
const brandLabel = (b: string) => CLUB_BRAND_OPTIONS.find((o) => o.code === b)?.label ?? b;
const money = (minor: number | null, cur: string) => (minor == null ? 'Not stated' : `${cur} ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
const code = (p: string) => `${p}-${new Date().getFullYear()}-${randomDigits(6)}`;

@ApiTags('club')
@Controller()
export class ClubController {
  constructor(@InjectDb() private db: Db, private audit: AuditService, private legal: ClubLegalService) {}

  private org(ctx: RequestContext) {
    if (!ctx.orgId) throw new ForbiddenException('Create or choose your business account first');
    return ctx.orgId;
  }
  private manager(ctx: RequestContext, orgId: string) {
    return ctx.memberships.some((m) => m.organizationId === orgId && (m.role === 'org_owner' || m.role === 'org_admin'));
  }
  private view(p: Product, extra: Record<string, unknown> = {}) {
    return { ...p, statusLabel: CLUB_PRODUCT_STATUS[p.status as keyof typeof CLUB_PRODUCT_STATUS] ?? p.status, brandLabel: brandLabel(p.brandOption), sectorName: sectorName(p.sector as SectorCode), ...extra };
  }
  private async mine(ctx: RequestContext, id: string) {
    const orgId = this.org(ctx);
    const [p] = await this.db.select().from(clubProducts).where(and(eq(clubProducts.id, id), eq(clubProducts.orgId, orgId))).limit(1);
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }
  private async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    if (ms.length) await this.db.insert(notifications).values(ms.map((m) => ({ userId: m.u, kind: 'announcement', title, body: text, link })));
  }

  // ------------------------------------------------------------------ OEM products (member)
  @Get('club/products')
  @RequireOrg()
  async list(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(clubProducts).where(eq(clubProducts.orgId, this.org(ctx))).orderBy(desc(clubProducts.createdAt));
    return { items: rows.map((r) => this.view(r)), canEdit: this.manager(ctx, ctx.orgId!), verified: ctx.orgVerificationStatus === 'verified' };
  }

  @Post('club/products')
  @RequireOrg()
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(ClubProductSchema)) b: z.infer<typeof ClubProductSchema>) {
    const orgId = this.org(ctx);
    if (!this.manager(ctx, orgId)) throw new ForbiddenException('Only the owner or an admin of your business can submit products');
    const n = await this.db.$count(clubProducts, and(eq(clubProducts.orgId, orgId), inArray(clubProducts.status, ['draft', 'submitted', 'licence_pending', 'approved'])));
    if (n >= 50) throw new ConflictException('You can have up to 50 products in the club. Withdraw one first.');
    const [p] = await this.db.insert(clubProducts).values({ ...b, powerOffer: b.powerFree ? b.powerOffer : null, code: code('ICP'), orgId, createdBy: ctx.userId!, history: [{ at: new Date().toISOString(), by: ctx.userId, status: 'draft' }] }).returning();
    await this.audit.record(ctx, { action: 'club.product_created', objectType: 'club_product', objectId: p.id, after: { name: p.name, brandOption: p.brandOption } });
    return this.view(p);
  }

  @Patch('club/products/:id')
  @RequireOrg()
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ClubProductSchema)) b: z.infer<typeof ClubProductSchema>) {
    const p = await this.mine(ctx, id);
    if (!this.manager(ctx, p.orgId)) throw new ForbiddenException();
    if (!['draft', 'rejected'].includes(p.status)) throw new ConflictException('Only drafts or products that were not approved can be edited. Withdraw it first to change an approved product.');
    const [u] = await this.db.update(clubProducts).set({ ...b, powerOffer: b.powerFree ? b.powerOffer : null, status: 'draft', updatedAt: new Date() }).where(eq(clubProducts.id, id)).returning();
    return this.view(u);
  }

  @Post('club/products/:id/submit')
  @RequireOrg()
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.mine(ctx, id);
    if (!this.manager(ctx, p.orgId)) throw new ForbiddenException();
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Complete your business verification (KYB) before submitting products for the Unite brand');
    await this.legal.assertTerms(p.orgId);
    if (!['draft', 'rejected'].includes(p.status)) throw new ConflictException(`This product is already ${CLUB_PRODUCT_STATUS[p.status as keyof typeof CLUB_PRODUCT_STATUS].toLowerCase()}`);
    const [u] = await this.db.update(clubProducts).set({ status: 'submitted', history: hist(ctx.userId!, 'submitted'), updatedAt: new Date() }).where(eq(clubProducts.id, id)).returning();
    await this.audit.record(ctx, { action: 'club.product_submitted', objectType: 'club_product', objectId: id });
    return this.view(u);
  }

  @Post('club/products/:id/withdraw')
  @RequireOrg()
  async withdraw(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.mine(ctx, id);
    if (!this.manager(ctx, p.orgId)) throw new ForbiddenException();
    if (p.status === 'withdrawn') return this.view(p);
    // An approved product leaves the Powertek catalogue at once (archived, so past enquiries keep their history).
    if (p.catalogItemId) await this.db.update(catalogItems).set({ status: 'archived', updatedAt: new Date() }).where(eq(catalogItems.id, p.catalogItemId));
    const [u] = await this.db.update(clubProducts).set({ status: 'withdrawn', history: hist(ctx.userId!, 'withdrawn'), updatedAt: new Date() }).where(eq(clubProducts.id, id)).returning();
    await this.audit.record(ctx, { action: 'club.product_withdrawn', objectType: 'club_product', objectId: id, before: { status: p.status } });
    return this.view(u);
  }

  // ------------------------------------------------------------------ OEM products (Unite review)
  @Get('admin/club/products')
  async adminList(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins review club products');
    const rows = await this.db.select({ p: clubProducts, maker: organizations.displayName, verification: organizations.verificationStatus }).from(clubProducts)
      .innerJoin(organizations, eq(organizations.id, clubProducts.orgId)).where(status ? eq(clubProducts.status, status) : sql`${clubProducts.status} <> 'draft'`).orderBy(desc(clubProducts.updatedAt)).limit(200);
    return { items: rows.map((r) => this.view(r.p, { maker: r.maker, makerVerification: r.verification })) };
  }

  @Post('admin/club/products/:id/review')
  async review(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ClubReviewSchema)) b: z.infer<typeof ClubReviewSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins review club products');
    const [p] = await this.db.select().from(clubProducts).where(eq(clubProducts.id, id)).limit(1);
    if (!p) throw new NotFoundException('Product not found');
    if (p.status !== 'submitted') throw new ConflictException('Only submitted products can be reviewed');
    let contract: { id: string; code: string; pilotDraft: boolean } | null = null;
    if (b.decision === 'approve') {
      const licensor = await this.legal.licensorOrgId();
      const [L, M] = await Promise.all([this.legal.party(licensor), this.legal.party(p.orgId)]);
      contract = await this.legal.issue(ctx, {
        type: 'brand_licence', code: 'club_brand_licence', fromOrgId: licensor, toOrgId: p.orgId, productId: p.id, title: `Brand Licence and OEM Supply Agreement — ${p.name}`,
        terms: { termMonths: b.licence.termMonths, warrantyMonths: b.licence.warrantyMonths, dispute: b.licence.dispute },
        vars: {
          licensor: L, licensee: { ...M, country: M.country }, brand: { name: p.brandOption === 'unite_powertek' ? '“Unite Powertek” (name and logo)' : '“Powered by Unite” (badge)' },
          territory: marketsLabel(p.markets), termMonths: b.licence.termMonths, warrantyMonths: b.licence.warrantyMonths, dispute: disputeText(b.licence.dispute), commercial: b.licence.commercial,
          powerBundle: p.powerFree ? 'The Product is offered with the free-power bundle in Schedule B. The Licensee is responsible for that offer to customers; the solar system is supplied under separate terms by Unite Solar or an installer approved by the Licensor. No party will promise customers a specific saving unless it is calculated for that customer and labelled as an estimate.' : 'No free-power bundle applies to the Product.',
          product: { code: p.code, name: p.name, category: p.category, description: p.description, certifications: p.certifications.length ? p.certifications.join(', ') : 'None declared', capacity: p.monthlyCapacity ? `${p.monthlyCapacity.toLocaleString('en-IN')} ${p.unit ?? 'units'} a month` : 'Not declared', mrp: money(p.mrp, p.currency), powerOffer: p.powerFree && p.powerOffer ? p.powerOffer : 'Not applicable.' },
        },
      });
    }
    const to = b.decision === 'approve' ? 'licence_pending' : 'rejected';
    const [u] = await this.db.update(clubProducts).set({ status: to, checks: b.checks, reviewNote: b.note ?? null, reviewedBy: ctx.userId, reviewedAt: new Date(), contractId: contract?.id ?? null, history: hist(ctx.userId!, to, b.note), updatedAt: new Date() })
      .where(and(eq(clubProducts.id, id), eq(clubProducts.status, 'submitted'))).returning();
    await this.audit.record(ctx, { action: `club.product_${to}`, objectType: 'club_product', objectId: id, after: { checks: b.checks, contractId: contract?.id ?? null } });
    await this.notifyOrg(p.orgId, `${p.name}: ${CLUB_PRODUCT_STATUS[to]}`, b.decision === 'approve' ? `Unite approved your product. Review and sign the brand licence ${contract!.code}; the product is listed as soon as both sides have signed.` : `Reason: ${b.note}`, b.decision === 'approve' ? `/vault?contract=${contract!.id}` : '/club/products');
    return this.view(u, { contract });
  }

  // ------------------------------------------------------------------ Buy power
  @Get('club/power-requests')
  @RequireOrg()
  async powerList(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(clubPowerRequests).where(eq(clubPowerRequests.orgId, this.org(ctx))).orderBy(desc(clubPowerRequests.createdAt));
    return { items: rows.map((r) => ({ ...r, needLabel: CLUB_POWER_NEEDS.find((n) => n.code === r.need)?.label ?? r.need, statusLabel: CLUB_POWER_STATUS[r.status as keyof typeof CLUB_POWER_STATUS] ?? r.status })) };
  }

  @Post('club/power-requests')
  @RequireOrg()
  @HttpCode(201)
  async powerCreate(@Ctx() ctx: RequestContext, @Body(body(ClubPowerRequestSchema)) b: z.infer<typeof ClubPowerRequestSchema>) {
    const orgId = this.org(ctx);
    const open = await this.db.$count(clubPowerRequests, and(eq(clubPowerRequests.orgId, orgId), inArray(clubPowerRequests.status, ['new', 'in_progress'])));
    if (open >= 5) throw new ConflictException('You already have 5 open power requests. The energy desk will contact you.');
    const [r] = await this.db.insert(clubPowerRequests).values({ ...b, code: code('PWR'), orgId, createdBy: ctx.userId!, history: [{ at: new Date().toISOString(), by: ctx.userId, status: 'new' }] }).returning();
    await this.audit.record(ctx, { action: 'club.power_requested', objectType: 'club_power_request', objectId: r.id, after: { need: b.need, state: b.state } });
    return r;
  }

  @Get('admin/club/power-requests')
  async powerAdmin(@Ctx() ctx: RequestContext) {
    if (!staff(ctx)) throw new ForbiddenException();
    const rows = await this.db.select({ r: clubPowerRequests, org: organizations.displayName }).from(clubPowerRequests).innerJoin(organizations, eq(organizations.id, clubPowerRequests.orgId)).orderBy(desc(clubPowerRequests.createdAt)).limit(200);
    return { items: rows.map(({ r, org }) => ({ ...r, organization: org, needLabel: CLUB_POWER_NEEDS.find((n) => n.code === r.need)?.label ?? r.need, statusLabel: CLUB_POWER_STATUS[r.status as keyof typeof CLUB_POWER_STATUS] ?? r.status })) };
  }

  @Post('admin/club/power-requests/:id/status')
  async powerStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ClubPowerStatusSchema)) b: z.infer<typeof ClubPowerStatusSchema>) {
    if (!staff(ctx)) throw new ForbiddenException();
    const [r] = await this.db.update(clubPowerRequests).set({ status: b.to, history: hist(ctx.userId!, b.to, b.note), updatedAt: new Date() }).where(eq(clubPowerRequests.id, id)).returning();
    if (!r) throw new NotFoundException();
    await this.notifyOrg(r.orgId, `Power request ${r.code}: ${CLUB_POWER_STATUS[b.to]}`, b.note ?? 'The Unite energy desk updated your request.', '/club/power');
    return r;
  }

  // ------------------------------------------------------------------ Public
  /** Approved club products (brand view; the maker is shown only on its own opted-in member page). */
  @Public()
  @Get('public/club/products')
  async publicProducts() {
    const rows = await this.db.select().from(clubProducts).where(eq(clubProducts.status, 'approved')).orderBy(desc(clubProducts.reviewedAt)).limit(60);
    return { items: rows.map((p) => ({ id: p.catalogItemId, code: p.code, name: p.brandOption === 'unite_powertek' ? `Unite Powertek ${p.name}` : p.name, category: p.category, brand: brandLabel(p.brandOption), powerFree: p.powerFree, powerOffer: p.powerOffer })) };
  }

  /** A member's own page — only when switched on. */
  @Public()
  @Get('public/club/members/:slug')
  async member(@Param('slug') slug: string) {
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw new NotFoundException();
    const [m] = await this.db.select({ j: collabJoinProfiles, name: organizations.displayName, verified: organizations.verificationStatus }).from(collabJoinProfiles)
      .innerJoin(organizations, eq(organizations.id, collabJoinProfiles.orgId)).where(and(eq(collabJoinProfiles.slug, slug), eq(collabJoinProfiles.micrositePublic, true))).limit(1);
    if (!m) throw new NotFoundException('This business page is not public');
    const products = await this.db.select().from(clubProducts).where(and(eq(clubProducts.orgId, m.j.orgId), eq(clubProducts.status, 'approved')));
    return {
      name: m.name, verified: m.verified === 'verified', sector: m.j.sector, sectorName: sectorName(m.j.sector as SectorCode), city: m.j.city, about: m.j.about,
      products: products.map((p) => ({ name: p.name, category: p.category, brand: brandLabel(p.brandOption), powerFree: p.powerFree, powerOffer: p.powerOffer, description: p.description })),
    };
  }
}

/** URL-safe page address for a member page, unique per organisation. */
export const memberSlug = (name: string, orgId: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'member'}-${orgId.slice(0, 6)}`;
