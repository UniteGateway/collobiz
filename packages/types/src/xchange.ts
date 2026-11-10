/**
 * COLLABIZ XCHANGE — B2B barter: businesses exchange goods, services, machinery, inventory and idle capacity, with or
 * without part-cash, directly or in multi-party cycles. Pure rules shared by the API and screens.
 * Values are open-market values in paise as declared by the parties; every party approves the same terms.
 * Tax: each leg is a separate supply at open-market value (CGST Rule 27) — COLLABIZ prepares invoice data only.
 */
import { z } from 'zod';

export const XCHANGE_CATEGORIES = [
  'solar_equipment', 'electrical_equipment', 'construction_materials', 'construction_services', 'machinery', 'industrial_equipment', 'raw_materials', 'finished_goods',
  'warehouse_space', 'logistics', 'installation_teams', 'technicians', 'manufacturing_capacity', 'advertising', 'software_it', 'professional_services', 'other',
] as const;
export const XCHANGE_CATEGORY_LABELS: Record<string, string> = {
  solar_equipment: 'Solar equipment', electrical_equipment: 'Electrical equipment', construction_materials: 'Construction materials', construction_services: 'Construction services', machinery: 'Machinery',
  industrial_equipment: 'Industrial equipment', raw_materials: 'Raw materials', finished_goods: 'Finished goods / surplus stock', warehouse_space: 'Warehouse space', logistics: 'Logistics & vehicles',
  installation_teams: 'Installation teams', technicians: 'Specialised technicians', manufacturing_capacity: 'Manufacturing capacity', advertising: 'Advertising & marketing', software_it: 'Software & IT',
  professional_services: 'Professional services', other: 'Other',
};
export const CAPACITY_CATEGORIES = new Set(['warehouse_space', 'logistics', 'installation_teams', 'technicians', 'manufacturing_capacity', 'machinery']);
export const VALUE_BASIS_LABELS: Record<string, string> = { price_list: 'Published price list', invoice: 'Recent invoice', quotation: 'Third-party quotation', estimate: 'Own estimate' };
export const XCHANGE_DEAL_STATUS_LABELS: Record<string, string> = { proposed: 'Waiting for approvals', agreed: 'Agreed — delivering', completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed' };
export const XCHANGE_LEG_STATUS_LABELS: Record<string, string> = { pending: 'To deliver', delivered: 'Delivered — awaiting acceptance', accepted: 'Accepted', disputed: 'Disputed' };

export const XchangeListingSchema = z.object({
  side: z.enum(['offer', 'need']),
  category: z.enum(XCHANGE_CATEGORIES),
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20, { message: 'Describe it (at least 20 characters)' }).max(3000),
  quantity: z.string().trim().max(80).optional(),
  value: z.number().int().min(1_000_00, { message: 'Minimum value ₹1,000' }).max(1_00_00_00_000_00),
  valueBasis: z.enum(['price_list', 'invoice', 'quotation', 'estimate']),
  region: z.string().trim().min(2).max(6),
  accepts: z.array(z.enum(['barter', 'part_cash', 'cash'])).min(1),
  availableUntil: z.string().date().optional(),
});
export const XchangeDealSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  legs: z.array(z.object({
    fromOrgId: z.string().uuid(), toOrgId: z.string().uuid(), listingId: z.string().uuid().optional(),
    description: z.string().trim().min(5).max(300), value: z.number().int().min(1).max(1_00_00_00_000_00), cash: z.number().int().min(0).max(1_00_00_00_000_00).default(0),
  })).min(2).max(8),
}).refine((d) => d.legs.every((l) => l.fromOrgId !== l.toOrgId), { message: 'A party cannot supply itself', path: ['legs'] });

export interface Leg { fromOrgId: string; toOrgId: string; value: number; cash: number }
/**
 * Net position per party: value received − value supplied, adjusted for cash. `cash` on a leg is paid by that leg's
 * receiver to its supplier (part-cash tops up a smaller counter-supply). A balanced exchange leaves every party near zero.
 */
export function balances(legs: Leg[]) {
  const net = new Map<string, number>();
  const add = (o: string, v: number) => net.set(o, (net.get(o) ?? 0) + v);
  for (const l of legs) {
    add(l.toOrgId, l.value - l.cash); // receiver gains the value, pays the cash
    add(l.fromOrgId, l.cash - l.value); // supplier gives the value, receives the cash
  }
  return [...net.entries()].map(([orgId, v]) => ({ orgId, net: v }));
}
/** Balanced when every party's net position is within the tolerance (default 2% of the largest leg, at least ₹100). */
export function isBalanced(legs: Leg[], tolerancePct = 2) {
  const largest = Math.max(...legs.map((l) => l.value), 0);
  const tol = Math.max(100_00, Math.round((largest * tolerancePct) / 100));
  const b = balances(legs);
  return { ok: b.every((x) => Math.abs(x.net) <= tol), tolerance: tol, balances: b };
}
/** Exchange kind from its legs. */
export const dealKind = (legs: Leg[]) => (new Set(legs.flatMap((l) => [l.fromOrgId, l.toOrgId])).size > 2 ? 'multi' : legs.some((l) => l.cash > 0) ? 'part_cash' : 'direct');
/** Terms fingerprint every party approves; any change needs fresh approval. */
export const termsKey = (legs: { fromOrgId: string; toOrgId: string; description: string; value: number; cash: number }[]) =>
  JSON.stringify([...legs].map((l) => [l.fromOrgId, l.toOrgId, l.description, l.value, l.cash]).sort());

// ---------------- Matching ----------------
export interface XListing { id: string; orgId: string; orgName: string; side: 'offer' | 'need'; category: string; title: string; value: number; region: string; accepts: string[] }
export interface Cycle { orgs: string[]; legs: { from: string; to: string; offer: XListing; need: XListing }[]; score: number; imbalancePct: number }

const sameish = (a: string, b: string) => a === b || a.slice(0, 5) === b.slice(0, 5); // same state code
/** Edges A→B: A offers something B needs (same category). */
function edges(listings: XListing[]) {
  const offers = listings.filter((l) => l.side === 'offer' && l.accepts.some((a) => a !== 'cash'));
  const needs = listings.filter((l) => l.side === 'need' && l.accepts.some((a) => a !== 'cash'));
  const e: { from: string; to: string; offer: XListing; need: XListing }[] = [];
  for (const o of offers) for (const n of needs) if (o.orgId !== n.orgId && o.category === n.category) e.push({ from: o.orgId, to: n.orgId, offer: o, need: n });
  return e;
}
/** Direct (two-way) and multi-party (3–4 way) exchange cycles that include `me`, best first. Suggestions only. */
export function findCycles(listings: XListing[], me: string, maxLen = 4, limit = 10): Cycle[] {
  const E = edges(listings);
  const out = new Map<string, Cycle>();
  const walk = (path: typeof E) => {
    const last = path[path.length - 1];
    if (last.to === me && path.length >= 2) {
      const vals = path.map((p) => Math.min(p.offer.value, p.need.value));
      const imb = (Math.max(...vals) - Math.min(...vals)) / Math.max(...vals);
      const local = path.filter((p) => sameish(p.offer.region, p.need.region)).length / path.length;
      const key = [...path.map((p) => `${p.offer.id}>${p.need.id}`)].sort().join('|');
      if (!out.has(key)) out.set(key, { orgs: path.map((p) => p.from), legs: path, score: Math.round(100 * (0.6 * (1 - imb) + 0.25 * local + 0.15 * (path.length === 2 ? 1 : 0.6))), imbalancePct: Math.round(imb * 100) });
      return;
    }
    if (path.length >= maxLen) return;
    for (const e of E.filter((x) => x.from === last.to)) {
      if (path.some((p) => p.from === e.from) && e.from !== me) continue; // no repeated parties
      if (e.to !== me && path.some((p) => p.from === e.to)) continue;
      walk([...path, e]);
    }
  };
  for (const start of E.filter((e) => e.from === me)) walk([start]);
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
/** One-way matches where the other side would pay part in cash (they need what I offer, or offer what I need). */
export function oneWayMatches(listings: XListing[], me: string, limit = 10) {
  const mine = listings.filter((l) => l.orgId === me);
  const others = listings.filter((l) => l.orgId !== me);
  const res: { mine: XListing; theirs: XListing; direction: 'they_need_my_offer' | 'they_offer_my_need' }[] = [];
  for (const m of mine) for (const o of others) {
    if (m.side === 'offer' && o.side === 'need' && m.category === o.category && o.accepts.some((a) => a === 'part_cash' || a === 'cash')) res.push({ mine: m, theirs: o, direction: 'they_need_my_offer' });
    if (m.side === 'need' && o.side === 'offer' && m.category === o.category && o.accepts.some((a) => a === 'part_cash' || a === 'cash')) res.push({ mine: m, theirs: o, direction: 'they_offer_my_need' });
  }
  return res.slice(0, limit);
}
/** Invoice data for one leg — for the parties' accountants. GST rate and HSN/SAC are for them to confirm. */
export const legInvoiceNote = 'Each supply in a barter is a separate taxable supply valued at open-market value (CGST Rules, rule 27). Each supplier issues its own tax invoice; part-cash is part of the consideration. COLLABIZ does not file returns or decide tax rates.';
