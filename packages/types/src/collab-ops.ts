/**
 * Collaboration operations: Launch (have → business model), Capacity calendar, Micro-contracts, Demand pools and
 * Commit (conditional multi-party agreements). Shared schemas and the pure rules the API and apps both use.
 */
import { z } from 'zod';
import type { AssetKind, NeedKind, OfferCategory } from './collab';

export const OPS_STATES = [
  ['AP', 'Andhra Pradesh'], ['AS', 'Assam'], ['BR', 'Bihar'], ['CG', 'Chhattisgarh'], ['DL', 'Delhi'], ['GA', 'Goa'], ['GJ', 'Gujarat'], ['HR', 'Haryana'], ['HP', 'Himachal Pradesh'],
  ['JH', 'Jharkhand'], ['KA', 'Karnataka'], ['KL', 'Kerala'], ['MP', 'Madhya Pradesh'], ['MH', 'Maharashtra'], ['OR', 'Odisha'], ['PB', 'Punjab'], ['RJ', 'Rajasthan'], ['TN', 'Tamil Nadu'],
  ['TG', 'Telangana'], ['UP', 'Uttar Pradesh'], ['UT', 'Uttarakhand'], ['WB', 'West Bengal'],
] as const;
export const opsStateName = (c: string | null | undefined) => (c ? OPS_STATES.find((s) => s[0] === c)?.[1] ?? c : 'Anywhere in India');
const StateCode = z.enum(OPS_STATES.map((s) => s[0]) as unknown as [string, ...string[]]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date (YYYY-MM-DD)');

// ============================================================================ Launch
export const INVEST_BANDS = [
  { code: 'none', label: 'No cash to invest', max: 0 }, { code: 'lt5l', label: 'Under ₹5 lakh', max: 5e5 }, { code: '5_25l', label: '₹5–25 lakh', max: 25e5 },
  { code: '25l_1cr', label: '₹25 lakh – ₹1 crore', max: 1e7 }, { code: 'gt1cr', label: 'Over ₹1 crore', max: Infinity },
] as const;
export type InvestBand = (typeof INVEST_BANDS)[number]['code'];
export const TIME_COMMITMENTS = [{ code: 'passive', label: 'Mostly passive' }, { code: 'part_time', label: 'Part-time' }, { code: 'full_time', label: 'Full-time' }] as const;
export type TimeCommitment = (typeof TIME_COMMITMENTS)[number]['code'];

export interface BusinessModel {
  code: string; title: string; summary: string;
  /** Resources the model is built on; `core` must include at least one of them. */
  core: AssetKind[]; helps: AssetKind[];
  minInvest: InvestBand; time: TimeCommitment[];
  /** Real records it is matched to: business-offer categories, Unite venture slugs, and other businesses' needs it serves. */
  offerCategories: OfferCategory[]; ventures: string[]; servesNeeds: NeedKind[];
  earns: string; firstSteps: string[];
}
export const BUSINESS_MODELS: BusinessModel[] = [
  { code: 'store_network', title: 'Partner your store with a store network', summary: 'Add a franchise or dealership counter to the store you already run.', core: ['store'], helps: ['customers', 'team'], minInvest: 'lt5l', time: ['part_time', 'full_time'],
    offerCategories: ['franchise', 'dealership'], ventures: ['solcart', 'nano-bazar', '99offers'], servesNeeds: ['franchise', 'distributors'], earns: 'Margin on products sold plus store incentives', firstSteps: ['Shortlist two franchise or dealership offers', 'Apply with store photos and footfall', 'Agree margin and stock terms', 'Sign and receive first stock'] },
  { code: 'solar_installer', title: 'Become a solar installation partner', summary: 'Use a trained crew to install rooftop solar for Unite Solar and EPC companies.', core: ['team', 'skills'], helps: ['vehicles', 'machinery'], minInvest: 'lt5l', time: ['full_time'],
    offerCategories: ['solar_epc', 'electrical'], ventures: ['sunite', 'power-partner', 'sunx'], servesNeeds: ['contractors', 'project_work'], earns: 'Per-kW installation fees on certified milestones', firstSteps: ['Apply to an EPC or solar offer', 'Share crew certificates', 'Complete a supervised first installation', 'Invoice on certification'] },
  { code: 'bpo_seats', title: 'Run outsourced work from your office', summary: 'Fill idle seats with calling, back-office or support contracts.', core: ['office', 'team'], helps: ['skills'], minInvest: 'none', time: ['part_time', 'full_time'],
    offerCategories: ['bpo_contract', 'marketing_work', 'idle_capacity'], ventures: ['leaddna', 'xpert'], servesNeeds: ['outsourcing_contracts', 'service_provider'], earns: 'Per-seat or per-outcome contract fees', firstSteps: ['Publish your seats on the capacity calendar', 'Apply to BPO and marketing offers', 'Run a paid pilot batch', 'Sign a monthly contract'] },
  { code: 'contract_manufacturing', title: 'Take contract manufacturing orders', summary: 'Use spare factory and machine hours for OEM and private-label work.', core: ['factory', 'machinery'], helps: ['team'], minInvest: 'none', time: ['full_time'],
    offerCategories: ['manufacturing', 'oem_private_label', 'idle_capacity'], ventures: ['unite-powertek'], servesNeeds: ['suppliers', 'outsourcing_contracts'], earns: 'Job-work and per-unit manufacturing fees', firstSteps: ['Publish production-line capacity', 'Answer OEM offers with samples', 'Agree a trial order', 'Deliver and invoice'] },
  { code: 'warehouse_3pl', title: 'Offer warehousing and last-mile delivery', summary: 'Rent space and vehicles to distributors and online sellers.', core: ['warehouse', 'vehicles'], helps: ['team'], minInvest: 'none', time: ['passive', 'part_time'],
    offerCategories: ['warehouse_logistics', 'distribution', 'idle_capacity'], ventures: ['ev-saathi', 'elwin'], servesNeeds: ['distributors', 'service_provider'], earns: 'Rent per sq ft or pallet, and per-trip fees', firstSteps: ['Publish space and vehicles with dates', 'Accept a first booking', 'Agree a monthly rate', 'Invoice monthly'] },
  { code: 'distribution', title: 'Become a regional distributor', summary: 'Distribute power, solar and consumer products in your region.', core: ['customers', 'warehouse'], helps: ['vehicles', 'capital', 'store'], minInvest: '5_25l', time: ['full_time'],
    offerCategories: ['distribution', 'dealership', 'wholesale'], ventures: ['unite-powertek', 'solcart'], servesNeeds: ['distributors', 'market_access'], earns: 'Distribution margin on sell-through', firstSteps: ['Apply to a distribution offer', 'Share your retailer list (no contact details)', 'Agree territory and margin', 'Place the opening order'] },
  { code: 'solar_park_share', title: 'Co-own a solar park share', summary: 'Put capital or land into a solar park with other partners.', core: ['capital', 'land'], helps: [], minInvest: '5_25l', time: ['passive'],
    offerCategories: ['joint_venture', 'land_property'], ventures: ['green-wallet', 'power-partner', 'solar-village-mission'], servesNeeds: ['joint_venture', 'financing'], earns: 'Share of energy revenue after costs (not guaranteed)', firstSteps: ['Read the project documents', 'Register interest in Invest together', 'Legal and tax review', 'Sign the participation agreement'] },
  { code: 'land_jv', title: 'Joint-develop your land', summary: 'Partner with a developer or energy company on land you own.', core: ['land'], helps: ['capital'], minInvest: 'none', time: ['passive'],
    offerCategories: ['land_property', 'joint_venture'], ventures: ['real-bricks', 'prodeal', 'roofz'], servesNeeds: ['joint_venture', 'business_partner'], earns: 'Lease rent or a share of the development', firstSteps: ['Upload land documents to your vault', 'Answer a land-partnership offer', 'Title check', 'Sign the development agreement'] },
  { code: 'sales_agent', title: 'Sell products and services on commission', summary: 'Use your contacts to sell Powertek, solar and partner services.', core: ['customers', 'skills'], helps: [], minInvest: 'none', time: ['passive', 'part_time', 'full_time'],
    offerCategories: ['marketing_work', 'dealership'], ventures: ['sunx', 'digital-seed', 'leaddna'], servesNeeds: ['customers'], earns: 'Commission when the customer pays', firstSteps: ['Register protected leads', 'Share product brochures', 'Close a first sale', 'Commission after payment'] },
  { code: 'consulting', title: 'Offer professional services', summary: 'Sell your expertise as fixed-price micro-contracts and projects.', core: ['skills'], helps: ['office', 'team'], minInvest: 'none', time: ['part_time', 'full_time'],
    offerCategories: ['consulting', 'marketing_work'], ventures: ['xpert', 'unite-learning'], servesNeeds: ['service_provider', 'project_work'], earns: 'Fixed fees per job, building your Proof passport', firstSteps: ['Apply to open micro-contracts', 'Deliver and get accepted', 'Collect payment directly', 'Turn repeat work into a contract'] },
  { code: 'tender_team', title: 'Bid for tenders with a team', summary: 'Combine your crew, machines and credentials with partners to bid.', core: ['team', 'machinery', 'contracts'], helps: ['capital', 'skills'], minInvest: 'lt5l', time: ['full_time'],
    offerCategories: ['tender', 'construction', 'electrical'], ventures: ['unitif'], servesNeeds: ['contractors', 'project_work'], earns: 'Your share of milestone payments', firstSteps: ['Shortlist open tenders', 'Form a team on COLLABIZ', 'Submit a sealed bid', 'Deliver milestones'] },
  { code: 'trade_desk', title: 'Trade products wholesale', summary: 'Buy and sell stock using RFQs, pools and barter.', core: ['products', 'capital'], helps: ['warehouse', 'customers'], minInvest: '5_25l', time: ['full_time'],
    offerCategories: ['wholesale', 'import_export'], ventures: ['99offers', 'prizo'], servesNeeds: ['suppliers', 'customers'], earns: 'Trading margin', firstSteps: ['Join or start a demand pool', 'Ask for quotes', 'Agree terms per order', 'Deliver and invoice'] },
  { code: 'opportunity_partner', title: 'Bring an opportunity and find partners', summary: 'Turn a project or contract you hold into a collaboration.', core: ['opportunity', 'contracts'], helps: ['customers'], minInvest: 'none', time: ['part_time', 'full_time'],
    offerCategories: ['strategic_partnership', 'joint_venture'], ventures: ['xpert'], servesNeeds: ['business_partner', 'project_work'], earns: 'A share of the work or an agreed referral fee', firstSteps: ['Post a business offer', 'Protect the customer as a lead', 'Pick partners from applications', 'Sign the collaboration agreement'] },
  { code: 'ev_fleet', title: 'Run an EV fleet or charging point', summary: 'Use vehicles or a roadside site for EV mobility services.', core: ['vehicles', 'land'], helps: ['capital'], minInvest: '5_25l', time: ['part_time', 'full_time'],
    offerCategories: ['idle_capacity', 'franchise'], ventures: ['ev-saathi', 'elwin'], servesNeeds: ['service_provider'], earns: 'Trip fees or charging revenue', firstSteps: ['Check site and power availability', 'Apply to an EV programme', 'Agree revenue share', 'Start operations'] },
];
export const LaunchProfileSchema = z.object({
  have: z.array(z.string()).min(1, 'Choose at least one thing you have').max(16),
  useCollab: z.boolean().default(false),
  state: StateCode.nullable().optional(), city: z.string().trim().max(80).optional(),
  invest: z.enum(INVEST_BANDS.map((b) => b.code) as unknown as [InvestBand, ...InvestBand[]]),
  time: z.enum(['passive', 'part_time', 'full_time']),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  languages: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
export type LaunchProfile = z.infer<typeof LaunchProfileSchema>;

const bandIndex = (b: InvestBand) => INVEST_BANDS.findIndex((x) => x.code === b);
/** Rank business models for what someone has, can invest and how much time they give. Models with no core resource are excluded. */
export function matchBusinessModels(p: Pick<LaunchProfile, 'have' | 'invest' | 'time'>) {
  const have = new Set(p.have);
  return BUSINESS_MODELS.map((m) => {
    const core = m.core.filter((k) => have.has(k)); const helps = m.helps.filter((k) => have.has(k));
    if (!core.length) return null;
    const affordable = bandIndex(p.invest) >= bandIndex(m.minInvest);
    const timeFits = m.time.includes(p.time);
    const score = Math.round(Math.min(100, 40 + (core.length / m.core.length) * 35 + (m.helps.length ? (helps.length / m.helps.length) * 10 : 10) + (affordable ? 10 : -20) + (timeFits ? 5 : -10)));
    const gaps = [...(affordable ? [] : [`Usually needs ${INVEST_BANDS.find((b) => b.code === m.minInvest)!.label.toLowerCase()} or more`]), ...(timeFits ? [] : [`Usually ${m.time.map((t) => TIME_COMMITMENTS.find((x) => x.code === t)!.label.toLowerCase()).join(' or ')}`])];
    return { model: m, score: Math.max(0, score), uses: [...core, ...helps], gaps };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.score - a.score || a.model.title.localeCompare(b.model.title));
}
export const LAUNCH_STAGES = ['Exploring options', 'Applied', 'In discussion', 'Agreement signed', 'Executing', 'First payment received'] as const;

// ============================================================================ Capacity calendar
export const CAPACITY_TYPES = [
  { code: 'workers', label: 'Workers' }, { code: 'seats', label: 'Seats' }, { code: 'vehicles', label: 'Vehicles' }, { code: 'machines', label: 'Machines' },
  { code: 'lines', label: 'Production lines' }, { code: 'sqft', label: 'Sq ft' }, { code: 'pallets', label: 'Pallet positions' }, { code: 'shifts', label: 'Shifts' },
] as const;
export type CapacityType = (typeof CAPACITY_TYPES)[number]['code'];
export const capacityTypeLabel = (c: string) => CAPACITY_TYPES.find((x) => x.code === c)?.label ?? c;
export const RATE_UNITS = [{ code: 'day', label: 'per unit per day' }, { code: 'week', label: 'per unit per week' }, { code: 'month', label: 'per unit per month' }, { code: 'job', label: 'per job' }, { code: 'negotiable', label: 'Negotiable' }] as const;
export const CapacityOfferSchema = z.object({
  type: z.enum(CAPACITY_TYPES.map((c) => c.code) as unknown as [CapacityType, ...CapacityType[]]),
  title: z.string().trim().min(5, 'Describe what is available').max(120),
  units: z.number().int().min(1).max(1_000_000),
  from: isoDate, to: isoDate,
  rateUnit: z.enum(['day', 'week', 'month', 'job', 'negotiable']),
  rate: z.number().min(0).max(1e9).nullable().optional(),
  state: StateCode, city: z.string().trim().max(80).optional(), notes: z.string().trim().max(1000).optional(),
}).refine((x) => x.to >= x.from, { message: 'The end date must be on or after the start date', path: ['to'] })
  .refine((x) => x.rateUnit === 'negotiable' || (x.rate ?? 0) > 0, { message: 'Enter the rate, or choose Negotiable', path: ['rate'] });
export const CapacityBookingSchema = z.object({ units: z.number().int().min(1), from: isoDate, to: isoDate, note: z.string().trim().max(500).optional() })
  .refine((x) => x.to >= x.from, { message: 'The end date must be on or after the start date', path: ['to'] });

const dayMs = 86_400_000;
export const eachDay = (from: string, to: string) => { const out: string[] = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += dayMs) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
/** Fewest units still free on any day of [from, to], given accepted bookings. Days outside the offer count as 0 free. */
export function capacityFree(offer: { units: number; from: string; to: string }, bookings: { units: number; from: string; to: string }[], from: string, to: string) {
  let min = Infinity;
  for (const d of eachDay(from, to)) {
    const used = d < offer.from || d > offer.to ? offer.units : bookings.filter((b) => b.from <= d && b.to >= d).reduce((a, b) => a + b.units, 0);
    min = Math.min(min, offer.units - used);
  }
  return min === Infinity ? 0 : Math.max(0, min);
}

// ============================================================================ Micro-contracts
export const MICRO_KINDS = [
  { code: 'calling', label: 'Calling' }, { code: 'site_survey', label: 'Site survey' }, { code: 'quotation', label: 'Quotation / estimate' }, { code: 'demo', label: 'Product demo' },
  { code: 'design', label: 'Design' }, { code: 'data', label: 'Data work' }, { code: 'field_visit', label: 'Field visit' }, { code: 'content', label: 'Content' }, { code: 'other', label: 'Other' },
] as const;
export const microKindLabel = (c: string) => MICRO_KINDS.find((x) => x.code === c)?.label ?? c;
export const MICRO_MIN_RS = 100; export const MICRO_MAX_RS = 50_000;
/** Unite products whose pages post work as micro-contracts. */
export const MICRO_SOURCES = ['xpert', 'partimer', 'zuppo', 'wakin', 'vidplay', '99films', 'moveon-video'] as const;
export const MicroContractSchema = z.object({
  source: z.enum(MICRO_SOURCES).nullable().optional(),
  kind: z.enum(MICRO_KINDS.map((k) => k.code) as unknown as [string, ...string[]]),
  state: StateCode.nullable().optional(),
  title: z.string().trim().min(8, 'Give a short, specific title').max(120),
  scope: z.string().trim().min(20, 'Say exactly what needs doing (at least 20 characters)').max(2000),
  acceptance: z.string().trim().min(10, 'Say how you will accept the work').max(1000),
  quantity: z.number().int().min(1).max(100_000), unit: z.string().trim().min(1).max(30),
  priceRs: z.number().int().min(MICRO_MIN_RS, `At least ₹${MICRO_MIN_RS}`).max(MICRO_MAX_RS, `At most ₹${MICRO_MAX_RS.toLocaleString('en-IN')}`),
  due: isoDate,
});
/** open → assigned → submitted → accepted → paid; revision sends submitted back to assigned. */
export const MICRO_FLOW: Record<string, string[]> = { open: ['assigned', 'cancelled'], assigned: ['submitted', 'cancelled'], submitted: ['accepted', 'assigned'], accepted: ['paid'], paid: [], cancelled: [] };

// ============================================================================ Demand pools
export const POOL_UNITS = ['units', 'metres', 'kg', 'tonnes', 'litres', 'sets', 'boxes', 'kW'] as const;
export const DemandPoolSchema = z.object({
  title: z.string().trim().min(5).max(120), spec: z.string().trim().min(20, 'Give enough detail for a supplier to quote (at least 20 characters)').max(2000),
  unit: z.enum(POOL_UNITS), state: StateCode,
  targetQty: z.number().positive(), myQty: z.number().positive(),
  joinBy: isoDate, neededBy: isoDate.optional(),
}).refine((x) => x.myQty <= x.targetQty, { message: 'Your quantity cannot exceed the pool target', path: ['myQty'] });
export const PoolQuoteSchema = z.object({ unitPriceRs: z.number().positive().max(1e8), minQty: z.number().positive(), validUntil: isoDate, terms: z.string().trim().min(10).max(1000) });
/** A quote applies only if the pool's committed total meets its minimum quantity. */
export const poolQuoteApplies = (committed: number, minQty: number) => committed >= minQty;

// ============================================================================ Commit
export const CONDITION_KINDS = [
  { code: 'buyer_order', label: 'Buyer order' }, { code: 'capacity', label: 'Capacity available' }, { code: 'permit', label: 'Permit or approval' },
  { code: 'financing', label: 'Financing sanctioned' }, { code: 'other', label: 'Other condition' },
] as const;
export const conditionKindLabel = (c: string) => CONDITION_KINDS.find((x) => x.code === c)?.label ?? c;
export const CommitmentSchema = z.object({
  title: z.string().trim().min(8).max(140), purpose: z.string().trim().min(20, 'Describe the deal (at least 20 characters)').max(3000),
  deadline: isoDate,
  parties: z.array(z.object({ orgId: z.string().uuid(), role: z.string().trim().min(2).max(80), pledge: z.string().trim().min(5).max(500) })).min(1, 'Add at least one other business').max(12),
  myRole: z.string().trim().min(2).max(80), myPledge: z.string().trim().min(5).max(500),
  conditions: z.array(z.object({ kind: z.enum(CONDITION_KINDS.map((k) => k.code) as unknown as [string, ...string[]]), text: z.string().trim().min(5).max(300), ownerOrgId: z.string().uuid() })).min(1, 'Add at least one condition').max(20),
});
export type CommitmentState = 'draft' | 'pledging' | 'binding' | 'lapsed' | 'withdrawn';
/** Binding only when every party has pledged and every condition is verified on or before the deadline; otherwise lapses after it. */
export function commitmentState(c: { withdrawn?: boolean; deadline: string; parties: { pledgedAt: string | null; declined?: boolean }[]; conditions: { verifiedAt: string | null }[] }, today: string): CommitmentState {
  if (c.withdrawn || c.parties.some((p) => p.declined)) return 'withdrawn';
  const pledged = c.parties.every((p) => p.pledgedAt && p.pledgedAt.slice(0, 10) <= c.deadline);
  const verified = c.conditions.every((x) => x.verifiedAt && x.verifiedAt.slice(0, 10) <= c.deadline);
  if (pledged && verified) return 'binding';
  if (today > c.deadline) return 'lapsed';
  return c.parties.some((p) => p.pledgedAt) ? 'pledging' : 'draft';
}

// ============================================================================ Home intent box
/** Route a free-text "What do you want to do?" to the right tool. Rules are keyword-based and shown to the user as a suggestion. */
export const INTENT_RULES: { href: string; label: string; words: RegExp }[] = [
  { href: '/pools', label: 'Demand pools — buy together in bulk', words: /\b(bulk|together|pool|group buy|combine)\b/i },
  { href: '/capacity', label: 'Capacity — book spare people, seats, vehicles or machines', words: /\b(spare|crew|crews|book|rent|hire|seats? for|machines?|vehicles?|trucks?|capacity)\b/i },
  { href: '/launch', label: 'Launch — start a business with what you have', words: /\b(start|launch|new business|side business|earn from|use my)\b/i },
  { href: '/business-offers/new', label: 'Post a business offer', words: /\b(post|publish|franchise offer|sell my business|offer)\b/i },
  { href: '/micro', label: 'Micro-contracts — small fixed-price jobs', words: /\b(calls?|survey|quotation|design|small job|gig|micro)\b/i },
  { href: '/energy', label: 'Unite Green Park — energy marketplace', words: /\b(mw|solar park|open access|ppa|power purchase|wind|renewable)\b/i },
  { href: '/collab', label: 'Collab — tell us what you have and need', words: /\b(i have|we have|office|warehouse|factory|land|team|showroom|store)\b/i },
];
export function routeIntent(text: string) {
  const t = text.trim();
  if (t.length < 3) return null;
  const hit = INTENT_RULES.find((r) => r.words.test(t));
  return hit ? { href: hit.href, label: hit.label } : { href: `/search?q=${encodeURIComponent(t)}`, label: 'Search COLLABIZ' };
}
