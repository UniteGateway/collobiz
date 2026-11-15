import { z } from 'zod';

// ---------------- Franchise ----------------
export const FRANCHISE_FORMATS = ['experience_centre', 'store', 'kiosk', 'service_point'] as const;
export const FRANCHISE_FORMAT_LABELS: Record<string, string> = { experience_centre: 'Experience centre', store: 'Store', kiosk: 'Kiosk', service_point: 'Service point',
  basic_franchise: 'Basic Franchise', master_franchise: 'Master Franchise', district_franchise: 'District Franchise', store_with_stock: 'Store Partner — With Stock', store_without_stock: 'Store Partner — Without Stock' };
export const FRANCHISE_STATUSES = ['draft', 'applied', 'approved', 'agreement_signed', 'setup', 'live', 'suspended', 'rejected', 'closed'] as const;
export const FRANCHISE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', applied: 'Applied', approved: 'Approved', agreement_signed: 'Agreement signed', setup: 'Setting up', live: 'Live', suspended: 'Suspended', rejected: 'Not approved', closed: 'Closed',
};
/** Allowed next steps. Going live also requires every checklist item to be done. */
export const FRANCHISE_NEXT: Record<string, string[]> = {
  draft: ['applied', 'closed'], applied: ['approved', 'rejected', 'draft'], approved: ['agreement_signed', 'closed'], agreement_signed: ['setup', 'closed'], setup: ['live', 'closed'],
  live: ['suspended', 'closed'], suspended: ['live', 'closed'], rejected: [], closed: [],
};
export const FRANCHISE_CHECKLIST: [string, string][] = [
  ['site', 'Site selected and approved'], ['agreement', 'Franchise agreement signed'], ['fee', 'Franchise fee received'], ['training', 'Staff trained'],
  ['branding', 'Branding and display installed'], ['stock', 'Opening stock received'], ['launch', 'Launch event done'],
];
export const FranchiseApplySchema = z.object({
  brandOrgId: z.string().uuid(),
  format: z.enum(FRANCHISE_FORMATS),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(6),
  message: z.string().trim().min(30, { message: 'Tell Unite about your location, team and experience (at least 30 characters)' }).max(2000),
});
export const FranchiseDecisionSchema = z.object({
  status: z.enum(FRANCHISE_STATUSES),
  note: z.string().trim().max(1000).optional(),
  fee: z.number().int().min(0).max(1_00_00_00_000_00).optional(),
  royaltyBps: z.number().int().min(0).max(5000).optional(),
  monthlyTarget: z.number().int().min(0).max(1_00_00_00_000_00).optional(),
});
export const FranchiseReportSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use the format YYYY-MM' }),
  sales: z.number().int().min(0).max(1_00_00_00_000_00),
  orders: z.number().int().min(0).max(1_000_000),
  notes: z.string().trim().max(1000).optional(),
});

// ---------------- Real estate ----------------
export const PROPERTY_KINDS = ['industrial_park', 'residential', 'commercial', 'plotted', 'land'] as const;
export const PROPERTY_KIND_LABELS: Record<string, string> = { industrial_park: 'Industrial park', residential: 'Residential', commercial: 'Commercial', plotted: 'Plotted development', land: 'Land' };
/** Project kinds that must carry a RERA registration before they can be marketed through partners. */
export const RERA_REQUIRED_KINDS = new Set(['residential', 'commercial', 'plotted']);
export const UNIT_TYPES = ['plot', 'flat', 'villa', 'shed', 'office', 'shop', 'land_parcel'] as const;
export const UNIT_TYPE_LABELS: Record<string, string> = { plot: 'Plot', flat: 'Flat', villa: 'Villa', shed: 'Industrial shed', office: 'Office', shop: 'Shop', land_parcel: 'Land parcel' };
export const UNIT_STATUS_LABELS: Record<string, string> = { available: 'Available', held: 'On hold', booked: 'Booked', sold: 'Sold', blocked: 'Not for sale' };
export const PROPERTY_HOLD_HOURS = 48;
export const PROPERTY_MAX_HOLDS = 5;

export const PropertyProjectSchema = z.object({
  ownerOrgId: z.string().uuid(),
  name: z.string().trim().min(3).max(160),
  kind: z.enum(PROPERTY_KINDS),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(6),
  description: z.string().trim().min(20).max(3000),
  reraNumber: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
  commissionBps: z.number().int().min(0).max(1000).default(200),
});
export const PropertyUnitsSchema = z.object({
  units: z.array(z.object({ unitNo: z.string().trim().min(1).max(30), unitType: z.enum(UNIT_TYPES), areaSqft: z.number().int().min(1).max(100_000_000), price: z.number().int().min(0).max(1_00_00_00_000_00) })).min(1).max(1000),
});
export const PropertyHoldSchema = z.object({
  buyerName: z.string().trim().min(2).max(120),
  buyerCity: z.string().trim().min(2).max(80),
  consentMethod: z.enum(['meeting_minutes', 'written_email', 'signed_letter', 'recorded_call']),
  consent: z.literal(true, { message: 'Confirm that the buyer agreed to be introduced' }),
  agentRera: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
});

// ---------------- Franchise operations: agreement, orders, revenue and royalty ----------------
/**
 * Two order books per franchise unit:
 *  - sale: the franchisee's customer orders (its revenue). Royalty is charged on delivered/paid sales, net of GST.
 *  - purchase: the franchisee's stock orders to the brand (the brand confirms and dispatches; the franchisee receives).
 * Money in paise, rates in basis points.
 */
export const FRANCHISE_ORDER_KINDS = ['sale', 'purchase'] as const;
export const ORDER_STATUS: Record<'sale' | 'purchase', string[]> = {
  sale: ['confirmed', 'delivered', 'paid', 'cancelled'],
  purchase: ['placed', 'confirmed', 'dispatched', 'received', 'cancelled'],
};
export const ORDER_STATUS_LABELS: Record<string, string> = { confirmed: 'Confirmed', delivered: 'Delivered', paid: 'Paid', cancelled: 'Cancelled', placed: 'Placed', dispatched: 'Dispatched', received: 'Received' };
/** Who may move an order to each status: the franchisee ('unit') or the brand ('brand'). */
export const ORDER_NEXT: Record<'sale' | 'purchase', Record<string, { to: string; by: 'unit' | 'brand' }[]>> = {
  sale: { confirmed: [{ to: 'delivered', by: 'unit' }, { to: 'cancelled', by: 'unit' }], delivered: [{ to: 'paid', by: 'unit' }], paid: [], cancelled: [] },
  purchase: { placed: [{ to: 'confirmed', by: 'brand' }, { to: 'cancelled', by: 'unit' }, { to: 'cancelled', by: 'brand' }], confirmed: [{ to: 'dispatched', by: 'brand' }, { to: 'cancelled', by: 'brand' }], dispatched: [{ to: 'received', by: 'unit' }], received: [], cancelled: [] },
};
/** Sale statuses that count as revenue for royalty. */
export const REVENUE_STATUSES = ['delivered', 'paid'];
export const OrderLineSchema = z.object({
  item: z.string().trim().min(2).max(160), sku: z.string().trim().max(60).optional(),
  qty: z.number().positive().max(1_000_000), unitPrice: z.number().int().min(0).max(1_00_00_00_000_00), gstBps: z.number().int().refine((x) => [0, 500, 1200, 1800, 2800].includes(x), { message: 'Use a GST rate of 0, 5, 12, 18 or 28%' }),
});
export const FranchiseOrderSchema = z.object({
  kind: z.enum(FRANCHISE_ORDER_KINDS),
  customerName: z.string().trim().max(160).optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(OrderLineSchema).min(1).max(50),
  notes: z.string().trim().max(1000).optional(),
}).refine((o) => o.kind !== 'sale' || (o.customerName?.length ?? 0) >= 2, { message: 'Enter the customer', path: ['customerName'] });
export type OrderLine = z.infer<typeof OrderLineSchema>;
export function orderTotals(lines: OrderLine[]) {
  let subtotal = 0, gst = 0;
  for (const l of lines) { const net = Math.round(l.qty * l.unitPrice); subtotal += net; gst += Math.round((net * l.gstBps) / 10000); }
  return { subtotal, gst, total: subtotal + gst };
}
/**
 * Royalty on net sales (excluding GST) at the agreed rate. GST on the royalty is shown at 18% — the rate commonly applied to
 * franchise royalties; the SAC code and rate must be confirmed by the company's CA. TDS (s.194J) is deducted by the payer.
 */
export const ROYALTY_GST_BPS = 1800;
export function royaltyFor(netSales: number, bps: number) { const royalty = Math.round((netSales * bps) / 10000); const gst = Math.round((royalty * ROYALTY_GST_BPS) / 10000); return { royalty, gst, total: royalty + gst }; }
export const STATEMENT_STATUS_LABELS: Record<string, string> = { due: 'Due — not invoiced', invoiced: 'Invoiced', paid: 'Paid', disputed: 'Disputed' };
export const FranchiseAgreementSchema = z.object({
  termYears: z.number().int().min(1).max(20), territory: z.string().trim().min(3).max(300), exclusive: z.boolean(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), noticeDays: z.number().int().min(15).max(365).default(90),
});
/** Status flags shown on dashboards: renewal window, missing reports, behind target. */
export function franchiseFlags(u: { status: string; agreementEnds?: string | null; monthlyTarget?: number | null; lastMonthSales?: number | null; lastReportedMonth?: string | null }, today = new Date()) {
  const flags: { key: string; label: string; tone: 'warning' | 'danger' | 'info' }[] = [];
  if (u.agreementEnds) {
    const days = Math.round((new Date(u.agreementEnds).getTime() - today.getTime()) / 86400000);
    if (days < 0) flags.push({ key: 'expired', label: 'Agreement expired', tone: 'danger' });
    else if (days <= 90) flags.push({ key: 'renewal', label: `Renewal due in ${days} days`, tone: 'warning' });
  }
  if (u.status === 'live') {
    const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    if (!u.lastReportedMonth || u.lastReportedMonth < prev) flags.push({ key: 'report', label: `Sales for ${prev} not closed`, tone: 'warning' });
    if (u.monthlyTarget && u.lastMonthSales != null && u.lastMonthSales < u.monthlyTarget * 0.8) flags.push({ key: 'target', label: 'Below 80% of target last month', tone: 'info' });
  }
  return flags;
}
