/**
 * Group-company product sales (Unite Powertek first): anyone with a COLLABIZ account — franchise, store, partner, agent or
 * individual — registers a customer enquiry for catalogue products; the company's sales team quotes and closes it; the seller
 * earns a commission on the order value (excl. GST) once the customer's payment is verified. Money in paise, rates in bps.
 */
import { z } from 'zod';

export const ENQUIRY_STATUSES = ['submitted', 'in_discussion', 'quoted', 'won', 'paid', 'lost', 'withdrawn'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  submitted: 'Submitted', in_discussion: 'In discussion', quoted: 'Quoted', won: 'Order won', paid: 'Paid — commission earned', lost: 'Lost', withdrawn: 'Withdrawn',
};
/** Moves the company's sales team may make (paid is recorded by finance; withdrawn by the seller). */
export const ENQUIRY_NEXT: Record<EnquiryStatus, EnquiryStatus[]> = {
  submitted: ['in_discussion', 'quoted', 'lost'], in_discussion: ['quoted', 'lost'], quoted: ['won', 'lost', 'in_discussion'], won: ['paid', 'lost'], paid: [], lost: [], withdrawn: [],
};
export const SELLER_CHANNELS = ['franchise', 'store', 'partner', 'agent'] as const;
export type SellerChannel = (typeof SELLER_CHANNELS)[number];
export const SELLER_CHANNEL_LABELS: Record<SellerChannel, string> = { franchise: 'Franchise', store: 'Store partner', partner: 'Partner company', agent: 'Agent / individual' };
/** Customer attribution lasts this long from registration; the first seller to register a customer keeps it. */
export const ATTRIBUTION_DAYS = 90;
export const MAX_PRODUCT_COMMISSION_BPS = 1000;

export const ProductEnquirySchema = z.object({
  customerName: z.string().trim().min(2, 'Enter the customer').max(160),
  customerPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').optional(),
  customerEmail: z.string().trim().email().max(200).optional(),
  city: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(60), pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  lines: z.array(z.object({ catalogItemId: z.string().uuid(), qty: z.number().int().positive().max(100000), note: z.string().trim().max(300).optional() })).min(1, 'Add at least one product').max(30),
  requirement: z.string().trim().min(10, 'Describe the requirement (10+ characters)').max(3000),
  consent: z.literal(true, { message: 'Confirm the customer agreed to be contacted by Unite Powertek' }),
});
export type ProductEnquiryInput = z.infer<typeof ProductEnquirySchema>;

export const CommissionRuleSchema = z.object({
  productLine: z.string().trim().max(80).nullable(), category: z.string().trim().max(80).nullable(),
  rateBps: z.number().int().min(0).max(MAX_PRODUCT_COMMISSION_BPS), note: z.string().trim().max(300).optional(),
}).refine((r) => !r.category || !!r.productLine, { message: 'A category rule needs its product line', path: ['productLine'] });

export interface RuleLike { productLine: string | null; category: string | null; rateBps: number; active: boolean }
/** Most specific active rule wins: product line + category, then product line, then the company default. Null = no rate set. */
export function resolveRate(rules: RuleLike[], productLine: string | null | undefined, category: string | null | undefined) {
  const act = rules.filter((r) => r.active);
  const hit = act.find((r) => r.productLine && r.category && r.productLine === productLine && r.category === category)
    ?? act.find((r) => r.productLine && !r.category && r.productLine === productLine)
    ?? act.find((r) => !r.productLine && !r.category);
  return hit ? Math.min(hit.rateBps, MAX_PRODUCT_COMMISSION_BPS) : null;
}
/** Commission on an order: the lowest rate among its lines' rules applies to the whole order value, so a mixed order never earns more than its least-rewarded product would. */
export function orderCommission(orderValue: number, lineRates: (number | null)[]) {
  const known = lineRates.filter((r): r is number => r != null);
  if (!known.length || known.length !== lineRates.length) return { rateBps: known.length ? Math.min(...known) : null, amount: null as number | null };
  const rateBps = Math.min(...known);
  return { rateBps, amount: Math.round((orderValue * rateBps) / 10000) };
}
/** Duplicate key for a customer: name (letters/digits only) + PIN code. */
export const customerKey = (name: string, pincode: string) => `${name.toLowerCase().replace(/(private|pvt|limited|ltd|llp|m\/s|\.|,)/g, '').replace(/[^a-z0-9]/g, '')}|${pincode}`;
