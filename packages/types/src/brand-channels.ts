/**
 * UNITE BRAND PRODUCTS & CHANNEL PARTNERS — Unite-branded products made by OEM partners and sold through distributors,
 * dealers, stores and franchises (tested in channels.test.ts and test/channels.e2e.ts).
 *
 * The matching agent here is rules-based: it explains every recommendation with the facts it used. It is labelled as
 * such; an AI model can re-rank results when the AI provider is switched on, but the reasons stay.
 */
import { z } from 'zod';
import { SECTOR_CODES } from './taxonomy';
import { RESERVED_SUBDOMAINS } from './product-domains';

export const CHANNEL_ROLES = [
  { code: 'distributor', label: 'Distributor', text: 'Stock in bulk and supply dealers and projects across a district or region.' },
  { code: 'dealer', label: 'Dealer', text: 'Sell to builders, contractors and homeowners in your town.' },
  { code: 'store', label: 'Store', text: 'Sell from your retail store or showroom.' },
  { code: 'franchise', label: 'Franchise', text: 'Open a Unite-branded store with Unite’s format and support.' },
  { code: 'manufacturer', label: 'Manufacturer (OEM)', text: 'Make products for the Unite brand to Unite’s specification.' },
] as const;
export type ChannelRole = (typeof CHANNEL_ROLES)[number]['code'];
export const CHANNEL_ROLE_CODES = CHANNEL_ROLES.map((r) => r.code) as unknown as [ChannelRole, ...ChannelRole[]];
export const channelRoleLabel = (c: string) => CHANNEL_ROLES.find((r) => r.code === c)?.label ?? c;

/** What the applicant does today — the matching agent's main input. */
export const BUSINESS_TYPES = [
  { code: 'building_materials_dealer', label: 'Building materials dealer' },
  { code: 'hardware_store', label: 'Hardware or sanitary store' },
  { code: 'cement_steel_trader', label: 'Cement or steel trader' },
  { code: 'timber_ply_dealer', label: 'Timber, ply or laminate dealer' },
  { code: 'furniture_store', label: 'Furniture store or showroom' },
  { code: 'furnishing_store', label: 'Home furnishing or carpet store' },
  { code: 'interior_designer', label: 'Interior designer or decorator' },
  { code: 'contractor', label: 'Civil contractor or builder' },
  { code: 'real_estate_developer', label: 'Real estate developer' },
  { code: 'hotel_institution_supplier', label: 'Supplier to hotels, offices or institutions' },
  { code: 'logistics_warehouse', label: 'Logistics or warehousing business' },
  { code: 'manufacturer', label: 'Manufacturer (factory)' },
  { code: 'new_business', label: 'Starting a new business' },
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number]['code'];
export const BUSINESS_TYPE_CODES = BUSINESS_TYPES.map((b) => b.code) as unknown as [BusinessType, ...BusinessType[]];
export const businessTypeLabel = (c: string) => BUSINESS_TYPES.find((b) => b.code === c)?.label ?? c;

export interface ChannelProduct {
  slug: string; name: string; bulk: boolean; showroom: boolean;
  roles: readonly ChannelRole[];
  /** Business types that already sell to this product's buyers (strong fit) and that can add it (good fit). */
  strong: readonly BusinessType[]; good: readonly BusinessType[];
  buyers: string;
}

/** Unite-branded products open to channel partners. Admins add more as new products launch. */
export const CHANNEL_PRODUCTS: readonly ChannelProduct[] = [
  { slug: 'unite-cement', name: 'Unite Cement', bulk: true, showroom: false, roles: ['distributor', 'dealer', 'store', 'franchise'],
    strong: ['building_materials_dealer', 'cement_steel_trader'], good: ['hardware_store', 'contractor', 'real_estate_developer', 'logistics_warehouse', 'new_business'], buyers: 'builders, contractors, developers and homeowners' },
  { slug: 'unite-steel', name: 'Unite Steel', bulk: true, showroom: false, roles: ['distributor', 'dealer', 'store', 'franchise'],
    strong: ['cement_steel_trader', 'building_materials_dealer'], good: ['hardware_store', 'contractor', 'real_estate_developer', 'logistics_warehouse', 'new_business'], buyers: 'builders, contractors, fabricators and developers' },
  { slug: 'unite-ply', name: 'Unite Ply', bulk: false, showroom: true, roles: ['distributor', 'dealer', 'store', 'franchise', 'manufacturer'],
    strong: ['timber_ply_dealer', 'hardware_store'], good: ['furniture_store', 'interior_designer', 'building_materials_dealer', 'manufacturer', 'new_business'], buyers: 'carpenters, interior designers, furniture makers and homeowners' },
  { slug: 'unite-carpets', name: 'Unite Carpets', bulk: false, showroom: true, roles: ['distributor', 'dealer', 'store', 'franchise', 'manufacturer'],
    strong: ['furnishing_store', 'interior_designer'], good: ['furniture_store', 'hotel_institution_supplier', 'manufacturer', 'new_business'], buyers: 'homes, hotels, offices and institutions' },
  { slug: 'unite-furniture', name: 'Unite Furniture', bulk: false, showroom: true, roles: ['distributor', 'dealer', 'store', 'franchise', 'manufacturer'],
    strong: ['furniture_store', 'manufacturer'], good: ['interior_designer', 'hotel_institution_supplier', 'real_estate_developer', 'furnishing_store', 'timber_ply_dealer', 'new_business'], buyers: 'homes, offices, hotels, schools and developers' },
];
export const channelProduct = (slug: string) => CHANNEL_PRODUCTS.find((p) => p.slug === slug);
export const CHANNEL_SLUGS = CHANNEL_PRODUCTS.map((p) => p.slug);

export interface MatchInput { businessType: BusinessType; role?: ChannelRole; warehouseSqft?: number; showroomSqft?: number; products?: readonly string[] }
export interface ChannelMatch { slug: string; name: string; role: ChannelRole; score: number; reasons: string[] }

/** Suggests a role from what the applicant has. */
export function suggestRole(i: MatchInput, p: ChannelProduct): ChannelRole {
  if (i.businessType === 'manufacturer' && p.roles.includes('manufacturer')) return 'manufacturer';
  if (i.role && p.roles.includes(i.role)) return i.role;
  if ((i.warehouseSqft ?? 0) >= 5000) return 'distributor';
  if (i.businessType === 'new_business') return 'franchise';
  if (p.showroom && (i.showroomSqft ?? 0) >= 300) return 'store';
  return 'dealer';
}

/** Ranks Unite brand products for an applicant, with the reasons for each. */
export function recommendChannels(i: MatchInput, products: readonly ChannelProduct[] = CHANNEL_PRODUCTS): ChannelMatch[] {
  const out: ChannelMatch[] = [];
  for (const p of products) {
    if (i.products?.length && !i.products.includes(p.slug)) continue;
    const reasons: string[] = []; let score = 0;
    if (p.strong.includes(i.businessType)) { score += 50; reasons.push(`${businessTypeLabel(i.businessType)}s already sell to ${p.name}’s buyers (${p.buyers})`); }
    else if (p.good.includes(i.businessType)) { score += 30; reasons.push(`Fits alongside what a ${businessTypeLabel(i.businessType).toLowerCase()} does today`); }
    else continue;
    const role = suggestRole(i, p);
    if (i.role && i.role !== role && !p.roles.includes(i.role)) reasons.push(`${p.name} does not take ${channelRoleLabel(i.role).toLowerCase()}s; ${channelRoleLabel(role).toLowerCase()} suits instead`);
    if (i.role && i.role === role) { score += 15; reasons.push(`You asked to be a ${channelRoleLabel(role).toLowerCase()}`); }
    if (p.bulk && (i.warehouseSqft ?? 0) >= 2000) { score += 15; reasons.push(`${p.name} moves in bulk and you have ${i.warehouseSqft!.toLocaleString('en-IN')} sq ft of storage`); }
    if (p.bulk && !(i.warehouseSqft) && role === 'distributor') reasons.push('Distributors of bulk products need storage — add your warehouse size');
    if (p.showroom && (i.showroomSqft ?? 0) >= 300) { score += 15; reasons.push(`${p.name} sells from display and you have a ${i.showroomSqft!.toLocaleString('en-IN')} sq ft showroom`); }
    if (role === 'manufacturer') reasons.push(`Unite is looking for manufacturers to make ${p.name} under the Unite brand`);
    out.push({ slug: p.slug, name: p.name, role, score: Math.min(score, 100), reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
export const ChannelApplicationSchema = z.object({
  /** Checked against the published brand products (and the roles each takes) on the server. */
  productSlug: z.string().trim().min(3, 'Choose a Unite product').max(80),
  role: z.enum(CHANNEL_ROLE_CODES),
  businessType: z.enum(BUSINESS_TYPE_CODES),
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number'),
  company: opt(160),
  state: z.string().trim().min(2, 'Choose your state').max(60),
  district: opt(80), city: z.string().trim().min(2, 'Enter your town or city').max(80),
  territory: opt(300), currentBrands: opt(300), experienceYears: z.number().int().min(0).max(80).optional(),
  warehouseSqft: z.number().int().min(0).max(10_000_000).optional(), showroomSqft: z.number().int().min(0).max(1_000_000).optional(),
  capacity: opt(300), message: opt(1500),
  consent: z.literal(true, { message: 'Consent is required so Unite can contact you' }),
  website: z.string().max(0).optional(),
}).refine((x) => x.role !== 'manufacturer' || (x.capacity?.length ?? 0) >= 5, { message: 'Describe your production capacity', path: ['capacity'] });
export type ChannelApplicationInput = z.infer<typeof ChannelApplicationSchema>;

export const MatchSchema = z.object({
  businessType: z.enum(BUSINESS_TYPE_CODES), role: z.enum(CHANNEL_ROLE_CODES).optional(),
  warehouseSqft: z.number().int().min(0).max(10_000_000).optional(), showroomSqft: z.number().int().min(0).max(1_000_000).optional(),
});

export const CHANNEL_STATUS = { submitted: 'Received', shortlisted: 'Shortlisted — Unite will call you', approved: 'Approved', declined: 'Not taken forward' } as const;
export const ChannelDecisionSchema = z.object({
  decision: z.enum(['shortlist', 'approve', 'decline']), territory: z.string().trim().max(300).optional(), note: z.string().trim().max(1000).optional(),
}).refine((x) => x.decision !== 'decline' || (x.note?.length ?? 0) >= 5, { message: 'Give the reason', path: ['note'] })
  .refine((x) => x.decision !== 'approve' || (x.territory?.length ?? 0) >= 2, { message: 'Set the territory', path: ['territory'] });

export const ChannelLeadSchema = z.object({
  productSlug: z.string().trim().min(3).max(80),
  customer: z.string().trim().min(2).max(200), contactName: opt(120), phone: opt(20), city: opt(80),
  title: z.string().trim().min(3).max(200), value: z.number().int().positive().max(1_000_000_000_00).optional(),
});

/** OEM manufacturing status, shown publicly only when a super admin marks it public. */
export const OEM_STATUS = { planned: 'Being finalised', agreement_signed: 'Agreement signed', producing: 'In production' } as const;

// ---------------------------------------------------------------- admin: add a brand product
const slugRe = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const Feature = z.object({ title: z.string().trim().min(3).max(80), text: z.string().trim().min(5).max(300), planned: z.boolean().default(false) });
export const BrandProductSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().toLowerCase().regex(slugRe, 'Lower-case letters, numbers and hyphens'),
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/, 'Lower-case letters, numbers and hyphens')
    .refine((s) => !(RESERVED_SUBDOMAINS as readonly string[]).includes(s), 'This web address is reserved'),
  category: z.string().trim().min(3).max(80),
  sector: z.enum(SECTOR_CODES),
  tagline: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(30).max(1200),
  buyers: z.string().trim().min(5).max(200),
  roles: z.array(z.enum(CHANNEL_ROLE_CODES)).min(1).max(5),
  strong: z.array(z.enum(BUSINESS_TYPE_CODES)).min(1, 'Choose at least one business type that already sells to these buyers').max(13),
  good: z.array(z.enum(BUSINESS_TYPE_CODES)).max(13).default([]),
  bulk: z.boolean().default(false),
  showroom: z.boolean().default(false),
  features: z.array(Feature).max(12).default([]),
  workflow: z.array(z.object({ title: z.string().trim().min(3).max(60), text: z.string().trim().min(5).max(200) })).max(6).default([]),
  /** Product range on the microsite: a category with a photo and a few named products (from the brand's own catalogue). */
  range: z.array(z.object({ title: z.string().trim().min(2).max(60), text: z.string().trim().min(5).max(300), image: z.string().trim().regex(/^(\/[\w./-]+|https:\/\/\S+)$/).max(300).optional().or(z.literal('').transform(() => undefined)),
    items: z.array(z.string().trim().min(2).max(120)).max(12).default([]) })).max(12).default([]),
  /** Benefits by audience (e.g. for customers, for retailers), each a short list. */
  benefits: z.array(z.object({ title: z.string().trim().min(3).max(60), items: z.array(z.string().trim().min(3).max(160)).min(1).max(8) })).max(6).default([]),
  accent: z.tuple([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.string().regex(/^#[0-9A-Fa-f]{6}$/)]).default(['#011E48', '#2E7D32']),
  oemPartner: z.string().trim().max(160).optional(),
  oemStatus: z.enum(['planned', 'agreement_signed', 'producing']).default('planned'),
  /** Logo and product photo: a path on the site (/brands/…, /photos/…) or an https address. */
  logo: z.string().trim().regex(/^(\/[\w./-]+|https:\/\/\S+)$/, 'Use a site path like /brands/logo.png or an https address').max(300).optional().or(z.literal('').transform(() => undefined)),
  heroImage: z.string().trim().regex(/^(\/[\w./-]+|https:\/\/\S+)$/, 'Use a site path like /photos/product.webp or an https address').max(300).optional().or(z.literal('').transform(() => undefined)),
});
export type BrandProductInput = z.infer<typeof BrandProductSchema>;
export const BrandProductUpdateSchema = BrandProductSchema.omit({ slug: true });
