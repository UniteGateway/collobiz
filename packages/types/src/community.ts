/** Community (members online, a wall to share thoughts) and group-investment offers with pro-rata income sharing. */
import { z } from 'zod';

export const ONLINE_WINDOW_SECONDS = 180;
export const POST_TOPICS = ['general', 'opportunity', 'question', 'solar', 'property', 'manufacturing', 'trading', 'events'] as const;
export const POST_TOPIC_LABELS: Record<string, string> = { general: 'General', opportunity: 'Business opportunity', question: 'Question', solar: 'Solar & energy', property: 'Property', manufacturing: 'Manufacturing', trading: 'Trading', events: 'Events' };
export const CommunityPostSchema = z.object({ body: z.string().trim().min(3, 'Write a little more').max(1500), topic: z.enum(POST_TOPICS).default('general') });
export const CommunityCommentSchema = z.object({ body: z.string().trim().min(1).max(800) });

// ------------------------------------------------------------------ group investments
export const INVESTMENT_KINDS = ['property_share', 'solar_park_share', 'warehouse_share', 'other'] as const;
export const INVESTMENT_KIND_LABELS: Record<string, string> = { property_share: 'Property share (per sq ft)', solar_park_share: 'Solar park share', warehouse_share: 'Warehouse share', other: 'Other' };
export const INVEST_OFFER_STATUSES = ['draft', 'interest_open', 'closed'] as const;
export const INVEST_OFFER_STATUS_LABELS: Record<string, string> = { draft: 'Draft', interest_open: 'Taking expressions of interest', closed: 'Closed' };
/**
 * Pooling money from the public in a shared asset is regulated in India (SEBI: Small & Medium REITs since 2024; otherwise a
 * possible collective investment scheme). COLLABIZ therefore records only non-binding interest — no payment, no allotment —
 * and shows this until a super admin records the regulatory clearance for the offer.
 */
export const INVESTMENT_NOTICE = 'Expression of interest only. COLLABIZ does not take money or allot units. Unite will contact interested members once the offer has the required regulatory clearance and offer documents. Rent figures are the sponsor’s projection, not a promise.';

export const InvestmentOfferSchema = z.object({
  title: z.string().trim().min(5).max(160), kind: z.enum(INVESTMENT_KINDS), summary: z.string().trim().min(20).max(2000),
  location: z.string().trim().min(3).max(160), unitLabel: z.string().trim().min(2).max(20).default('sq ft'),
  totalUnits: z.number().int().positive().max(100_000_000), unitPrice: z.number().int().positive(), minUnits: z.number().int().positive().default(1),
  projectedMonthlyRent: z.number().int().min(0), // for the whole asset, paise
  lockInMonths: z.number().int().min(0).max(240).default(0), sponsor: z.string().trim().min(2).max(160), documentsUrl: z.string().trim().max(500).optional(),
}).refine((o) => o.minUnits <= o.totalUnits, { message: 'Minimum cannot exceed the total', path: ['minUnits'] });
export const InvestmentInterestSchema = z.object({ units: z.number().int().positive(), note: z.string().trim().max(500).optional() });

/** One member's share of a month's rent: rent × units held ÷ total units of the asset. */
export const rentShare = (monthlyRent: number, units: number, totalUnits: number) => Math.floor((monthlyRent * units) / totalUnits);
/**
 * Splits a rent amount among holders pro rata to units. Shares of unsold units are not distributed. Rounding: every holder
 * gets the floor; leftover paise go one each to the largest fractional remainders, so the total paid equals the exact pro-rata
 * amount for the units held.
 */
export function prorataSplit(monthlyRent: number, holdings: { id: string; units: number }[], totalUnits: number) {
  const held = holdings.reduce((a, h) => a + h.units, 0);
  if (held > totalUnits) throw new Error('Holdings exceed the asset’s units');
  const target = Math.floor((monthlyRent * held) / totalUnits);
  const raw = holdings.map((h) => { const exact = (monthlyRent * h.units) / totalUnits; return { id: h.id, units: h.units, amount: Math.floor(exact), rem: exact - Math.floor(exact) }; });
  let left = target - raw.reduce((a, r) => a + r.amount, 0);
  for (const r of [...raw].sort((a, b) => b.rem - a.rem)) { if (left <= 0) break; r.amount += 1; left -= 1; }
  return { distributed: target, retainedForUnsold: monthlyRent - target, shares: raw.map(({ id, units, amount }) => ({ id, units, amount })) };
}
/** Indicative gross annual yield of the projected rent on the unit price (not a promise). */
export const grossYieldPct = (monthlyRent: number, totalUnits: number, unitPrice: number) => (totalUnits && unitPrice ? Math.round(((monthlyRent * 12) / (totalUnits * unitPrice)) * 10000) / 100 : 0);
