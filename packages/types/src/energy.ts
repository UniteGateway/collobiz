/**
 * Unite Green Park — renewable energy marketplace (tested in energy.test.ts).
 * Plants/capacity and buyer demand are listed by businesses, checked by COLLABIZ before publishing, and connected through
 * protected introductions. COLLABIZ facilitates introductions and agreed brokerage only; it is not a licensed electricity
 * trader. Calculator figures are forecasts, never quotations.
 */
import { z } from 'zod';

export const ENERGY_CATEGORIES = [
  { code: 'solar_available', label: 'Solar Power Available', side: 'plant' },
  { code: 'solar_required', label: 'Solar Power Required', side: 'buyer' },
  { code: 'solar_plant_sale', label: 'Operational Solar Plants for Sale', side: 'plant' },
  { code: 'solar_under_development', label: 'Under-Development Solar Projects', side: 'plant' },
  { code: 'solar_parks', label: 'Solar Parks & Capacity', side: 'plant' },
  { code: 'group_captive', label: 'Group Captive Opportunities', side: 'plant' },
  { code: 'open_access_ppa', label: 'Open Access PPA Opportunities', side: 'plant' },
  { code: 'wind', label: 'Wind Power Opportunities', side: 'plant' },
  { code: 'hybrid', label: 'Hybrid Solar + Wind Opportunities', side: 'plant' },
  { code: 'bess', label: 'Battery Energy Storage Projects', side: 'plant' },
  { code: 're_epc', label: 'Renewable Energy EPC Projects', side: 'plant' },
  { code: 'investment_jv', label: 'Investment & Joint Venture Opportunities', side: 'plant' },
  { code: 'land_transmission', label: 'Land and Transmission Infrastructure', side: 'plant' },
  { code: 'consultants', label: 'Renewable Energy Consultants & Partners', side: 'plant' },
  { code: 'traders', label: 'Licensed Electricity Trading Partners', side: 'plant' },
] as const;
export type EnergyCategory = (typeof ENERGY_CATEGORIES)[number]['code'];
export const ENERGY_CATEGORY_CODES = ENERGY_CATEGORIES.map((c) => c.code) as unknown as [EnergyCategory, ...EnergyCategory[]];
export const energyCategoryLabel = (c: string) => ENERGY_CATEGORIES.find((x) => x.code === c)?.label ?? c;
export const ENERGY_MODELS = ['open_access', 'group_captive', 'captive', 'third_party', 'merchant'] as const;
export const ENERGY_MODEL_LABELS: Record<string, string> = { open_access: 'Open access', group_captive: 'Group captive', captive: 'Captive', third_party: 'Third-party sale', merchant: 'Merchant' };
export const PLANT_STAGES = ['planned', 'construction', 'operational'] as const;
export const ENERGY_SOURCES = ['solar', 'wind', 'hybrid', 'bess', 'any'] as const;

/** States for the schematic map: code, name, grid position (column, row). */
export const ENERGY_STATES: { code: string; name: string; x: number; y: number }[] = [
  { code: 'HP', name: 'Himachal Pradesh', x: 3, y: 1 }, { code: 'PB', name: 'Punjab', x: 2, y: 2 }, { code: 'UT', name: 'Uttarakhand', x: 4, y: 2 },
  { code: 'HR', name: 'Haryana', x: 3, y: 3 }, { code: 'DL', name: 'Delhi', x: 4, y: 3 }, { code: 'RJ', name: 'Rajasthan', x: 2, y: 4 }, { code: 'UP', name: 'Uttar Pradesh', x: 4, y: 4 },
  { code: 'BR', name: 'Bihar', x: 6, y: 4 }, { code: 'AS', name: 'Assam', x: 8, y: 4 }, { code: 'GJ', name: 'Gujarat', x: 1, y: 5 }, { code: 'MP', name: 'Madhya Pradesh', x: 3, y: 5 },
  { code: 'JH', name: 'Jharkhand', x: 6, y: 5 }, { code: 'WB', name: 'West Bengal', x: 7, y: 5 }, { code: 'MH', name: 'Maharashtra', x: 2, y: 6 }, { code: 'CT', name: 'Chhattisgarh', x: 4, y: 6 },
  { code: 'OR', name: 'Odisha', x: 5, y: 6 }, { code: 'GA', name: 'Goa', x: 2, y: 7 }, { code: 'TG', name: 'Telangana', x: 3, y: 7 }, { code: 'KA', name: 'Karnataka', x: 2, y: 8 },
  { code: 'AP', name: 'Andhra Pradesh', x: 3, y: 8 }, { code: 'KL', name: 'Kerala', x: 2, y: 9 }, { code: 'TN', name: 'Tamil Nadu', x: 3, y: 9 },
];
export const energyStateName = (c: string) => ENERGY_STATES.find((s) => s.code === c)?.name ?? c;
const STATE_CODES = ENERGY_STATES.map((s) => s.code) as [string, ...string[]];

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const money = z.number().min(0).max(50); // ₹/kWh
export const EnergyPlantSchema = z.object({
  side: z.literal('plant'),
  category: z.enum(ENERGY_CATEGORY_CODES).refine((c) => ENERGY_CATEGORIES.find((x) => x.code === c)?.side === 'plant', 'Choose a supply category'),
  title: text(8, 160), state: z.enum(STATE_CODES), district: text(2, 80),
  source: z.enum(ENERGY_SOURCES), stage: z.enum(PLANT_STAGES),
  capacityMw: z.number().positive().max(5000), availableMw: z.number().min(0).max(5000).optional(),
  tariffRsKwh: money.optional(), ppaYears: z.number().int().min(1).max(30).optional(),
  models: z.array(z.enum(ENERGY_MODELS)).min(1).max(5), voltageKv: z.number().min(0.4).max(765).optional(),
  description: text(20, 3000), confidential: z.boolean().default(false),
}).refine((x) => x.availableMw == null || x.availableMw <= x.capacityMw, { message: 'Available MW cannot exceed capacity', path: ['availableMw'] });

export const EnergyBuyerSchema = z.object({
  side: z.literal('buyer'),
  category: z.enum(ENERGY_CATEGORY_CODES).refine((c) => ENERGY_CATEGORIES.find((x) => x.code === c)?.side === 'buyer', 'Choose a demand category'),
  title: text(8, 160), company: text(2, 160), industry: text(2, 80), state: z.enum(STATE_CODES), district: text(2, 80),
  discom: text(2, 80), consumerCategory: text(2, 60), contractDemandMva: z.number().min(0).max(1000).optional(), voltageKv: z.number().min(0.4).max(765).optional(),
  monthlyMwh: z.number().min(0).max(1_000_000).optional(), requiredMw: z.number().positive().max(2000), source: z.enum(ENERGY_SOURCES),
  currentTariffRsKwh: money, targetRsKwh: money.optional(), ppaYears: z.number().int().min(1).max(30), startBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  models: z.array(z.enum(ENERGY_MODELS)).min(1).max(5), openAccessEligible: z.boolean(), storageRequired: z.boolean(), description: text(20, 3000),
});
export const EnergyListingSchema = z.discriminatedUnion('side', [EnergyPlantSchema as never, EnergyBuyerSchema as never]) as unknown as z.ZodType<z.infer<typeof EnergyPlantSchema> | z.infer<typeof EnergyBuyerSchema>>;
export type EnergyPlantInput = z.infer<typeof EnergyPlantSchema>;
export type EnergyBuyerInput = z.infer<typeof EnergyBuyerSchema>;

/** The 19 stages of an energy deal, from introduction to settled supply. Either party records progress; nothing is automatic. */
export const ENERGY_DEAL_STAGES = [
  'Introduction requested', 'Introduction accepted', 'NDA signed', 'Load profile shared', 'Generation profile shared', 'Landed-cost feasibility',
  'Indicative offer', 'Term sheet agreed', 'Due diligence', 'Payment security agreed', 'Open-access / connectivity application', 'Draft PPA',
  'PPA negotiation', 'PPA signed', 'Regulatory approvals (SLDC / DISCOM)', 'Metering & scheduling ready', 'Commercial operation date', 'First supply', 'Billing & settlement live',
] as const;

/** Map colour: supply minus demand per state. */
export function stateBalance(listings: { state: string; side: 'plant' | 'buyer'; mw: number }[]) {
  const m = new Map<string, { supply: number; demand: number }>();
  for (const l of listings) { const s = m.get(l.state) ?? { supply: 0, demand: 0 }; if (l.side === 'plant') s.supply += l.mw; else s.demand += l.mw; m.set(l.state, s); }
  return ENERGY_STATES.map((st) => { const v = m.get(st.code); return { ...st, supply: v?.supply ?? 0, demand: v?.demand ?? 0, net: v ? v.supply - v.demand : null }; });
}

// ------------------------------------------------------------------ delivered-cost calculator
export interface CostInputs {
  capacityMw: number; cufPct: number; ppaRsKwh: number; years: number; escalationPct: number;
  transmission: number; wheeling: number; lossPct: number; bankingPct: number; css: number; additionalSurcharge: number; scheduling: number; tradingMargin: number; duty: number;
  discomRsKwh: number; discomEscalationPct?: number;
}
export const CostInputsSchema = z.object({
  capacityMw: z.number().positive().max(2000), cufPct: z.number().min(5).max(60), ppaRsKwh: money, years: z.number().int().min(1).max(30), escalationPct: z.number().min(0).max(10),
  transmission: money, wheeling: money, lossPct: z.number().min(0).max(30), bankingPct: z.number().min(0).max(30), css: money, additionalSurcharge: money, scheduling: money, tradingMargin: money, duty: money,
  discomRsKwh: money, discomEscalationPct: z.number().min(0).max(10).optional(),
});
/**
 * Year-1 delivered cost per kWh received at the consumer:
 *   received = generated × (1 − losses);  banking charge is a share of energy (priced at the PPA tariff);
 *   cost/kWh received = (PPA × generated + banking + per-kWh charges × generated) / received + duty + CSS + AS (on received).
 * Then a year-by-year table with escalation, savings against the DISCOM tariff and the totals.
 */
export function deliveredCost(i: CostInputs) {
  const genMwh = i.capacityMw * 8760 * (i.cufPct / 100);
  const recMwh = genMwh * (1 - i.lossPct / 100);
  const rows: { year: number; ppa: number; landed: number; discom: number; saving: number; receivedMwh: number; savingRs: number }[] = [];
  for (let y = 1; y <= i.years; y++) {
    const ppa = i.ppaRsKwh * (1 + i.escalationPct / 100) ** (y - 1);
    const discom = i.discomRsKwh * (1 + (i.discomEscalationPct ?? 0) / 100) ** (y - 1);
    const injected = ppa + i.transmission + i.wheeling + i.scheduling + i.tradingMargin + (i.bankingPct / 100) * ppa; // per kWh generated
    const landed = injected / (1 - i.lossPct / 100) + i.css + i.additionalSurcharge + i.duty; // per kWh received
    rows.push({ year: y, ppa, landed, discom, saving: discom - landed, receivedMwh: recMwh, savingRs: (discom - landed) * recMwh * 1000 });
  }
  const y1 = rows[0];
  const breakdown = [
    { label: 'PPA tariff', rsKwh: y1.ppa / (1 - i.lossPct / 100) },
    { label: 'Transmission + wheeling', rsKwh: (i.transmission + i.wheeling) / (1 - i.lossPct / 100) },
    { label: 'Banking', rsKwh: ((i.bankingPct / 100) * y1.ppa) / (1 - i.lossPct / 100) },
    { label: 'Scheduling & trading', rsKwh: (i.scheduling + i.tradingMargin) / (1 - i.lossPct / 100) },
    { label: 'Cross-subsidy + additional surcharge', rsKwh: i.css + i.additionalSurcharge },
    { label: 'Electricity duty / taxes', rsKwh: i.duty },
  ];
  return { generatedMwh: genMwh, receivedMwh: recMwh, landedRsKwh: y1.landed, savingRsKwh: y1.saving, savingPct: y1.discom > 0 ? y1.saving / y1.discom : 0,
    annualSavingRs: y1.savingRs, totalSavingRs: rows.reduce((a, r) => a + r.savingRs, 0), breakdown, rows };
}

/** Illustrative state presets so the calculator runs — DEMO values, not SERC orders. Users replace them with the current order. */
export const ILLUSTRATIVE_STATE_CHARGES: Record<string, Omit<CostInputs, 'capacityMw' | 'cufPct' | 'ppaRsKwh' | 'years' | 'escalationPct'>> = {
  AP: { transmission: 0.35, wheeling: 0.6, lossPct: 8, bankingPct: 8, css: 1.4, additionalSurcharge: 0.6, scheduling: 0.05, tradingMargin: 0.07, duty: 0.06, discomRsKwh: 7.65 },
  GJ: { transmission: 0.38, wheeling: 0.6, lossPct: 8.5, bankingPct: 8, css: 1.5, additionalSurcharge: 0.7, scheduling: 0.05, tradingMargin: 0.07, duty: 0.07, discomRsKwh: 7.4 },
  KA: { transmission: 0.4, wheeling: 0.65, lossPct: 8.8, bankingPct: 8, css: 1.6, additionalSurcharge: 0.7, scheduling: 0.05, tradingMargin: 0.07, duty: 0.05, discomRsKwh: 7.9 },
  MP: { transmission: 0.36, wheeling: 0.62, lossPct: 9, bankingPct: 8, css: 1.5, additionalSurcharge: 0.6, scheduling: 0.05, tradingMargin: 0.07, duty: 0.06, discomRsKwh: 7.7 },
  MH: { transmission: 0.45, wheeling: 0.8, lossPct: 9.9, bankingPct: 8, css: 1.9, additionalSurcharge: 1.0, scheduling: 0.05, tradingMargin: 0.07, duty: 0.08, discomRsKwh: 9.1 },
  OR: { transmission: 0.3, wheeling: 0.5, lossPct: 9, bankingPct: 8, css: 1.2, additionalSurcharge: 0.4, scheduling: 0.05, tradingMargin: 0.07, duty: 0.04, discomRsKwh: 6.9 },
  RJ: { transmission: 0.4, wheeling: 0.65, lossPct: 9.8, bankingPct: 8, css: 1.6, additionalSurcharge: 0.8, scheduling: 0.05, tradingMargin: 0.07, duty: 0.06, discomRsKwh: 8.2 },
  TN: { transmission: 0.42, wheeling: 0.7, lossPct: 9.5, bankingPct: 8, css: 1.7, additionalSurcharge: 0.6, scheduling: 0.05, tradingMargin: 0.07, duty: 0.05, discomRsKwh: 8.0 },
  TG: { transmission: 0.33, wheeling: 0.55, lossPct: 8.3, bankingPct: 8, css: 1.5, additionalSurcharge: 0.5, scheduling: 0.05, tradingMargin: 0.07, duty: 0.06, discomRsKwh: 8.1 },
  UP: { transmission: 0.38, wheeling: 0.66, lossPct: 10, bankingPct: 8, css: 1.6, additionalSurcharge: 0.7, scheduling: 0.05, tradingMargin: 0.07, duty: 0.07, discomRsKwh: 8.3 },
};
export const ENERGY_DISCLAIMER = 'Unite Green Park facilitates introductions and contractually agreed brokerage. It is not a licensed electricity trader unless stated; any purchase for resale needs a licensed trader or an exemption.';

export const EnergyTraderSchema = z.object({
  name: text(2, 160), licenceNo: text(3, 60), authority: z.enum(['CERC', 'SERC']), state: z.enum(STATE_CODES).optional(),
  category: text(2, 80), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), website: z.string().url().max(300).optional(),
});
