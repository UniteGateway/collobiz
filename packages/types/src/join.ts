/**
 * JOIN — "Join as any industry or collaborate with Unite Group".
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
  { code: 'solar_products', label: 'Sell my products with solar integration', blurb: 'Bundle your product with Unite Solar or Powertek — pumps, cold storage, EV charging, lighting, appliances.',
    icon: 'package', links: [['/powertek', 'Powertek products'], ['/business-offers/new', 'Publish a joint offer']], ventures: ['solcart', 'sungate', 'unite-powertek'], sectors: ['solar', 'power_equipment', 'manufacturing'] },
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
  const s: JoinIntent[] = ['free_power'];
  for (const i of JOIN_INTENTS) if (i.code !== 'free_power' && (i.sectors as readonly string[]).includes(sector)) s.push(i.code);
  if (s.length < 3) s.push('promote');
  return [...new Set(s)].slice(0, 4);
}

export const JoinProfileSchema = z.object({
  sector: z.enum(SECTOR_CODES),
  intents: z.array(z.enum(JOIN_INTENT_CODES)).min(1, 'Choose at least one way to collaborate').max(JOIN_INTENT_CODES.length).transform((a) => [...new Set(a)]),
  about: z.string().trim().max(500).optional(),
  city: z.string().trim().max(80).optional(),
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
