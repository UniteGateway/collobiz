import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CatalogItemSchema, GroupCompanySchema, patchOf, SECTOR_CODES } from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import { businessUnits, catalogItems, groupCompanies, organizations, successStories, enquiryMessages, tradeEnquiries } from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, OptionalCtx, Public, RequireCaps, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { MailService, StorageService } from '../../common/adapters';
import { randomDigits } from '../../common/crypto';
import { canSeePrice, viewerOf, type Viewer } from '../../common/viewer';

type Item = typeof catalogItems.$inferSelect;

/** Visibility filter: public → everyone; partners → signed-in partner orgs; private → owner org + platform. Drafts → owner/platform only. */
function visibleTo(v: Viewer): SQL {
  if (v.platform) return sql`true`;
  const own = v.memberOf.size ? inArray(catalogItems.ownerOrgId, [...v.memberOf]) : sql`false`;
  const pub = and(eq(catalogItems.status, 'published'), v.partner ? inArray(catalogItems.visibility, ['public', 'partners']) : eq(catalogItems.visibility, 'public'))!;
  return or(pub, own)!;
}
function present(i: Item & { ownerName?: string | null }, v: Viewer) {
  const show = canSeePrice(v, i.priceVisibility, i.ownerOrgId);
  return {
    id: i.id, kind: i.kind, name: i.name, sector: i.sector, description: i.description, sku: i.sku, unit: i.unit, specs: i.specs, status: i.status, visibility: i.visibility,
    ownerOrgId: i.ownerOrgId, ownerName: i.ownerName ?? null, currency: i.currency, priceVisibility: i.priceVisibility,
    image: i.imageKey ? `/api/v1/catalog/${i.id}/image` : null,
    listPrice: show ? i.listPrice : null,
    priceNote: show ? null : i.priceVisibility === 'on_request' ? 'Price on request' : i.priceVisibility === 'certified_partners' ? 'Visible to certified partners' : 'Visible to verified partners',
  };
}

/** Screens 004, 005, 008, 039 (public & partner catalogue). */
@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(@InjectDb() private db: Db, private mail: MailService, private audit: AuditService, private storage: StorageService) {}

  @Public()
  @Get('public/group-companies')
  async groupCompanies() {
    return this.db.select({
      id: organizations.id, brandName: groupCompanies.brandName, legalName: organizations.legalName, legalEntityCode: groupCompanies.legalEntityCode, city: organizations.city, country: organizations.country,
      sectors: groupCompanies.sectors, description: groupCompanies.description, website: groupCompanies.website,
      publishedItems: sql<number>`(select count(*)::int from catalog_items c where c.owner_org_id = ${organizations.id} and c.status = 'published' and c.visibility = 'public')`,
    }).from(groupCompanies).innerJoin(organizations, eq(organizations.id, groupCompanies.organizationId)).where(and(eq(groupCompanies.status, 'active'), eq(groupCompanies.listedPublicly, true))).orderBy(groupCompanies.brandName);
  }

  @Public()
  @Get('catalog')
  async list(@OptionalCtx() ctx: RequestContext | null, @Query('q') q?: string, @Query('sector') sector?: string, @Query('kind') kind?: string, @Query('owner') owner?: string, @Query('limit') limit = '60') {
    const v = viewerOf(ctx);
    const conds: SQL[] = [visibleTo(v), sql`${catalogItems.status} <> 'archived'`];
    if (q) conds.push(or(sql`to_tsvector('english', ${catalogItems.name} || ' ' || ${catalogItems.description}) @@ plainto_tsquery('english', ${q})`, ilike(catalogItems.name, `%${q}%`))!);
    if (sector) conds.push(eq(catalogItems.sector, sector));
    if (kind) conds.push(eq(catalogItems.kind, kind));
    if (owner) conds.push(eq(catalogItems.ownerOrgId, owner));
    const rows = await this.db.select({ item: catalogItems, ownerName: organizations.displayName }).from(catalogItems).innerJoin(organizations, eq(organizations.id, catalogItems.ownerOrgId))
      .where(and(...conds)).orderBy(desc(catalogItems.updatedAt)).limit(Math.min(200, Number(limit) || 60));
    return rows.map((r) => present({ ...r.item, ownerName: r.ownerName }, v));
  }

  /** 039 — product & service detail. Non-visible items return 404 (no existence leak). */
  @Public()
  @Get('catalog/:id')
  async detail(@OptionalCtx() ctx: RequestContext | null, @Param('id', ParseUUIDPipe) id: string) {
    const v = viewerOf(ctx);
    const [r] = await this.db.select({ item: catalogItems, ownerName: organizations.displayName }).from(catalogItems).innerJoin(organizations, eq(organizations.id, catalogItems.ownerOrgId))
      .where(and(eq(catalogItems.id, id), visibleTo(v))).limit(1);
    if (!r) throw new NotFoundException('Item not found');
    const related = await this.db.select({ id: catalogItems.id, name: catalogItems.name, kind: catalogItems.kind }).from(catalogItems)
      .where(and(eq(catalogItems.sector, r.item.sector), sql`${catalogItems.id} <> ${id}`, visibleTo(v), eq(catalogItems.status, 'published'))).limit(4);
    return { ...present({ ...r.item, ownerName: r.ownerName }, v), related };
  }

  /** Product photo — served only if the viewer can see the item; types checked by magic bytes. */
  @Public()
  @Get('catalog/:id/image')
  async image(@OptionalCtx() ctx: RequestContext | null, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const v = viewerOf(ctx);
    const [r] = await this.db.select({ key: catalogItems.imageKey, visibility: catalogItems.visibility }).from(catalogItems).where(and(eq(catalogItems.id, id), visibleTo(v))).limit(1);
    if (!r?.key) throw new NotFoundException('No image');
    const buf = await this.storage.get(r.key).catch(() => null);
    if (!buf) throw new NotFoundException('No image');
    const head = buf.subarray(0, 4).toString('latin1');
    const type = head.startsWith('\x89PNG') ? 'image/png' : head.startsWith('RIFF') ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', r.visibility === 'public' ? 'public, max-age=86400' : 'private, max-age=3600');
    res.end(buf);
  }

  /** 039 — "Request price / quotation": routes to the owning company; full enquiry desk in Stage 11 (088). */
  @Post('catalog/:id/price-request')
  @HttpCode(201)
  async priceRequest(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ quantity: z.string().trim().min(1).max(120), message: z.string().trim().max(2000).optional() }))) b: { quantity: string; message?: string }) {
    const v = viewerOf(ctx);
    const [i] = await this.db.select().from(catalogItems).where(and(eq(catalogItems.id, id), visibleTo(v))).limit(1);
    if (!i) throw new NotFoundException('Item not found');
    if (!v.partner) throw new ForbiddenException('Create a partner account to request prices');
    const reference = `PRQ-${randomDigits(8)}`;
    // Also open an enquiry thread on the 088 desk so the owning company can reply and quote.
    if (ctx.orgId && ctx.orgId !== i.ownerOrgId) {
      const [e] = await this.db.insert(tradeEnquiries).values({ code: `ENQ-${new Date().getUTCFullYear()}-${randomDigits(6)}`, buyerOrgId: ctx.orgId, supplierOrgId: i.ownerOrgId, catalogItemId: i.id, subject: i.name, quantity: b.quantity, createdBy: ctx.userId }).returning();
      await this.db.insert(enquiryMessages).values({ enquiryId: e.id, authorOrgId: ctx.orgId, authorUserId: ctx.userId, body: b.message?.trim() || `Price request for ${b.quantity}` });
    }
    await this.mail.send('email', `catalog-owner:${i.ownerOrgId}`, `Price request ${reference}: ${i.name}`, `Quantity: ${b.quantity}\n${b.message ?? ''}`, { itemId: id, fromOrg: ctx.orgId });
    await this.audit.record(ctx, { action: 'catalog.price_requested', objectType: 'catalog_item', objectId: id, after: { reference, quantity: b.quantity } });
    return { reference };
  }

  @Public()
  @Get('public/success-stories')
  stories(@Query('sector') sector?: string) {
    return this.db.select().from(successStories).where(and(eq(successStories.status, 'published'), eq(successStories.partnerConsent, true), sector ? eq(successStories.sector, sector) : undefined)).orderBy(desc(successStories.publishedAt));
  }

  @Public()
  @Get('public/success-stories/:id')
  async story(@Param('id', ParseUUIDPipe) id: string) {
    const [s] = await this.db.select().from(successStories).where(and(eq(successStories.id, id), eq(successStories.status, 'published'), eq(successStories.partnerConsent, true))).limit(1);
    if (!s) throw new NotFoundException();
    return s;
  }
}

const ItemPatch = patchOf(CatalogItemSchema);

/** Screens 128 (group companies & business units) and 136 (catalogue management). */
@ApiTags('admin')
@Controller('admin')
export class AdminCatalogController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  /** Unite admins manage only their own group companies; super admin manages all. */
  private manageable(ctx: RequestContext): string[] | 'all' {
    if (ctx.platformRoles.includes('super_admin')) return 'all';
    return ctx.memberships.filter((m) => m.orgType === 'group_company').map((m) => m.organizationId);
  }
  private assertOwner(ctx: RequestContext, orgId: string) {
    const m = this.manageable(ctx);
    if (m !== 'all' && !m.includes(orgId)) throw new ForbiddenException('You can only manage catalogue items of your own group company');
  }

  @Get('group-companies')
  @RequireCaps('catalog.manage')
  async companies() {
    return this.db.select({ org: organizations, gc: groupCompanies, units: sql<number>`(select count(*)::int from business_units b where b.organization_id = ${organizations.id})` })
      .from(organizations).leftJoin(groupCompanies, eq(groupCompanies.organizationId, organizations.id)).where(eq(organizations.type, 'group_company')).orderBy(organizations.displayName);
  }

  @Post('group-companies')
  @RequireCaps('group.manage')
  @HttpCode(201)
  async createCompany(@Ctx() ctx: RequestContext, @Body(body(GroupCompanySchema)) b: z.infer<typeof GroupCompanySchema>) {
    return this.db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({ legalName: b.legalName, displayName: b.brandName, type: 'group_company', country: b.country, verificationStatus: 'verified', membershipLevel: 'strategic', createdBy: ctx.userId }).returning();
      const [gc] = await tx.insert(groupCompanies).values({ organizationId: org.id, legalEntityCode: b.legalEntityCode, brandName: b.brandName, sectors: b.sectors, billingIdentity: b.billingIdentity, description: b.description }).returning();
      await this.audit.record(ctx, { action: 'group_company.created', objectType: 'organization', objectId: org.id, after: b }, tx as unknown as Db);
      return { ...org, groupCompany: gc };
    });
  }

  @Patch('group-companies/:orgId')
  @RequireCaps('group.manage')
  async updateCompany(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(body(GroupCompanySchema.partial().extend({ status: z.enum(['active', 'inactive']).optional(), website: z.string().url().optional() }))) b: Record<string, unknown>) {
    const [before] = await this.db.select().from(groupCompanies).where(eq(groupCompanies.organizationId, orgId)).limit(1);
    if (!before) throw new NotFoundException();
    const { legalName, country, ...gc } = b as { legalName?: string; country?: string } & Record<string, unknown>;
    if (legalName || country) await this.db.update(organizations).set({ ...(legalName ? { legalName } : {}), ...(country ? { country } : {}), updatedAt: new Date() }).where(eq(organizations.id, orgId));
    const [after] = await this.db.update(groupCompanies).set({ ...gc, updatedAt: new Date() }).where(eq(groupCompanies.organizationId, orgId)).returning();
    await this.audit.record(ctx, { action: 'group_company.updated', objectType: 'organization', objectId: orgId, before, after });
    return after;
  }

  @Post('group-companies/:orgId/units')
  @RequireCaps('group.manage')
  @HttpCode(201)
  async addUnit(@Ctx() ctx: RequestContext, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(body(z.object({ name: z.string().trim().min(2).max(120), sectors: z.array(z.enum(SECTOR_CODES)).default([]) }))) b: { name: string; sectors: string[] }) {
    const [u] = await this.db.insert(businessUnits).values({ organizationId: orgId, ...b }).returning();
    await this.audit.record(ctx, { action: 'business_unit.created', objectType: 'business_unit', objectId: u.id, after: b });
    return u;
  }

  @Get('group-companies/:orgId/units')
  @RequireCaps('catalog.manage')
  units(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.db.select().from(businessUnits).where(eq(businessUnits.organizationId, orgId));
  }

  @Get('catalog')
  @RequireCaps('catalog.manage')
  async items(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    const m = this.manageable(ctx);
    if (m !== 'all' && !m.length) return [];
    return this.db.select({ item: catalogItems, ownerName: organizations.displayName }).from(catalogItems).innerJoin(organizations, eq(organizations.id, catalogItems.ownerOrgId))
      .where(and(m === 'all' ? undefined : inArray(catalogItems.ownerOrgId, m), status ? eq(catalogItems.status, status) : undefined)).orderBy(desc(catalogItems.updatedAt))
      .then((r) => r.map((x) => ({ ...x.item, ownerName: x.ownerName })));
  }

  @Post('catalog')
  @RequireCaps('catalog.manage')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(CatalogItemSchema.extend({ ownerOrgId: z.string().uuid() }))) b: z.infer<typeof CatalogItemSchema> & { ownerOrgId: string }) {
    this.assertOwner(ctx, b.ownerOrgId);
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, b.ownerOrgId)).limit(1);
    if (!org || org.type !== 'group_company') throw new BadRequestException('Owner must be a Unite Group company');
    if (b.priceVisibility !== 'on_request' && b.listPrice == null) throw new BadRequestException({ statusCode: 400, message: 'Enter a list price or choose "price on request"', issues: [{ path: 'listPrice', message: 'Required unless price is on request' }] });
    const [i] = await this.db.insert(catalogItems).values({ ...b, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'catalog.item_created', objectType: 'catalog_item', objectId: i.id, organizationId: b.ownerOrgId, after: b });
    return i;
  }

  @Patch('catalog/:id')
  @RequireCaps('catalog.manage')
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ItemPatch.extend({ status: z.enum(['draft', 'published', 'archived']).optional() }))) b: Partial<Item>) {
    const [before] = await this.db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1);
    if (!before) throw new NotFoundException();
    this.assertOwner(ctx, before.ownerOrgId);
    const [after] = await this.db.update(catalogItems).set({ ...b, updatedAt: new Date() }).where(eq(catalogItems.id, id)).returning();
    await this.audit.record(ctx, { action: b.status && b.status !== before.status ? `catalog.item_${b.status}` : 'catalog.item_updated', objectType: 'catalog_item', objectId: id, organizationId: before.ownerOrgId, before, after });
    return after;
  }

  @Post('success-stories')
  @RequireCaps('cms.manage')
  @HttpCode(201)
  async story(@Ctx() ctx: RequestContext, @Body(body(z.object({ title: z.string().trim().min(5).max(200), sector: z.enum(SECTOR_CODES), summary: z.string().trim().min(20).max(500), body: z.string().trim().min(50).max(10000), metrics: z.array(z.object({ label: z.string(), value: z.string() })).default([]), partnerOrgIds: z.array(z.string().uuid()).default([]), partnerConsent: z.boolean(), publish: z.boolean().default(false) }))) b: any) {
    if (b.publish && !b.partnerConsent) throw new BadRequestException('Partner consent is required before publishing a case study');
    const { publish, ...v } = b;
    const [s] = await this.db.insert(successStories).values({ ...v, status: publish ? 'published' : 'draft', publishedAt: publish ? new Date() : null, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'cms.story_created', objectType: 'success_story', objectId: s.id, after: { title: b.title, publish } });
    return s;
  }

}

@Module({ controllers: [CatalogController, AdminCatalogController] })
export class CatalogModule {}
