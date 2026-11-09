/**
 * Promotions — "Buy X, get Y free" (BOGO = buy 1 get 1) across the COLLABIZ online store and physical stores.
 * The API prices every cart with `applyPromotions`; screens only display what it returns.
 * Convention: free units are added on top of what the customer pays for (buy 1 → receive 2), up to the per-order and budget limits.
 */
import { z } from 'zod';
import { INDIA_MOBILE } from './solar';

export const PROMO_CHANNELS = ['online', 'store', 'both'] as const;
export const PROMO_CHANNEL_LABELS: Record<string, string> = { online: 'Online store', store: 'Physical stores', both: 'Online and in stores' };
export const PROMO_SCOPES = ['all', 'sectors', 'items'] as const;
export const PROMO_SCOPE_LABELS: Record<string, string> = { all: 'All products', sectors: 'Chosen categories', items: 'Chosen products' };
export const PROMO_STATUSES = ['draft', 'active', 'paused', 'ended'] as const;
export const PROMO_STATUS_LABELS: Record<string, string> = { draft: 'Draft — needs approval', active: 'Live', paused: 'Paused', ended: 'Ended' };

export const PromotionSchema = z.object({
  name: z.string().trim().min(3).max(120),
  buyQty: z.number().int().min(1).max(20),
  getQty: z.number().int().min(1).max(20),
  scope: z.enum(PROMO_SCOPES),
  sectors: z.array(z.string().trim().min(2).max(80)).max(50).default([]),
  itemRefs: z.array(z.string().trim().min(3).max(80)).max(500).default([]), // "kit:<uuid>" or "item:<uuid>"
  channel: z.enum(PROMO_CHANNELS),
  stores: z.array(z.string().trim().min(2).max(120)).max(200).default([]), // empty = every store
  maxFreePerOrder: z.number().int().min(1).max(100).default(1),
  budgetUnits: z.number().int().min(1).max(1_000_000).optional(),
  budgetValue: z.number().int().min(1).max(1_00_00_00_000_00).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  terms: z.string().trim().min(20, { message: 'Write the offer terms customers will see (at least 20 characters)' }).max(3000),
}).refine((p) => new Date(p.endsAt) > new Date(p.startsAt), { message: 'The end must be after the start', path: ['endsAt'] })
  .refine((p) => p.scope !== 'sectors' || p.sectors.length > 0, { message: 'Choose at least one category', path: ['sectors'] })
  .refine((p) => p.scope !== 'items' || p.itemRefs.length > 0, { message: 'Choose at least one product', path: ['itemRefs'] })
  .refine((p) => p.budgetUnits != null || p.budgetValue != null, { message: 'Set a budget — free units or free value — so the offer stops when it is used up', path: ['budgetUnits'] });
export type PromotionInput = z.infer<typeof PromotionSchema>;

export interface PromoLike {
  id: string; code: string; name: string; buyQty: number; getQty: number; scope: string; sectors: string[]; itemRefs: string[]; channel: string; stores: string[];
  maxFreePerOrder: number; budgetUnits: number | null; budgetValue: number | null; usedUnits: number; usedValue: number; startsAt: Date | string; endsAt: Date | string; status: string;
}
export interface CartLine { ref: string; name: string; sector: string; unitPrice: number; qty: number }
export interface PricedLine extends CartLine { freeQty: number; freeValue: number; promotionId: string | null; promotionName: string | null; lineTotal: number }

export const promoLabel = (p: { buyQty: number; getQty: number }) => (p.buyQty === 1 && p.getQty === 1 ? 'Buy 1 get 1 free' : `Buy ${p.buyQty} get ${p.getQty} free`);

/** Live, in its dates, on this channel and store, and with budget left. */
export function promoApplies(p: PromoLike, channel: 'online' | 'store', store: string | null, now = new Date()) {
  if (p.status !== 'active') return false;
  if (now < new Date(p.startsAt) || now > new Date(p.endsAt)) return false;
  if (p.channel !== 'both' && p.channel !== channel) return false;
  if (channel === 'store' && p.stores.length && (!store || !p.stores.includes(store))) return false;
  if (p.budgetUnits != null && p.usedUnits >= p.budgetUnits) return false;
  if (p.budgetValue != null && p.usedValue >= p.budgetValue) return false;
  return true;
}
export const promoCovers = (p: PromoLike, line: { ref: string; sector: string }) => p.scope === 'all' || (p.scope === 'sectors' ? p.sectors.includes(line.sector) : p.itemRefs.includes(line.ref));

/**
 * Prices a cart. Each line gets at most one promotion — the one giving the most free value. Free units = floor(qty / buy) × get,
 * limited by the promotion's per-order cap and its remaining budget, shared across the cart (dearest items first).
 */
export function applyPromotions(lines: CartLine[], promos: PromoLike[], channel: 'online' | 'store', store: string | null = null, now = new Date()): { lines: PricedLine[]; subtotal: number; freeValue: number } {
  const live = promos.filter((p) => promoApplies(p, channel, store, now));
  const left = new Map(live.map((p) => [p.id, { units: p.budgetUnits != null ? p.budgetUnits - p.usedUnits : Infinity, value: p.budgetValue != null ? p.budgetValue - p.usedValue : Infinity, perOrder: p.maxFreePerOrder }]));
  // Caps are shared within the cart: the most expensive items get their free units first, whatever order they were added in.
  const order = lines.map((l, i) => i).sort((a, b) => lines[b].unitPrice - lines[a].unitPrice || a - b);
  const out: PricedLine[] = new Array(lines.length);
  for (const i of order) {
    const l = lines[i];
    let best: { p: PromoLike; free: number } | null = null;
    for (const p of live.filter((x) => promoCovers(x, l))) {
      const b = left.get(p.id)!;
      let free = Math.floor(l.qty / p.buyQty) * p.getQty;
      free = Math.min(free, b.perOrder, b.units, l.unitPrice > 0 ? Math.floor(b.value / l.unitPrice) : free);
      if (free > 0 && (!best || free * l.unitPrice > best.free * l.unitPrice)) best = { p, free };
    }
    if (best) { const b = left.get(best.p.id)!; b.units -= best.free; b.value -= best.free * l.unitPrice; b.perOrder -= best.free; }
    out[i] = { ...l, freeQty: best?.free ?? 0, freeValue: (best?.free ?? 0) * l.unitPrice, promotionId: best?.p.id ?? null, promotionName: best ? `${best.p.name} — ${promoLabel(best.p)}` : null, lineTotal: l.unitPrice * l.qty };
  }
  const priced = out;
  return { lines: priced, subtotal: priced.reduce((a, l) => a + l.lineTotal, 0), freeValue: priced.reduce((a, l) => a + l.freeValue, 0) };
}

// ---------------- Online store orders and in-store vouchers ----------------
export const StoreOrderSchema = z.object({
  lines: z.array(z.object({ ref: z.string().trim().min(3).max(80), qty: z.number().int().min(1).max(100) })).min(1).max(50),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().regex(INDIA_MOBILE, { message: 'Enter a 10-digit Indian mobile number' }),
    email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
    address: z.string().trim().min(10, { message: 'Enter the delivery address' }).max(400),
    city: z.string().trim().min(2).max(80),
    region: z.string().trim().min(2).max(6),
    pincode: z.string().trim().regex(/^\d{6}$/, { message: 'Enter a 6-digit PIN code' }),
  }),
  consent: z.literal(true, { message: 'Please agree to be contacted to confirm the order' }),
  referralCode: z.string().trim().max(20).optional().or(z.literal('').transform(() => undefined)),
});
export const STORE_ORDER_STATUS_LABELS: Record<string, string> = { new: 'New — to confirm', confirmed: 'Confirmed', fulfilled: 'Delivered', cancelled: 'Cancelled' };
export const STORE_ORDER_NEXT: Record<string, string[]> = { new: ['confirmed', 'cancelled'], confirmed: ['fulfilled', 'cancelled'], fulfilled: [], cancelled: [] };

export const VoucherClaimSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(INDIA_MOBILE, { message: 'Enter a 10-digit Indian mobile number' }),
  consent: z.literal(true, { message: 'Please agree to the offer terms' }),
});
export const VoucherRedeemSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^BOGO-[A-Z0-9]{4}-[A-Z0-9]{4}$/, { message: 'Voucher codes look like BOGO-AB12-CD34' }),
  store: z.string().trim().min(2).max(120),
  itemRef: z.string().trim().min(3).max(80),
  billNo: z.string().trim().min(1).max(60),
});
/** Normalises a mobile number to its last 10 digits so the same person is recognised however it was typed. */
export const phone10 = (p: string) => p.replace(/\D/g, '').slice(-10);
