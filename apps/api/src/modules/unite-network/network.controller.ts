/**
 * Unite Solar Franchise Network — partner side (tested in test/unite-network.e2e.ts).
 *  - Packages and prices come from the server (administrator-configured, versioned). Applications start as drafts, are
 *    submitted once the business is verified, and are reviewed by Unite. Rights are activated only after the agreement is
 *    signed AND finance has verified the payment — never on payment initiation.
 *  - Stores with stock receive their opening stock as an allocation they confirm (goods received note). Sales from stock
 *    reduce on-hand stock under a row lock; stores without stock raise fulfilment requests to Unite, so no phantom stock.
 *  - Product earnings: resale margin on own stock OR a capped commission on Unite-fulfilled sales — never both.
 *  - LeadDNA access is checked on the server against entitlements; no LeadDNA credentials reach the browser.
 */
import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  COMMISSION_STATUS_LABELS, DEMO_NEXT, EARNING_STREAMS, FRANCHISE_STATUS_LABELS, NetworkApplicationSchema, NetworkSaleSchema, PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, STREAM_LABELS,
  ServiceRequestSchema, lineEarning, packagePrice, territoryConflicts, type PackageConfig, type TerritoryLike,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  demoAllocations, demoMaterials, franchiseOrders, franchiseTerritories, franchiseUnits, inventoryMovements, marketingAssets, networkCommissions, networkSettlements, organizations,
  serviceRequests, solarProducts, solarReferralCodes, solarReferrals, stockAllocations, storeInventory, users,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, RequireOrg, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { Idempotent } from '../../common/idempotency';
import { randomDigits } from '../../common/crypto';
import { NetworkService, bad, hist, staff, today, type Unit } from './network.service';

const OPEN = ['draft', 'applied', 'approved', 'agreement_signed', 'setup', 'live', 'suspended'];
const ACTIVE_PARTNER = ['approved', 'agreement_signed', 'setup', 'live'];
const PaymentSchema = z.object({ reference: z.string().trim().min(4).max(80), amount: z.number().int().positive(), method: z.enum(['bank_transfer', 'upi', 'cheque', 'gateway']) });

@ApiTags('unite-network')
@Controller()
export class NetworkController {
  constructor(@InjectDb() private db: Db, private svc: NetworkService, private audit: AuditService) {}

  // ---------------------------------------------------------------- packages, territories, applications
  @Get('network/packages')
  async packages() {
    const pk = await this.svc.packages();
    return pk.map((p) => ({ ...p, pricing: packagePrice(p, false), pricingWithLeadDna: p.leadDnaIncluded || p.leadDnaAddonPrice != null ? packagePrice(p, true) : null }));
  }

  @Get('network/territories')
  async availableTerritories(@Query('state') state?: string, @Query('district') district?: string, @Query('level') level?: string) {
    const rows = await this.db.select().from(franchiseTerritories).where(and(eq(franchiseTerritories.status, 'available'), state ? eq(franchiseTerritories.state, state) : undefined, district ? sql`lower(${franchiseTerritories.district}) = ${district.toLowerCase()}` : undefined, level ? eq(franchiseTerritories.level, level) : undefined)).orderBy(franchiseTerritories.state, franchiseTerritories.district, franchiseTerritories.name);
    return rows.map((t) => ({ id: t.id, level: t.level, name: t.name, state: t.state, district: t.district, pincodes: t.pincodes, exclusive: t.exclusive }));
  }

  /** The caller's applications and partner records. */
  @Get('network/mine')
  @RequireOrg()
  async mine(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(franchiseUnits).where(and(eq(franchiseUnits.franchiseeOrgId, ctx.orgId!), sql`${franchiseUnits.packageCode} is not null`)).orderBy(desc(franchiseUnits.createdAt));
    const pk = await this.svc.packages();
    const [org] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, ctx.orgId!));
    return { verified: org?.v === 'verified', units: rows.map((u) => this.summary(u, pk.find((p) => p.code === u.packageCode))) };
  }
  private summary(u: Unit, p?: PackageConfig) {
    return {
      id: u.id, code: u.code, packageCode: u.packageCode, packageName: p?.name ?? u.packageCode, status: u.status, statusLabel: FRANCHISE_STATUS_LABELS[u.status] ?? u.status, city: u.city, district: u.district, state: u.region,
      pincode: u.pincode, territory: u.territory, message: u.message, leadDnaAddon: u.leadDnaAddon, pricing: u.pricing, paymentStatus: u.paymentStatus, decisionNote: u.decisionNote, createdAt: u.createdAt,
    };
  }

  private async priced(ctx: RequestContext, b: z.infer<typeof NetworkApplicationSchema>) {
    const p = await this.svc.pkg(b.packageCode);
    let pricing;
    try { pricing = packagePrice(p, b.leadDnaAddon); } catch (e) { throw bad('leadDnaAddon', (e as Error).message); }
    let territory: typeof franchiseTerritories.$inferSelect | undefined;
    if (b.territoryId) {
      [territory] = await this.db.select().from(franchiseTerritories).where(eq(franchiseTerritories.id, b.territoryId)).limit(1);
      if (!territory) throw bad('territoryId', 'Territory not found');
      if (!p.exclusive) throw bad('territoryId', 'Store partners get a catchment area around their PIN code, not an exclusive territory');
      if (territory.level !== p.territoryLevel) throw bad('territoryId', `${p.name} is granted at ${p.territoryLevel} level`);
    }
    return { p, pricing: { ...pricing, packageVersion: p.version, packageName: p.name }, territory };
  }

  @Post('network/applications')
  @RequireOrg()
  async apply(@Ctx() ctx: RequestContext, @Body(body(NetworkApplicationSchema)) b: z.infer<typeof NetworkApplicationSchema>) {
    const { p, pricing, territory } = await this.priced(ctx, b);
    const brandOrgId = await this.svc.brandOrgId();
    const [dup] = await this.db.select({ id: franchiseUnits.id }).from(franchiseUnits).where(and(eq(franchiseUnits.franchiseeOrgId, ctx.orgId!), eq(franchiseUnits.brandOrgId, brandOrgId), sql`lower(${franchiseUnits.city}) = ${b.city.toLowerCase()}`, inArray(franchiseUnits.status, OPEN))).limit(1);
    if (dup) throw new ConflictException('You already have an open application or partnership for this city');
    const [u] = await this.db.insert(franchiseUnits).values({
      code: `US-${randomDigits(6)}`, brandOrgId, franchiseeOrgId: ctx.orgId!, format: p.code, city: b.city, region: b.state, district: b.district, pincode: b.pincode, message: b.message, status: 'draft',
      packageCode: p.code, packageVersion: p.version, leadDnaAddon: b.leadDnaAddon && !p.leadDnaIncluded, pricing, territoryId: territory?.id ?? null, exclusive: p.exclusive, termYears: p.termYears,
      territory: territory ? `${territory.name} (${territory.level}, ${territory.district})` : `Catchment around PIN ${b.pincode}`, appliedBy: ctx.userId,
    }).returning();
    await this.audit.record(ctx, { action: 'network.application.draft', objectType: 'franchise_unit', objectId: u.id, after: { package: p.code, version: p.version, total: pricing.total } });
    return this.summary(u, p);
  }

  @Post('network/applications/:id')
  @HttpCode(200)
  @RequireOrg()
  async update(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(NetworkApplicationSchema)) b: z.infer<typeof NetworkApplicationSchema>) {
    const u = await this.svc.ownUnit(ctx, id);
    if (u.status !== 'draft') throw new ConflictException('Only a draft (or an application returned for changes) can be edited');
    const { p, pricing, territory } = await this.priced(ctx, b);
    const [n] = await this.db.update(franchiseUnits).set({
      format: p.code, city: b.city, region: b.state, district: b.district, pincode: b.pincode, message: b.message, packageCode: p.code, packageVersion: p.version, leadDnaAddon: b.leadDnaAddon && !p.leadDnaIncluded,
      pricing, territoryId: territory?.id ?? null, exclusive: p.exclusive, termYears: p.termYears, territory: territory ? `${territory.name} (${territory.level}, ${territory.district})` : `Catchment around PIN ${b.pincode}`, updatedAt: new Date(),
    }).where(eq(franchiseUnits.id, id)).returning();
    return this.summary(n, p);
  }

  @Post('network/applications/:id/submit')
  @HttpCode(200)
  @RequireOrg()
  async submit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const u = await this.svc.ownUnit(ctx, id);
    if (u.status !== 'draft') throw new ConflictException('This application has already been submitted');
    const [org] = await this.db.select({ v: organizations.verificationStatus }).from(organizations).where(eq(organizations.id, u.franchiseeOrgId));
    if (org?.v !== 'verified') throw new ForbiddenException('Complete business verification (KYC / KYB documents) before submitting the application');
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    if (p.exclusive) {
      if (!u.territoryId) throw bad('territoryId', 'Choose a territory');
      const [t] = await this.db.select().from(franchiseTerritories).where(eq(franchiseTerritories.id, u.territoryId));
      if (t?.status !== 'available') throw new ConflictException('That territory is no longer available — choose another and resubmit');
    }
    await this.db.update(franchiseUnits).set({ status: 'applied', updatedAt: new Date() }).where(eq(franchiseUnits.id, id));
    await this.svc.notifyStaff(`New ${p.name} application ${u.code}`, `${u.city}, ${u.district} — ${u.territory}`, `/workspace/network/applications/${id}`);
    await this.audit.record(ctx, { action: 'network.application.submit', objectType: 'franchise_unit', objectId: id });
    return { ok: true, status: 'applied' };
  }

  /** The partner records the payment they made; finance verifies it against the bank. Rights are not activated here. */
  @Post('network/units/:id/payment')
  @HttpCode(200)
  @Idempotent()
  @RequireOrg()
  async pay(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PaymentSchema)) b: z.infer<typeof PaymentSchema>) {
    const u = await this.svc.ownUnit(ctx, id);
    if (!['approved', 'agreement_signed', 'setup'].includes(u.status)) throw new ConflictException('Payment is made after your application is approved');
    if (!['unpaid', 'rejected'].includes(u.paymentStatus)) throw new ConflictException(u.paymentStatus === 'verified' ? 'Payment is already verified' : 'Your payment is awaiting verification');
    const total = (u.pricing as { total: number }).total;
    if (b.amount !== total) throw bad('amount', `The amount due is ₹${(total / 100).toLocaleString('en-IN')} (package${u.leadDnaAddon ? ' + LeadDNA' : ''} + GST)`);
    await this.db.update(franchiseUnits).set({ paymentStatus: 'submitted', paymentReference: `${b.method}:${b.reference}`, paymentAmount: b.amount, updatedAt: new Date() }).where(eq(franchiseUnits.id, id));
    await this.svc.notifyStaff(`Payment to verify — ${u.code}`, `Reference ${b.reference}`, `/workspace/network/applications/${id}`);
    await this.audit.record(ctx, { action: 'network.payment.submitted', objectType: 'franchise_unit', objectId: id, after: { amount: b.amount, method: b.method } });
    return { ok: true, paymentStatus: 'submitted' };
  }

  // ---------------------------------------------------------------- partner dashboard
  @Get('network/units/:id/dashboard')
  async dashboard(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const u = await this.svc.ownUnit(ctx, id);
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    const [territory] = u.territoryId ? await this.db.select().from(franchiseTerritories).where(eq(franchiseTerritories.id, u.territoryId)) : [];
    const ent = await this.svc.leadDnaEntitlement(u.franchiseeOrgId);
    const orders = await this.db.select().from(franchiseOrders).where(and(eq(franchiseOrders.unitId, id), eq(franchiseOrders.kind, 'sale'))).orderBy(desc(franchiseOrders.createdAt)).limit(50);
    const stock = p.inventoryEnabled ? await this.db.select({ qty: storeInventory.qty, value: storeInventory.value, reorder: solarProducts.reorderLevel }).from(storeInventory).innerJoin(solarProducts, eq(solarProducts.id, storeInventory.productId)).where(eq(storeInventory.unitId, id)) : [];
    const demo = await this.db.select({ status: demoAllocations.status }).from(demoAllocations).where(eq(demoAllocations.unitId, id));
    const services = await this.db.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.unitId, id));
    const comm = await this.db.select({ stream: networkCommissions.stream, status: networkCommissions.status, amount: networkCommissions.amount }).from(networkCommissions).where(eq(networkCommissions.beneficiaryOrgId, u.franchiseeOrgId));
    const live = orders.filter((o) => o.status !== 'cancelled');
    const steps = [
      { key: 'submitted', label: 'Application submitted', done: !['draft'].includes(u.status) },
      { key: 'approved', label: 'Approved by Unite', done: ['approved', 'agreement_signed', 'setup', 'live', 'suspended'].includes(u.status) },
      { key: 'agreement', label: 'Agreement signed', done: ['agreement_signed', 'setup', 'live', 'suspended'].includes(u.status) },
      { key: 'payment', label: 'Payment verified by finance', done: u.paymentStatus === 'verified' },
      ...(p.inventoryEnabled ? [{ key: 'stock', label: 'Opening stock received', done: !!(u.checklist as Record<string, string>).stock }] : []),
      { key: 'active', label: 'Partnership active', done: ['live'].includes(u.status) },
    ];
    return {
      unit: { ...this.summary(u, p), agreementContractId: u.agreementContractId, paymentReference: u.paymentReference, openedAt: u.openedAt, agreementEnds: u.agreementEnds },
      package: p, steps,
      territory: territory ? { id: territory.id, name: territory.name, level: territory.level, district: territory.district, state: territory.state, pincodes: territory.pincodes, status: territory.status, exclusive: territory.exclusive, expiresOn: territory.expiresOn } : null,
      catchment: p.exclusive ? null : { pincode: u.pincode, note: 'Store partners serve a catchment area; it is not an exclusive territory.' },
      leadDna: { entitled: !!ent, source: ent?.source ?? null, validTo: ent?.validTo ?? null, offered: p.leadDnaIncluded ? 'included' : p.leadDnaAddonPrice != null ? 'add-on' : 'not available' },
      sales: {
        orders: live.length, value: live.reduce((a, o) => a + o.subtotal, 0), fromStock: live.filter((o) => o.fulfilment === 'from_stock').length, viaUnite: live.filter((o) => o.fulfilment === 'unite').length,
        awaitingAcceptance: live.filter((o) => o.fulfilment === 'unite' && o.fulfilmentStatus !== 'accepted').length,
        margin: live.reduce((a, o) => a + (o.lines as { earning?: { kind: string; amount: number } }[]).reduce((s, l) => s + (l.earning?.kind === 'margin' ? l.earning.amount : 0), 0), 0),
      },
      inventory: p.inventoryEnabled ? { skus: stock.filter((s) => s.qty > 0).length, units: stock.reduce((a, s) => a + s.qty, 0), value: stock.reduce((a, s) => a + s.value, 0), lowStock: stock.filter((s) => s.qty <= s.reorder).length } : null,
      earnings: EARNING_STREAMS.map((s) => {
        const rows = comm.filter((c) => c.stream === s), sum = (st: string[]) => rows.filter((r) => st.includes(r.status)).reduce((a, r) => a + r.amount, 0);
        return { stream: s, label: STREAM_LABELS[s], pending: sum(['pending', 'qualified']), approved: sum(['approved', 'payable']), paid: sum(['paid']) };
      }),
      demo: { open: demo.filter((d) => !['confirmed', 'rejected', 'returned'].includes(d.status)).length, held: demo.filter((d) => d.status === 'confirmed').length },
      service: { open: services.filter((s) => !['resolved', 'closed'].includes(s.status)).length, total: services.length },
      disclaimer: 'Earnings depend on verified sales and approvals. COLLABIZ and Unite Solar do not promise any fixed or minimum income.',
    };
  }

  // ---------------------------------------------------------------- LeadDNA (gated, server-side only)
  @Get('network/leaddna')
  @RequireOrg()
  async leadDna(@Ctx() ctx: RequestContext) {
    const e = await this.svc.leadDnaEntitlement(ctx.orgId);
    const configured = !!process.env.LEADDNA_API_URL && !!process.env.LEADDNA_API_KEY;
    return {
      entitled: !!e, source: e?.source ?? null, validTo: e?.validTo ?? null, connection: configured ? 'configured' : 'not_configured',
      message: !e ? 'LeadDNA is included with the District Franchise, or available as a paid add-on with the Basic and Master Franchise. Store partners use COLLABIZ lead registration.'
        : configured ? 'Your LeadDNA licence is active.' : 'Your LeadDNA licence is active. The LeadDNA connection is being set up by Unite — access opens as soon as it is connected.',
    };
  }

  @Post('network/leaddna/session')
  @HttpCode(200)
  @RequireOrg()
  async leadDnaSession(@Ctx() ctx: RequestContext) {
    const e = await this.svc.leadDnaEntitlement(ctx.orgId);
    if (!e) throw new ForbiddenException('Your partnership does not include LeadDNA');
    // The LeadDNA API contract has not been provided; no session is created until the adapter is configured.
    throw new ServiceUnavailableException('The LeadDNA connection is not configured yet');
  }

  // ---------------------------------------------------------------- catalogue
  @Get('network/products')
  async products(@Query('category') category?: string, @Query('q') q?: string) {
    const rows = await this.db.select().from(solarProducts).where(and(eq(solarProducts.status, 'active'), category ? eq(solarProducts.category, category) : undefined, q ? sql`(${solarProducts.name} ilike ${'%' + q + '%'} or ${solarProducts.sku} ilike ${'%' + q + '%'} or ${solarProducts.brand} ilike ${'%' + q + '%'})` : undefined)).orderBy(solarProducts.category, solarProducts.name);
    return { categories: PRODUCT_CATEGORIES.map((c) => ({ key: c, label: PRODUCT_CATEGORY_LABELS[c], count: rows.filter((r) => r.category === c).length })), products: rows };
  }

  // ---------------------------------------------------------------- inventory (stores with stock)
  @Get('network/units/:id/inventory')
  async inventory(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    const u = await this.svc.ownUnit(ctx, id);
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    if (!p.inventoryEnabled) return { enabled: false, message: 'This partnership has no stock. Sales are fulfilled by Unite Solar.' };
    const items = await this.db.select({ i: storeInventory, pr: solarProducts }).from(storeInventory).innerJoin(solarProducts, eq(solarProducts.id, storeInventory.productId)).where(eq(storeInventory.unitId, id)).orderBy(solarProducts.name);
    const moves = await this.db.select({ m: inventoryMovements, name: solarProducts.name, sku: solarProducts.sku }).from(inventoryMovements).innerJoin(solarProducts, eq(solarProducts.id, inventoryMovements.productId)).where(eq(inventoryMovements.unitId, id)).orderBy(desc(inventoryMovements.createdAt));
    const allocations = await this.db.select().from(stockAllocations).where(eq(stockAllocations.unitId, id)).orderBy(desc(stockAllocations.createdAt));
    const byKind = (k: string) => moves.filter((m) => m.m.kind === k).reduce((a, m) => a + Math.abs(m.m.qty * m.m.unitCost), 0);
    // Reconciliation: for each product, the journal must add up to what is on hand.
    const recon = items.map(({ i, pr }) => { const journal = moves.filter((m) => m.m.productId === i.productId).reduce((a, m) => a + m.m.qty, 0); return { sku: pr.sku, name: pr.name, onHand: i.qty, journal, ok: journal === i.qty }; });
    const allocated = allocations.filter((a) => a.status !== 'cancelled').reduce((a, x) => a + x.value, 0);
    return {
      enabled: true, stockEntitlement: p.stockAllocation, allocated, remainingAllocation: Math.max(0, p.stockAllocation - allocated),
      items: items.map(({ i, pr }) => ({ productId: i.productId, sku: pr.sku, name: pr.name, category: pr.category, qty: i.qty, value: i.value, partnerPrice: pr.partnerPrice, customerPrice: pr.customerPrice, reorderLevel: pr.reorderLevel, low: i.qty <= pr.reorderLevel })),
      allocations, movements: moves.slice(0, 100).map((m) => ({ ...m.m, name: m.name, sku: m.sku })),
      valuation: { onHand: items.reduce((a, x) => a + x.i.value, 0), received: byKind('allocation_received') + byKind('transfer_in'), sold: byKind('sale'), damaged: byKind('damage'), returnedToUnite: byKind('return_to_unite'), customerReturns: byKind('customer_return') },
      reconciliation: { ok: recon.every((r) => r.ok), rows: recon },
    };
  }

  /** Goods received note: the store confirms the allocated stock arrived; on-hand stock is created from it. */
  @Post('network/units/:id/allocations/:aid/receive')
  @HttpCode(200)
  @Idempotent()
  @RequireOrg()
  async receive(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Param('aid', ParseUUIDPipe) aid: string) {
    const u = await this.svc.ownUnit(ctx, id);
    if (u.franchiseeOrgId !== ctx.orgId) throw new ForbiddenException('The store confirms receipt of its own stock');
    return this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(stockAllocations).where(and(eq(stockAllocations.id, aid), eq(stockAllocations.unitId, id))).for('update');
      if (!a) throw new NotFoundException('Allocation not found');
      if (a.status !== 'dispatched') throw new ConflictException('This allocation has already been received');
      for (const l of a.lines as { productId: string; qty: number; unitCost: number; serials?: string[] }[])
        await this.svc.move(tx, { unitId: id, productId: l.productId, delta: l.qty, kind: 'allocation_received', unitCost: l.unitCost, reference: `${a.number} / ${a.invoiceNumber}`, userId: ctx.userId, serials: l.serials });
      await tx.update(stockAllocations).set({ status: 'received', receivedAt: new Date() }).where(eq(stockAllocations.id, aid));
      await tx.update(franchiseUnits).set({ checklist: sql`checklist || ${JSON.stringify({ stock: new Date().toISOString() })}::jsonb`, updatedAt: new Date() }).where(eq(franchiseUnits.id, id));
      await this.audit.record(ctx, { action: 'network.stock.received', objectType: 'stock_allocation', objectId: aid, after: { value: a.value } }, tx);
      return { ok: true };
    });
  }

  @Post('network/units/:id/inventory/movements')
  @HttpCode(200)
  @Idempotent()
  @RequireOrg()
  async movement(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ productId: z.string().uuid(), kind: z.enum(['damage', 'customer_return', 'return_to_unite']), qty: z.number().int().positive().max(10000), note: z.string().trim().min(3).max(500), serials: z.array(z.string().trim().min(1).max(60)).max(500).optional() }))) b: { productId: string; kind: string; qty: number; note: string; serials?: string[] }) {
    const u = await this.svc.ownUnit(ctx, id);
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    if (!p.inventoryEnabled) throw new ConflictException('This partnership has no stock');
    const [pr] = await this.db.select().from(solarProducts).where(eq(solarProducts.id, b.productId));
    if (!pr) throw bad('productId', 'Product not found');
    const qty = await this.db.transaction(async (tx) => {
      const n = await this.svc.move(tx, { unitId: id, productId: pr.id, delta: b.kind === 'customer_return' ? b.qty : -b.qty, kind: b.kind, unitCost: pr.partnerPrice, reference: `${b.kind.toUpperCase()}-${randomDigits(5)}`, userId: ctx.userId, serials: b.serials, note: b.note });
      await this.audit.record(ctx, { action: `network.stock.${b.kind}`, objectType: 'franchise_unit', objectId: id, after: { sku: pr.sku, qty: b.qty } }, tx);
      return n;
    });
    return { ok: true, onHand: qty };
  }

  // ---------------------------------------------------------------- sales and orders
  @Post('network/units/:id/sales')
  @Idempotent()
  @RequireOrg()
  async sale(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(NetworkSaleSchema)) b: z.infer<typeof NetworkSaleSchema>) {
    const u = await this.svc.ownUnit(ctx, id);
    if (u.franchiseeOrgId !== ctx.orgId) throw new ForbiddenException('Sales are recorded by the partner');
    if (u.status !== 'live') throw new ConflictException('Sales are recorded once the partnership is active');
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    if (b.fulfilment === 'from_stock' && !p.inventoryEnabled) throw bad('fulfilment', 'This partnership has no stock — raise the order for fulfilment by Unite Solar');
    const products = await this.db.select().from(solarProducts).where(inArray(solarProducts.id, b.lines.map((l) => l.productId)));
    const lines = b.lines.map((l) => {
      const pr = products.find((x) => x.id === l.productId);
      if (!pr || pr.status !== 'active') throw bad('lines', 'A product in this order is not in the catalogue');
      // Prices come from the catalogue, never from the browser.
      const earning = lineEarning({ qty: l.qty, unitPrice: pr.customerPrice }, pr, b.fulfilment, p.maxProductCommissionBps);
      return { productId: pr.id, item: pr.name, sku: pr.sku, qty: l.qty, unitPrice: pr.customerPrice, gstBps: pr.gstBps, partnerPrice: pr.partnerPrice, earning };
    });
    let subtotal = 0, gst = 0;
    for (const l of lines) { const net = l.qty * l.unitPrice; subtotal += net; gst += Math.round((net * l.gstBps) / 10000); }
    const number = `US-SO-${randomDigits(6)}`;
    return this.db.transaction(async (tx) => {
      const [o] = await tx.insert(franchiseOrders).values({
        unitId: id, number, kind: 'sale', customerName: b.customerName, customerPhone: b.customerPhone ?? null, pincode: b.pincode, orderDate: today(), lines, subtotal, gst, total: subtotal + gst,
        status: b.fulfilment === 'from_stock' ? 'delivered' : 'confirmed', fulfilment: b.fulfilment, fulfilmentStatus: b.fulfilment === 'unite' ? 'requested' : null, notes: b.notes ?? null, createdBy: ctx.userId,
        history: [{ at: new Date().toISOString(), by: ctx.userId, status: b.fulfilment === 'from_stock' ? 'delivered' : 'confirmed', to: b.fulfilment === 'from_stock' ? 'delivered' : 'confirmed', note: b.fulfilment === 'from_stock' ? 'Sold from store stock' : 'Fulfilment requested from Unite Solar' }],
      }).returning();
      if (b.fulfilment === 'from_stock') for (const l of lines) await this.svc.move(tx, { unitId: id, productId: l.productId, delta: -l.qty, kind: 'sale', unitCost: l.partnerPrice, reference: number, userId: ctx.userId });
      const comm = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.earning.kind === 'commission' && l.earning.amount > 0);
      if (comm.length) await tx.insert(networkCommissions).values(comm.map(({ l, i }) => ({
        stream: 'product', beneficiaryOrgId: u.franchiseeOrgId, unitId: id, sourceRef: `order:${number}:${i + 1}`, orderId: o.id, description: `${l.qty} × ${l.item} — ${b.customerName}`,
        base: l.earning.base, baseLabel: 'Sale value excl. GST', rateBps: l.earning.bps, amount: l.earning.amount, status: 'pending', inputs: { sku: l.sku, qty: l.qty }, createdBy: ctx.userId,
        history: [{ at: new Date().toISOString(), by: ctx.userId, to: 'pending', note: 'Awaiting customer payment and acceptance' }],
      })));
      await this.audit.record(ctx, { action: 'network.sale', objectType: 'franchise_order', objectId: o.id, after: { number, fulfilment: b.fulfilment, subtotal } }, tx);
      if (b.fulfilment === 'unite') await this.svc.notifyStaff(`Fulfilment request ${number}`, `${u.code}: ${lines.length} line(s) for ${b.customerName}, PIN ${b.pincode}`, `/workspace/network/orders`);
      return o;
    });
  }

  @Get('network/units/:id/sales')
  async sales(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.ownUnit(ctx, id);
    const orders = await this.db.select().from(franchiseOrders).where(and(eq(franchiseOrders.unitId, id), eq(franchiseOrders.kind, 'sale'))).orderBy(desc(franchiseOrders.createdAt));
    const comm = orders.length ? await this.db.select().from(networkCommissions).where(inArray(networkCommissions.orderId, orders.map((o) => o.id))) : [];
    return orders.map((o) => ({ ...o, commissions: comm.filter((c) => c.orderId === o.id).map((c) => ({ id: c.id, amount: c.amount, rateBps: c.rateBps, status: c.status, statusLabel: COMMISSION_STATUS_LABELS[c.status] })) }));
  }

  /** The partner records the customer's acceptance after delivery / installation. */
  @Post('network/orders/:oid/accept')
  @HttpCode(200)
  @RequireOrg()
  async accept(@Ctx() ctx: RequestContext, @Param('oid', ParseUUIDPipe) oid: string, @Body(body(z.object({ acceptedBy: z.string().trim().min(2).max(120), note: z.string().trim().max(500).optional() }))) b: { acceptedBy: string; note?: string }) {
    const [o] = await this.db.select().from(franchiseOrders).where(eq(franchiseOrders.id, oid));
    if (!o || o.fulfilment !== 'unite') throw new NotFoundException('Order not found');
    const u = await this.svc.ownUnit(ctx, o.unitId);
    if (u.franchiseeOrgId !== ctx.orgId) throw new ForbiddenException('The partner records customer acceptance');
    if (!['dispatched', 'installed'].includes(o.fulfilmentStatus ?? '')) throw new ConflictException('The order has not been delivered yet');
    await this.db.update(franchiseOrders).set({ fulfilmentStatus: 'accepted', status: 'delivered', history: hist(ctx.userId, 'accepted', `Accepted by ${b.acceptedBy}${b.note ? ` — ${b.note}` : ''}`) }).where(eq(franchiseOrders.id, oid));
    await this.qualify(oid, ctx.userId);
    return { ok: true };
  }

  @Post('network/orders/:oid/cancel')
  @HttpCode(200)
  async cancel(@Ctx() ctx: RequestContext, @Param('oid', ParseUUIDPipe) oid: string, @Body(body(z.object({ reason: z.string().trim().min(5).max(500) }))) b: { reason: string }) {
    const [o] = await this.db.select().from(franchiseOrders).where(eq(franchiseOrders.id, oid));
    if (!o || !o.fulfilment) throw new NotFoundException('Order not found');
    await this.svc.ownUnit(ctx, o.unitId);
    if (['cancelled', 'paid'].includes(o.status)) throw new ConflictException('This order cannot be cancelled');
    return this.db.transaction(async (tx) => {
      const comm = await tx.select().from(networkCommissions).where(eq(networkCommissions.orderId, oid)).for('update');
      if (comm.some((c) => ['payable', 'paid'].includes(c.status))) throw new ConflictException('Commission on this order is already in settlement — Unite finance must handle the return');
      await tx.update(networkCommissions).set({ status: 'reversed', history: hist(ctx.userId, 'reversed', `Order cancelled: ${b.reason}`), updatedAt: new Date() }).where(and(eq(networkCommissions.orderId, oid), ne(networkCommissions.status, 'reversed')));
      if (o.fulfilment === 'from_stock') for (const l of o.lines as { productId: string; qty: number; partnerPrice: number }[])
        await this.svc.move(tx, { unitId: o.unitId, productId: l.productId, delta: l.qty, kind: 'customer_return', unitCost: l.partnerPrice, reference: `${o.number} cancelled`, userId: ctx.userId, note: b.reason });
      await tx.update(franchiseOrders).set({ status: 'cancelled', history: hist(ctx.userId, 'cancelled', b.reason) }).where(eq(franchiseOrders.id, oid));
      await this.audit.record(ctx, { action: 'network.sale.cancel', objectType: 'franchise_order', objectId: oid, after: { reason: b.reason } }, tx);
      return { ok: true };
    });
  }

  /** Product commission becomes "qualified" once the customer's payment is verified and the customer has accepted. */
  async qualify(orderId: string, by: string) {
    const [o] = await this.db.select().from(franchiseOrders).where(eq(franchiseOrders.id, orderId));
    const rows = await this.db.select().from(networkCommissions).where(and(eq(networkCommissions.orderId, orderId), eq(networkCommissions.status, 'pending')));
    for (const c of rows) if (!this.svc.qualifyBlocker(c, o))
      await this.db.update(networkCommissions).set({ status: 'qualified', history: hist(by, 'qualified', 'Payment verified and customer accepted'), updatedAt: new Date() }).where(eq(networkCommissions.id, c.id));
  }

  // ---------------------------------------------------------------- earnings (five streams)
  @Get('network/earnings')
  @RequireOrg()
  async earnings(@Ctx() ctx: RequestContext) {
    const rows = await this.db.select().from(networkCommissions).where(eq(networkCommissions.beneficiaryOrgId, ctx.orgId!)).orderBy(desc(networkCommissions.createdAt));
    const settlements = await this.db.select().from(networkSettlements).where(eq(networkSettlements.beneficiaryOrgId, ctx.orgId!)).orderBy(desc(networkSettlements.createdAt));
    const units = await this.db.select({ id: franchiseUnits.id }).from(franchiseUnits).where(eq(franchiseUnits.franchiseeOrgId, ctx.orgId!));
    const stockSales = units.length ? await this.db.select({ lines: franchiseOrders.lines }).from(franchiseOrders).where(and(inArray(franchiseOrders.unitId, units.map((u) => u.id)), eq(franchiseOrders.fulfilment, 'from_stock'), ne(franchiseOrders.status, 'cancelled'))) : [];
    return {
      streams: EARNING_STREAMS.map((s) => {
        const r = rows.filter((x) => x.stream === s), sum = (st: string[]) => r.filter((x) => st.includes(x.status)).reduce((a, x) => a + x.amount, 0);
        return {
          stream: s, label: STREAM_LABELS[s],
          totals: { earned: sum(['pending', 'qualified', 'approved', 'payable', 'paid']), pending: sum(['pending', 'qualified']), approved: sum(['approved', 'payable']), paid: sum(['paid']), reversed: sum(['reversed']), blocked: sum(['blocked']) },
          entries: r.map((x) => ({ id: x.id, reference: x.sourceRef, description: x.description, base: x.base, baseLabel: x.baseLabel, rateBps: x.rateBps, amount: x.amount, status: x.status, statusLabel: COMMISSION_STATUS_LABELS[x.status], createdAt: x.createdAt, compliance: x.compliance })),
        };
      }),
      resaleMargin: stockSales.reduce((a, o) => a + (o.lines as { earning?: { kind: string; amount: number } }[]).reduce((s, l) => s + (l.earning?.kind === 'margin' ? l.earning.amount : 0), 0), 0),
      settlements,
      disclaimer: 'Amounts are shown as they are verified and approved. This is not a guaranteed or fixed income.',
    };
  }

  // ---------------------------------------------------------------- demo materials, marketing, service
  @Get('network/demo')
  @RequireOrg()
  async demo(@Ctx() ctx: RequestContext) {
    const materials = await this.db.select().from(demoMaterials).where(eq(demoMaterials.active, true)).orderBy(demoMaterials.name);
    const units = await this.db.select({ id: franchiseUnits.id }).from(franchiseUnits).where(eq(franchiseUnits.franchiseeOrgId, ctx.orgId!));
    const mine = units.length ? await this.db.select({ a: demoAllocations, name: demoMaterials.name, ownership: demoMaterials.ownership }).from(demoAllocations).innerJoin(demoMaterials, eq(demoMaterials.id, demoAllocations.materialId)).where(inArray(demoAllocations.unitId, units.map((u) => u.id))).orderBy(desc(demoAllocations.createdAt)) : [];
    return { materials, requests: mine.map((m) => ({ ...m.a, name: m.name, ownership: m.ownership, partnerActions: (DEMO_NEXT[m.a.status] ?? []).filter((n) => n.by === 'partner').map((n) => n.to) })) };
  }

  @Post('network/units/:id/demo-requests')
  @RequireOrg()
  async demoRequest(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ materialId: z.string().uuid(), qty: z.number().int().positive().max(50), note: z.string().trim().max(500).optional() }))) b: { materialId: string; qty: number; note?: string }) {
    const u = await this.svc.ownUnit(ctx, id);
    if (!ACTIVE_PARTNER.includes(u.status)) throw new ConflictException('Demo materials are available once your application is approved');
    const [m] = await this.db.select().from(demoMaterials).where(eq(demoMaterials.id, b.materialId));
    if (!m || !m.active) throw bad('materialId', 'Material not found');
    const [held] = await this.db.select({ n: sql<number>`coalesce(sum(${demoAllocations.qty}), 0)::int` }).from(demoAllocations).where(and(eq(demoAllocations.unitId, id), eq(demoAllocations.materialId, m.id), sql`${demoAllocations.status} not in ('rejected', 'returned')`));
    if (held.n + b.qty > m.maxPerPartner) throw bad('qty', `Up to ${m.maxPerPartner} per partner (${held.n} already requested or held)`);
    const [a] = await this.db.insert(demoAllocations).values({ unitId: id, materialId: m.id, qty: b.qty, note: b.note ?? null, createdBy: ctx.userId, history: [{ at: new Date().toISOString(), by: ctx.userId, to: 'requested', note: b.note ?? null }] }).returning();
    await this.svc.notifyStaff(`Demo material request — ${u.code}`, `${b.qty} × ${m.name}`, '/workspace/network/demo');
    return a;
  }

  /** Partner steps on a demo allocation: confirm receipt, report damage, return. */
  @Post('network/demo/:aid/status')
  @HttpCode(200)
  @RequireOrg()
  async demoStatus(@Ctx() ctx: RequestContext, @Param('aid', ParseUUIDPipe) aid: string, @Body(body(z.object({ to: z.string(), note: z.string().trim().max(500).optional() }))) b: { to: string; note?: string }) {
    const [a] = await this.db.select().from(demoAllocations).where(eq(demoAllocations.id, aid));
    if (!a) throw new NotFoundException('Request not found');
    const u = await this.svc.ownUnit(ctx, a.unitId);
    const isPartner = u.franchiseeOrgId === ctx.orgId;
    const step = (DEMO_NEXT[a.status] ?? []).find((n) => n.to === b.to && (n.by === 'partner' ? isPartner : staff(ctx)));
    if (!step) throw new ConflictException(`A request that is "${a.status}" cannot become "${b.to}" by you`);
    if (b.to === 'damaged' && !b.note) throw bad('note', 'Describe the damage');
    await this.db.update(demoAllocations).set({ status: b.to, history: hist(ctx.userId, b.to, b.note), updatedAt: new Date() }).where(eq(demoAllocations.id, aid));
    await this.audit.record(ctx, { action: 'network.demo.status', objectType: 'demo_allocation', objectId: aid, before: { status: a.status }, after: { status: b.to } });
    if (!isPartner) await this.svc.notifyOrg(u.franchiseeOrgId, `Demo material ${b.to}`, b.note ?? '', '/unite-solar/marketing');
    return { ok: true };
  }

  /** Marketing centre: approved Unite Solar material and the partner's QR referral link with attribution. */
  @Get('network/marketing')
  @RequireOrg()
  async marketing(@Ctx() ctx: RequestContext) {
    const [unit] = await this.db.select({ id: franchiseUnits.id }).from(franchiseUnits).where(and(eq(franchiseUnits.franchiseeOrgId, ctx.orgId!), sql`${franchiseUnits.packageCode} is not null`, inArray(franchiseUnits.status, ACTIVE_PARTNER))).limit(1);
    if (!unit) throw new ForbiddenException('The marketing centre opens once your partnership is approved');
    let [code] = await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.ownerUserId, ctx.userId)).limit(1);
    if (!code) {
      const [me] = await this.db.select({ name: users.fullName }).from(users).where(eq(users.id, ctx.userId));
      const stem = (me?.name ?? 'SUN').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5) || 'SUN';
      for (let i = 0; i < 5 && !code; i++) [code] = await this.db.insert(solarReferralCodes).values({ code: `${stem}${randomDigits(3)}`, ownerUserId: ctx.userId, ownerOrgId: ctx.orgId, ownerName: me?.name ?? 'Unite Solar partner' }).onConflictDoNothing().returning();
      if (!code) [code] = await this.db.select().from(solarReferralCodes).where(eq(solarReferralCodes.ownerUserId, ctx.userId)).limit(1);
    }
    const refs = await this.db.select({ status: solarReferrals.status }).from(solarReferrals).where(eq(solarReferrals.codeId, code.id));
    const assets = await this.db.select().from(marketingAssets).where(and(eq(marketingAssets.status, 'approved'), sql`(${marketingAssets.sector} = 'solar' or ${marketingAssets.sector} is null)`)).orderBy(marketingAssets.kind, marketingAssets.title);
    const base = (process.env.WEB_PUBLIC_URL ?? process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const link = (campaign: string) => `${base}/refer/${code.code}?utm_source=partner&utm_campaign=${campaign}`;
    return {
      referralCode: code.code, referralLink: `${base}/refer/${code.code}`, campaigns: ['whatsapp', 'flyer', 'store_display', 'social'].map((c) => ({ campaign: c, link: link(c) })),
      attribution: { leads: refs.length, byStatus: refs.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}) },
      assets: assets.map((a) => ({ id: a.id, kind: a.kind, title: a.title, body: a.body, channel: a.channel })),
    };
  }

  @Post('network/units/:id/service-requests')
  @RequireOrg()
  async service(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(ServiceRequestSchema)) b: z.infer<typeof ServiceRequestSchema>) {
    const u = await this.svc.ownUnit(ctx, id);
    if (!ACTIVE_PARTNER.includes(u.status)) throw new ConflictException('Service requests open once your application is approved');
    if (b.orderId) { const [o] = await this.db.select({ unitId: franchiseOrders.unitId }).from(franchiseOrders).where(eq(franchiseOrders.id, b.orderId)); if (o?.unitId !== id) throw bad('orderId', 'Order not found'); }
    const [r] = await this.db.insert(serviceRequests).values({ number: `SR-${randomDigits(6)}`, unitId: id, kind: b.kind, customerName: b.customerName, customerPhone: b.customerPhone ?? null, pincode: b.pincode ?? null, orderId: b.orderId ?? null, details: b.details, createdBy: ctx.userId }).returning();
    await this.svc.notifyStaff(`Service request ${r.number}`, `${u.code}: ${b.kind.replace(/_/g, ' ')} for ${b.customerName}`, '/workspace/network/service');
    return r;
  }

  @Get('network/units/:id/service-requests')
  async services(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.ownUnit(ctx, id);
    return this.db.select().from(serviceRequests).where(eq(serviceRequests.unitId, id)).orderBy(desc(serviceRequests.createdAt));
  }

  /** Territory lookup used by a partner's own record (exclusivity checks run on the admin side). */
  static conflicts(t: typeof franchiseTerritories.$inferSelect, others: (typeof franchiseTerritories.$inferSelect)[], unitId: string) {
    const like = (x: typeof franchiseTerritories.$inferSelect): TerritoryLike => ({ id: x.id, level: x.level as TerritoryLike['level'], state: x.state, district: x.district, pincodes: x.pincodes, exclusive: x.exclusive, status: x.status as TerritoryLike['status'], unitId: x.unitId });
    return territoryConflicts(like(t), others.map(like), unitId);
  }
}
