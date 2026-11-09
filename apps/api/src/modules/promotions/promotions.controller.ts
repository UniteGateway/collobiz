/**
 * Promotions — "Buy X, get Y free" (BOGO) across the COLLABIZ online store and every physical store.
 *
 * Rules (tested in test/promotions.e2e.ts):
 *  - Unite admins draft promotions; only a super admin or finance can make one live, and someone other than its author unless
 *    they are a super admin (two-person rule for giving stock away). Every promotion has dates, terms and a budget
 *    (free units and/or free value); it stops by itself when the budget is used up.
 *  - The online store prices every cart on the server; free units are recorded per promotion, and released if the order is cancelled.
 *  - In stores, customers claim a voucher (one per mobile number per promotion); store staff — Unite admins or members of a
 *    live franchise — redeem it once against a bill, with the customer's mobile number as a check.
 *  - With ERPNext connected, a live promotion can be sent as a POS Pricing Rule so tills apply it automatically.
 */
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  INDIA_MOBILE, PromotionSchema, STORE_ORDER_NEXT, StoreOrderSchema, VoucherClaimSchema, VoucherRedeemSchema, applyPromotions, phone10, promoApplies, promoCovers, promoLabel,
  type CartLine, type PromoLike,
} from '@collabiz/types';
import { InjectDb, type Db } from '../../db/client';
import {
  catalogItems, franchiseUnits, groupCompanies, memberships, notifications, organizations, promoRedemptions, promoVouchers, promotions, solarKits, solarReferralCodes, storeOrders,
} from '../../db/schema';
import { body } from '../../common/http';
import { Ctx, Public, type RequestContext } from '../../common/context';
import { AuditService } from '../../common/audit.service';
import { randomDigits } from '../../common/crypto';
import { ErpnextSource, erpSource } from '../erp/erp.source';

const staff = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'unite_admin');
const money = (ctx: RequestContext) => ctx.platformRoles.some((r) => r === 'super_admin' || r === 'finance');
const SAMPLE_STORES = ['Solar Experience Centre — Hyderabad', 'Franchise Store — Vijayawada', 'Franchise Store — Pune'];
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const voucherCode = () => `BOGO-${Array.from({ length: 4 }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('')}-${Array.from({ length: 4 }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('')}`;
type Promo = typeof promotions.$inferSelect;
const asLike = (p: Promo): PromoLike => ({ ...p, budgetValue: p.budgetValue ?? null, budgetUnits: p.budgetUnits ?? null });

export interface StoreProduct { ref: string; name: string; sector: string; price: number; description: string; kind: 'kit' | 'item'; image: boolean; capacityKw?: number; system?: string }

@Injectable()
export class PromotionsService {
  constructor(@InjectDb() private db: Db) {}

  /** Everything sold in the online store: active solar kits and catalogue products given a store price. */
  async products(): Promise<StoreProduct[]> {
    const kits = await this.db.select().from(solarKits).where(eq(solarKits.status, 'active')).orderBy(sql`array_position(array['on_grid','hybrid','off_grid'], ${solarKits.system})`, solarKits.capacityW);
    const items = await this.db.select().from(catalogItems).where(and(eq(catalogItems.status, 'published'), isNotNull(catalogItems.storePrice))).orderBy(catalogItems.name);
    return [
      ...kits.map((k) => ({ ref: `kit:${k.id}`, name: k.name, sector: 'Solar kits', price: k.price, description: k.description, kind: 'kit' as const, image: false, capacityKw: k.capacityW / 1000, system: k.system })),
      ...items.map((i) => ({ ref: `item:${i.id}`, name: i.name, sector: i.sector, price: i.storePrice!, description: i.description, kind: 'item' as const, image: !!i.imageKey })),
    ];
  }
  async promos(where?: ReturnType<typeof eq>) { return this.db.select().from(promotions).where(where).orderBy(desc(promotions.createdAt)); }
  async stores() {
    const s = erpSource();
    let names = SAMPLE_STORES;
    if (s instanceof ErpnextSource) names = (await s.client.list<{ name: string }>('POS Profile', { fields: ['name'], filters: [['disabled', '=', 0]], limit: 200 }).catch(() => [])).map((r) => r.name);
    const fr = await this.db.select({ city: franchiseUnits.city, code: franchiseUnits.code, brand: organizations.displayName }).from(franchiseUnits).innerJoin(organizations, eq(organizations.id, franchiseUnits.brandOrgId)).where(eq(franchiseUnits.status, 'live'));
    return [...new Set([...names, ...fr.map((f) => `${f.brand} franchise — ${f.city} (${f.code})`)])];
  }
  /** Stores this person may redeem vouchers at: every store for Unite admins; their own live franchise stores for franchisees. */
  async storesFor(ctx: RequestContext) {
    if (staff(ctx)) return this.stores();
    if (!ctx.orgId) return [];
    const fr = await this.db.select({ city: franchiseUnits.city, code: franchiseUnits.code, brand: organizations.displayName }).from(franchiseUnits).innerJoin(organizations, eq(organizations.id, franchiseUnits.brandOrgId))
      .where(and(eq(franchiseUnits.franchiseeOrgId, ctx.orgId), eq(franchiseUnits.status, 'live')));
    return fr.map((f) => `${f.brand} franchise — ${f.city} (${f.code})`);
  }
  /** Prices a cart against live online promotions. */
  async price(lines: { ref: string; qty: number }[], tx: Db = this.db, lock = false) {
    const products = new Map((await this.products()).map((p) => [p.ref, p]));
    const cart: CartLine[] = lines.map((l) => {
      const p = products.get(l.ref);
      if (!p) throw new BadRequestException('A product in the cart is no longer sold online — refresh the store');
      return { ref: l.ref, name: p.name, sector: p.sector, unitPrice: p.price, qty: l.qty };
    });
    const live = lock
      ? await tx.select().from(promotions).where(eq(promotions.status, 'active')).for('update')
      : await tx.select().from(promotions).where(eq(promotions.status, 'active'));
    return applyPromotions(cart, live.map(asLike), 'online');
  }
  view(p: Promo) {
    return {
      id: p.id, code: p.code, name: p.name, label: promoLabel(p), buyQty: p.buyQty, getQty: p.getQty, scope: p.scope, sectors: p.sectors, itemRefs: p.itemRefs, channel: p.channel, stores: p.stores,
      maxFreePerOrder: p.maxFreePerOrder, budgetUnits: p.budgetUnits, budgetValue: p.budgetValue, usedUnits: p.usedUnits, usedValue: p.usedValue, startsAt: p.startsAt, endsAt: p.endsAt, terms: p.terms,
      status: p.status, live: promoApplies(asLike(p), p.channel === 'store' ? 'store' : 'online', p.stores[0] ?? null) || promoApplies(asLike(p), 'store', p.stores[0] ?? null), approvedAt: p.approvedAt, erpRuleName: p.erpRuleName, createdAt: p.createdAt,
    };
  }
  async notifyStaff(title: string, text: string, link: string) {
    const admins = await this.db.selectDistinct({ u: memberships.userId }).from(memberships).where(and(inArray(memberships.role, ['unite_admin', 'super_admin']), eq(memberships.status, 'active')));
    if (admins.length) await this.db.insert(notifications).values(admins.map((a) => ({ userId: a.u, kind: 'announcement', title, body: text, link })));
  }
}

const StatusSchema = z.object({ status: z.enum(['active', 'paused', 'ended']) });
const OrderStatusSchema = z.object({ status: z.enum(['confirmed', 'fulfilled', 'cancelled']), note: z.string().trim().max(500).optional() });
const StorePriceSchema = z.object({ storePrice: z.number().int().min(100).max(1_00_00_000_00).nullable() });

@ApiTags('Promotions and store')
@Controller()
export class PromotionsController {
  constructor(@InjectDb() private db: Db, private svc: PromotionsService, private audit: AuditService) {}

  // ---------- public: online store ----------
  @Public()
  @Get('public/store')
  async store() {
    const products = await this.svc.products();
    const live = (await this.svc.promos(eq(promotions.status, 'active'))).filter((p) => promoApplies(asLike(p), 'online', null));
    return {
      products: products.map((p) => { const promo = live.find((x) => promoCovers(asLike(x), p)); return { ...p, offer: promo ? { id: promo.id, label: promoLabel(promo), name: promo.name } : null }; }),
      offers: live.map((p) => ({ id: p.id, name: p.name, label: promoLabel(p), terms: p.terms, endsAt: p.endsAt, maxFreePerOrder: p.maxFreePerOrder })),
    };
  }

  @Public()
  @Post('public/store/price')
  @HttpCode(200)
  async price(@Body(body(z.object({ lines: StoreOrderSchema.shape.lines }))) b: { lines: { ref: string; qty: number }[] }) {
    return this.svc.price(b.lines);
  }

  @Public()
  @Post('public/store/orders')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async order(@Body(body(StoreOrderSchema)) b: z.infer<typeof StoreOrderSchema>) {
    const [ref] = b.referralCode ? await this.db.select({ id: solarReferralCodes.id }).from(solarReferralCodes).where(eq(solarReferralCodes.code, b.referralCode.toUpperCase())).limit(1) : [];
    const o = await this.db.transaction(async (tx) => {
      const priced = await this.svc.price(b.lines, tx as unknown as Db, true); // promotion rows locked: budgets cannot be overspent by parallel orders
      const [o] = await tx.insert(storeOrders).values({ code: `STO-${new Date().getFullYear()}-${randomDigits(6)}`, customer: b.customer, phone10: phone10(b.customer.phone), lines: priced.lines, subtotal: priced.subtotal, freeValue: priced.freeValue, referralCodeId: ref?.id ?? null }).returning();
      for (const l of priced.lines.filter((x) => x.promotionId && x.freeQty > 0)) {
        await tx.insert(promoRedemptions).values({ promotionId: l.promotionId!, channel: 'online', orderId: o.id, itemRef: l.ref, units: l.freeQty, value: l.freeValue });
        await tx.update(promotions).set({ usedUnits: sql`${promotions.usedUnits} + ${l.freeQty}`, usedValue: sql`${promotions.usedValue} + ${l.freeValue}` }).where(eq(promotions.id, l.promotionId!));
      }
      return o;
    });
    await this.svc.notifyStaff(`New online order ${o.code}`, `${b.customer.name}, ${b.customer.city} — ₹${(o.subtotal / 100).toLocaleString('en-IN')}${o.freeValue ? ` (+ ₹${(o.freeValue / 100).toLocaleString('en-IN')} free)` : ''}.`, '/workspace/store');
    return { code: o.code, subtotal: o.subtotal, freeValue: o.freeValue, lines: o.lines, message: 'Order received. Unite will call you to confirm delivery and payment.' };
  }

  // ---------- public: in-store vouchers ----------
  @Public()
  @Get('public/store/offers')
  async storeOffers() {
    const live = (await this.svc.promos(eq(promotions.status, 'active'))).filter((p) => p.channel !== 'online' && promoApplies(asLike(p), 'store', p.stores[0] ?? null));
    return live.map((p) => ({ id: p.id, name: p.name, label: promoLabel(p), terms: p.terms, endsAt: p.endsAt, stores: p.stores.length ? p.stores : null, scope: p.scope, sectors: p.sectors }));
  }

  @Public()
  @Post('public/store/offers/:id/voucher')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async claim(@Param('id', ParseUUIDPipe) id: string, @Body(body(VoucherClaimSchema)) b: z.infer<typeof VoucherClaimSchema>) {
    const [p] = await this.db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
    if (!p || p.channel === 'online' || !promoApplies(asLike(p), 'store', p.stores[0] ?? null)) throw new NotFoundException('This offer is not running in stores right now');
    const ph = phone10(b.phone);
    for (let i = 0; i < 4; i++) {
      const [v] = await this.db.insert(promoVouchers).values({ code: voucherCode(), promotionId: id, name: b.name, phone10: ph }).onConflictDoNothing().returning();
      if (v) return { code: v.code, offer: p.name, label: promoLabel(p), endsAt: p.endsAt, stores: p.stores.length ? p.stores : 'Any participating store', message: 'Show this code and your mobile number at the store.' };
      const [mine] = await this.db.select({ id: promoVouchers.id }).from(promoVouchers).where(and(eq(promoVouchers.promotionId, id), eq(promoVouchers.phone10, ph))).limit(1);
      if (mine) throw new ConflictException('This mobile number already has a voucher for this offer — use the code you were given');
    }
    throw new ConflictException('Could not issue a voucher — try again');
  }

  // ---------- stores: redeem ----------
  @Get('store/redeem')
  async redeemContext(@Ctx() ctx: RequestContext) {
    const stores = await this.svc.storesFor(ctx);
    if (!stores.length) throw new ForbiddenException('Vouchers are redeemed by Unite store staff and live franchise stores');
    return { stores, products: (await this.svc.products()).map((p) => ({ ref: p.ref, name: p.name, price: p.price, sector: p.sector })) };
  }

  @Post('store/vouchers/redeem')
  @HttpCode(200)
  async redeem(@Ctx() ctx: RequestContext, @Body(body(VoucherRedeemSchema.extend({ phone: z.string().trim().regex(INDIA_MOBILE, { message: 'Enter the customer’s mobile number' }) }))) b: z.infer<typeof VoucherRedeemSchema> & { phone: string }) {
    const allowed = await this.svc.storesFor(ctx);
    if (!allowed.includes(b.store)) throw new ForbiddenException('You can redeem vouchers only at your own store');
    const product = (await this.svc.products()).find((p) => p.ref === b.itemRef);
    if (!product) throw new BadRequestException('Choose the product the customer is buying');
    return this.db.transaction(async (tx) => {
      const [v] = await tx.select().from(promoVouchers).where(eq(promoVouchers.code, b.code)).for('update').limit(1);
      if (!v || v.phone10 !== phone10(b.phone)) throw new NotFoundException('No voucher with this code for this mobile number');
      if (v.status === 'redeemed') throw new ConflictException(`This voucher was already used on ${v.redeemedAt?.toLocaleDateString('en-IN')} at ${v.store}`);
      const [p] = await tx.select().from(promotions).where(eq(promotions.id, v.promotionId)).for('update').limit(1);
      if (!promoApplies(asLike(p), 'store', b.store)) throw new ConflictException('This offer has ended or is not running at this store');
      if (!promoCovers(asLike(p), product)) throw new ConflictException(`${product.name} is not part of “${p.name}”`);
      const free = Math.min(p.getQty, p.maxFreePerOrder);
      const value = free * product.price;
      if (p.budgetValue != null && p.usedValue + value > p.budgetValue) throw new ConflictException('The offer budget is used up');
      await tx.update(promoVouchers).set({ status: 'redeemed', store: b.store, billNo: b.billNo, itemRef: b.itemRef, freeValue: value, redeemedBy: ctx.userId, redeemedAt: new Date() }).where(eq(promoVouchers.id, v.id));
      await tx.insert(promoRedemptions).values({ promotionId: p.id, channel: 'store', store: b.store, voucherId: v.id, itemRef: b.itemRef, units: free, value });
      await tx.update(promotions).set({ usedUnits: sql`${promotions.usedUnits} + ${free}`, usedValue: sql`${promotions.usedValue} + ${value}` }).where(eq(promotions.id, p.id));
      await this.audit.record(ctx, { action: 'promotion.voucher_redeemed', objectType: 'promo_voucher', objectId: v.id, after: { store: b.store, billNo: b.billNo, item: product.name, free, value } });
      return { ok: true, message: `Give ${free} × ${product.name} free with bill ${b.billNo}.`, free, value, product: product.name, customer: v.name };
    });
  }

  // ---------- Unite admins ----------
  @Get('admin/promotions')
  async admin(@Ctx() ctx: RequestContext) {
    if (!staff(ctx) && !money(ctx)) throw new ForbiddenException('Promotions are managed by Unite admins');
    const list = await this.svc.promos();
    const products = await this.svc.products();
    const vouchers = await this.db.select({ p: promoVouchers.promotionId, n: sql<number>`count(*)::int`, r: sql<number>`count(*) filter (where ${promoVouchers.status} = 'redeemed')::int` }).from(promoVouchers).groupBy(promoVouchers.promotionId);
    const vm = new Map(vouchers.map((v) => [v.p, v]));
    return {
      promotions: list.map((p) => ({ ...this.svc.view(p), vouchers: vm.get(p.id)?.n ?? 0, redeemed: vm.get(p.id)?.r ?? 0, eligibleProducts: products.filter((x) => promoCovers(asLike(p), x)).length })),
      products: products.map((p) => ({ ref: p.ref, name: p.name, sector: p.sector, price: p.price })), sectors: [...new Set(products.map((p) => p.sector))].sort(),
      stores: await this.svc.stores(), erpnext: erpSource() instanceof ErpnextSource, canApprove: money(ctx),
    };
  }

  @Post('admin/promotions')
  @HttpCode(201)
  async create(@Ctx() ctx: RequestContext, @Body(body(PromotionSchema)) b: z.infer<typeof PromotionSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Promotions are drafted by Unite admins');
    const [owner] = await this.db.select({ id: groupCompanies.organizationId }).from(groupCompanies).where(eq(groupCompanies.brandName, 'Unite Solar')).limit(1);
    const [p] = await this.db.insert(promotions).values({ ...b, code: `PRM-${new Date().getFullYear()}-${randomDigits(4)}`, ownerOrgId: owner?.id ?? ctx.orgId!, budgetUnits: b.budgetUnits ?? null, budgetValue: b.budgetValue ?? null, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), createdBy: ctx.userId }).returning();
    await this.audit.record(ctx, { action: 'promotion.drafted', objectType: 'promotion', objectId: p.id, after: { name: p.name, scope: p.scope, channel: p.channel, budgetUnits: p.budgetUnits, budgetValue: p.budgetValue } });
    return this.svc.view(p);
  }

  @Patch('admin/promotions/:id')
  async edit(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(PromotionSchema)) b: z.infer<typeof PromotionSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Promotions are edited by Unite admins');
    const [p] = await this.db.select().from(promotions).where(eq(promotions.id, id));
    if (!p) throw new NotFoundException('Promotion not found');
    if (p.status === 'active' || p.status === 'ended') throw new ConflictException('Pause the promotion before changing it; ended promotions cannot change');
    const [n] = await this.db.update(promotions).set({ ...b, budgetUnits: b.budgetUnits ?? null, budgetValue: b.budgetValue ?? null, startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() }).where(eq(promotions.id, id)).returning();
    await this.audit.record(ctx, { action: 'promotion.edited', objectType: 'promotion', objectId: id, before: { name: p.name, scope: p.scope, budgetUnits: p.budgetUnits, budgetValue: p.budgetValue }, after: { name: n.name, scope: n.scope, budgetUnits: n.budgetUnits, budgetValue: n.budgetValue } });
    return this.svc.view(n);
  }

  @Post('admin/promotions/:id/status')
  @HttpCode(200)
  async setStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(StatusSchema)) b: z.infer<typeof StatusSchema>) {
    const [p] = await this.db.select().from(promotions).where(eq(promotions.id, id));
    if (!p) throw new NotFoundException('Promotion not found');
    if (p.status === 'ended') throw new ConflictException('This promotion has ended');
    const patch: Partial<typeof promotions.$inferInsert> = { status: b.status, updatedAt: new Date() };
    if (b.status === 'active') {
      if (!money(ctx)) throw new ForbiddenException('Only a super admin or finance can make a promotion live — it gives stock away');
      if (p.createdBy === ctx.userId && !ctx.platformRoles.includes('super_admin')) throw new ForbiddenException('Someone other than the author must approve this promotion');
      if (p.endsAt < new Date()) throw new ConflictException('The end date has passed — change the dates first');
      if (!p.approvedAt) { patch.approvedBy = ctx.userId; patch.approvedAt = new Date(); }
    } else if (!staff(ctx) && !money(ctx)) throw new ForbiddenException('Promotions are managed by Unite admins');
    const [n] = await this.db.update(promotions).set(patch).where(eq(promotions.id, id)).returning();
    await this.audit.record(ctx, { action: `promotion.${b.status}`, objectType: 'promotion', objectId: id, before: { status: p.status }, after: { status: b.status } });
    return this.svc.view(n);
  }

  /** Sends a live promotion to ERPNext as a POS Pricing Rule (product discount: get the same item free). */
  @Post('admin/promotions/:id/erpnext')
  @HttpCode(200)
  async toErp(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    if (!staff(ctx)) throw new ForbiddenException('Only Unite admins send promotions to ERPNext');
    const s = erpSource();
    if (!(s instanceof ErpnextSource)) throw new ConflictException('ERPNext is not connected — store tills cannot apply the offer automatically yet. Use vouchers meanwhile.');
    const [p] = await this.db.select().from(promotions).where(eq(promotions.id, id));
    if (!p || p.status !== 'active') throw new ConflictException('Only a live promotion can be sent to the stores');
    if (p.erpRuleName) return { name: p.erpRuleName, created: false };
    const items = p.scope === 'items' ? await this.db.select({ sku: catalogItems.sku }).from(catalogItems).where(inArray(catalogItems.id, p.itemRefs.filter((r) => r.startsWith('item:')).map((r) => r.slice(5)))) : [];
    const doc: Record<string, unknown> = {
      title: `${p.code} ${p.name}`.slice(0, 140), apply_on: p.scope === 'items' ? 'Item Code' : p.scope === 'sectors' ? 'Item Group' : 'Transaction', price_or_product_discount: 'Product', selling: 1, buying: 0,
      min_qty: p.buyQty, free_qty: p.getQty, same_item: 1, is_recursive: 0, valid_from: p.startsAt.toISOString().slice(0, 10), valid_upto: p.endsAt.toISOString().slice(0, 10), priority: 1,
    };
    if (p.scope === 'items') doc.items = items.filter((i) => i.sku).map((i) => ({ item_code: i.sku }));
    if (p.scope === 'sectors') doc.item_groups = p.sectors.map((g) => ({ item_group: g }));
    const r = await s.client.insert<{ name: string }>('Pricing Rule', doc);
    await this.db.update(promotions).set({ erpRuleName: r.name }).where(eq(promotions.id, id));
    await this.audit.record(ctx, { action: 'promotion.sent_to_erpnext', objectType: 'promotion', objectId: id, after: { rule: r.name } });
    return { name: r.name, created: true };
  }

  @Get('admin/store')
  async orders(@Ctx() ctx: RequestContext) {
    if (!staff(ctx) && !money(ctx)) throw new ForbiddenException('Store orders are for Unite admins');
    const list = await this.db.select().from(storeOrders).orderBy(desc(storeOrders.createdAt)).limit(300);
    const items = await this.db.select({ id: catalogItems.id, name: catalogItems.name, sector: catalogItems.sector, owner: organizations.displayName, storePrice: catalogItems.storePrice, listPrice: catalogItems.listPrice })
      .from(catalogItems).innerJoin(groupCompanies, eq(groupCompanies.organizationId, catalogItems.ownerOrgId)).innerJoin(organizations, eq(organizations.id, catalogItems.ownerOrgId))
      .where(and(eq(catalogItems.status, 'published'), eq(catalogItems.kind, 'product'))).orderBy(sql`${catalogItems.storePrice} is null`, catalogItems.name).limit(600);
    const open = list.filter((o) => o.status === 'new' || o.status === 'confirmed');
    return {
      totals: { orders: list.length, open: open.length, openValue: open.reduce((a, o) => a + o.subtotal, 0), freeValue: list.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.freeValue, 0), listed: items.filter((i) => i.storePrice != null).length },
      orders: list.map((o) => ({ id: o.id, code: o.code, customer: o.customer, lines: o.lines, subtotal: o.subtotal, freeValue: o.freeValue, status: o.status, next: STORE_ORDER_NEXT[o.status] ?? [], createdAt: o.createdAt })),
      items,
    };
  }

  @Post('admin/store/orders/:id/status')
  @HttpCode(200)
  async orderStatus(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(OrderStatusSchema)) b: z.infer<typeof OrderStatusSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Store orders are handled by Unite admins');
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select().from(storeOrders).where(eq(storeOrders.id, id)).for('update');
      if (!o) throw new NotFoundException('Order not found');
      if (!(STORE_ORDER_NEXT[o.status] ?? []).includes(b.status)) throw new ConflictException(`An order that is ${o.status} cannot become ${b.status}`);
      await tx.update(storeOrders).set({ status: b.status, statusBy: ctx.userId, updatedAt: new Date() }).where(eq(storeOrders.id, id));
      if (b.status === 'cancelled') { // free units go back into the promotion budget
        const reds = await tx.select().from(promoRedemptions).where(and(eq(promoRedemptions.orderId, id), isNull(promoRedemptions.reversedAt)));
        for (const r of reds) {
          await tx.update(promoRedemptions).set({ reversedAt: new Date() }).where(eq(promoRedemptions.id, r.id));
          await tx.update(promotions).set({ usedUnits: sql`greatest(0, ${promotions.usedUnits} - ${r.units})`, usedValue: sql`greatest(0, ${promotions.usedValue} - ${r.value})` }).where(eq(promotions.id, r.promotionId));
        }
      }
      await this.audit.record(ctx, { action: `store_order.${b.status}`, objectType: 'store_order', objectId: id, before: { status: o.status }, after: { status: b.status, note: b.note } });
      return { ok: true, status: b.status };
    });
  }

  @Patch('admin/store/items/:id')
  async storePrice(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body(body(StorePriceSchema)) b: z.infer<typeof StorePriceSchema>) {
    if (!staff(ctx)) throw new ForbiddenException('Store listings are managed by Unite admins');
    const [i] = await this.db.select({ id: catalogItems.id, storePrice: catalogItems.storePrice, owner: catalogItems.ownerOrgId }).from(catalogItems).innerJoin(groupCompanies, eq(groupCompanies.organizationId, catalogItems.ownerOrgId)).where(eq(catalogItems.id, id));
    if (!i) throw new NotFoundException('Only Unite group products can be sold in the online store');
    await this.db.update(catalogItems).set({ storePrice: b.storePrice, updatedAt: new Date() }).where(eq(catalogItems.id, id));
    await this.audit.record(ctx, { action: 'store.listing', objectType: 'catalog_item', objectId: id, before: { storePrice: i.storePrice }, after: b });
    return { ok: true };
  }
}

@Module({ controllers: [PromotionsController], providers: [PromotionsService] })
export class PromotionsModule {}
