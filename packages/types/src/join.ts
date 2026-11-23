/**
 * UNITE INDUSTRY CLUB (module code: join / club) — any industry joins Unite Group's club.
 *
 * Any business, in any industry, picks what it wants from the network. The member's board then shows one card per
 * choice, with live counts from the COLLABIZ modules behind it, plus Unite businesses and offers matched to its industry.
 * Matching here is rules-based (industry + chosen collaborations) and every match says why it was shown.
 */
import { z } from 'zod';
import { SECTOR_CODES, sectorName, type SectorCode } from './taxonomy';

/** What a business can do with Unite Group. Each choice maps to existing modules and Unite businesses. */
export const JOIN_INTENTS = [
  { code: 'free_power', label: 'Free or lower-cost power for my premises', blurb: 'Rooftop solar, PPA (pay only for units) or a partner-funded system for your factory, shop, school or office.',
    icon: 'value', links: [['/solar', 'Get a solar quote'], ['/energy', 'Energy desk']], ventures: ['sunite', 'roofz', 'solar-village-mission'], sectors: ['solar'] },
  { code: 'buy_power', label: 'Buy green power for my factory or business', blurb: 'Open access, group captive or PPA power from solar, wind and hybrid plants — usually cheaper than the grid tariff.',
    icon: 'value', links: [['/club/power', 'Request power'], ['/energy', 'Green Park energy market']], ventures: [], sectors: ['solar', 'manufacturing', 'infrastructure'] },
  { code: 'solar_products', label: 'Sell my products under the Unite Powertek brand, with free power', blurb: 'OEM: we brand, list and sell your product through the Unite network; customers can get free solar power with it.',
    icon: 'package', links: [['/club/products', 'Submit a product'], ['/powertek', 'Powertek catalogue']], ventures: ['solcart', 'sungate', 'unite-powertek'], sectors: ['solar', 'power_equipment', 'manufacturing'] },
  { code: 'epc_partner', label: 'Become an EPC or installation partner', blurb: 'Solar EPC work, sealed-bid projects through SOLBID, tenders and installation teams.',
    icon: 'briefcase', links: [['/energy', 'Energy desk'], ['/tenders', 'Open tenders'], ['/unite-solar/apply', 'Unite Solar partner']], ventures: ['sunx', 'sunite'], sectors: ['solar', 'construction_epc', 'infrastructure'] },
  { code: 'barter', label: 'Barter club — exchange goods, services or capacity', blurb: 'Trade what you have for what you need through COLLABIZ XCHANGE, with or without part cash.',
    icon: 'teams', links: [['/xchange', 'XCHANGE barter club']], ventures: [], sectors: [] },
  { code: 'trading', label: 'Trading — buy and sell with verified businesses', blurb: 'Post requirements, receive quotations and run orders with verified suppliers.',
    icon: 'package', links: [['/trading', 'Trading desk'], ['/pools', 'Buy together in bulk']], ventures: [], sectors: ['trading', 'manufacturing', 'local_commerce', 'agri_food'] },
  { code: 'export_import', label: 'Exports and imports', blurb: 'Cross-border enquiries, country partners and import-export desks in India, USA, UK, UAE, Africa and Singapore.',
    icon: 'map', links: [['/global/import-export', 'Import & export'], ['/global/desks', 'Country desks']], ventures: [], sectors: ['trading', 'logistics', 'agri_food'] },
  { code: 'promote', label: 'Promote Unite businesses and earn', blurb: 'Refer customers to any of the Unite Group businesses with your own partner link.',
    icon: 'building', links: [['/ventures', 'Unite businesses']], ventures: [], sectors: [] },
  { code: 'property', label: 'Property and real estate', blurb: 'Sell or invest in Unite property projects, or list your own space.',
    icon: 'building', links: [['/property', 'Property sales']], ventures: ['prodeal', 'real-bricks', 'unitif'], sectors: ['real_estate'] },
  { code: 'jobs_teams', label: 'Find work, teams and contracts', blurb: 'Micro-contracts, project teams and spare capacity — people, vehicles or machines.',
    icon: 'check', links: [['/micro', 'Micro-contracts'], ['/teams', 'Teams'], ['/capacity', 'Capacity']], ventures: ['xpert', 'partimer'], sectors: ['employment', 'consulting', 'technology'] },
  { code: 'learning', label: 'Learn and certify', blurb: 'Courses and certificates for your team, from solar installation to sales.',
    icon: 'award', links: [['/learning', 'Learning']], ventures: ['unite-learning', 'startsmart'], sectors: ['education'] },
  { code: 'launch', label: 'Start a new business with what I have', blurb: 'Turn a space, team, vehicle or skill into a new line of business with a Unite programme.',
    icon: 'plus', links: [['/launch', 'Launch'], ['/collab', 'Tell us what you have']], ventures: [], sectors: [] },
] as const satisfies readonly { code: string; label: string; blurb: string; icon: string; links: readonly (readonly [string, string])[]; ventures: readonly string[]; sectors: readonly string[] }[];

export type JoinIntent = (typeof JOIN_INTENTS)[number]['code'];
export const JOIN_INTENT_CODES = JOIN_INTENTS.map((i) => i.code) as unknown as [JoinIntent, ...JoinIntent[]];
export const joinIntent = (c: string) => JOIN_INTENTS.find((i) => i.code === c);

/** Suggested choices for an industry — a starting point the member can change, never applied without them. */
export function suggestIntents(sector: string): JoinIntent[] {
  const s: JoinIntent[] = ['free_power', 'solar_products'];
  for (const i of JOIN_INTENTS) if (i.code !== 'free_power' && i.code !== 'solar_products' && (i.sectors as readonly string[]).includes(sector)) s.push(i.code);
  if (s.length < 3) s.push('promote');
  return [...new Set(s)].slice(0, 4);
}

export const JoinProfileSchema = z.object({
  sector: z.enum(SECTOR_CODES),
  intents: z.array(z.enum(JOIN_INTENT_CODES)).min(1, 'Choose at least one way to collaborate').max(JOIN_INTENT_CODES.length).transform((a) => [...new Set(a)]),
  about: z.string().trim().max(500).optional(),
  city: z.string().trim().max(80).optional(),
  /** The member's own public page (microsite) on COLLABIZ — off unless the member switches it on. */
  micrositePublic: z.boolean().default(false),
});
export type JoinProfile = z.infer<typeof JoinProfileSchema>;

export interface MatchReason { label: string }
/** Why a Unite business is shown on a member's board. Returns null when it is not relevant. */
export function ventureReasons(v: { slug: string; sector: string }, profile: { sector: string; intents: string[] }): MatchReason[] | null {
  const r: MatchReason[] = [];
  for (const c of profile.intents) {
    const i = joinIntent(c);
    if (i && (i.ventures as readonly string[]).includes(v.slug)) r.push({ label: `You chose: ${i.label}` });
  }
  if (v.sector === profile.sector) r.push({ label: `Same industry: ${sectorName(v.sector as SectorCode)}` });
  return r.length ? r : null;
}

// ---------------------------------------------------------------- Unite Industry Club
export const CLUB_NAME = 'Unite Industry Club';

/** What membership gives a business. Every item points at a working module; none promises income or a fixed saving. */
export const CLUB_BENEFITS = [
  { code: 'oem', title: 'Sell under the Unite Powertek brand', text: 'Submit your product. Once Unite approves quality and signs the brand licence, it is listed in the Unite Powertek catalogue as “Unite Powertek” or “Powered by Unite”.', href: '/club/products' },
  { code: 'power_free', title: 'Products with free power', text: 'Bundle a solar system with your product so customers get free power — a cold room, pump, EV charger or shop with its own rooftop solar.', href: '/club/products' },
  { code: 'network_sales', title: 'Sell through the whole network', text: 'Approved products can be sold by every COLLABIZ partner, franchise and store, with commissions tracked from enquiry to payment.', href: '/powertek' },
  { code: 'buy_power', title: 'Buy green power', text: 'Request open access, group captive or PPA power for your factory, or post your requirement on the Green Park energy market.', href: '/club/power' },
  { code: 'rooftop', title: 'Free or lower-cost power at your premises', text: 'Rooftop solar on PPA (pay only for units) or a partner-funded system, quoted by the Unite Solar desk.', href: '/solar' },
  { code: 'microsite', title: 'Your own business page', text: 'A public page for your business and your approved products, which you switch on or off.', href: '/board' },
  { code: 'matching', title: 'Your board, matched for you', text: 'Live opportunities for your industry — tenders, trading, barter, exports and imports — with the reason for each match.', href: '/board' },
  { code: 'barter_trade', title: 'Barter, trading, exports and imports', text: 'Exchange capacity in the barter club, trade with verified businesses and reach buyers in other countries.', href: '/xchange' },
] as const;

export const CLUB_BRAND_OPTIONS = [
  { code: 'unite_powertek', label: 'Sold as “Unite Powertek”', text: 'Your product carries the Unite Powertek brand (OEM / private label).' },
  { code: 'powered_by_unite', label: 'Your brand, “Powered by Unite”', text: 'Your brand stays; the product carries the Powered by Unite badge.' },
] as const;
export type ClubBrandOption = (typeof CLUB_BRAND_OPTIONS)[number]['code'];
export const CLUB_PRODUCT_STATUS = { draft: 'Draft', submitted: 'Waiting for Unite review', approved: 'Approved — listed in the Powertek catalogue', rejected: 'Not approved', withdrawn: 'Withdrawn' } as const;
export type ClubProductStatus = keyof typeof CLUB_PRODUCT_STATUS;
/** Checks a Unite reviewer must confirm before a product can carry the brand. */
export const CLUB_REVIEW_CHECKS = [
  { code: 'quality_checked', label: 'Product quality checked (sample or factory visit)' },
  { code: 'certifications_verified', label: 'Certifications verified (BIS, ISI, CE or as applicable)' },
  { code: 'factory_verified', label: 'Manufacturer’s business verification (KYB) complete' },
  { code: 'brand_licence_signed', label: 'Brand licence / OEM agreement signed' },
] as const;
export const CLUB_REVIEW_CHECK_CODES = CLUB_REVIEW_CHECKS.map((c) => c.code) as unknown as [string, ...string[]];

const money = z.number().int().positive().max(10_000_000_000_00); // paise
export const ClubProductSchema = z.object({
  name: z.string().trim().min(3).max(120),
  category: z.string().trim().min(2).max(80),
  sector: z.enum(SECTOR_CODES),
  description: z.string().trim().min(20).max(3000),
  brandOption: z.enum(['unite_powertek', 'powered_by_unite']),
  powerFree: z.boolean().default(false),
  powerOffer: z.string().trim().max(500).optional(),
  certifications: z.array(z.string().trim().min(2).max(60)).max(10).default([]),
  monthlyCapacity: z.number().int().positive().max(100_000_000).optional(),
  unit: z.string().trim().max(30).optional(),
  mrp: money.optional(),
}).refine((x) => !x.powerFree || (x.powerOffer?.length ?? 0) >= 10, { message: 'Describe the free-power offer (for example: 3 kW rooftop solar with every cold room)', path: ['powerOffer'] });
export type ClubProductInput = z.infer<typeof ClubProductSchema>;

export const ClubReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  checks: z.array(z.enum(CLUB_REVIEW_CHECK_CODES)).default([]),
  note: z.string().trim().max(2000).optional(),
}).refine((x) => x.decision !== 'approve' || CLUB_REVIEW_CHECK_CODES.every((c) => x.checks.includes(c)), { message: 'Approval needs every check, including the signed brand licence', path: ['checks'] })
  .refine((x) => x.decision === 'approve' || (x.note?.length ?? 0) >= 5, { message: 'Give the reason', path: ['note'] });

export const CLUB_POWER_NEEDS = [
  { code: 'open_access', label: 'Open access power from a solar, wind or hybrid plant' },
  { code: 'group_captive', label: 'Group captive (own a share of a plant)' },
  { code: 'rooftop_ppa', label: 'Rooftop solar on PPA (pay only for units)' },
  { code: 'green_tariff', label: 'Green tariff from my DISCOM' },
  { code: 'not_sure', label: 'Not sure — advise me' },
] as const;
export const CLUB_POWER_STATUS = { new: 'Received', in_progress: 'Energy desk working on it', proposal_sent: 'Proposal sent', closed: 'Closed' } as const;
export const ClubPowerRequestSchema = z.object({
  need: z.enum(['open_access', 'group_captive', 'rooftop_ppa', 'green_tariff', 'not_sure']),
  sanctionedLoadKw: z.number().positive().max(1_000_000).optional(),
  monthlyUnits: z.number().int().positive().max(1_000_000_000).optional(),
  monthlyBill: money.optional(),
  state: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(80),
  note: z.string().trim().max(1000).optional(),
}).refine((x) => !!(x.monthlyUnits || x.monthlyBill || x.sanctionedLoadKw), { message: 'Give your monthly units, bill or sanctioned load', path: ['monthlyUnits'] });
export const ClubPowerStatusSchema = z.object({ to: z.enum(['in_progress', 'proposal_sent', 'closed']), note: z.string().trim().max(1000).optional() });
