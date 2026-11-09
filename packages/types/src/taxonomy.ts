/** Sector & geography taxonomy — Master Book §1.5 priority sectors. */
export const SECTORS = [
  { code: 'solar', name: 'Solar & Renewable Energy', priority: true },
  { code: 'power_equipment', name: 'Power Equipment', priority: true },
  { code: 'construction_epc', name: 'Construction & EPC', priority: true },
  { code: 'infrastructure', name: 'Infrastructure', priority: true },
  { code: 'trading', name: 'Trading / Import-Export', priority: true },
  { code: 'manufacturing', name: 'Manufacturing', priority: true },
  { code: 'consulting', name: 'Consulting', priority: true },
  { code: 'real_estate', name: 'Real Estate', priority: true },
  { code: 'technology', name: 'Technology', priority: false },
  { code: 'logistics', name: 'Logistics', priority: false },
  { code: 'ev', name: 'Electric Vehicles', priority: false },
  { code: 'agri_food', name: 'Agriculture & Food Distribution', priority: false },
] as const;
export type SectorCode = (typeof SECTORS)[number]['code'];
export const SECTOR_CODES = SECTORS.map((s) => s.code) as unknown as [SectorCode, ...SectorCode[]];
export const sectorName = (c: string) => SECTORS.find((s) => s.code === c)?.name ?? c;

export const CURRENCIES = ['INR', 'USD', 'AED', 'EUR', 'GBP', 'SGD'] as const;
export const LOCALES = ['en-IN', 'en-US', 'en-GB', 'hi-IN', 'ar-AE'] as const;

/** Opportunity routes — §2.1 Unite-first hybrid model. */
export const OPPORTUNITY_ROUTES = {
  unite_owned: 'A. Unite-owned business',
  partner_originated: 'B. Partner-originated opportunity',
  partner_exchange: 'C. Partner exchange',
  joint_execution: 'D. Joint execution',
} as const;
export type OpportunityRoute = keyof typeof OPPORTUNITY_ROUTES;

/** ISO 3166-2 India states and priority international markets (coverage, matching explanations). */
export const INDIA_STATES: [string, string][] = [
  ['IN-AP', 'Andhra Pradesh'], ['IN-AS', 'Assam'], ['IN-BR', 'Bihar'], ['IN-CT', 'Chhattisgarh'], ['IN-DL', 'Delhi'], ['IN-GA', 'Goa'], ['IN-GJ', 'Gujarat'],
  ['IN-HR', 'Haryana'], ['IN-HP', 'Himachal Pradesh'], ['IN-JH', 'Jharkhand'], ['IN-KA', 'Karnataka'], ['IN-KL', 'Kerala'], ['IN-MP', 'Madhya Pradesh'],
  ['IN-MH', 'Maharashtra'], ['IN-OR', 'Odisha'], ['IN-PB', 'Punjab'], ['IN-RJ', 'Rajasthan'], ['IN-TN', 'Tamil Nadu'], ['IN-TG', 'Telangana'],
  ['IN-UP', 'Uttar Pradesh'], ['IN-UT', 'Uttarakhand'], ['IN-WB', 'West Bengal'],
];
export const COUNTRIES: [string, string][] = [['IN', 'India'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['BD', 'Bangladesh'], ['NP', 'Nepal'], ['LK', 'Sri Lanka'], ['KE', 'Kenya'], ['NG', 'Nigeria'], ['GB', 'United Kingdom'], ['US', 'United States'], ['SG', 'Singapore']];
export const regionLabel = (c: string) => INDIA_STATES.find(([k]) => k === c)?.[1] ?? COUNTRIES.find(([k]) => k === c)?.[1] ?? c;
export const certLabel = (c: string) => c.replace(/^ISO(\d+)/, 'ISO $1');

/** Membership levels in words ("verified" → "Verified partner"). */
export const LEVEL_LABELS: Record<string, string> = { registered: 'Registered member', verified: 'Verified partner', certified: 'Certified partner', strategic: 'Strategic partner', country_partner: 'Country partner' };
export const levelLabel = (l?: string | null) => (l ? LEVEL_LABELS[l] ?? l.replace(/_/g, ' ') : 'None');
