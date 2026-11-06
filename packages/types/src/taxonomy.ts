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
