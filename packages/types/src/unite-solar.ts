/**
 * Unite Solar Franchise Network — pure rules shared by API and UI. Money in paise, rates in basis points (1% = 100).
 *
 * Packages, prices and rates are administrator-configured records; the values below are only the starting configuration
 * supplied by Unite. Every earning is "up to" a configured maximum — nothing here promises income.
 */
import { z } from 'zod';

export const PACKAGE_KINDS = ['basic_franchise', 'master_franchise', 'district_franchise', 'store_with_stock', 'store_without_stock'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];
export const TERRITORY_LEVELS = ['pincode', 'mandal', 'city', 'district'] as const;
export type TerritoryLevel = (typeof TERRITORY_LEVELS)[number];

export interface PackageConfig {
  code: PackageKind; name: string; tagline: string;
  /** Package price excluding GST unless gstMode says otherwise. */
  price: number;
  gstMode: 'extra' | 'included'; gstBps: number;
  leadDnaIncluded: boolean; leadDnaAddonPrice: number | null;
  /** Store with stock: part of the price that is inventory at partner price, and the non-stock store package. */
  stockAllocation: number; storePackage: number;
  territoryLevel: TerritoryLevel | null; exclusive: boolean; inventoryEnabled: boolean;
  maxProductCommissionBps: number; districtProfitShareBps: number; interFranchiseBps: number;
  benefits: string[]; termYears: number;
}
export const COMMON_BENEFITS = [
  'Unite Solar branding support', 'Demo / display materials', 'Printed and downloadable flyers', 'Digital marketing campaign support', 'Product catalogue and price lists',
  'Up to 10% on eligible product / solar kit sales', 'Customer lead registration and referral tracking', 'Loan assistance and subsidy guidance requests', 'Site survey, installation and service requests',
  'Training resources and product updates', 'COLLABIZ partner dashboard with transparent earnings',
];
const L = 100_000_00; // ₹1 lakh in paise
/** Starting configuration supplied by Unite (editable by administrators; GST treatment set by finance). */
export const DEFAULT_PACKAGES: PackageConfig[] = [
  { code: 'basic_franchise', name: 'Basic Franchise', tagline: 'Local solar business', price: 2 * L, gstMode: 'extra', gstBps: 1800, leadDnaIncluded: false, leadDnaAddonPrice: 5 * L, stockAllocation: 0, storePackage: 0, territoryLevel: 'mandal', exclusive: true, inventoryEnabled: false, maxProductCommissionBps: 1000, districtProfitShareBps: 0, interFranchiseBps: 1250, benefits: ['Franchise rights', 'Business support'], termYears: 3 },
  { code: 'master_franchise', name: 'Master Franchise', tagline: 'Expanded franchise network', price: 5 * L, gstMode: 'extra', gstBps: 1800, leadDnaIncluded: false, leadDnaAddonPrice: 5 * L, stockAllocation: 0, storePackage: 0, territoryLevel: 'city', exclusive: true, inventoryEnabled: false, maxProductCommissionBps: 1000, districtProfitShareBps: 0, interFranchiseBps: 1250, benefits: ['Extended territory', 'Business support'], termYears: 5 },
  { code: 'district_franchise', name: 'District Franchise', tagline: 'LeadDNA included', price: 10 * L, gstMode: 'extra', gstBps: 1800, leadDnaIncluded: true, leadDnaAddonPrice: null, stockAllocation: 0, storePackage: 0, territoryLevel: 'district', exclusive: true, inventoryEnabled: false, maxProductCommissionBps: 1000, districtProfitShareBps: 2500, interFranchiseBps: 1250, benefits: ['District rights', 'LeadDNA software licence', 'Share of eligible district net profit'], termYears: 5 },
  { code: 'store_with_stock', name: 'Store Partner — With Stock', tagline: 'Includes ₹4 lakh stock', price: 5 * L, gstMode: 'extra', gstBps: 1800, leadDnaIncluded: false, leadDnaAddonPrice: null, stockAllocation: 4 * L, storePackage: 1 * L, territoryLevel: 'pincode', exclusive: false, inventoryEnabled: true, maxProductCommissionBps: 1000, districtProfitShareBps: 0, interFranchiseBps: 0, benefits: ['₹4 lakh opening stock at partner price', '₹1 lakh store package'], termYears: 3 },
  { code: 'store_without_stock', name: 'Store Partner — Without Stock', tagline: 'No initial inventory', price: 1.5 * L, gstMode: 'extra', gstBps: 1800, leadDnaIncluded: false, leadDnaAddonPrice: null, stockAllocation: 0, storePackage: 1.5 * L, territoryLevel: 'pincode', exclusive: false, inventoryEnabled: false, maxProductCommissionBps: 1000, districtProfitShareBps: 0, interFranchiseBps: 0, benefits: ['Showroom and digital catalogue sales', 'Orders fulfilled by Unite or authorised partners'], termYears: 3 },
];

/** Server-side price: package + optional LeadDNA add-on, GST per the package's setting. */
export function packagePrice(p: Pick<PackageConfig, 'price' | 'gstMode' | 'gstBps' | 'leadDnaIncluded' | 'leadDnaAddonPrice'>, withLeadDna: boolean) {
  if (withLeadDna && !p.leadDnaIncluded && p.leadDnaAddonPrice == null) throw new Error('LeadDNA is not offered as an add-on with this package');
  const addon = withLeadDna && !p.leadDnaIncluded ? p.leadDnaAddonPrice ?? 0 : 0;
  const base = p.price + addon;
  const gst = p.gstMode === 'extra' ? Math.round((base * p.gstBps) / 10000) : 0;
  const gstIncluded = p.gstMode === 'included' ? Math.round(base - base / (1 + p.gstBps / 10000)) : 0;
  return { package: p.price, leadDnaAddon: addon, subtotal: base, gst, gstIncluded, total: base + gst, gstMode: p.gstMode };
}
export function validatePackage(p: PackageConfig) {
  const e: string[] = [];
  if (p.code === 'store_with_stock' && p.stockAllocation + p.storePackage !== p.price) e.push('Stock allocation + store package must equal the package price');
  if (p.maxProductCommissionBps > 1000) e.push('Product commission cannot exceed 10%');
  if (p.leadDnaIncluded && p.leadDnaAddonPrice) e.push('A package that includes LeadDNA cannot also charge for it');
  if (p.inventoryEnabled !== (p.stockAllocation > 0)) e.push('Only packages with a stock allocation run inventory');
  return e;
}

// ------------------------------------------------------------------ territories
export interface TerritoryLike { id: string; level: TerritoryLevel; state: string; district: string; pincodes: string[]; exclusive: boolean; status: 'available' | 'reserved' | 'allocated' | 'expired'; unitId?: string | null }
/** An exclusive grant conflicts with any other reserved/allocated exclusive grant that shares a PIN code or the district. */
export function territoryConflicts(t: TerritoryLike, others: TerritoryLike[], unitId: string) {
  if (!t.exclusive) return [];
  return others.filter((o) => o.id !== t.id && o.exclusive && ['reserved', 'allocated'].includes(o.status) && o.unitId !== unitId && o.state === t.state && o.district.toLowerCase() === t.district.toLowerCase()
    && (o.level === 'district' || t.level === 'district' || o.pincodes.some((p) => t.pincodes.includes(p))));
}

// ------------------------------------------------------------------ products and product commission
export const PRODUCT_CATEGORIES = ['pv_module', 'on_grid_inverter', 'hybrid_inverter', 'battery', 'mounting', 'cable', 'acdb_dcdb', 'protection', 'rooftop_kit', 'commercial_kit', 'street_light', 'water_pump', 'ev_charger', 'allied'] as const;
export const PRODUCT_CATEGORY_LABELS: Record<string, string> = {
  pv_module: 'Solar PV modules', on_grid_inverter: 'On-grid inverters', hybrid_inverter: 'Hybrid inverters', battery: 'Batteries and BESS', mounting: 'Mounting structures', cable: 'Solar cables', acdb_dcdb: 'ACDB / DCDB',
  protection: 'Protection equipment', rooftop_kit: 'Rooftop kits (1–10 kW)', commercial_kit: 'Commercial rooftop kits', street_light: 'Solar street lights', water_pump: 'Solar water pumps', ev_charger: 'EV chargers', allied: 'Allied electrical products',
};
export const SolarProductSchema = z.object({
  sku: z.string().trim().min(3).max(40), name: z.string().trim().min(3).max(160), category: z.enum(PRODUCT_CATEGORIES), brand: z.string().trim().min(2).max(80), model: z.string().trim().max(80).optional(),
  hsn: z.string().regex(/^\d{4,8}$/, 'HSN must be 4–8 digits'), gstBps: z.number().int().refine((x) => [0, 500, 1200, 1800, 2800].includes(x), 'Use a GST slab'),
  specification: z.string().trim().min(5).max(2000), warrantyMonths: z.number().int().min(0).max(360),
  mrp: z.number().int().positive(), partnerPrice: z.number().int().positive(), customerPrice: z.number().int().positive(),
  commissionBps: z.number().int().min(0).max(1000), reorderLevel: z.number().int().min(0).max(100000).default(0), serialised: z.boolean().default(false),
  imageUrl: z.string().url().optional().or(z.literal('')), datasheetUrl: z.string().url().optional().or(z.literal('')), installation: z.string().trim().max(2000).optional(),
}).refine((p) => p.customerPrice <= p.mrp, { message: 'Customer price cannot exceed MRP', path: ['customerPrice'] })
  .refine((p) => p.partnerPrice <= p.customerPrice, { message: 'Partner price cannot exceed the customer price', path: ['partnerPrice'] })
  .refine((p) => (p.customerPrice - p.partnerPrice) * 10000 <= p.customerPrice * 1000, { message: 'Partner margin cannot exceed 10% of the customer price', path: ['partnerPrice'] });

/**
 * One earning per order line, never both: a store selling from its own stock earns the resale margin (it bought at partner
 * price and invoices the customer); an order fulfilled by Unite earns the product commission, capped at the package maximum.
 */
export function lineEarning(line: { qty: number; unitPrice: number }, product: { partnerPrice: number; customerPrice: number; commissionBps: number }, fulfilment: 'from_stock' | 'unite', maxBps: number) {
  const net = Math.round(line.qty * line.unitPrice);
  if (fulfilment === 'from_stock') return { kind: 'margin' as const, base: net, bps: 0, amount: Math.max(0, net - Math.round(line.qty * product.partnerPrice)) };
  const bps = Math.min(product.commissionBps, maxBps, 1000);
  return { kind: 'commission' as const, base: net, bps, amount: Math.round((net * bps) / 10000) };
}

// ------------------------------------------------------------------ other earning streams
export const EARNING_STREAMS = ['product', 'district_profit', 'inter_franchise', 'solar_park', 'investment'] as const;
export type EarningStream = (typeof EARNING_STREAMS)[number];
export const STREAM_LABELS: Record<EarningStream, string> = {
  product: 'Product / kit sales commission', district_profit: 'District partner profit share', inter_franchise: 'Inter-franchise commission', solar_park: 'Solar park development commission', investment: 'Investment facilitation commission',
};
export const COMMISSION_STATUSES = ['pending', 'qualified', 'approved', 'payable', 'paid', 'reversed', 'blocked'] as const;
export const COMMISSION_STATUS_LABELS: Record<string, string> = { pending: 'Pending', qualified: 'Qualified', approved: 'Approved', payable: 'Payable', paid: 'Paid', reversed: 'Reversed', blocked: 'Blocked — compliance' };
export const COMMISSION_NEXT: Record<string, string[]> = { pending: ['qualified', 'reversed'], qualified: ['approved', 'reversed'], approved: ['payable', 'reversed'], payable: ['paid', 'reversed'], paid: [], reversed: [], blocked: ['pending', 'reversed'] };

/** District share: rate × (revenue − direct costs − approved expenses), never negative. */
export function districtProfitShare(i: { revenue: number; directCosts: number; approvedExpenses: number }, bps: number) {
  const distributable = Math.max(0, i.revenue - i.directCosts - i.approvedExpenses);
  return { distributable, amount: Math.round((distributable * bps) / 10000) };
}
/** Inter-franchise: rate × the administrator-defined eligible commission/profit pool — never project turnover. */
export const interFranchiseCommission = (eligiblePool: number, bps: number) => Math.round((eligiblePool * bps) / 10000);
/** Solar park: a project pool of at most 2% of the approved eligible value, split among contributors; the split cannot exceed the pool. */
export function solarParkSplit(eligibleValue: number, poolBps: number, contributors: { orgId: string; bps: number }[]) {
  if (poolBps > 200) throw new Error('The solar park commission pool cannot exceed 2%');
  const used = contributors.reduce((a, c) => a + c.bps, 0);
  if (used > poolBps) throw new Error(`Contributor shares (${used / 100}%) exceed the project pool (${poolBps / 100}%)`);
  if (new Set(contributors.map((c) => c.orgId)).size !== contributors.length) throw new Error('Each contributor appears once');
  return contributors.map((c) => ({ ...c, amount: Math.round((eligibleValue * c.bps) / 10000) }));
}
/** Investment: rate × realised (received) investment only; payout blocked until compliance clears it. */
export const investmentCommission = (realised: number, bps: number) => { if (bps > 200) throw new Error('Investment commission cannot exceed 2%'); return Math.round((realised * bps) / 10000); };

// ------------------------------------------------------------------ demo materials and service requests
export const DEMO_STATUSES = ['requested', 'approved', 'dispatched', 'delivered', 'confirmed', 'rejected', 'returned', 'damaged'] as const;
export const DEMO_NEXT: Record<string, { to: string; by: 'admin' | 'partner' }[]> = {
  requested: [{ to: 'approved', by: 'admin' }, { to: 'rejected', by: 'admin' }], approved: [{ to: 'dispatched', by: 'admin' }], dispatched: [{ to: 'delivered', by: 'admin' }, { to: 'confirmed', by: 'partner' }],
  delivered: [{ to: 'confirmed', by: 'partner' }], confirmed: [{ to: 'returned', by: 'partner' }, { to: 'damaged', by: 'partner' }], rejected: [], returned: [], damaged: [{ to: 'returned', by: 'partner' }],
};
export const SERVICE_KINDS = ['site_survey', 'installation', 'service', 'loan_assistance', 'subsidy_guidance', 'complaint'] as const;
export const SERVICE_KIND_LABELS: Record<string, string> = { site_survey: 'Site survey', installation: 'Installation', service: 'Service / warranty', loan_assistance: 'Loan assistance', subsidy_guidance: 'Subsidy guidance', complaint: 'Customer complaint' };
export const FULFILMENT_STATUSES = ['requested', 'dispatched', 'installed', 'accepted'] as const;

// ------------------------------------------------------------------ request bodies shared by the API and the apps
export const NetworkApplicationSchema = z.object({
  packageCode: z.enum(PACKAGE_KINDS), leadDnaAddon: z.boolean().default(false), territoryId: z.string().uuid().optional(),
  state: z.string().trim().min(2).max(40), district: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'), message: z.string().trim().min(10, 'Tell us a little about your business (10+ characters)').max(2000),
});
export const NetworkSaleSchema = z.object({
  customerName: z.string().trim().min(2).max(160), customerPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').optional(),
  pincode: z.string().regex(/^\d{6}$/), fulfilment: z.enum(['from_stock', 'unite']),
  lines: z.array(z.object({ productId: z.string().uuid(), qty: z.number().int().positive().max(10000) })).min(1).max(30), notes: z.string().trim().max(1000).optional(),
});
export const NetworkTerritorySchema = z.object({
  level: z.enum(TERRITORY_LEVELS), name: z.string().trim().min(2).max(120), state: z.string().trim().min(2).max(40), district: z.string().trim().min(2).max(80),
  pincodes: z.array(z.string().regex(/^\d{6}$/)).max(500).default([]), exclusive: z.boolean().default(true),
}).refine((t) => t.level === 'district' || t.pincodes.length > 0, { message: 'List the PIN codes this territory covers', path: ['pincodes'] });
export const ServiceRequestSchema = z.object({
  kind: z.enum(SERVICE_KINDS), customerName: z.string().trim().min(2).max(160), customerPhone: z.string().regex(/^[6-9]\d{9}$/).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(), orderId: z.string().uuid().optional(), details: z.string().trim().min(10).max(2000),
});
