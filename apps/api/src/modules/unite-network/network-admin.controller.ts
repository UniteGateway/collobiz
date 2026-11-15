/**
 * Unite Solar Franchise Network — Admin Control Centre (tested in test/unite-network.e2e.ts).
 * Packages (versioned), application review, territory reservation/allocation, payment verification (finance), activation,
 * the product catalogue, stock allocation, order fulfilment, the five-stream commission ledger with maker-checker approval,
 * settlements, demo materials, service requests and network reports.
 */
import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  COMMISSION_NEXT, COMMISSION_STATUS_LABELS, DEMO_NEXT, EARNING_STREAMS, PACKAGE_KINDS, STREAM_LABELS, SolarProductSchema, NetworkTerritorySchema, districtProfitShare, interFranchiseCommission,
  investmentCommission, solarParkSplit, territoryConflicts, validatePackage, type PackageConfig, type TerritoryLike,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  contracts, demoAllocations, demoMaterials, franchiseOrders, franchisePackages, franchiseTerritories, franchiseUnits, networkCommissions, networkSettlements, organizations, partnerEntitlements,
  serviceRequests, solarProducts, stockAllocations, storeInventory,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { Idempotent } from '../../common/idempotency';
import { randomDigits } from '../../common/crypto';
import { NetworkController } from './network.controller';
import { NetworkService, addDays, addYears, bad, complianceRole, financeRole, hist, staff, today, type Commission } from './network.service';

type Territory = typeof franchiseTerritories.$inferSelect;
const like = (x: Territory): TerritoryLike => ({ id: x.id, level: x.level as TerritoryLike['level'], state: x.state, district: x.district, pincodes: x.pincodes, exclusive: x.exclusive, status: x.status as TerritoryLike['status'], unitId: x.unitId });
const PackageEditSchema = z.object({
  name: z.string().trim().min(3).max(80), tagline: z.string().trim().max(120), price: z.number().int().positive(), gstMode: z.enum(['extra', 'included']), gstBps: z.number().int().min(0).max(2800),
  leadDnaIncluded: z.boolean(), leadDnaAddonPrice: z.number().int().positive().nullable(), stockAllocation: z.number().int().min(0), storePackage: z.number().int().min(0),
  territoryLevel: z.enum(['pincode', 'mandal', 'city', 'district']).nullable(), exclusive: z.boolean(), inventoryEnabled: z.boolean(),
  maxProductCommissionBps: z.number().int().min(0).max(1000), districtProfitShareBps: z.number().int().min(0).max(5000), interFranchiseBps: z.number().int().min(0).max(5000),
  benefits: z.array(z.string().trim().min(2).max(160)).max(20), termYears: z.number().int().min(1).max(20),
}).partial();

@ApiTags('unite-network-admin')
@Controller('admin/network')
export class NetworkAdminController {
  constructor(@InjectDb() private db: Db, private svc: NetworkService, private partner: NetworkController, private audit: AuditService) {}
  private guard(ctx: RequestContext) { if (!staff(ctx)) throw new ForbiddenException('Unite administrators only'); }

  // ---------------------------------------------------------------- packages
  @Get('packages')
  async packages(@Ctx() ctx: RequestContext) {
    this.guard(ctx);
    await this.svc.packages();
    const rows = await this.db.select().from(franchisePackages).orderBy(franchisePackages.code, desc(franchisePackages.version));
    return rows.map((r) => ({ code: r.code, version: r.version, active: r.active, createdAt: r.createdAt, config: r.config }));
  }

  /** Editing a package creates a new version; existing applications keep the version they were priced with. */
  @Post('packages/:code')
  @HttpCode(200)
  async editPackage(@Ctx() ctx: RequestContext, @Param('code') code: string, @Body(body(PackageEditSchema)) b: z.infer<typeof PackageEditSchema>) {
    this.guard(ctx);
    if (!(PACKAGE_KINDS as readonly string[]).includes(code)) throw new NotFoundException('Package not found');
    const cur = await this.svc.pkg(code);
    const { version, ...prev } = cur;
    const next: PackageConfig = { ...prev, ...b, code: cur.code };
    const errors = validatePackage(next);
    if (errors.length) throw bad('config', errors.join('; '));
    return this.db.transaction(async (tx) => {
      await tx.update(franchisePackages).set({ active: false }).where(eq(franchisePackages.code, code));
      const [r] = await tx.insert(franchisePackages).values({ code, version: version + 1, active: true, config: next, updatedBy: ctx.userId }).returning();
      await this.audit.record(ctx, { action: 'network.package.edit', objectType: 'franchise_package', objectId: r.id, before: prev, after: next }, tx);
      return { code, version: r.version, config: next };
    });
  }

  // ---------------------------------------------------------------- applications
  @Get('applications')
  async applications(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    this.guard(ctx);
    const rows = await this.db.select({ u: franchiseUnits, org: organizations.displayName, verified: organizations.verificationStatus }).from(franchiseUnits).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId))
      .where(and(sql`${franchiseUnits.packageCode} is not null`, status ? eq(franchiseUnits.status, status) : ne(franchiseUnits.status, 'draft'))).orderBy(desc(franchiseUnits.updatedAt));
    return rows.map(({ u, org, verified }) => ({ id: u.id, code: u.code, partner: org, verified: verified === 'verified', packageCode: u.packageCode, packageVersion: u.packageVersion, status: u.status, city: u.city, district: u.district, state: u.region, pincode: u.pincode, territory: u.territory, territoryId: u.territoryId, leadDnaAddon: u.leadDnaAddon, pricing: u.pricing, paymentStatus: u.paymentStatus, paymentReference: u.paymentReference, paymentAmount: u.paymentAmount, agreementContractId: u.agreementContractId, decisionNote: u.decisionNote, createdAt: u.createdAt, message: u.message }));
  }

  @Get('applications/:id')
  async application(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.guard(ctx);
    const [row] = (await this.applications(ctx, undefined)).filter((a) => a.id === id);
    const u = row ?? (await this.svc.unit(id));
    const dash = await this.partner.dashboard(ctx, id);
    const allocations = await this.db.select().from(stockAllocations).where(eq(stockAllocations.unitId, id)).orderBy(desc(stockAllocations.createdAt));
    return { application: u, dashboard: dash, allocations };
  }

  /** approve (reserves the territory, sets the fee from the server price) · return for changes (back to draft) · reject. */
  @Post('applications/:id/decision')
  @HttpCode(200)
  async decide(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['approve', 'return', 'reject']), note: z.string().trim().max(1000).optional() }))) b: { decision: 'approve' | 'return' | 'reject'; note?: string }) {
    this.guard(ctx);
    const u = await this.svc.unit(id);
    if (u.status !== 'applied') throw new ConflictException('Only a submitted application can be decided');
    if (b.decision !== 'approve' && !b.note) throw bad('note', 'Tell the applicant why');
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    return this.db.transaction(async (tx) => {
      if (b.decision === 'approve' && p.exclusive) {
        await tx.execute(sql`select pg_advisory_xact_lock(7340377)`); // one territory decision at a time
        const [t] = await tx.select().from(franchiseTerritories).where(eq(franchiseTerritories.id, u.territoryId!)).for('update');
        if (!t || t.status !== 'available') throw new ConflictException('That territory is no longer available — return the application so the partner can choose another');
        const others = await tx.select().from(franchiseTerritories).where(and(eq(franchiseTerritories.state, t.state), inArray(franchiseTerritories.status, ['reserved', 'allocated'])));
        const clash = territoryConflicts({ ...like(t), status: 'reserved' }, others.map(like), id);
        if (clash.length) throw new ConflictException(`Territory overlaps an exclusive grant already reserved or allocated (${clash.map((c) => others.find((o) => o.id === c.id)?.name).join(', ')})`);
        await tx.update(franchiseTerritories).set({ status: 'reserved', unitId: id, expiresOn: addDays(today(), 60), updatedAt: new Date() }).where(eq(franchiseTerritories.id, t.id));
      }
      const status = b.decision === 'approve' ? 'approved' : b.decision === 'return' ? 'draft' : 'rejected';
      await tx.update(franchiseUnits).set({ status, decisionNote: b.note ?? null, decidedBy: ctx.userId, updatedAt: new Date(), ...(b.decision === 'approve' ? { fee: (u.pricing as { subtotal: number }).subtotal, royaltyBps: 0 } : {}) }).where(eq(franchiseUnits.id, id));
      await this.audit.record(ctx, { action: `network.application.${b.decision}`, objectType: 'franchise_unit', objectId: id, after: { status, note: b.note } }, tx);
      await this.svc.notifyOrg(u.franchiseeOrgId, `Your ${p.name} application: ${b.decision === 'approve' ? 'approved' : b.decision === 'return' ? 'returned for changes' : 'not approved'}`, b.note ?? 'Next: sign the agreement and make the payment.', `/unite-solar/my`);
      return { ok: true, status };
    });
  }

  /** Finance checks the payment against the bank statement. Initiating a payment never activates anything. */
  @Post('units/:id/payment')
  @HttpCode(200)
  @Idempotent()
  async verifyPayment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['verify', 'reject']), note: z.string().trim().max(500).optional() }))) b: { decision: 'verify' | 'reject'; note?: string }) {
    if (!financeRole(ctx)) throw new ForbiddenException('Finance verifies payments');
    const u = await this.svc.unit(id);
    if (u.paymentStatus !== 'submitted') throw new ConflictException('There is no payment awaiting verification');
    if (b.decision === 'reject' && !b.note) throw bad('note', 'Say why the payment could not be verified');
    await this.db.update(franchiseUnits).set({ paymentStatus: b.decision === 'verify' ? 'verified' : 'rejected', paymentVerifiedBy: ctx.userId, updatedAt: new Date(), ...(b.decision === 'verify' ? { checklist: sql`checklist || ${JSON.stringify({ fee: new Date().toISOString() })}::jsonb` } : {}) }).where(eq(franchiseUnits.id, id));
    await this.audit.record(ctx, { action: `network.payment.${b.decision}`, objectType: 'franchise_unit', objectId: id, after: { amount: u.paymentAmount, note: b.note } });
    await this.svc.notifyOrg(u.franchiseeOrgId, b.decision === 'verify' ? 'Payment verified' : 'Payment could not be verified', b.note ?? '', '/unite-solar/my');
    return { ok: true, paymentStatus: b.decision === 'verify' ? 'verified' : 'rejected' };
  }

  /** Activation: agreement executed + payment verified (+ opening stock received for stock stores). Allocates the territory and grants entitlements. */
  @Post('units/:id/activate')
  @HttpCode(200)
  async activate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    this.guard(ctx);
    let u = await this.svc.unit(id);
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    // The agreement is signed in Contracts; pick up its execution if the unit has not been refreshed since.
    if (u.status === 'approved' && u.agreementContractId) {
      const [c] = await this.db.select({ status: contracts.status }).from(contracts).where(eq(contracts.id, u.agreementContractId));
      if (c?.status === 'executed') [u] = await this.db.update(franchiseUnits).set({ status: 'agreement_signed', updatedAt: new Date() }).where(eq(franchiseUnits.id, id)).returning();
    }
    const missing: string[] = [];
    if (!['agreement_signed', 'setup'].includes(u.status)) missing.push('the agreement must be signed by both parties');
    if (u.paymentStatus !== 'verified') missing.push('finance must verify the payment');
    if (p.inventoryEnabled && !(u.checklist as Record<string, string>).stock) missing.push('the store must confirm receipt of its opening stock');
    if (missing.length) throw new ConflictException(`Cannot activate yet: ${missing.join('; ')}`);
    const start = today(), end = addYears(start, p.termYears);
    return this.db.transaction(async (tx) => {
      if (u.territoryId) {
        const [t] = await tx.select().from(franchiseTerritories).where(eq(franchiseTerritories.id, u.territoryId)).for('update');
        if (t?.unitId !== id || t.status !== 'reserved') throw new ConflictException('The territory reservation has lapsed — reserve it again first');
        await tx.update(franchiseTerritories).set({ status: 'allocated', expiresOn: end, updatedAt: new Date() }).where(eq(franchiseTerritories.id, t.id));
      }
      const grants = [...(p.leadDnaIncluded ? ['package'] : []), ...(u.leadDnaAddon ? ['addon'] : [])];
      if (grants.length) await tx.insert(partnerEntitlements).values({ orgId: u.franchiseeOrgId, unitId: id, product: 'leaddna', source: grants[0], validFrom: start, validTo: end, grantedBy: ctx.userId, note: grants[0] === 'addon' ? 'Paid add-on (payment verified)' : `Included with ${p.name}` });
      await tx.update(franchiseUnits).set({ status: 'live', openedAt: new Date(), agreementStarts: u.agreementStarts ?? start, agreementEnds: u.agreementEnds ?? end, updatedAt: new Date(), checklist: sql`checklist || ${JSON.stringify({ agreement: u.agreementContractId ? new Date().toISOString() : undefined })}::jsonb` }).where(eq(franchiseUnits.id, id));
      await this.audit.record(ctx, { action: 'network.activate', objectType: 'franchise_unit', objectId: id, after: { package: p.code, territory: u.territoryId, until: end, leadDna: grants } }, tx);
      await this.svc.notifyOrg(u.franchiseeOrgId, `Your ${p.name} is active`, `Valid until ${end}.`, '/unite-solar/my');
      return { ok: true, status: 'live', validTo: end };
    });
  }

  // ---------------------------------------------------------------- territories
  @Get('territories')
  async territories(@Ctx() ctx: RequestContext, @Query('state') state?: string, @Query('status') status?: string) {
    this.guard(ctx);
    const rows = await this.db.select({ t: franchiseTerritories, unit: franchiseUnits.code, partner: organizations.displayName }).from(franchiseTerritories).leftJoin(franchiseUnits, eq(franchiseUnits.id, franchiseTerritories.unitId)).leftJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId))
      .where(and(state ? eq(franchiseTerritories.state, state) : undefined, status ? eq(franchiseTerritories.status, status) : undefined)).orderBy(franchiseTerritories.state, franchiseTerritories.district, franchiseTerritories.name);
    return rows.map((r) => ({ ...r.t, unitCode: r.unit, partner: r.partner }));
  }

  @Post('territories')
  async createTerritory(@Ctx() ctx: RequestContext, @Body(body(NetworkTerritorySchema)) b: z.infer<typeof NetworkTerritorySchema>) {
    this.guard(ctx);
    const others = await this.db.select().from(franchiseTerritories).where(and(eq(franchiseTerritories.state, b.state), ne(franchiseTerritories.status, 'expired')));
    // Exclusive territories may not be drawn over each other, whatever their status.
    const clash = territoryConflicts({ id: 'new', ...b, status: 'available', unitId: null }, others.map((o) => ({ ...like(o), status: 'reserved', unitId: null })), 'new').filter((c) => others.find((o) => o.id === c.id)!.level === b.level || b.level === 'district' || c.level === 'district');
    if (clash.length) throw new ConflictException(`Overlaps existing exclusive territory: ${clash.map((c) => others.find((o) => o.id === c.id)?.name).join(', ')}`);
    const [t] = await this.db.insert(franchiseTerritories).values({ ...b, createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'network.territory.create', objectType: 'franchise_territory', objectId: t.id, after: b });
    return t;
  }

  @Post('territories/:id/action')
  @HttpCode(200)
  async territoryAction(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ action: z.enum(['release', 'renew', 'reassign', 'expire']), unitId: z.string().uuid().optional(), expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().trim().min(3).max(500) }))) b: { action: string; unitId?: string; expiresOn?: string; note: string }) {
    this.guard(ctx);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7340377)`);
      const [t] = await tx.select().from(franchiseTerritories).where(eq(franchiseTerritories.id, id)).for('update');
      if (!t) throw new NotFoundException('Territory not found');
      let set: Partial<Territory> = {};
      if (b.action === 'release') {
        if (t.status !== 'reserved') throw new ConflictException('Only a reservation can be released');
        set = { status: 'available', unitId: null, expiresOn: null };
        if (t.unitId) await tx.update(franchiseUnits).set({ territoryId: null, updatedAt: new Date() }).where(eq(franchiseUnits.id, t.unitId));
      } else if (b.action === 'renew') {
        if (t.status !== 'allocated' || !b.expiresOn || (t.expiresOn && b.expiresOn <= t.expiresOn)) throw bad('expiresOn', 'Give a new expiry date later than the current one');
        set = { expiresOn: b.expiresOn };
        await tx.update(franchiseUnits).set({ agreementEnds: b.expiresOn, updatedAt: new Date() }).where(eq(franchiseUnits.id, t.unitId!));
      } else if (b.action === 'reassign') {
        if (!['reserved', 'allocated'].includes(t.status) || !b.unitId) throw bad('unitId', 'Choose the partner to reassign to');
        const n = await this.svc.unit(b.unitId);
        const p = await this.svc.pkg(n.packageCode!, n.packageVersion);
        if (p.territoryLevel !== t.level || !p.exclusive) throw bad('unitId', `That partner's package is granted at ${p.territoryLevel} level`);
        if (t.unitId) await tx.update(franchiseUnits).set({ territoryId: null, updatedAt: new Date() }).where(eq(franchiseUnits.id, t.unitId));
        await tx.update(franchiseUnits).set({ territoryId: t.id, territory: `${t.name} (${t.level}, ${t.district})`, updatedAt: new Date() }).where(eq(franchiseUnits.id, n.id));
        set = { unitId: n.id };
      } else {
        set = { status: 'expired' };
      }
      await tx.update(franchiseTerritories).set({ ...set, updatedAt: new Date() }).where(eq(franchiseTerritories.id, id));
      await this.audit.record(ctx, { action: `network.territory.${b.action}`, objectType: 'franchise_territory', objectId: id, before: { status: t.status, unitId: t.unitId, expiresOn: t.expiresOn }, after: { ...set, note: b.note } }, tx);
      return { ok: true };
    });
  }

  // ---------------------------------------------------------------- entitlements
  @Get('entitlements')
  async entitlements(@Ctx() ctx: RequestContext) {
    this.guard(ctx);
    return this.db.select({ e: partnerEntitlements, org: organizations.displayName }).from(partnerEntitlements).innerJoin(organizations, eq(organizations.id, partnerEntitlements.orgId)).orderBy(desc(partnerEntitlements.createdAt)).then((r) => r.map((x) => ({ ...x.e, partner: x.org })));
  }
  @Post('entitlements')
  async grant(@Ctx() ctx: RequestContext, @Body(body(z.object({ orgId: z.string().uuid(), product: z.literal('leaddna'), validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().trim().min(5).max(500) }))) b: { orgId: string; product: string; validTo?: string; note: string }) {
    this.guard(ctx);
    const [e] = await this.db.insert(partnerEntitlements).values({ orgId: b.orgId, product: b.product, source: 'admin_grant', validFrom: today(), validTo: b.validTo ?? null, note: b.note, grantedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'network.entitlement.grant', objectType: 'partner_entitlement', objectId: e.id, after: b });
    return e;
  }
  @Post('entitlements/:id/revoke')
  @HttpCode(200)
  async revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ note: z.string().trim().min(5).max(500) }))) b: { note: string }) {
    this.guard(ctx);
    await this.db.update(partnerEntitlements).set({ status: 'revoked', note: b.note, updatedAt: new Date() }).where(eq(partnerEntitlements.id, id));
    await this.audit.record(ctx, { action: 'network.entitlement.revoke', objectType: 'partner_entitlement', objectId: id, after: b });
    return { ok: true };
  }

  // ---------------------------------------------------------------- products
  @Post('products')
  async createProduct(@Ctx() ctx: RequestContext, @Body(body(SolarProductSchema)) b: z.infer<typeof SolarProductSchema>) {
    this.guard(ctx);
    const [dup] = await this.db.select({ id: solarProducts.id }).from(solarProducts).where(eq(solarProducts.sku, b.sku));
    if (dup) throw new ConflictException('A product with this SKU already exists');
    const [p] = await this.db.insert(solarProducts).values({ ...b, model: b.model ?? null, imageUrl: b.imageUrl || null, datasheetUrl: b.datasheetUrl || null, installation: b.installation ?? null, updatedBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'network.product.create', objectType: 'solar_product', objectId: p.id, after: b });
    return p;
  }
  @Post('products/:id')
  @HttpCode(200)
  async updateProduct(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(SolarProductSchema)) b: z.infer<typeof SolarProductSchema>) {
    this.guard(ctx);
    const [cur] = await this.db.select().from(solarProducts).where(eq(solarProducts.id, id));
    if (!cur) throw new NotFoundException('Product not found');
    const [p] = await this.db.update(solarProducts).set({ ...b, model: b.model ?? null, imageUrl: b.imageUrl || null, datasheetUrl: b.datasheetUrl || null, installation: b.installation ?? null, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(solarProducts.id, id)).returning();
    await this.audit.record(ctx, { action: 'network.product.update', objectType: 'solar_product', objectId: id, before: { customerPrice: cur.customerPrice, partnerPrice: cur.partnerPrice, commissionBps: cur.commissionBps }, after: { customerPrice: b.customerPrice, partnerPrice: b.partnerPrice, commissionBps: b.commissionBps } });
    return p;
  }

  // ---------------------------------------------------------------- stock allocation and transfers
  @Post('units/:id/allocations')
  @Idempotent()
  async allocate(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().positive().max(10000), serials: z.array(z.string().trim().min(1).max(60)).max(10000).optional() })).min(1).max(60) }))) b: { lines: { productId: string; qty: number; serials?: string[] }[] }) {
    this.guard(ctx);
    const u = await this.svc.unit(id);
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    if (!p.inventoryEnabled) throw new ConflictException('This partner has no stock package — no inventory is created for it');
    if (u.paymentStatus !== 'verified') throw new ConflictException('Stock is allocated after finance verifies the package payment');
    const products = await this.db.select().from(solarProducts).where(inArray(solarProducts.id, b.lines.map((l) => l.productId)));
    const lines = b.lines.map((l) => {
      const pr = products.find((x) => x.id === l.productId);
      if (!pr) throw bad('lines', 'Unknown product');
      if (pr.serialised && (l.serials?.length ?? 0) !== l.qty) throw bad('lines', `${pr.name} is serialised — enter ${l.qty} serial number(s)`);
      return { productId: pr.id, sku: pr.sku, name: pr.name, qty: l.qty, unitCost: pr.partnerPrice, gstBps: pr.gstBps, serials: l.serials ?? [] };
    });
    const value = lines.reduce((a, l) => a + l.qty * l.unitCost, 0);
    const gst = lines.reduce((a, l) => a + Math.round((l.qty * l.unitCost * l.gstBps) / 10000), 0);
    return this.db.transaction(async (tx) => {
      await tx.select({ id: franchiseUnits.id }).from(franchiseUnits).where(eq(franchiseUnits.id, id)).for('update');
      const [done] = await tx.select({ v: sql<number>`coalesce(sum(${stockAllocations.value}), 0)::bigint` }).from(stockAllocations).where(and(eq(stockAllocations.unitId, id), ne(stockAllocations.status, 'cancelled')));
      const used = Number(done.v);
      if (used + value > p.stockAllocation) throw new ConflictException(`This allocation (₹${(value / 100).toLocaleString('en-IN')}) exceeds the remaining stock entitlement of ₹${((p.stockAllocation - used) / 100).toLocaleString('en-IN')} at partner price`);
      const n = randomDigits(6);
      const [a] = await tx.insert(stockAllocations).values({ unitId: id, number: `SA-${n}`, invoiceNumber: `US-INV-SA-${n}`, lines, value, gst, createdBy: ctx.userId }).returning();
      await this.audit.record(ctx, { action: 'network.stock.allocate', objectType: 'stock_allocation', objectId: a.id, after: { value, lines: lines.length } }, tx);
      await this.svc.notifyOrg(u.franchiseeOrgId, `Stock dispatched — ${a.number}`, `Invoice ${a.invoiceNumber}, value ₹${(value / 100).toLocaleString('en-IN')} + GST. Confirm receipt when it arrives.`, '/unite-solar/inventory');
      return a;
    });
  }

  @Post('transfers')
  @HttpCode(200)
  @Idempotent()
  async transfer(@Ctx() ctx: RequestContext, @Body(body(z.object({ fromUnitId: z.string().uuid(), toUnitId: z.string().uuid(), productId: z.string().uuid(), qty: z.number().int().positive().max(10000), note: z.string().trim().min(3).max(500) }))) b: { fromUnitId: string; toUnitId: string; productId: string; qty: number; note: string }) {
    this.guard(ctx);
    if (b.fromUnitId === b.toUnitId) throw bad('toUnitId', 'Choose a different store');
    for (const uid of [b.fromUnitId, b.toUnitId]) { const u = await this.svc.unit(uid); if (!(await this.svc.pkg(u.packageCode!, u.packageVersion)).inventoryEnabled) throw bad('toUnitId', `${u.code} has no stock package`); }
    const [pr] = await this.db.select().from(solarProducts).where(eq(solarProducts.id, b.productId));
    if (!pr) throw bad('productId', 'Product not found');
    const ref = `TR-${randomDigits(6)}`;
    return this.db.transaction(async (tx) => {
      await this.svc.move(tx, { unitId: b.fromUnitId, productId: pr.id, delta: -b.qty, kind: 'transfer_out', unitCost: pr.partnerPrice, reference: ref, userId: ctx.userId, note: b.note });
      await this.svc.move(tx, { unitId: b.toUnitId, productId: pr.id, delta: b.qty, kind: 'transfer_in', unitCost: pr.partnerPrice, reference: ref, userId: ctx.userId, note: b.note });
      await this.audit.record(ctx, { action: 'network.stock.transfer', objectType: 'solar_product', objectId: pr.id, after: b }, tx);
      return { ok: true, reference: ref };
    });
  }

  // ---------------------------------------------------------------- orders fulfilled by Unite
  @Get('orders')
  async orders(@Ctx() ctx: RequestContext) {
    this.guard(ctx);
    const rows = await this.db.select({ o: franchiseOrders, unit: franchiseUnits.code, partner: organizations.displayName }).from(franchiseOrders).innerJoin(franchiseUnits, eq(franchiseUnits.id, franchiseOrders.unitId)).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId))
      .where(sql`${franchiseOrders.fulfilment} is not null`).orderBy(desc(franchiseOrders.createdAt)).limit(300);
    return rows.map((r) => ({ ...r.o, unitCode: r.unit, partner: r.partner }));
  }

  @Post('orders/:oid/fulfilment')
  @HttpCode(200)
  async fulfil(@Ctx() ctx: RequestContext, @Param('oid', ParseUUIDPipe) oid: string, @Body(body(z.object({ status: z.enum(['dispatched', 'installed']), note: z.string().trim().max(500).optional() }))) b: { status: 'dispatched' | 'installed'; note?: string }) {
    this.guard(ctx);
    const [o] = await this.db.select().from(franchiseOrders).where(eq(franchiseOrders.id, oid));
    if (!o || o.fulfilment !== 'unite') throw new NotFoundException('Order not found');
    const allowed: Record<string, string[]> = { requested: ['dispatched'], dispatched: ['installed'] };
    if (o.status === 'cancelled' || !(allowed[o.fulfilmentStatus ?? ''] ?? []).includes(b.status)) throw new ConflictException(`An order that is "${o.fulfilmentStatus}" cannot become "${b.status}"`);
    await this.db.update(franchiseOrders).set({ fulfilmentStatus: b.status, history: hist(ctx.userId, b.status, b.note) }).where(eq(franchiseOrders.id, oid));
    const u = await this.svc.unit(o.unitId);
    await this.svc.notifyOrg(u.franchiseeOrgId, `Order ${o.number}: ${b.status}`, b.note ?? '', '/unite-solar/sales');
    return { ok: true };
  }

  @Post('orders/:oid/payment-verified')
  @HttpCode(200)
  async orderPayment(@Ctx() ctx: RequestContext, @Param('oid', ParseUUIDPipe) oid: string, @Body(body(z.object({ reference: z.string().trim().min(4).max(80) }))) b: { reference: string }) {
    if (!financeRole(ctx)) throw new ForbiddenException('Finance verifies customer payments');
    const [o] = await this.db.select().from(franchiseOrders).where(eq(franchiseOrders.id, oid));
    if (!o || o.fulfilment !== 'unite') throw new NotFoundException('Order not found');
    if (o.paymentVerified) throw new ConflictException('Already verified');
    await this.db.update(franchiseOrders).set({ paymentVerified: true, history: hist(ctx.userId, 'payment_verified', b.reference) }).where(eq(franchiseOrders.id, oid));
    await this.partner.qualify(oid, ctx.userId);
    await this.audit.record(ctx, { action: 'network.order.payment_verified', objectType: 'franchise_order', objectId: oid, after: b });
    return { ok: true };
  }

  // ---------------------------------------------------------------- commission ledger (five streams)
  @Get('commissions')
  async commissions(@Ctx() ctx: RequestContext, @Query('stream') stream?: string, @Query('status') status?: string) {
    if (!staff(ctx) && !financeRole(ctx) && !complianceRole(ctx)) throw new ForbiddenException('Unite administrators only');
    const rows = await this.db.select({ c: networkCommissions, partner: organizations.displayName }).from(networkCommissions).innerJoin(organizations, eq(organizations.id, networkCommissions.beneficiaryOrgId))
      .where(and(stream ? eq(networkCommissions.stream, stream) : undefined, status ? eq(networkCommissions.status, status) : undefined)).orderBy(desc(networkCommissions.createdAt)).limit(500);
    return {
      streams: EARNING_STREAMS.map((s) => ({ stream: s, label: STREAM_LABELS[s], ...Object.fromEntries(['pending', 'qualified', 'approved', 'payable', 'paid', 'reversed', 'blocked'].map((st) => [st, rows.filter((r) => r.c.stream === s && r.c.status === st).reduce((a, r) => a + r.c.amount, 0)])) })),
      entries: rows.map((r) => ({ ...r.c, partner: r.partner, statusLabel: COMMISSION_STATUS_LABELS[r.c.status], next: (COMMISSION_NEXT[r.c.status] ?? []).filter((n) => !['payable', 'paid'].includes(n)) })),
    };
  }

  /** Lifecycle moves. Approval is maker-checker: whoever entered an amount cannot approve it. Payable/paid happen only through settlements. */
  @Post('commissions/:id/status')
  @HttpCode(200)
  async commissionStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ to: z.enum(['qualified', 'approved', 'reversed', 'pending']), note: z.string().trim().max(500).optional() }))) b: { to: string; note?: string }) {
    this.guard(ctx);
    return this.db.transaction(async (tx) => {
      const [c] = await tx.select().from(networkCommissions).where(eq(networkCommissions.id, id)).for('update');
      if (!c) throw new NotFoundException('Entry not found');
      if (!(COMMISSION_NEXT[c.status] ?? []).includes(b.to)) throw new ConflictException(`An entry that is "${c.status}" cannot become "${b.to}"`);
      if (b.to === 'pending' && c.compliance === 'blocked') throw new ConflictException('Compliance has blocked this entry');
      if (b.to === 'qualified') {
        const [o] = c.orderId ? await tx.select().from(franchiseOrders).where(eq(franchiseOrders.id, c.orderId)) : [];
        const why = this.svc.qualifyBlocker(c, o);
        if (why) throw new ConflictException(`Cannot qualify: ${why}`);
      }
      if (b.to === 'approved' && c.createdBy === ctx.userId) throw new ForbiddenException('A second administrator must approve an amount you entered');
      if (b.to === 'reversed' && !b.note) throw bad('note', 'Give the reason for the reversal');
      await tx.update(networkCommissions).set({ status: b.to, history: hist(ctx.userId, b.to, b.note), updatedAt: new Date() }).where(eq(networkCommissions.id, id));
      await this.audit.record(ctx, { action: `network.commission.${b.to}`, objectType: 'network_commission', objectId: id, before: { status: c.status }, after: { status: b.to, amount: c.amount, note: b.note } }, tx);
      return { ok: true, status: b.to };
    });
  }

  private async insertEntries(ctx: RequestContext, rows: (typeof networkCommissions.$inferInsert)[]) {
    try {
      return await this.db.transaction(async (tx) => {
        const out = await tx.insert(networkCommissions).values(rows.map((r) => ({ ...r, createdBy: ctx.userId, history: [{ at: new Date().toISOString(), by: ctx.userId, to: r.status ?? 'pending', note: 'Entered' }] }))).returning();
        for (const e of out) await this.audit.record(ctx, { action: `network.commission.create.${e.stream}`, objectType: 'network_commission', objectId: e.id, after: { base: e.base, rateBps: e.rateBps, amount: e.amount, inputs: e.inputs } }, tx);
        return out;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505' || /network_commissions_uq/.test(String((e as Error).message) + String((e as { cause?: unknown }).cause))) throw new ConflictException('An entry for this source and partner already exists — no duplicate earnings');
      throw e;
    }
  }

  /** District profit share: package rate × (revenue − direct costs − approved expenses) for one period. */
  @Post('commissions/district')
  async district(@Ctx() ctx: RequestContext, @Body(body(z.object({ unitId: z.string().uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), revenue: z.number().int().min(0), directCosts: z.number().int().min(0), approvedExpenses: z.number().int().min(0), note: z.string().trim().max(500).optional() }))) b: { unitId: string; period: string; revenue: number; directCosts: number; approvedExpenses: number; note?: string }) {
    this.guard(ctx);
    const u = await this.svc.unit(b.unitId);
    const p = await this.svc.pkg(u.packageCode!, u.packageVersion);
    if (!p.districtProfitShareBps || u.status !== 'live') throw new ConflictException('Profit share applies to an active District Franchise');
    const r = districtProfitShare(b, p.districtProfitShareBps);
    return (await this.insertEntries(ctx, [{ stream: 'district_profit', beneficiaryOrgId: u.franchiseeOrgId, unitId: u.id, sourceRef: `district:${u.code}:${b.period}`, description: `${u.district} district net profit, ${b.period}`, base: r.distributable, baseLabel: 'Distributable net profit', rateBps: p.districtProfitShareBps, amount: r.amount, inputs: { ...b } }]))[0];
  }

  /** Inter-franchise: originating partner earns its package rate on the eligible pool set by Unite, released after project payment is verified. */
  @Post('commissions/inter-franchise')
  async interFranchise(@Ctx() ctx: RequestContext, @Body(body(z.object({ originUnitId: z.string().uuid(), executingUnitId: z.string().uuid(), leadReference: z.string().trim().min(3).max(80), projectReference: z.string().trim().min(3).max(80), eligiblePool: z.number().int().positive(), poolBasis: z.string().trim().min(5).max(300) }))) b: { originUnitId: string; executingUnitId: string; leadReference: string; projectReference: string; eligiblePool: number; poolBasis: string }) {
    this.guard(ctx);
    if (b.originUnitId === b.executingUnitId) throw bad('executingUnitId', 'The executing partner must be a different franchise');
    const o = await this.svc.unit(b.originUnitId), x = await this.svc.unit(b.executingUnitId);
    const p = await this.svc.pkg(o.packageCode!, o.packageVersion);
    if (!p.interFranchiseBps) throw bad('originUnitId', 'Inter-franchise commission applies to franchise partners only');
    const amount = interFranchiseCommission(b.eligiblePool, p.interFranchiseBps);
    return (await this.insertEntries(ctx, [{ stream: 'inter_franchise', beneficiaryOrgId: o.franchiseeOrgId, unitId: o.id, sourceRef: `interfranchise:${b.projectReference}`, description: `Lead ${b.leadReference} executed by ${x.code} (${x.district})`, base: b.eligiblePool, baseLabel: 'Eligible commission / profit pool', rateBps: p.interFranchiseBps, amount, inputs: { ...b, originUnit: o.code, executingUnit: x.code, paymentVerified: false } }]))[0];
  }

  @Post('commissions/:id/payment-verified')
  @HttpCode(200)
  async interPayment(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reference: z.string().trim().min(4).max(80) }))) b: { reference: string }) {
    if (!financeRole(ctx)) throw new ForbiddenException('Finance verifies project payments');
    const [c] = await this.db.select().from(networkCommissions).where(eq(networkCommissions.id, id));
    if (!c || c.stream !== 'inter_franchise') throw new NotFoundException('Entry not found');
    await this.db.update(networkCommissions).set({ inputs: { ...(c.inputs as object), paymentVerified: true, paymentReference: b.reference }, history: hist(ctx.userId, c.status, `Project payment verified: ${b.reference}`), updatedAt: new Date() }).where(eq(networkCommissions.id, id));
    await this.audit.record(ctx, { action: 'network.commission.payment_verified', objectType: 'network_commission', objectId: id, after: b });
    return { ok: true };
  }

  /** Solar park development: a pool of at most 2% of the approved eligible value, split among named contributors. */
  @Post('commissions/solar-park')
  async solarPark(@Ctx() ctx: RequestContext, @Body(body(z.object({ projectReference: z.string().trim().min(3).max(80), projectName: z.string().trim().min(3).max(160), eligibleValue: z.number().int().positive(), poolBps: z.number().int().min(1).max(200), contributors: z.array(z.object({ orgId: z.string().uuid(), bps: z.number().int().min(1).max(200), role: z.string().trim().min(3).max(120) })).min(1).max(20) }))) b: { projectReference: string; projectName: string; eligibleValue: number; poolBps: number; contributors: { orgId: string; bps: number; role: string }[] }) {
    this.guard(ctx);
    const prior = await this.db.select().from(networkCommissions).where(and(eq(networkCommissions.stream, 'solar_park'), sql`${networkCommissions.sourceRef} like ${`solarpark:${b.projectReference}:%`}`, ne(networkCommissions.status, 'reversed')));
    const priorPool = prior.length ? (prior[0].inputs as { poolBps: number }).poolBps : null;
    if (priorPool != null && priorPool !== b.poolBps) throw bad('poolBps', `This project's pool is already set at ${priorPool / 100}%`);
    let split;
    try { split = solarParkSplit(b.eligibleValue, b.poolBps, [...prior.map((p) => ({ orgId: p.beneficiaryOrgId, bps: p.rateBps })), ...b.contributors.map((c) => ({ orgId: c.orgId, bps: c.bps }))]); } catch (e) { throw bad('contributors', (e as Error).message); }
    const fresh = split.slice(prior.length);
    return this.insertEntries(ctx, fresh.map((s, i) => ({ stream: 'solar_park', beneficiaryOrgId: s.orgId, sourceRef: `solarpark:${b.projectReference}:${s.orgId}`, description: `${b.projectName} — ${b.contributors[i].role}`, base: b.eligibleValue, baseLabel: 'Approved eligible project value', rateBps: s.bps, amount: s.amount, inputs: { projectReference: b.projectReference, poolBps: b.poolBps, role: b.contributors[i].role } })));
  }

  /** Investment facilitation: 2% (max) of realised investment; blocked until compliance clears it; never where legally restricted. */
  @Post('commissions/investment')
  async investment(@Ctx() ctx: RequestContext, @Body(body(z.object({ orgId: z.string().uuid(), investmentReference: z.string().trim().min(3).max(80), investor: z.string().trim().min(2).max(160), realised: z.number().int().positive(), bps: z.number().int().min(1).max(200), legallyRestricted: z.boolean(), note: z.string().trim().max(500).optional() }))) b: { orgId: string; investmentReference: string; investor: string; realised: number; bps: number; legallyRestricted: boolean; note?: string }) {
    this.guard(ctx);
    const amount = investmentCommission(b.realised, b.bps);
    return (await this.insertEntries(ctx, [{ stream: 'investment', beneficiaryOrgId: b.orgId, sourceRef: `investment:${b.investmentReference}`, description: `Investment by ${b.investor}`, base: b.realised, baseLabel: 'Realised (received) investment', rateBps: b.bps, amount, status: b.legallyRestricted ? 'blocked' : 'pending', compliance: b.legallyRestricted ? 'blocked' : 'pending', inputs: { ...b } }]))[0];
  }

  @Post('commissions/:id/compliance')
  @HttpCode(200)
  async compliance(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ decision: z.enum(['cleared', 'blocked']), note: z.string().trim().min(5).max(500) }))) b: { decision: 'cleared' | 'blocked'; note: string }) {
    if (!complianceRole(ctx)) throw new ForbiddenException('Compliance decides this');
    const [c] = await this.db.select().from(networkCommissions).where(eq(networkCommissions.id, id));
    if (!c || c.stream !== 'investment') throw new NotFoundException('Entry not found');
    if (['payable', 'paid', 'reversed'].includes(c.status)) throw new ConflictException('This entry is closed');
    if (b.decision === 'cleared' && (c.inputs as { legallyRestricted?: boolean }).legallyRestricted) throw new ConflictException('A legally restricted investment cannot earn a facilitation fee');
    const status = b.decision === 'blocked' ? 'blocked' : c.status === 'blocked' ? 'pending' : c.status;
    await this.db.update(networkCommissions).set({ compliance: b.decision, status, history: hist(ctx.userId, status, `Compliance ${b.decision}: ${b.note}`), updatedAt: new Date() }).where(eq(networkCommissions.id, id));
    await this.audit.record(ctx, { action: `network.commission.compliance.${b.decision}`, objectType: 'network_commission', objectId: id, after: b });
    return { ok: true, status };
  }

  // ---------------------------------------------------------------- settlements (partner wallet)
  @Get('settlements')
  async settlements(@Ctx() ctx: RequestContext) {
    if (!staff(ctx) && !financeRole(ctx)) throw new ForbiddenException('Unite administrators only');
    const rows = await this.db.select({ s: networkSettlements, partner: organizations.displayName }).from(networkSettlements).innerJoin(organizations, eq(organizations.id, networkSettlements.beneficiaryOrgId)).orderBy(desc(networkSettlements.createdAt));
    return rows.map((r) => ({ ...r.s, partner: r.partner }));
  }

  @Post('settlements')
  @Idempotent()
  async settle(@Ctx() ctx: RequestContext, @Body(body(z.object({ orgId: z.string().uuid() }))) b: { orgId: string }) {
    if (!financeRole(ctx)) throw new ForbiddenException('Finance prepares settlements');
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(networkCommissions).where(and(eq(networkCommissions.beneficiaryOrgId, b.orgId), eq(networkCommissions.status, 'approved'))).for('update');
      if (!rows.length) throw new ConflictException('Nothing approved to settle for this partner');
      const amount = rows.reduce((a, r) => a + r.amount, 0);
      const [s] = await tx.insert(networkSettlements).values({ number: `US-SET-${randomDigits(6)}`, beneficiaryOrgId: b.orgId, amount, entries: rows.length, createdBy: ctx.userId }).returning();
      await tx.update(networkCommissions).set({ status: 'payable', settlementId: s.id, history: hist(ctx.userId, 'payable', s.number), updatedAt: new Date() }).where(inArray(networkCommissions.id, rows.map((r) => r.id)));
      await this.audit.record(ctx, { action: 'network.settlement.create', objectType: 'network_settlement', objectId: s.id, after: { amount, entries: rows.length } }, tx);
      return s;
    });
  }

  @Post('settlements/:id/paid')
  @HttpCode(200)
  @Idempotent()
  async paid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ reference: z.string().trim().min(4).max(80) }))) b: { reference: string }) {
    if (!financeRole(ctx)) throw new ForbiddenException('Finance records payouts');
    return this.db.transaction(async (tx) => {
      const [s] = await tx.select().from(networkSettlements).where(eq(networkSettlements.id, id)).for('update');
      if (!s) throw new NotFoundException('Settlement not found');
      if (s.status !== 'payable') throw new ConflictException('Already paid');
      if (s.createdBy === ctx.userId) throw new ForbiddenException('A second finance user records the payout');
      await tx.update(networkSettlements).set({ status: 'paid', paymentReference: b.reference, paidAt: new Date() }).where(eq(networkSettlements.id, id));
      await tx.update(networkCommissions).set({ status: 'paid', history: hist(ctx.userId, 'paid', b.reference), updatedAt: new Date() }).where(eq(networkCommissions.settlementId, id));
      await this.audit.record(ctx, { action: 'network.settlement.paid', objectType: 'network_settlement', objectId: id, after: b }, tx);
      await this.svc.notifyOrg(s.beneficiaryOrgId, `Payout ${s.number} paid`, `₹${(s.amount / 100).toLocaleString('en-IN')} — reference ${b.reference}. TDS, if applicable, is shown on your statement.`, '/unite-solar/earnings');
      return { ok: true };
    });
  }

  // ---------------------------------------------------------------- demo materials and service requests
  @Get('demo')
  async demo(@Ctx() ctx: RequestContext) {
    this.guard(ctx);
    const materials = await this.db.select().from(demoMaterials).orderBy(demoMaterials.name);
    const requests = await this.db.select({ a: demoAllocations, name: demoMaterials.name, unit: franchiseUnits.code, partner: organizations.displayName }).from(demoAllocations).innerJoin(demoMaterials, eq(demoMaterials.id, demoAllocations.materialId)).innerJoin(franchiseUnits, eq(franchiseUnits.id, demoAllocations.unitId)).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId)).orderBy(desc(demoAllocations.createdAt));
    return { materials, requests: requests.map((r) => ({ ...r.a, name: r.name, unitCode: r.unit, partner: r.partner, adminActions: (DEMO_NEXT[r.a.status] ?? []).filter((n) => n.by === 'admin').map((n) => n.to) })) };
  }
  @Post('demo-materials')
  async createMaterial(@Ctx() ctx: RequestContext, @Body(body(z.object({ name: z.string().trim().min(3).max(120), kind: z.enum(['display_stand', 'sample_panel', 'inverter_demo', 'kit_sample', 'display_board', 'brochure', 'catalogue']), ownership: z.enum(['company_owned', 'partner_owned', 'returnable']), unitValue: z.number().int().min(0), chargeable: z.boolean(), maxPerPartner: z.number().int().min(1).max(500) }))) b: typeof demoMaterials.$inferInsert) {
    this.guard(ctx);
    const [m] = await this.db.insert(demoMaterials).values(b).returning();
    await this.audit.record(ctx, { action: 'network.demo_material.create', objectType: 'demo_material', objectId: m.id, after: b });
    return m;
  }
  @Get('service-requests')
  async serviceRequests(@Ctx() ctx: RequestContext) {
    this.guard(ctx);
    const rows = await this.db.select({ r: serviceRequests, unit: franchiseUnits.code, partner: organizations.displayName }).from(serviceRequests).innerJoin(franchiseUnits, eq(franchiseUnits.id, serviceRequests.unitId)).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId)).orderBy(desc(serviceRequests.createdAt));
    return rows.map((r) => ({ ...r.r, unitCode: r.unit, partner: r.partner }));
  }
  @Post('service-requests/:id')
  @HttpCode(200)
  async updateService(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(z.object({ status: z.enum(['assigned', 'in_progress', 'resolved', 'closed']), assignedTo: z.string().trim().max(120).optional(), resolution: z.string().trim().max(1000).optional() }))) b: { status: string; assignedTo?: string; resolution?: string }) {
    this.guard(ctx);
    if (b.status === 'resolved' && !b.resolution) throw bad('resolution', 'Describe how it was resolved');
    const [r] = await this.db.update(serviceRequests).set({ status: b.status, ...(b.assignedTo ? { assignedTo: b.assignedTo } : {}), ...(b.resolution ? { resolution: b.resolution } : {}), updatedAt: new Date() }).where(eq(serviceRequests.id, id)).returning();
    if (!r) throw new NotFoundException('Request not found');
    const u = await this.svc.unit(r.unitId);
    await this.svc.notifyOrg(u.franchiseeOrgId, `Service request ${r.number}: ${b.status.replace(/_/g, ' ')}`, b.resolution ?? b.assignedTo ?? '', '/unite-solar/support');
    return r;
  }

  // ---------------------------------------------------------------- reports
  @Get('dashboard')
  async dashboard(@Ctx() ctx: RequestContext, @Query('state') state?: string, @Query('district') district?: string, @Query('pincode') pincode?: string, @Query('type') type?: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (!staff(ctx) && !financeRole(ctx)) throw new ForbiddenException('Unite administrators only');
    const pk = await this.svc.packages();
    const units = await this.db.select({ u: franchiseUnits, partner: organizations.displayName }).from(franchiseUnits).innerJoin(organizations, eq(organizations.id, franchiseUnits.franchiseeOrgId))
      .where(and(sql`${franchiseUnits.packageCode} is not null`, state ? eq(franchiseUnits.region, state) : undefined, district ? sql`lower(${franchiseUnits.district}) = ${district.toLowerCase()}` : undefined, pincode ? eq(franchiseUnits.pincode, pincode) : undefined, type ? eq(franchiseUnits.packageCode, type) : undefined));
    const ids = units.map((x) => x.u.id);
    const orders = ids.length ? await this.db.select().from(franchiseOrders).where(and(inArray(franchiseOrders.unitId, ids), eq(franchiseOrders.kind, 'sale'), ne(franchiseOrders.status, 'cancelled'), from ? gte(franchiseOrders.orderDate, from) : undefined, to ? lte(franchiseOrders.orderDate, to) : undefined)) : [];
    const comm = ids.length ? await this.db.select().from(networkCommissions).where(inArray(networkCommissions.beneficiaryOrgId, [...new Set(units.map((x) => x.u.franchiseeOrgId))])) : [];
    const stock = ids.length ? await this.db.select({ unitId: storeInventory.unitId, qty: storeInventory.qty, value: storeInventory.value, reorder: solarProducts.reorderLevel }).from(storeInventory).innerJoin(solarProducts, eq(solarProducts.id, storeInventory.productId)).where(inArray(storeInventory.unitId, ids)) : [];
    const salesOf = (uid: string) => orders.filter((o) => o.unitId === uid).reduce((a, o) => a + o.subtotal, 0);
    const group = (key: (x: (typeof units)[number]) => string | null) => {
      const m = new Map<string, { key: string; partners: number; active: number; sales: number; orders: number }>();
      for (const x of units) { const k = key(x) ?? '—'; const g = m.get(k) ?? { key: k, partners: 0, active: 0, sales: 0, orders: 0 }; g.partners++; if (x.u.status === 'live') g.active++; g.sales += salesOf(x.u.id); g.orders += orders.filter((o) => o.unitId === x.u.id).length; m.set(k, g); }
      return [...m.values()].sort((a, b) => b.sales - a.sales);
    };
    const count = (st: string[]) => units.filter((x) => st.includes(x.u.status)).length;
    return {
      kpis: {
        partners: units.length, active: count(['live']), applications: count(['applied']), awaitingAgreement: count(['approved']), paymentsToVerify: units.filter((x) => x.u.paymentStatus === 'submitted').length,
        packageRevenue: units.filter((x) => x.u.paymentStatus === 'verified').reduce((a, x) => a + ((x.u.pricing as { subtotal?: number })?.subtotal ?? 0), 0),
        sales: orders.reduce((a, o) => a + o.subtotal, 0), orders: orders.length, pendingFulfilment: orders.filter((o) => o.fulfilment === 'unite' && o.fulfilmentStatus !== 'accepted').length,
        stockValue: stock.reduce((a, s) => a + s.value, 0), lowStock: stock.filter((s) => s.qty <= s.reorder).length,
      },
      byPackage: pk.map((p) => ({ code: p.code, name: p.name, price: p.price, partners: units.filter((x) => x.u.packageCode === p.code).length, active: units.filter((x) => x.u.packageCode === p.code && x.u.status === 'live').length, sales: units.filter((x) => x.u.packageCode === p.code).reduce((a, x) => a + salesOf(x.u.id), 0) })),
      byState: group((x) => x.u.region), byDistrict: group((x) => `${x.u.district ?? '—'}, ${x.u.region}`), byPincode: group((x) => x.u.pincode),
      byPartner: units.map((x) => ({ id: x.u.id, code: x.u.code, partner: x.partner, packageCode: x.u.packageCode, status: x.u.status, district: x.u.district, state: x.u.region, pincode: x.u.pincode, sales: salesOf(x.u.id), orders: orders.filter((o) => o.unitId === x.u.id).length, paymentStatus: x.u.paymentStatus })).sort((a, b) => b.sales - a.sales),
      commissions: EARNING_STREAMS.map((s) => { const r = comm.filter((c: Commission) => c.stream === s); const sum = (st: string[]) => r.filter((c) => st.includes(c.status)).reduce((a, c) => a + c.amount, 0); return { stream: s, label: STREAM_LABELS[s], pending: sum(['pending', 'qualified']), approved: sum(['approved']), payable: sum(['payable']), paid: sum(['paid']), reversed: sum(['reversed']), blocked: sum(['blocked']) }; }),
      filters: { state: state ?? null, district: district ?? null, pincode: pincode ?? null, type: type ?? null, from: from ?? null, to: to ?? null },
    };
  }
}
