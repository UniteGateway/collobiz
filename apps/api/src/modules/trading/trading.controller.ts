/**
 * Stage 11b — Trading (screens 085–094).
 *
 * Controls that carry the Stage 11 gate into trading:
 *  - Purchase orders follow the shared state machine; every action is written to an append-only order history
 *    (trigger), and once an order is issued its lines, totals and parties are locked (trigger).
 *  - Goods receipt is recorded by the buyer line by line; shortages and damage are kept on the record and feed claims.
 *  - Damage and warranty claims need photo evidence; claims are time-boxed from delivery and the supplier has a
 *    response deadline; an unanswered or rejected claim can be escalated to COLLABIZ.
 *  - Quotation privacy: a supplier never sees another supplier's price; only the buyer compares.
 *  - Territories: a supplier cannot grant overlapping exclusive territories; enquiries from a region covered by an
 *    exclusive distributor are routed to that distributor, and the routing is shown to everyone involved.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { and, arrayContains, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  assertTransition, ClaimResponseSchema, ClaimSchema, EnquiryMessageSchema, EnquirySchema, GoodsReceiptSchema, patchOf, PoActionSchema, PoCancelSchema, PoMachine, PurchaseOrderSchema, QuotationSchema,
  RequirementSchema, ShipmentEventSchema, ShipmentSchema, SupplierProductSchema, TerritorySchema, type PoState,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  catalogItems, enquiryMessages, memberships, notifications, organizations, partnerProfiles, poEvents, projectChangeLog, projectMaterials, projectMembers, purchaseOrders, quotations, shipments, supplierProducts,
  territories, tradeClaims, tradeDocuments, tradeEnquiries, tradeRequirements, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';
import { Idempotent } from '../../common/idempotency';
import { MAX_UPLOAD_BYTES, StorageService } from '../../common/adapters';

type Po = typeof purchaseOrders.$inferSelect;
type Line = { item: string; quantity: number; unit: string; unitPrice: number; spec?: string };
const SUPPLIER_TYPES = ['trader', 'manufacturer', 'distributor'];
const OPEN_CLAIMS = ['open', 'accepted', 'escalated'];
const year = () => new Date().getUTCFullYear();
const today = () => new Date().toISOString().slice(0, 10);
const totals = (lines: Line[], taxPct: number) => {
  const subtotal = lines.reduce((a, l) => a + Math.round(l.quantity * l.unitPrice), 0);
  return { subtotal, total: subtotal + Math.round((subtotal * taxPct) / 100) };
};
const issues = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

@Injectable()
export class TradingService {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}

  async org(id: string) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return o ?? null;
  }
  isSupplier(o: typeof organizations.$inferSelect | null) {
    return !!o && o.verificationStatus === 'verified' && ['partner_company', 'partner_individual'].includes(o.type) && (o.partnerTypes ?? []).some((t) => SUPPLIER_TYPES.includes(t));
  }
  assertBuyer(ctx: RequestContext) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified organizations can buy on COLLABIZ');
    if (!ctx.caps.has('procurement.manage')) throw new ForbiddenException('You need procurement rights in your organization');
  }
  async assertSupplier(ctx: RequestContext) {
    if (!ctx.caps.has('procurement.manage')) throw new ForbiddenException('You need procurement rights in your organization');
    const o = await this.org(ctx.orgId!);
    if (!this.isSupplier(o)) throw new ForbiddenException('Only verified traders, manufacturers and distributors can sell');
    return o!;
  }
  async notifyOrg(orgId: string, title: string, text: string, link: string) {
    const ms = await this.db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.status, 'active')));
    for (const m of ms) await this.db.insert(notifications).values({ userId: m.userId, kind: 'trade', title, body: text, link });
  }
  async loadPo(ctx: RequestContext, id: string) {
    const [po] = await this.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    const side = po ? (ctx.orgId === po.buyerOrgId ? 'buyer' : ctx.orgId === po.supplierOrgId ? 'supplier' : null) : null;
    if (!po || !side) throw new NotFoundException('Order not found');
    return { po, side: side as 'buyer' | 'supplier' };
  }
  async setPo(ctx: RequestContext, po: Po, to: PoState, note?: string, extra: Partial<Po> = {}, data?: unknown, tx: Db = this.db) {
    assertTransition(PoMachine, po.status as PoState, to);
    const [u] = await tx.update(purchaseOrders).set({ ...extra, status: to, version: po.version + 1, updatedAt: new Date() }).where(and(eq(purchaseOrders.id, po.id), eq(purchaseOrders.version, po.version))).returning();
    if (!u) throw new ConflictException('The order was changed concurrently. Reload and try again.');
    await this.event(ctx, po.id, `po.${to}`, po.status, to, note, data, tx);
    await this.audit.record(ctx, { action: `po.${to}`, objectType: 'purchase_order', objectId: po.id, reason: note, before: { status: po.status }, after: { status: to } }, tx);
    return u;
  }
  event(ctx: RequestContext, poId: string, action: string, from: string | null, to: string | null, note?: string, data?: unknown, tx: Db = this.db) {
    return tx.insert(poEvents).values({ poId, action, fromStatus: from, toStatus: to, note, data: data === undefined ? null : data, userId: ctx.userId, organizationId: ctx.orgId! });
  }
  /** An active exclusive distributor for this supplier, region and sector, if any (used to route enquiries). */
  async exclusiveDistributor(supplierOrgId: string, region: string | null | undefined, sector: string) {
    if (!region) return null;
    const [t] = await this.db.select().from(territories).where(and(eq(territories.supplierOrgId, supplierOrgId), eq(territories.region, region), eq(territories.sector, sector), eq(territories.exclusive, true), eq(territories.status, 'active'), lte(territories.startDate, today()), gte(territories.endDate, today()))).limit(1);
    return t ?? null;
  }
}

@ApiTags('trading')
@Controller('trading')
@RequireOrg()
export class TradingController {
  constructor(@InjectDb() private db: Db, private svc: TradingService, private audit: AuditService, private storage: StorageService) {}

  // ---------- 085 marketplace ----------
  @Get('market')
  async market(@Ctx() ctx: RequestContext, @Query('q') q?: string, @Query('sector') sector?: string) {
    const term = q?.trim().slice(0, 100);
    const products = await this.db.select({ p: supplierProducts, supplier: organizations.displayName, level: organizations.membershipLevel }).from(supplierProducts).innerJoin(organizations, eq(organizations.id, supplierProducts.supplierOrgId))
      .where(and(eq(supplierProducts.status, 'published'), sector ? eq(supplierProducts.sector, sector) : undefined, term ? or(ilike(supplierProducts.name, `%${term}%`), ilike(supplierProducts.description, `%${term}%`)) : undefined)).orderBy(asc(supplierProducts.name)).limit(100);
    const catalog = await this.db.select({ c: catalogItems, owner: organizations.displayName }).from(catalogItems).innerJoin(organizations, eq(organizations.id, catalogItems.ownerOrgId))
      .where(and(eq(catalogItems.status, 'published'), eq(catalogItems.kind, 'product'), inArray(catalogItems.visibility, ['public', 'partners']), sector ? eq(catalogItems.sector, sector) : undefined, term ? or(ilike(catalogItems.name, `%${term}%`), ilike(catalogItems.description, `%${term}%`)) : undefined)).limit(50);
    const me = await this.svc.org(ctx.orgId!);
    const supplier = this.svc.isSupplier(me);
    const [profile] = await this.db.select({ sectors: partnerProfiles.sectors }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId!)).limit(1);
    const open = supplier ? await this.db.select({ r: tradeRequirements, buyer: organizations.displayName }).from(tradeRequirements).innerJoin(organizations, eq(organizations.id, tradeRequirements.buyerOrgId))
      .where(and(eq(tradeRequirements.status, 'open'), sql`${tradeRequirements.closesAt} > now()`, ne(tradeRequirements.buyerOrgId, ctx.orgId!),
        or(arrayContains(tradeRequirements.invitedSupplierIds, [ctx.orgId!]), and(sql`cardinality(${tradeRequirements.invitedSupplierIds}) = 0`, inArray(tradeRequirements.sector, profile?.sectors?.length ? profile.sectors : ['__none__']))))).orderBy(asc(tradeRequirements.closesAt)).limit(50) : [];
    return {
      isSupplier: supplier,
      products: products.map((r) => ({ id: r.p.id, source: 'supplier', name: r.p.name, sector: r.p.sector, description: r.p.description, unit: r.p.unit, price: r.p.price, currency: r.p.currency, moq: r.p.moq, leadTimeDays: r.p.leadTimeDays, stock: r.p.stock, supplier: r.supplier, supplierOrgId: r.p.supplierOrgId, supplierLevel: r.level })),
      catalog: catalog.map((r) => ({ id: r.c.id, source: 'catalog', name: r.c.name, sector: r.c.sector, description: r.c.description, unit: r.c.unit, supplier: r.owner, supplierOrgId: r.c.ownerOrgId })),
      openRequirements: open.map((r) => ({ id: r.r.id, code: r.r.code, title: r.r.title, sector: r.r.sector, buyer: r.buyer, closesAt: r.r.closesAt, items: r.r.items, deliveryLocation: r.r.deliveryLocation })),
    };
  }

  // ---------- 086 suppliers & products ----------
  @Get('suppliers')
  async suppliers(@Query('sector') sector?: string) {
    const rows = await this.db.select({ o: organizations, p: partnerProfiles, n: sql<number>`(select count(*)::int from supplier_products sp where sp.supplier_org_id = ${organizations.id} and sp.status = 'published')` })
      .from(organizations).innerJoin(partnerProfiles, eq(partnerProfiles.organizationId, organizations.id))
      .where(and(eq(organizations.verificationStatus, 'verified'), sql`${organizations.partnerTypes} && array['trader','manufacturer','distributor']::text[]`, sector ? sql`${sector} = any(${partnerProfiles.sectors})` : undefined)).orderBy(organizations.displayName);
    const terr = await this.db.select({ t: territories, name: organizations.displayName }).from(territories).innerJoin(organizations, eq(organizations.id, territories.distributorOrgId)).where(and(eq(territories.status, 'active'), gte(territories.endDate, today())));
    return rows.map((r) => ({ id: r.o.id, name: r.o.displayName, types: r.o.partnerTypes, level: r.o.membershipLevel, city: r.o.city, sectors: r.p.sectors, regions: r.p.regions, certifications: r.p.certifications, products: r.n,
      distributors: terr.filter((x) => x.t.supplierOrgId === r.o.id).map((x) => ({ name: x.name, region: x.t.region, sector: x.t.sector, exclusive: x.t.exclusive })) }));
  }

  @Get('products/mine')
  async myProducts(@Ctx() ctx: RequestContext) {
    return this.db.select().from(supplierProducts).where(eq(supplierProducts.supplierOrgId, ctx.orgId!)).orderBy(desc(supplierProducts.createdAt));
  }

  @Post('products')
  @HttpCode(201)
  async addProduct(@Ctx() ctx: RequestContext, @Body(body(SupplierProductSchema)) b: z.infer<typeof SupplierProductSchema>) {
    await this.svc.assertSupplier(ctx);
    const [p] = await this.db.insert(supplierProducts).values({ ...b, supplierOrgId: ctx.orgId!, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'trade.product_listed', objectType: 'supplier_product', objectId: p.id, after: { name: p.name } });
    return p;
  }

  @Patch('products/:id')
  async editProduct(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(patchOf(SupplierProductSchema).extend({ status: z.enum(['published', 'archived']).optional() }))) b: Record<string, unknown>) {
    await this.svc.assertSupplier(ctx);
    const [p] = await this.db.update(supplierProducts).set({ ...b, updatedAt: new Date() }).where(and(eq(supplierProducts.id, id), eq(supplierProducts.supplierOrgId, ctx.orgId!))).returning();
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  // ---------- 087 requirements ----------
  @Post('requirements')
  @HttpCode(201)
  async postRequirement(@Ctx() ctx: RequestContext, @Body(body(RequirementSchema)) b: z.infer<typeof RequirementSchema>) {
    this.svc.assertBuyer(ctx);
    if (new Date(b.closesAt).getTime() < Date.now() + 60 * 60 * 1000) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { closesAt: 'Give suppliers at least one hour to quote' } });
    if (b.projectId) {
      const [m] = await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, b.projectId), eq(projectMembers.organizationId, ctx.orgId!), eq(projectMembers.status, 'active'))).limit(1);
      if (!m) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { projectId: 'You are not on this project' } });
    }
    const [r] = await this.db.insert(tradeRequirements).values({ ...b, code: `REQ-${year()}-${randomDigits(6)}`, buyerOrgId: ctx.orgId!, closesAt: new Date(b.closesAt), createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'trade.requirement_posted', objectType: 'trade_requirement', objectId: r.id, after: { code: r.code } });
    for (const s of b.invitedSupplierIds) await this.svc.notifyOrg(s, `Invited to quote: ${r.code}`, r.title, `/trading/quotations?requirement=${r.id}`);
    return r;
  }

  @Get('requirements')
  async requirements(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ r: tradeRequirements, quotes: sql<number>`(select count(*)::int from quotations q where q.requirement_id = ${tradeRequirements.id} and q.status <> 'withdrawn')` })
      .from(tradeRequirements).where(eq(tradeRequirements.buyerOrgId, ctx.orgId!)).orderBy(desc(tradeRequirements.createdAt));
    return rows.map((x) => ({ ...x.r, quotes: x.quotes }));
  }

  private async requirementFor(ctx: RequestContext, id: string) {
    const [r] = await this.db.select().from(tradeRequirements).where(eq(tradeRequirements.id, id)).limit(1);
    if (!r) throw new NotFoundException('Requirement not found');
    if (r.buyerOrgId === ctx.orgId) return { r, side: 'buyer' as const };
    const me = await this.svc.org(ctx.orgId!);
    const [profile] = await this.db.select({ sectors: partnerProfiles.sectors }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId!)).limit(1);
    const eligible = this.svc.isSupplier(me) && (r.invitedSupplierIds.length ? r.invitedSupplierIds.includes(ctx.orgId!) : (profile?.sectors ?? []).includes(r.sector));
    if (!eligible) throw new NotFoundException('Requirement not found');
    return { r, side: 'supplier' as const };
  }

  @Get('requirements/:id')
  async requirement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { r, side } = await this.requirementFor(ctx, id);
    const [buyer] = await this.db.select({ name: organizations.displayName }).from(organizations).where(eq(organizations.id, r.buyerOrgId));
    const mine = side === 'supplier' ? await this.db.select().from(quotations).where(and(eq(quotations.requirementId, id), eq(quotations.supplierOrgId, ctx.orgId!))).orderBy(desc(quotations.createdAt)) : [];
    return { ...r, buyer: buyer.name, side, open: r.status === 'open' && r.closesAt.getTime() > Date.now(), myQuotations: mine };
  }

  @Post('requirements/:id/cancel')
  @HttpCode(200)
  async cancelRequirement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PoCancelSchema)) b: { reason: string }) {
    const { r, side } = await this.requirementFor(ctx, id);
    if (side !== 'buyer') throw new ForbiddenException('Only the buyer can cancel');
    if (r.status !== 'open') throw new ConflictException('Only open requirements can be cancelled');
    const [u] = await this.db.update(tradeRequirements).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(tradeRequirements.id, id)).returning();
    await this.db.update(quotations).set({ status: 'rejected', updatedAt: new Date() }).where(and(eq(quotations.requirementId, id), eq(quotations.status, 'submitted')));
    await this.audit.record(ctx, { action: 'trade.requirement_cancelled', objectType: 'trade_requirement', objectId: id, reason: b.reason });
    return u;
  }

  // ---------- 088 enquiries ----------
  /** Product enquiry / price request. Routed to the authorised exclusive distributor for the buyer's region when one exists. */
  @Post('enquiries')
  @HttpCode(201)
  async enquire(@Ctx() ctx: RequestContext, @Body(body(EnquirySchema)) b: z.infer<typeof EnquirySchema>) {
    if (ctx.orgVerificationStatus !== 'verified') throw new ForbiddenException('Only verified organizations can send enquiries');
    let supplierOrgId = b.supplierOrgId;
    let subject = b.subject;
    let sector: string | null = null;
    if (b.supplierProductId) {
      const [p] = await this.db.select().from(supplierProducts).where(and(eq(supplierProducts.id, b.supplierProductId), eq(supplierProducts.status, 'published'))).limit(1);
      if (!p) throw new NotFoundException('Product not found');
      supplierOrgId = p.supplierOrgId; subject ??= p.name; sector = p.sector;
    } else if (b.catalogItemId) {
      const [c] = await this.db.select().from(catalogItems).where(and(eq(catalogItems.id, b.catalogItemId), eq(catalogItems.status, 'published'), inArray(catalogItems.visibility, ['public', 'partners']))).limit(1);
      if (!c) throw new NotFoundException('Item not found');
      supplierOrgId = c.ownerOrgId; subject ??= c.name; sector = c.sector;
    }
    if (!supplierOrgId || supplierOrgId === ctx.orgId) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { supplierOrgId: 'Choose another organization’s product' } });
    const [buyerProfile] = await this.db.select({ regions: partnerProfiles.regions }).from(partnerProfiles).where(eq(partnerProfiles.organizationId, ctx.orgId!)).limit(1);
    const dist = sector ? await this.svc.exclusiveDistributor(supplierOrgId, buyerProfile?.regions?.[0], sector) : null;
    const routedTo = dist && dist.distributorOrgId !== ctx.orgId ? dist.distributorOrgId : null;
    const e = await this.db.transaction(async (tx) => {
      const [e] = await tx.insert(tradeEnquiries).values({ code: `ENQ-${year()}-${randomDigits(6)}`, buyerOrgId: ctx.orgId!, supplierOrgId: routedTo ?? supplierOrgId!, intendedSupplierOrgId: routedTo ? supplierOrgId : null, supplierProductId: b.supplierProductId, catalogItemId: b.catalogItemId, subject: subject ?? 'General enquiry', quantity: b.quantity, createdBy: ctx.userId }).returning();
      await tx.insert(enquiryMessages).values({ enquiryId: e.id, authorOrgId: ctx.orgId!, authorUserId: ctx.userId, body: b.message });
      return e;
    });
    await this.audit.record(ctx, { action: routedTo ? 'trade.enquiry_routed_to_distributor' : 'trade.enquiry_sent', objectType: 'trade_enquiry', objectId: e.id, after: { to: e.supplierOrgId, intended: supplierOrgId } });
    await this.svc.notifyOrg(e.supplierOrgId, `New enquiry ${e.code}`, `${e.subject} · quantity ${e.quantity}${routedTo ? ' (routed to you as the authorised distributor)' : ''}`, `/trading/enquiry?id=${e.id}`);
    return { ...e, routedToDistributor: !!routedTo };
  }

  @Get('enquiries')
  async enquiries(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(tradeEnquiries).where(or(eq(tradeEnquiries.buyerOrgId, ctx.orgId!), eq(tradeEnquiries.supplierOrgId, ctx.orgId!))).orderBy(desc(tradeEnquiries.updatedAt)).limit(200);
    const ids = [...new Set(rows.flatMap((r) => [r.buyerOrgId, r.supplierOrgId, r.intendedSupplierOrgId].filter(Boolean) as string[]))];
    const names = ids.length ? await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, ids)) : [];
    const n = (id?: string | null) => names.find((x) => x.id === id)?.name ?? null;
    return rows.map((r) => ({ ...r, direction: r.buyerOrgId === ctx.orgId ? 'sent' : 'received', buyer: n(r.buyerOrgId), supplier: n(r.supplierOrgId), intendedSupplier: n(r.intendedSupplierOrgId) }));
  }

  private async enquiryFor(ctx: RequestContext, id: string) {
    const [e] = await this.db.select().from(tradeEnquiries).where(eq(tradeEnquiries.id, id)).limit(1);
    if (!e || (e.buyerOrgId !== ctx.orgId && e.supplierOrgId !== ctx.orgId)) throw new NotFoundException('Enquiry not found');
    return e;
  }

  @Get('enquiries/:id')
  async enquiry(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const e = await this.enquiryFor(ctx, id);
    const msgs = await this.db.select({ m: enquiryMessages, author: users.fullName, org: organizations.displayName }).from(enquiryMessages).innerJoin(users, eq(users.id, enquiryMessages.authorUserId)).innerJoin(organizations, eq(organizations.id, enquiryMessages.authorOrgId)).where(eq(enquiryMessages.enquiryId, id)).orderBy(asc(enquiryMessages.createdAt));
    const qts = await this.db.select().from(quotations).where(eq(quotations.enquiryId, id)).orderBy(desc(quotations.createdAt));
    return { ...e, side: e.buyerOrgId === ctx.orgId ? 'buyer' : 'supplier', messages: msgs.map((x) => ({ id: x.m.id, body: x.m.body, author: x.author, org: x.org, mine: x.m.authorOrgId === ctx.orgId, createdAt: x.m.createdAt })), quotations: qts };
  }

  @Post('enquiries/:id/messages')
  @HttpCode(201)
  async reply(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(EnquiryMessageSchema)) b: { body: string }) {
    const e = await this.enquiryFor(ctx, id);
    if (e.status === 'closed') throw new ConflictException('This enquiry is closed');
    const [m] = await this.db.insert(enquiryMessages).values({ enquiryId: id, authorOrgId: ctx.orgId!, authorUserId: ctx.userId, body: b.body }).returning();
    await this.db.update(tradeEnquiries).set({ updatedAt: new Date() }).where(eq(tradeEnquiries.id, id));
    await this.svc.notifyOrg(e.buyerOrgId === ctx.orgId ? e.supplierOrgId : e.buyerOrgId, `Reply on ${e.code}`, b.body.slice(0, 140), `/trading/enquiry?id=${id}`);
    return m;
  }

  @Post('enquiries/:id/close')
  @HttpCode(200)
  async closeEnquiry(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.enquiryFor(ctx, id);
    const [u] = await this.db.update(tradeEnquiries).set({ status: 'closed', updatedAt: new Date() }).where(eq(tradeEnquiries.id, id)).returning();
    return u;
  }

  // ---------- 089 quotations ----------
  @Post('quotations')
  @HttpCode(201)
  async quote(@Ctx() ctx: RequestContext, @Body(body(QuotationSchema)) b: z.infer<typeof QuotationSchema>) {
    await this.svc.assertSupplier(ctx);
    if (b.validUntil < today()) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { validUntil: 'Validity must be today or later' } });
    let buyerOrgId: string;
    if (b.requirementId) {
      const { r, side } = await this.requirementFor(ctx, b.requirementId);
      if (side !== 'supplier') throw new ForbiddenException('You cannot quote on your own requirement');
      if (r.status !== 'open' || r.closesAt.getTime() <= Date.now()) throw new ConflictException('This requirement is no longer accepting quotations');
      buyerOrgId = r.buyerOrgId;
    } else {
      const e = await this.enquiryFor(ctx, b.enquiryId!);
      if (e.supplierOrgId !== ctx.orgId) throw new ForbiddenException('Only the supplier can quote on this enquiry');
      if (e.status === 'closed') throw new ConflictException('This enquiry is closed');
      buyerOrgId = e.buyerOrgId;
    }
    const t = totals(b.lines, b.taxPct);
    const q = await this.db.transaction(async (tx) => {
      const [q] = await tx.insert(quotations).values({ ...b, ...t, code: `QT-${year()}-${randomDigits(6)}`, supplierOrgId: ctx.orgId!, buyerOrgId, createdBy: ctx.userId }).returning();
      if (b.enquiryId) await tx.update(tradeEnquiries).set({ status: 'quoted', updatedAt: new Date() }).where(eq(tradeEnquiries.id, b.enquiryId));
      return q;
    });
    await this.audit.record(ctx, { action: 'trade.quotation_submitted', objectType: 'quotation', objectId: q.id, after: { code: q.code, total: q.total } });
    await this.svc.notifyOrg(buyerOrgId, `Quotation received ${q.code}`, `Total ${t.total / 100}`, b.requirementId ? `/trading/quotations?requirement=${b.requirementId}` : `/trading/enquiry?id=${b.enquiryId}`);
    return q;
  }

  @Get('quotations')
  async myQuotes(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ q: quotations, buyer: organizations.displayName, req: tradeRequirements.title }).from(quotations).innerJoin(organizations, eq(organizations.id, quotations.buyerOrgId)).leftJoin(tradeRequirements, eq(tradeRequirements.id, quotations.requirementId))
      .where(eq(quotations.supplierOrgId, ctx.orgId!)).orderBy(desc(quotations.createdAt));
    return rows.map((r) => ({ ...r.q, buyer: r.buyer, requirement: r.req }));
  }

  /** Buyer-only comparison: per-line best prices, totals, delivery and validity. Suppliers only ever see their own quote. */
  @Get('requirements/:id/quotations')
  async compare(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { r, side } = await this.requirementFor(ctx, id);
    if (side !== 'buyer') throw new ForbiddenException('Only the buyer can compare quotations');
    const rows = await this.db.select({ q: quotations, supplier: organizations.displayName, level: organizations.membershipLevel }).from(quotations).innerJoin(organizations, eq(organizations.id, quotations.supplierOrgId))
      .where(and(eq(quotations.requirementId, id), ne(quotations.status, 'withdrawn'))).orderBy(asc(quotations.total));
    const live = rows.filter((x) => x.q.validUntil >= today());
    const best = new Map<string, number>();
    for (const x of live) for (const l of x.q.lines as Line[]) best.set(l.item, Math.min(best.get(l.item) ?? Infinity, l.unitPrice));
    const lowest = live.length ? Math.min(...live.map((x) => x.q.total)) : null;
    const fastest = live.length ? Math.min(...live.map((x) => x.q.deliveryDays)) : null;
    return { requirement: r, quotations: rows.map((x, i) => ({ ...x.q, supplier: x.supplier, supplierLevel: x.level, rank: i + 1, expired: x.q.validUntil < today(), lowest: x.q.total === lowest, fastest: x.q.deliveryDays === fastest,
      lines: (x.q.lines as Line[]).map((l) => ({ ...l, best: l.unitPrice === best.get(l.item) })) })) };
  }

  @Post('quotations/:id/withdraw')
  @HttpCode(200)
  async withdrawQuote(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const [q] = await this.db.update(quotations).set({ status: 'withdrawn', updatedAt: new Date() }).where(and(eq(quotations.id, id), eq(quotations.supplierOrgId, ctx.orgId!), eq(quotations.status, 'submitted'))).returning();
    if (!q) throw new ConflictException('Only your submitted (not yet accepted) quotations can be withdrawn');
    return q;
  }

  // ---------- 090/091 purchase orders ----------
  @Post('purchase-orders')
  @HttpCode(201)
  async createPo(@Ctx() ctx: RequestContext, @Body(body(PurchaseOrderSchema)) b: z.infer<typeof PurchaseOrderSchema>) {
    this.svc.assertBuyer(ctx);
    if (b.deliveryBy < today()) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { deliveryBy: 'Delivery date must be in the future' } });
    let lines: Line[]; let supplierOrgId: string; let taxPct = b.taxPct;
    const [q] = b.quotationId ? await this.db.select().from(quotations).where(eq(quotations.id, b.quotationId)).limit(1) : [];
    if (b.quotationId) {
      if (!q || q.buyerOrgId !== ctx.orgId) throw new NotFoundException('Quotation not found');
      if (q.status !== 'submitted') throw new ConflictException('This quotation is no longer open');
      if (q.validUntil < today()) throw new ConflictException('This quotation has expired; ask the supplier to re-quote');
      lines = q.lines as Line[]; supplierOrgId = q.supplierOrgId; taxPct = q.taxPct;
    } else {
      const s = await this.svc.org(b.supplierOrgId!);
      if (!this.svc.isSupplier(s)) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { supplierOrgId: 'Choose a verified supplier' } });
      lines = b.lines!; supplierOrgId = b.supplierOrgId!;
    }
    if (supplierOrgId === ctx.orgId) throw new BadRequestException('You cannot order from your own organization');
    if (b.projectMaterialId) {
      const [m] = await this.db.select().from(projectMaterials).where(eq(projectMaterials.id, b.projectMaterialId)).limit(1);
      const [mem] = m ? await this.db.select().from(projectMembers).where(and(eq(projectMembers.projectId, m.projectId), eq(projectMembers.organizationId, ctx.orgId!), eq(projectMembers.status, 'active'))).limit(1) : [];
      if (!m || !mem) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { projectMaterialId: 'Material not found on your projects' } });
      b.projectId = m.projectId;
    }
    const t = totals(lines, taxPct);
    const po = await this.db.transaction(async (tx) => {
      const [po] = await tx.insert(purchaseOrders).values({ number: `PO-${year()}-${randomDigits(6)}`, buyerOrgId: ctx.orgId!, supplierOrgId, quotationId: b.quotationId, projectId: b.projectId, projectMaterialId: b.projectMaterialId, lines, taxPct, ...t, deliveryAddress: b.deliveryAddress, deliveryBy: b.deliveryBy, paymentTerms: b.paymentTerms, createdBy: ctx.userId }).returning();
      if (q) {
        await tx.update(quotations).set({ status: 'accepted', updatedAt: new Date() }).where(eq(quotations.id, q.id));
        if (q.requirementId) {
          await tx.update(quotations).set({ status: 'rejected', updatedAt: new Date() }).where(and(eq(quotations.requirementId, q.requirementId), eq(quotations.status, 'submitted'), ne(quotations.id, q.id)));
          await tx.update(tradeRequirements).set({ status: 'awarded', updatedAt: new Date() }).where(eq(tradeRequirements.id, q.requirementId));
        }
      }
      if (b.projectMaterialId) await tx.update(projectMaterials).set({ purchaseOrderId: po.id, status: 'ordered', updatedAt: new Date() }).where(eq(projectMaterials.id, b.projectMaterialId));
      await this.svc.event(ctx, po.id, 'po.created', null, 'draft', q ? `From quotation ${q.code}` : 'Direct order', { total: t.total }, tx as unknown as Db);
      return po;
    });
    return po;
  }

  @Get('purchase-orders')
  async orders(@Ctx() ctx: RequestContext, @Query('side') side?: string) {
    const where = side === 'buyer' ? eq(purchaseOrders.buyerOrgId, ctx.orgId!) : side === 'supplier' ? eq(purchaseOrders.supplierOrgId, ctx.orgId!) : or(eq(purchaseOrders.buyerOrgId, ctx.orgId!), eq(purchaseOrders.supplierOrgId, ctx.orgId!));
    const rows = await this.db.select().from(purchaseOrders).where(where).orderBy(desc(purchaseOrders.updatedAt)).limit(200);
    const ids = [...new Set(rows.flatMap((r) => [r.buyerOrgId, r.supplierOrgId]))];
    const names = ids.length ? await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, ids)) : [];
    const claims = rows.length ? await this.db.select({ po: tradeClaims.poId, n: sql<number>`count(*)::int` }).from(tradeClaims).where(and(inArray(tradeClaims.poId, rows.map((r) => r.id)), inArray(tradeClaims.status, OPEN_CLAIMS))).groupBy(tradeClaims.poId) : [];
    return rows.map((r) => ({ ...r, side: r.buyerOrgId === ctx.orgId ? 'buyer' : 'supplier', buyer: names.find((n) => n.id === r.buyerOrgId)?.name, supplier: names.find((n) => n.id === r.supplierOrgId)?.name,
      late: r.deliveryBy < today() && !['delivered', 'closed', 'cancelled'].includes(r.status), openClaims: claims.find((c) => c.po === r.id)?.n ?? 0 }));
  }

  @Get('purchase-orders/:id')
  async order(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    const [events, [shipment], claims, names] = await Promise.all([
      this.db.select({ e: poEvents, who: users.fullName, org: organizations.displayName }).from(poEvents).innerJoin(users, eq(users.id, poEvents.userId)).innerJoin(organizations, eq(organizations.id, poEvents.organizationId)).where(eq(poEvents.poId, id)).orderBy(asc(poEvents.createdAt)),
      this.db.select().from(shipments).where(eq(shipments.poId, id)).limit(1),
      this.db.select().from(tradeClaims).where(eq(tradeClaims.poId, id)).orderBy(desc(tradeClaims.createdAt)),
      this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, [po.buyerOrgId, po.supplierOrgId])),
    ]);
    const pod = shipment ? await this.db.select({ id: tradeDocuments.id, fileName: tradeDocuments.fileName, sha256: tradeDocuments.sha256 }).from(tradeDocuments).where(and(eq(tradeDocuments.ownerType, 'shipment'), eq(tradeDocuments.ownerId, shipment.id))) : [];
    return { ...po, side, buyer: names.find((n) => n.id === po.buyerOrgId)?.name, supplier: names.find((n) => n.id === po.supplierOrgId)?.name,
      history: events.map((e) => ({ ...e.e, who: e.who, org: e.org })), shipment: shipment ? { ...shipment, proofOfDelivery: pod } : null, claims };
  }

  @Post('purchase-orders/:id/issue')
  @Idempotent()
  @HttpCode(200)
  async issue(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'buyer') throw new ForbiddenException('Only the buyer issues the order');
    const u = await this.svc.setPo(ctx, po, 'issued', 'Order issued to supplier');
    await this.svc.notifyOrg(po.supplierOrgId, `Purchase order ${po.number}`, `New order for ${po.total / 100} — please accept or decline.`, `/trading/orders?id=${id}`);
    return u;
  }

  @Post('purchase-orders/:id/accept')
  @HttpCode(200)
  async accept(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PoActionSchema)) b: { note?: string }) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'supplier') throw new ForbiddenException('Only the supplier accepts the order');
    const u = await this.svc.setPo(ctx, po, 'accepted', b.note ?? 'Accepted by supplier');
    await this.svc.notifyOrg(po.buyerOrgId, `Order accepted: ${po.number}`, b.note ?? '', `/trading/orders?id=${id}`);
    return u;
  }

  @Post('purchase-orders/:id/start')
  @HttpCode(200)
  async startFulfilment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'supplier') throw new ForbiddenException('Only the supplier fulfils the order');
    return this.svc.setPo(ctx, po, 'in_fulfilment', 'Fulfilment started');
  }

  /** Buyer cancels before fulfilment; supplier declines an issued order. Both need a reason. */
  @Post('purchase-orders/:id/cancel')
  @HttpCode(200)
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PoCancelSchema)) b: { reason: string }) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side === 'supplier' && po.status !== 'issued') throw new ConflictException('Suppliers can decline only newly issued orders');
    const u = await this.svc.setPo(ctx, po, 'cancelled', b.reason, { cancelReason: b.reason });
    await this.svc.notifyOrg(side === 'buyer' ? po.supplierOrgId : po.buyerOrgId, `Order cancelled: ${po.number}`, b.reason, `/trading/orders?id=${id}`);
    return u;
  }

  // ---------- 092 shipping & receipt ----------
  @Post('purchase-orders/:id/shipment')
  @HttpCode(201)
  async ship(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ShipmentSchema)) b: z.infer<typeof ShipmentSchema>) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'supplier') throw new ForbiddenException('Only the supplier dispatches');
    if (po.status !== 'in_fulfilment') throw new ConflictException('Start fulfilment before dispatching');
    return this.db.transaction(async (tx) => {
      const [s] = await tx.insert(shipments).values({ poId: id, carrier: b.carrier, trackingNo: b.trackingNo, eta: b.eta, events: [{ at: new Date().toISOString(), status: 'Dispatched', location: null, note: `${b.carrier} ${b.trackingNo}` }] }).returning();
      await this.svc.setPo(ctx, po, 'shipped', `Dispatched via ${b.carrier} (${b.trackingNo})`, {}, { carrier: b.carrier, trackingNo: b.trackingNo, eta: b.eta }, tx as unknown as Db);
      return s;
    }).then(async (s) => { await this.svc.notifyOrg(po.buyerOrgId, `Dispatched: ${po.number}`, `${b.carrier} ${b.trackingNo}${b.eta ? `, ETA ${b.eta}` : ''}`, `/trading/orders/${id}/shipping`); return s; });
  }

  @Post('purchase-orders/:id/shipment/events')
  @HttpCode(201)
  async track(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ShipmentEventSchema)) b: z.infer<typeof ShipmentEventSchema>) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'supplier') throw new ForbiddenException('Only the supplier updates tracking');
    const [s] = await this.db.select().from(shipments).where(eq(shipments.poId, id)).limit(1);
    if (!s || s.status !== 'in_transit') throw new ConflictException('No shipment in transit');
    const [u] = await this.db.update(shipments).set({ events: [...(s.events as unknown[]), { at: new Date().toISOString(), ...b }] }).where(eq(shipments.id, s.id)).returning();
    await this.svc.event(ctx, po.id, 'shipment.tracking', null, null, `${b.status}${b.location ? ` @ ${b.location}` : ''}`);
    return u;
  }

  /** Goods receipt (GRN) by the buyer, line by line, optionally with proof-of-delivery photos. Shortages/damage stay on record. */
  @Post('purchase-orders/:id/receipt')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 } }))
  @Idempotent()
  @HttpCode(200)
  async receive(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: { buffer: Buffer; mimetype: string; originalname: string }[] | undefined, @Body() raw: Record<string, string>) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'buyer') throw new ForbiddenException('Only the buyer records goods receipt');
    let payload: unknown;
    try { payload = JSON.parse(raw.payload ?? '{}'); } catch { throw new BadRequestException('Malformed receipt'); }
    const parsed = GoodsReceiptSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException({ message: 'Check the highlighted fields', issues: issues(parsed.error) });
    const b = parsed.data;
    const ordered = po.lines as Line[];
    for (const l of b.lines) {
      const o = ordered.find((x) => x.item === l.item);
      if (!o) throw new BadRequestException(`“${l.item}” is not on this order`);
      if (l.received > o.quantity || l.damaged > l.received) throw new BadRequestException(`Check the quantities for “${l.item}”`);
    }
    const [s] = await this.db.select().from(shipments).where(eq(shipments.poId, id)).limit(1);
    if (!s || po.status !== 'shipped') throw new ConflictException('Goods can be received only after dispatch');
    const stored = await Promise.all((files ?? []).map(async (f) => ({ f, st: await this.storage.put(f.buffer, f.mimetype, `trade/${id}`) })));
    const short = b.lines.filter((l) => l.received < (ordered.find((o) => o.item === l.item)?.quantity ?? 0) || l.damaged > 0);
    const u = await this.db.transaction(async (tx) => {
      await tx.update(shipments).set({ status: 'delivered', receivedAt: new Date(), receivedBy: ctx.userId, receivedLines: b.lines, receiptNote: b.note, events: [...(s.events as unknown[]), { at: new Date().toISOString(), status: 'Delivered', note: b.note ?? null }] }).where(eq(shipments.id, s.id));
      for (const { f, st } of stored) await tx.insert(tradeDocuments).values({ ownerType: 'shipment', ownerId: s.id, fileName: f.originalname.slice(0, 200), objectKey: st.key, sha256: st.sha256, size: st.size, mime: st.mime, organizationId: ctx.orgId!, uploadedBy: ctx.userId });
      const u = await this.svc.setPo(ctx, po, 'delivered', short.length ? `Received with exceptions: ${short.map((x) => x.item).join(', ')}` : 'Received in full', { deliveredAt: new Date() }, { lines: b.lines }, tx as unknown as Db);
      if (po.projectMaterialId) {
        const [m] = await tx.select().from(projectMaterials).where(eq(projectMaterials.id, po.projectMaterialId)).limit(1);
        if (m) {
          const good = b.lines.reduce((a, l) => a + (l.received - l.damaged), 0);
          const qty = Math.min(m.quantity, m.deliveredQty + Math.round(good));
          await tx.update(projectMaterials).set({ deliveredQty: qty, status: qty >= m.quantity ? 'delivered' : m.status, version: m.version + 1, updatedAt: new Date() }).where(eq(projectMaterials.id, m.id));
          await tx.insert(projectChangeLog).values({ projectId: m.projectId, entity: 'material', entityId: m.id, field: 'deliveredQty', before: m.deliveredQty, after: qty, reason: `Goods receipt on ${po.number}`, userId: ctx.userId, organizationId: ctx.orgId! });
        }
      }
      return u;
    });
    await this.svc.notifyOrg(po.supplierOrgId, `Delivered: ${po.number}`, short.length ? 'Received with exceptions — see the receipt.' : 'Received in full.', `/trading/orders/${id}/shipping`);
    return { ...u, exceptions: short };
  }

  @Post('purchase-orders/:id/close')
  @HttpCode(200)
  async closePo(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const { po, side } = await this.svc.loadPo(ctx, id);
    if (side !== 'buyer') throw new ForbiddenException('Only the buyer closes the order');
    const open = await this.db.select({ id: tradeClaims.id }).from(tradeClaims).where(and(eq(tradeClaims.poId, id), inArray(tradeClaims.status, OPEN_CLAIMS))).limit(1);
    if (open.length) throw new ConflictException('Resolve open claims before closing the order');
    return this.svc.setPo(ctx, po, 'closed', 'Order closed');
  }

  // ---------- 093 territories ----------
  @Get('territories')
  async territoriesList(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ t: territories }).from(territories).where(or(eq(territories.supplierOrgId, ctx.orgId!), eq(territories.distributorOrgId, ctx.orgId!))).orderBy(desc(territories.createdAt));
    const ids = [...new Set(rows.flatMap((r) => [r.t.supplierOrgId, r.t.distributorOrgId]))];
    const names = ids.length ? await this.db.select({ id: organizations.id, name: organizations.displayName }).from(organizations).where(inArray(organizations.id, ids)) : [];
    return rows.map((r) => ({ ...r.t, side: r.t.supplierOrgId === ctx.orgId ? 'supplier' : 'distributor', supplier: names.find((n) => n.id === r.t.supplierOrgId)?.name, distributor: names.find((n) => n.id === r.t.distributorOrgId)?.name, current: r.t.status === 'active' && r.t.startDate <= today() && r.t.endDate >= today() }));
  }

  /** Grant a territory. Exclusive grants may not overlap any other active grant for the same supplier, region and sector. */
  @Post('territories')
  @HttpCode(201)
  async grant(@Ctx() ctx: RequestContext, @Body(body(TerritorySchema)) b: z.infer<typeof TerritorySchema>) {
    const me = await this.svc.assertSupplier(ctx);
    if (!(me.partnerTypes ?? []).some((t) => ['manufacturer', 'trader'].includes(t))) throw new ForbiddenException('Only manufacturers and traders appoint distributors');
    const d = await this.svc.org(b.distributorOrgId);
    if (!d || !this.svc.isSupplier(d) || !(d.partnerTypes ?? []).includes('distributor') || d.id === ctx.orgId) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { distributorOrgId: 'Choose a verified distributor' } });
    const overlapping = await this.db.select({ t: territories, name: organizations.displayName }).from(territories).innerJoin(organizations, eq(organizations.id, territories.distributorOrgId))
      .where(and(eq(territories.supplierOrgId, ctx.orgId!), eq(territories.region, b.region), eq(territories.sector, b.sector), eq(territories.status, 'active'), lte(territories.startDate, b.endDate), gte(territories.endDate, b.startDate)));
    const dup = overlapping.find((o) => o.t.distributorOrgId === b.distributorOrgId);
    if (dup) throw new ConflictException(`${dup.name} is already appointed for ${b.region} in this period (${dup.t.startDate} → ${dup.t.endDate}). Revoke or let it expire first.`);
    const clash = overlapping.find((o) => (b.exclusive || o.t.exclusive) && o.t.distributorOrgId !== b.distributorOrgId);
    if (clash) throw new ConflictException(`Conflicts with ${clash.t.exclusive ? 'the exclusive' : 'an existing'} territory of ${clash.name} in ${b.region} (${clash.t.startDate} → ${clash.t.endDate})`);
    const [t] = await this.db.insert(territories).values({ ...b, supplierOrgId: ctx.orgId!, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'trade.territory_granted', objectType: 'territory', objectId: t.id, after: { distributor: d.displayName, region: b.region, sector: b.sector, exclusive: b.exclusive } });
    await this.svc.notifyOrg(b.distributorOrgId, 'Territory granted', `${me.displayName} appointed you for ${b.region} (${b.sector})${b.exclusive ? ' exclusively' : ''}.`, '/trading/territories');
    return t;
  }

  @Post('territories/:id/revoke')
  @HttpCode(200)
  async revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PoCancelSchema)) b: { reason: string }) {
    const [t] = await this.db.update(territories).set({ status: 'revoked', revokedReason: b.reason }).where(and(eq(territories.id, id), eq(territories.supplierOrgId, ctx.orgId!), eq(territories.status, 'active'))).returning();
    if (!t) throw new NotFoundException('Active territory not found');
    await this.audit.record(ctx, { action: 'trade.territory_revoked', objectType: 'territory', objectId: id, reason: b.reason });
    await this.svc.notifyOrg(t.distributorOrgId, 'Territory revoked', b.reason, '/trading/territories');
    return t;
  }

  // ---------- 094 claims ----------
  @Post('claims')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 5 } }))
  @HttpCode(201)
  async claim(@Ctx() ctx: RequestContext, @UploadedFiles() files: { buffer: Buffer; mimetype: string; originalname: string }[] | undefined, @Body() raw: Record<string, string>) {
    let payload: unknown;
    try { payload = JSON.parse(raw.payload ?? '{}'); } catch { throw new BadRequestException('Malformed claim'); }
    const parsed = ClaimSchema.safeParse(payload);
    if (!parsed.success) throw new BadRequestException({ message: 'Check the highlighted fields', issues: issues(parsed.error) });
    const b = parsed.data;
    const { po, side } = await this.svc.loadPo(ctx, b.poId);
    if (side !== 'buyer') throw new ForbiddenException('Only the buyer raises claims');
    if (!['delivered', 'closed'].includes(po.status) || !po.deliveredAt) throw new ConflictException('Claims can be raised only on delivered orders');
    const windowDays = b.kind === 'warranty' ? 365 : 30;
    if (Date.now() - po.deliveredAt.getTime() > windowDays * 86400_000) throw new ConflictException(`${b.kind === 'warranty' ? 'Warranty' : 'Return'} claims must be raised within ${windowDays} days of delivery`);
    if (['damage', 'warranty'].includes(b.kind) && !(files ?? []).length) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { files: 'Attach at least one photo as evidence' } });
    for (const l of b.lines) {
      const o = (po.lines as Line[]).find((x) => x.item === l.item);
      if (!o || l.quantity > o.quantity) throw new BadRequestException(`Check the quantity for “${l.item}”`);
    }
    if (b.amountClaimed && b.amountClaimed > po.total) throw new BadRequestException({ message: 'Check the highlighted fields', fields: { amountClaimed: 'Cannot exceed the order value' } });
    const stored = await Promise.all((files ?? []).map(async (f) => ({ f, st: await this.storage.put(f.buffer, f.mimetype, `trade/${po.id}`) })));
    const c = await this.db.transaction(async (tx) => {
      const [c] = await tx.insert(tradeClaims).values({ code: `CLM-${year()}-${randomDigits(6)}`, poId: po.id, buyerOrgId: po.buyerOrgId, supplierOrgId: po.supplierOrgId, kind: b.kind, description: b.description, lines: b.lines, amountClaimed: b.amountClaimed,
        responseDueAt: new Date(Date.now() + 5 * 86400_000), history: [{ at: new Date().toISOString(), action: 'raised', by: ctx.userId }], createdBy: ctx.userId }).returning();
      for (const { f, st } of stored) await tx.insert(tradeDocuments).values({ ownerType: 'claim', ownerId: c.id, fileName: f.originalname.slice(0, 200), objectKey: st.key, sha256: st.sha256, size: st.size, mime: st.mime, organizationId: ctx.orgId!, uploadedBy: ctx.userId });
      await this.svc.event(ctx, po.id, 'claim.raised', null, null, `${c.code}: ${b.kind}`, undefined, tx as unknown as Db);
      return c;
    });
    await this.audit.record(ctx, { action: 'trade.claim_raised', objectType: 'trade_claim', objectId: c.id, after: { code: c.code, kind: b.kind, evidence: stored.map((x) => x.st.sha256) } });
    await this.svc.notifyOrg(po.supplierOrgId, `Claim ${c.code} on ${po.number}`, `${b.kind}: respond within 5 days.`, `/trading/claims?id=${c.id}`);
    return c;
  }

  @Get('claims')
  async claims(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select({ c: tradeClaims, po: purchaseOrders.number }).from(tradeClaims).innerJoin(purchaseOrders, eq(purchaseOrders.id, tradeClaims.poId))
      .where(or(eq(tradeClaims.buyerOrgId, ctx.orgId!), eq(tradeClaims.supplierOrgId, ctx.orgId!))).orderBy(desc(tradeClaims.updatedAt));
    const docs = rows.length ? await this.db.select({ ownerId: tradeDocuments.ownerId, id: tradeDocuments.id, fileName: tradeDocuments.fileName, sha256: tradeDocuments.sha256 }).from(tradeDocuments).where(and(eq(tradeDocuments.ownerType, 'claim'), inArray(tradeDocuments.ownerId, rows.map((r) => r.c.id)))) : [];
    return rows.map((r) => ({ ...r.c, poNumber: r.po, side: r.c.buyerOrgId === ctx.orgId ? 'buyer' : 'supplier', overdue: r.c.status === 'open' && r.c.responseDueAt.getTime() < Date.now(), evidence: docs.filter((d) => d.ownerId === r.c.id) }));
  }

  private async claimFor(ctx: RequestContext, id: string) {
    const [c] = await this.db.select().from(tradeClaims).where(eq(tradeClaims.id, id)).limit(1);
    if (!c || (c.buyerOrgId !== ctx.orgId && c.supplierOrgId !== ctx.orgId)) throw new NotFoundException('Claim not found');
    return c;
  }
  private async setClaim(ctx: RequestContext, c: typeof tradeClaims.$inferSelect, status: string, extra: Partial<typeof tradeClaims.$inferSelect>, note: string) {
    const [u] = await this.db.update(tradeClaims).set({ ...extra, status, history: [...(c.history as unknown[]), { at: new Date().toISOString(), action: status, by: ctx.userId, note }], updatedAt: new Date() }).where(and(eq(tradeClaims.id, c.id), eq(tradeClaims.status, c.status))).returning();
    if (!u) throw new ConflictException('The claim was changed concurrently. Reload and try again.');
    await this.svc.event(ctx, c.poId, `claim.${status}`, null, null, `${c.code}: ${note}`);
    await this.audit.record(ctx, { action: `trade.claim_${status}`, objectType: 'trade_claim', objectId: c.id, reason: note });
    return u;
  }

  @Post('claims/:id/respond')
  @HttpCode(200)
  async respond(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ClaimResponseSchema)) b: z.infer<typeof ClaimResponseSchema>) {
    const c = await this.claimFor(ctx, id);
    if (c.supplierOrgId !== ctx.orgId) throw new ForbiddenException('Only the supplier responds to a claim');
    if (c.status !== 'open') throw new ConflictException('This claim has already been answered');
    const u = await this.setClaim(ctx, c, b.decision === 'accept' ? 'accepted' : 'rejected', { resolution: b.resolution, resolutionNote: b.note }, b.note);
    await this.svc.notifyOrg(c.buyerOrgId, `Claim ${c.code} ${u.status}`, b.note, `/trading/claims?id=${id}`);
    return u;
  }

  @Post('claims/:id/resolve')
  @HttpCode(200)
  async resolve(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5).max(1000) }))) b: { note: string }) {
    const c = await this.claimFor(ctx, id);
    if (c.buyerOrgId !== ctx.orgId) throw new ForbiddenException('Only the buyer confirms the resolution');
    if (c.status !== 'accepted') throw new ConflictException('Only accepted claims can be marked resolved');
    return this.setClaim(ctx, c, 'resolved', {}, b.note);
  }

  /** Buyer escalates to COLLABIZ when the supplier rejected the claim or missed the response deadline. */
  @Post('claims/:id/escalate')
  @HttpCode(200)
  async escalate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(10).max(2000) }))) b: { note: string }) {
    const c = await this.claimFor(ctx, id);
    if (c.buyerOrgId !== ctx.orgId) throw new ForbiddenException('Only the buyer escalates');
    const overdue = c.status === 'open' && c.responseDueAt.getTime() < Date.now();
    if (!(c.status === 'rejected' || overdue)) throw new ConflictException('A claim can be escalated after the supplier rejects it or misses the response deadline');
    const u = await this.setClaim(ctx, c, 'escalated', {}, b.note);
    const staff = await this.db.select({ userId: memberships.userId }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).where(and(eq(organizations.type, 'platform'), inArray(memberships.role, ['compliance', 'moderator']), eq(memberships.status, 'active')));
    for (const s of staff) await this.db.insert(notifications).values({ userId: s.userId, kind: 'trade', title: `Escalated claim ${c.code}`, body: b.note, link: `/support` });
    await this.svc.notifyOrg(c.supplierOrgId, `Claim ${c.code} escalated to COLLABIZ`, b.note, `/trading/claims?id=${id}`);
    return u;
  }

  @Get('documents/:docId/url')
  async docUrl(@Ctx() ctx: RequestContext, @Param('docId', ParseUUIDPipe) docId: string) {
    const [d] = await this.db.select().from(tradeDocuments).where(eq(tradeDocuments.id, docId)).limit(1);
    if (!d) throw new NotFoundException();
    const owner = d.ownerType === 'claim' ? (await this.db.select({ a: tradeClaims.buyerOrgId, b: tradeClaims.supplierOrgId }).from(tradeClaims).where(eq(tradeClaims.id, d.ownerId)))[0]
      : (await this.db.select({ a: purchaseOrders.buyerOrgId, b: purchaseOrders.supplierOrgId }).from(shipments).innerJoin(purchaseOrders, eq(purchaseOrders.id, shipments.poId)).where(eq(shipments.id, d.ownerId)))[0];
    if (!owner || ![owner.a, owner.b].includes(ctx.orgId!)) throw new NotFoundException();
    await this.audit.record(ctx, { action: 'trade.document_accessed', objectType: 'trade_document', objectId: docId });
    return { url: this.storage.signedUrl(d.objectKey, 300) };
  }
}

@Module({ controllers: [TradingController], providers: [TradingService] })
export class TradingModule {}
