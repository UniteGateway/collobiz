/**
 * COLLAB — resource-first collaboration (Master Upgrade §5–§7).
 *
 *   What I have  → collab assets (store, office, team, factory, land, skills, capital, customers …)
 *   What I need  → collab needs (customers, partners, contracts, suppliers, finance …)
 *   Matching     → deterministic and explainable: every score is a sum of named reasons; nothing is invented.
 *   Business offers are opportunities published by partners (one canonical opportunity record + offer details).
 *   Proposal → counter-proposal → mutual acceptance → agreement in Contracts → project → invoices → earnings.
 *
 * Money is in paise. Investment-type offers are discovery only and are routed to a regulated channel, never transacted.
 */
import { z } from 'zod';
import { SECTOR_CODES } from './taxonomy';

export const ASSET_KINDS = ['store', 'office', 'team', 'factory', 'machinery', 'warehouse', 'land', 'vehicles', 'skills', 'capital', 'customers', 'products', 'services', 'contracts', 'opportunity'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_LABELS: Record<AssetKind, string> = {
  store: 'Store or showroom', office: 'Office space', team: 'Team or manpower', factory: 'Factory or production line', machinery: 'Machinery or equipment', warehouse: 'Warehouse or storage',
  land: 'Land or commercial space', vehicles: 'Vehicles', skills: 'Professional skills', capital: 'Capital or funding', customers: 'Customer network or contacts', products: 'Products',
  services: 'Services', contracts: 'Existing contracts', opportunity: 'A business opportunity',
};
/** Unit used for the "capacity" number of each kind, shown next to the field. */
export const ASSET_UNITS: Record<AssetKind, string> = {
  store: 'sq ft', office: 'workstations', team: 'people', factory: 'units / month', machinery: 'machines', warehouse: 'sq ft', land: 'acres', vehicles: 'vehicles', skills: 'years of experience',
  capital: '₹ lakh', customers: 'contacts', products: 'SKUs', services: 'projects / month', contracts: 'contracts', opportunity: '₹ lakh value',
};

export const NEED_KINDS = ['customers', 'business_partner', 'franchise', 'outsourcing_contracts', 'financing', 'suppliers', 'distributors', 'contractors', 'employees', 'technology', 'market_access', 'joint_venture', 'business_buyer', 'project_work', 'extra_income', 'service_provider'] as const;
export type NeedKind = (typeof NEED_KINDS)[number];
export const NEED_LABELS: Record<NeedKind, string> = {
  customers: 'Customers', business_partner: 'A business partner', franchise: 'A franchise or dealership', outsourcing_contracts: 'Outsourcing / service contracts', financing: 'Financing',
  suppliers: 'Product suppliers', distributors: 'Distributors', contractors: 'Contractors', employees: 'Employees', technology: 'Technology', market_access: 'Market access',
  joint_venture: 'A joint venture', business_buyer: 'A buyer for my business', project_work: 'Project work', extra_income: 'Additional income from what I have', service_provider: 'A service provider or outsourced team',
};

/** Business Offers categories (Master Upgrade §6). `regulated` categories are discovery only and need a regulated channel. */
export const OFFER_CATEGORIES = [
  { code: 'business_for_sale', label: 'Business for sale', regulated: true },
  { code: 'acquisition', label: 'Business acquisition / takeover', regulated: true },
  { code: 'strategic_partnership', label: 'Strategic partnership' },
  { code: 'joint_venture', label: 'Joint venture' },
  { code: 'franchise', label: 'Franchise opportunity' },
  { code: 'dealership', label: 'Dealership' },
  { code: 'distribution', label: 'Distribution arrangement' },
  { code: 'bpo_contract', label: 'BPO / customer-support contract' },
  { code: 'marketing_work', label: 'Marketing work' },
  { code: 'consulting', label: 'Consulting' },
  { code: 'construction', label: 'Construction contract' },
  { code: 'solar_epc', label: 'Solar EPC' },
  { code: 'electrical', label: 'Electrical project' },
  { code: 'manufacturing', label: 'Manufacturing contract' },
  { code: 'oem_private_label', label: 'OEM / private label' },
  { code: 'wholesale', label: 'Wholesale trading' },
  { code: 'import_export', label: 'Import / export' },
  { code: 'warehouse_logistics', label: 'Warehouse & logistics' },
  { code: 'land_property', label: 'Land & property partnership' },
  { code: 'idle_capacity', label: 'Idle capacity' },
  { code: 'business_rescue', label: 'Business rescue' },
  { code: 'urgent_exit', label: 'Urgent business exit', regulated: true },
  { code: 'investment', label: 'Investment introduction', regulated: true },
  { code: 'international_representation', label: 'International representation' },
  { code: 'tender', label: 'Government / private tender' },
] as const;
export type OfferCategory = (typeof OFFER_CATEGORIES)[number]['code'];
export const OFFER_CATEGORY_CODES = OFFER_CATEGORIES.map((c) => c.code) as unknown as [OfferCategory, ...OfferCategory[]];
export const offerCategoryLabel = (c: string) => OFFER_CATEGORIES.find((x) => x.code === c)?.label ?? c;
export const isRegulatedCategory = (c: string) => OFFER_CATEGORIES.some((x) => x.code === c && 'regulated' in x && x.regulated);

/**
 * Who the offer is looking for, by category: the resources a responder should have, and the needs it serves.
 * Used by matching in both directions.
 */
export const CATEGORY_FIT: Record<OfferCategory, { assets: AssetKind[]; needs: NeedKind[] }> = {
  business_for_sale: { assets: ['capital'], needs: ['business_buyer'] },
  acquisition: { assets: ['capital'], needs: ['business_buyer', 'joint_venture'] },
  strategic_partnership: { assets: ['customers', 'skills', 'capital', 'team'], needs: ['business_partner', 'market_access'] },
  joint_venture: { assets: ['capital', 'land', 'factory', 'skills'], needs: ['joint_venture', 'business_partner', 'financing'] },
  franchise: { assets: ['store', 'office', 'capital', 'customers'], needs: ['franchise', 'extra_income'] },
  dealership: { assets: ['store', 'customers', 'warehouse'], needs: ['franchise', 'suppliers', 'extra_income'] },
  distribution: { assets: ['warehouse', 'vehicles', 'store', 'customers'], needs: ['distributors', 'suppliers', 'market_access'] },
  bpo_contract: { assets: ['office', 'team', 'skills'], needs: ['outsourcing_contracts', 'project_work', 'extra_income'] },
  marketing_work: { assets: ['skills', 'team', 'customers'], needs: ['customers', 'project_work', 'outsourcing_contracts'] },
  consulting: { assets: ['skills'], needs: ['project_work', 'extra_income'] },
  construction: { assets: ['team', 'machinery', 'vehicles', 'skills'], needs: ['contractors', 'project_work'] },
  solar_epc: { assets: ['team', 'skills', 'machinery'], needs: ['contractors', 'project_work'] },
  electrical: { assets: ['team', 'skills'], needs: ['contractors', 'project_work'] },
  manufacturing: { assets: ['factory', 'machinery', 'team'], needs: ['suppliers', 'project_work', 'outsourcing_contracts'] },
  oem_private_label: { assets: ['factory', 'machinery'], needs: ['suppliers', 'project_work'] },
  wholesale: { assets: ['products', 'warehouse', 'capital'], needs: ['suppliers', 'distributors', 'customers'] },
  import_export: { assets: ['products', 'customers', 'warehouse'], needs: ['market_access', 'suppliers', 'customers'] },
  warehouse_logistics: { assets: ['warehouse', 'vehicles'], needs: ['project_work', 'extra_income', 'distributors'] },
  land_property: { assets: ['land', 'capital'], needs: ['joint_venture', 'extra_income', 'business_partner'] },
  idle_capacity: { assets: ['office', 'factory', 'machinery', 'warehouse', 'team', 'vehicles'], needs: ['extra_income', 'project_work', 'outsourcing_contracts'] },
  business_rescue: { assets: ['capital', 'skills', 'customers', 'team'], needs: ['business_partner', 'financing', 'customers'] },
  urgent_exit: { assets: ['capital'], needs: ['business_buyer'] },
  investment: { assets: ['capital'], needs: ['financing', 'joint_venture'] },
  international_representation: { assets: ['customers', 'office', 'skills'], needs: ['market_access', 'distributors'] },
  tender: { assets: ['team', 'machinery', 'skills', 'capital'], needs: ['project_work', 'contractors'] },
};

/**
 * When the publisher is OFFERING something (seats, a franchise, a business, capacity), who should respond: the needs it
 * serves and, where the taker must bring something, the resources they need. A responder who has the same resource as
 * the publisher is a competitor, not a fit, so resources count only where listed here.
 */
export const OFFERING_FIT: Record<OfferCategory, { assets: AssetKind[]; needs: NeedKind[] }> = {
  business_for_sale: { assets: ['capital'], needs: [] }, acquisition: { assets: ['capital'], needs: [] }, urgent_exit: { assets: ['capital'], needs: [] },
  strategic_partnership: { assets: [], needs: ['business_partner', 'market_access'] }, joint_venture: { assets: ['capital'], needs: ['joint_venture', 'business_partner'] },
  franchise: { assets: ['store', 'office', 'customers'], needs: ['franchise', 'extra_income'] }, dealership: { assets: ['store', 'customers'], needs: ['franchise', 'extra_income'] },
  distribution: { assets: ['warehouse', 'vehicles', 'store'], needs: ['franchise', 'extra_income', 'suppliers'] },
  bpo_contract: { assets: [], needs: ['service_provider'] }, marketing_work: { assets: [], needs: ['service_provider', 'customers'] }, consulting: { assets: [], needs: ['service_provider', 'technology'] },
  construction: { assets: [], needs: ['contractors'] }, solar_epc: { assets: [], needs: ['contractors'] }, electrical: { assets: [], needs: ['contractors'] }, tender: { assets: [], needs: ['contractors', 'business_partner'] },
  manufacturing: { assets: [], needs: ['suppliers'] }, oem_private_label: { assets: [], needs: ['suppliers'] }, wholesale: { assets: ['store', 'warehouse'], needs: ['suppliers'] },
  import_export: { assets: [], needs: ['suppliers', 'market_access'] }, warehouse_logistics: { assets: [], needs: ['distributors', 'service_provider'] },
  land_property: { assets: ['capital'], needs: ['joint_venture'] }, idle_capacity: { assets: [], needs: ['service_provider', 'contractors', 'suppliers'] },
  business_rescue: { assets: ['capital', 'skills', 'customers'], needs: [] }, investment: { assets: [], needs: ['financing'] },
  international_representation: { assets: [], needs: ['market_access', 'distributors'] },
};
/** Resources that can satisfy each need — used for reverse matching (my need → someone else's resource). */
export const NEED_ASSETS: Record<NeedKind, AssetKind[]> = {
  customers: ['customers'], business_partner: ['skills', 'capital', 'customers'], franchise: [], outsourcing_contracts: ['contracts', 'opportunity'], financing: ['capital'],
  suppliers: ['products', 'factory'], distributors: ['warehouse', 'vehicles', 'store'], contractors: ['team', 'machinery'], employees: ['team'], technology: ['skills'],
  market_access: ['customers', 'office'], joint_venture: ['capital', 'land', 'factory'], business_buyer: ['capital'], project_work: ['contracts', 'opportunity'], extra_income: [],
  service_provider: ['team', 'office', 'skills'],
};
export const fitFor = (category: OfferCategory, side: 'offering' | 'seeking') => (side === 'seeking' ? CATEGORY_FIT : OFFERING_FIT)[category];

/** Offer lifecycle shown on every offer. Verification means the checks listed were done — never a guarantee. */
export const OFFER_STATUSES = ['draft', 'pending_verification', 'verified', 'under_review', 'active', 'negotiating', 'closed', 'expired', 'suspended', 'rejected'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Draft', pending_verification: 'Pending verification', verified: 'Verified', under_review: 'Under Unite review', active: 'Active', negotiating: 'Negotiating',
  closed: 'Closed', expired: 'Expired', suspended: 'Suspended', rejected: 'Rejected',
};
export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ['pending_verification'],
  pending_verification: ['verified', 'rejected'],
  verified: ['under_review', 'active'],
  under_review: ['active'],
  active: ['negotiating', 'closed', 'expired', 'suspended'],
  negotiating: ['active', 'closed', 'suspended'],
  closed: [],
  expired: ['pending_verification'], // renewal goes back through verification
  suspended: ['active', 'closed'],
  rejected: ['draft'],
};
export const canOfferMove = (from: string, to: OfferStatus) => (OFFER_TRANSITIONS[from as OfferStatus] ?? []).includes(to);
/** Responders can apply only while an offer is open. */
export const OFFER_OPEN: OfferStatus[] = ['active', 'negotiating'];

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const CollabAssetSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  title: text(3, 120),
  description: text(10, 2000),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(40).optional(),
  country: z.string().length(2).toUpperCase().default('IN'),
  capacity: z.number().nonnegative().max(1e9).optional(),
  sectors: z.array(z.enum(SECTOR_CODES)).max(6).default([]),
  models: z.array(z.enum(OFFER_CATEGORY_CODES)).max(8).default([]),
  available: z.boolean().default(true),
  visibility: z.enum(['private', 'verified_partners']).default('verified_partners'),
});
export const CollabNeedSchema = z.object({
  kind: z.enum(NEED_KINDS),
  description: text(10, 2000),
  sectors: z.array(z.enum(SECTOR_CODES)).max(6).default([]),
  regions: z.array(z.string().trim().max(40)).max(10).default([]),
  zeroUpfrontOnly: z.boolean().default(false),
  visibility: z.enum(['private', 'verified_partners']).default('verified_partners'),
});
export const BusinessOfferSchema = z.object({
  category: z.enum(OFFER_CATEGORY_CODES),
  side: z.enum(['offering', 'seeking']), // offering what I have, or seeking a collaborator for what I need
  title: text(8, 160),
  summary: text(30, 6000),
  sector: z.enum(SECTOR_CODES),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(40).optional(),
  country: z.string().length(2).toUpperCase().default('IN'),
  territory: z.string().trim().max(200).optional(),
  estimatedValue: z.number().int().nonnegative().optional(), // paise
  upfrontRequired: z.boolean(),
  upfrontAmount: z.number().int().nonnegative().optional(), // paise
  eligibility: z.string().trim().max(2000).optional(),
  confidential: z.boolean().default(false),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  uniteFirstConsent: z.boolean().default(false),
  assetIds: z.array(z.string().uuid()).max(10).default([]),
}).refine((x) => !x.upfrontRequired || (x.upfrontAmount ?? 0) > 0, { message: 'Enter the upfront amount', path: ['upfrontAmount'] })
  .refine((x) => x.upfrontRequired || !x.upfrontAmount, { message: 'Remove the amount or mark an upfront payment as required', path: ['upfrontAmount'] });

export const PRICING_MODELS = ['fixed_fee', 'per_unit', 'monthly_retainer', 'revenue_share', 'commission', 'barter'] as const;
export const PRICING_LABELS: Record<(typeof PRICING_MODELS)[number], string> = {
  fixed_fee: 'Fixed fee', per_unit: 'Per unit / per seat', monthly_retainer: 'Monthly retainer', revenue_share: 'Revenue share', commission: 'Commission on sales', barter: 'Barter (through XCHANGE)',
};
export const CollabProposalSchema = z.object({
  scope: text(20, 6000),
  deliverables: text(5, 3000),
  pricingModel: z.enum(PRICING_MODELS),
  value: z.number().int().positive(), // paise — total contract value for the term
  sharePercent: z.number().min(0).max(100).optional(),
  paymentTerms: text(5, 500),
  durationMonths: z.number().int().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Who pays: the offer's owner or the applicant. The payer issues the agreement and becomes the project client. */
  payer: z.enum(['owner', 'applicant']),
  note: z.string().trim().max(1000).optional(),
}).refine((x) => !['revenue_share', 'commission'].includes(x.pricingModel) || (x.sharePercent ?? 0) > 0, { message: 'Enter the agreed percentage', path: ['sharePercent'] })
  .refine((x) => x.pricingModel !== 'barter', { message: 'Barter is agreed in XCHANGE, which balances both sides and handles each leg as a separate supply', path: ['pricingModel'] });

// ---------------------------------------------------------------- matching
export interface MatchAsset { id: string; orgId: string; kind: AssetKind; region?: string | null; city?: string | null; country?: string; sectors: string[]; models: string[]; capacity?: number | null; available: boolean }
export interface MatchNeed { id: string; orgId: string; kind: NeedKind; sectors: string[]; regions: string[]; zeroUpfrontOnly: boolean }
export interface MatchOffer { id: string; orgId: string; category: OfferCategory; side: 'offering' | 'seeking'; sector: string; region?: string | null; city?: string | null; country: string; upfrontRequired: boolean; status: string; expiresOn: string }
export interface MatchProgram { id: string; name: string; sector: string; roles: string[]; open: boolean }
export interface Reason { code: string; text: string; points: number }
export interface Match<T> { item: T; score: number; reasons: Reason[]; via?: string }

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
/** Resources that let a partner take part in each Unite programme role. */
export const ROLE_ASSETS: Record<string, AssetKind[]> = {
  refer_customers: ['customers'], sell_products: ['store', 'customers'], supply_products: ['products', 'factory', 'warehouse'], deliver_services: ['team', 'skills', 'machinery', 'vehicles'],
  recruit_merchants: ['customers', 'store'], recruit_members: ['customers', 'office'], create_content: ['skills'], community: ['customers', 'office'],
};

/**
 * Scores an open offer for an organisation from its assets and needs. Rules:
 *  - The offer must be open, unexpired and not the viewer's own. Hard filter, not a score.
 *  - A zero-upfront need excludes offers that require an upfront payment.
 *  - Points: matching resource kind 40 (once), matching need 30 (once), sector 15, region 10 (city 5 more), named model 10.
 *  - A match needs at least one resource or need fit; sector or location alone never makes a match.
 */
export function scoreOffer(o: MatchOffer, assets: MatchAsset[], needs: MatchNeed[], today: string): Match<MatchOffer> | null {
  if (!OFFER_OPEN.includes(o.status as OfferStatus) || o.expiresOn < today) return null;
  if (assets.some((a) => a.orgId === o.orgId) || needs.some((n) => n.orgId === o.orgId)) return null;
  const fit = fitFor(o.category, o.side);
  const reasons: Reason[] = [];
  const usable = assets.filter((a) => a.available);
  const asset = usable.find((a) => fit.assets.includes(a.kind));
  if (asset) reasons.push({ code: 'asset', text: `You have ${ASSET_LABELS[asset.kind].toLowerCase()}, which this ${offerCategoryLabel(o.category).toLowerCase()} needs from a partner`, points: 40 });
  const need = needs.find((n) => fit.needs.includes(n.kind));
  if (need) reasons.push({ code: 'need', text: `You are looking for ${NEED_LABELS[need.kind].toLowerCase()}`, points: 30 });
  if (!asset && !need) return null;
  if (needs.length && needs.every((n) => n.zeroUpfrontOnly) && o.upfrontRequired) return null;
  const sectors = new Set([...usable.flatMap((a) => a.sectors), ...needs.flatMap((n) => n.sectors)]);
  if (sectors.has(o.sector)) reasons.push({ code: 'sector', text: 'Same sector', points: 15 });
  const regions = new Set([...usable.map((a) => a.region).filter(Boolean), ...needs.flatMap((n) => n.regions)].map((r) => String(r).toLowerCase()));
  if (o.region && regions.has(o.region.toLowerCase())) reasons.push({ code: 'region', text: `In ${o.region}`, points: 10 });
  if (usable.some((a) => same(a.city, o.city))) reasons.push({ code: 'city', text: `Same city (${o.city})`, points: 5 });
  if (usable.some((a) => a.models.includes(o.category))) reasons.push({ code: 'model', text: 'A business model you said you prefer', points: 10 });
  if (!o.upfrontRequired) reasons.push({ code: 'zero_upfront', text: 'No upfront fee or capital required (not risk-free)', points: 0 });
  return { item: o, score: Math.min(100, reasons.reduce((s, r) => s + r.points, 0)), reasons };
}

/** Unite programmes a partner could join with what they have. Only programmes marked open are suggested. */
export function scoreProgram(p: MatchProgram, assets: MatchAsset[], needs: MatchNeed[]): Match<MatchProgram> | null {
  if (!p.open) return null;
  const usable = assets.filter((a) => a.available);
  const reasons: Reason[] = [];
  for (const role of p.roles) {
    const a = usable.find((x) => (ROLE_ASSETS[role] ?? []).includes(x.kind));
    if (a) { reasons.push({ code: `role:${role}`, text: `Your ${ASSET_LABELS[a.kind].toLowerCase()} fits the “${role.replace(/_/g, ' ')}” role`, points: 35 }); break; }
  }
  if (!reasons.length) return null;
  if (needs.some((n) => ['franchise', 'extra_income', 'business_partner', 'customers'].includes(n.kind))) reasons.push({ code: 'need', text: 'Matches what you are looking for', points: 25 });
  if (usable.some((a) => a.sectors.includes(p.sector)) || needs.some((n) => n.sectors.includes(p.sector))) reasons.push({ code: 'sector', text: 'Same sector', points: 20 });
  return { item: p, score: Math.min(100, reasons.reduce((s, r) => s + r.points, 0)), reasons };
}

/**
 * Reverse matching: other organisations' published resources that fit what I need, or that an offer of mine is seeking.
 * Only resources marked visible to verified partners are considered; the caller enforces the viewer's own verification.
 */
export function reverseMatches(needs: { kind?: NeedKind; category?: OfferCategory; side?: 'offering' | 'seeking'; sectors: string[]; regions: string[]; orgId: string }[], others: (MatchAsset & { visibility: string })[], limit = 20) {
  const out: Match<MatchAsset>[] = [];
  for (const a of others) {
    if (a.visibility !== 'verified_partners' || !a.available) continue;
    let best: Match<MatchAsset> | null = null;
    for (const n of needs) {
      if (a.orgId === n.orgId) continue;
      const kinds = n.category ? fitFor(n.category, n.side ?? 'seeking').assets : NEED_ASSETS[n.kind!];
      if (!kinds.includes(a.kind)) continue;
      const reasons: Reason[] = [{ code: 'asset', text: `Has ${ASSET_LABELS[a.kind].toLowerCase()}`, points: 50 }];
      if (n.sectors.some((s) => a.sectors.includes(s))) reasons.push({ code: 'sector', text: 'Same sector', points: 25 });
      if (a.region && n.regions.some((r) => same(r, a.region))) reasons.push({ code: 'region', text: `In ${a.region}`, points: 15 });
      if (a.capacity) reasons.push({ code: 'capacity', text: `Declared capacity ${a.capacity} ${ASSET_UNITS[a.kind]}`, points: 10 });
      const m = { item: a, score: Math.min(100, reasons.reduce((s, r) => s + r.points, 0)), reasons, via: n.category ?? n.kind };
      if (!best || m.score > best.score) best = m;
    }
    if (best) out.push(best);
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Proposal rounds alternate between the two parties; only the party that did not send the latest round can accept it. */
export function nextProposalTurn(rounds: { fromOrgId: string; status: string }[], ownerOrgId: string, applicantOrgId: string) {
  const live = [...rounds].reverse().find((r) => r.status === 'sent');
  if (!live) return { canPropose: [ownerOrgId, applicantOrgId], canAccept: [] as string[] };
  const other = live.fromOrgId === ownerOrgId ? applicantOrgId : ownerOrgId;
  return { canPropose: [other], canAccept: [other] };
}
