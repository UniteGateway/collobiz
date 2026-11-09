/**
 * Unite Solar sales desk — shared, pure calculation engine (used by the API, which is authoritative, and by screens for previews).
 * Money is in paise; energy in kWh; tariffs in paise per kWh. Every figure is an estimate and is labelled as one on screen.
 */
import { z } from 'zod';

/** Indian mobile number as people type it: optional +91, optional space or dash after the first five digits. */
export const INDIA_MOBILE = /^(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

// ---------------- Vocabulary ----------------
export const SOLAR_SYSTEMS = ['on_grid', 'hybrid', 'off_grid'] as const;
export const SOLAR_SYSTEM_LABELS: Record<string, string> = { on_grid: 'On-grid', hybrid: 'Hybrid (with battery)', off_grid: 'Off-grid' };
export const SOLAR_SEGMENTS = ['residential', 'commercial', 'industrial'] as const;
export const SOLAR_SEGMENT_LABELS: Record<string, string> = { residential: 'Home', commercial: 'Business / commercial', industrial: 'Factory / industrial' };
export const SOLAR_MODELS = ['kit', 'epc', 'ppa'] as const;
export const SOLAR_MODEL_LABELS: Record<string, string> = { kit: 'Solar kit', epc: 'EPC (turnkey project)', ppa: 'PPA (no upfront cost)' };
export const SOLAR_QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'won', 'installed', 'paid', 'declined', 'expired'] as const;
export const SOLAR_QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent to customer', accepted: 'Accepted', won: 'Order won', installed: 'Installed', paid: 'Customer paid', declined: 'Declined', expired: 'Expired',
};
/** Allowed next steps. `won` opens a projected commission; `paid` (customer payment) makes it earned; `installed` makes referral rewards due. */
export const SOLAR_QUOTE_NEXT: Record<string, string[]> = {
  draft: ['sent', 'declined'], sent: ['accepted', 'declined', 'expired'], accepted: ['won', 'declined'], won: ['installed', 'paid'],
  installed: ['paid'], paid: ['installed'], declined: [], expired: ['sent'],
};

// ---------------- Configuration (Unite Solar sets these; defaults are demo values) ----------------
export interface SolarConfig {
  /** Typical specific yield, kWh per kWp per year, by state (ISO 3166-2:IN code). */
  yieldByState: Record<string, number>;
  defaultYield: number;
  /** Composite GST on a solar system (bps) — e.g. 70% goods at 5% and 30% services at 18% ≈ 8.9%. Confirm with a CA. */
  gstBps: number;
  /** PM Surya Ghar central financial assistance (residential, grid-connected): per-kW slabs and a cap, in paise. */
  subsidy: { slabs: { upToKw: number; perKw: number }[]; cap: number };
  /** Value of exported units (net metering / billing), paise per kWh. */
  exportRate: number;
  tariffEscalationBps: number;
  degradationBps: number;
  /** EPC price per watt-peak before GST, by size (paise per Wp). */
  epcRates: { upToKw: number; perWp: number }[];
  panelW: number;
  ppa: { minKw: number; tariff: number; termYears: number; escalationBps: number };
  commission: { kitPerKw: number; kitMin: number; epcTiers: { upTo: number | null; rateBps: number }[]; ppaPerKw: number };
  referral: { residentialFlat: number; businessPerKw: number; businessCap: number };
  co2KgPerKwh: number;
}

export const DEFAULT_SOLAR_CONFIG: SolarConfig = {
  yieldByState: {
    'IN-RJ': 1600, 'IN-GJ': 1550, 'IN-AP': 1500, 'IN-TG': 1500, 'IN-MP': 1500, 'IN-MH': 1450, 'IN-KA': 1450, 'IN-TN': 1450, 'IN-CT': 1450, 'IN-HP': 1450,
    'IN-DL': 1400, 'IN-HR': 1400, 'IN-PB': 1400, 'IN-UP': 1400, 'IN-UT': 1400, 'IN-GA': 1400, 'IN-JK': 1400, 'IN-KL': 1350, 'IN-OR': 1350, 'IN-BR': 1350,
    'IN-JH': 1350, 'IN-WB': 1250, 'IN-AS': 1150, 'IN-ML': 1150, 'IN-MN': 1150, 'IN-MZ': 1150, 'IN-NL': 1150, 'IN-TR': 1150, 'IN-AR': 1150, 'IN-SK': 1200,
  },
  defaultYield: 1400,
  gstBps: 890,
  subsidy: { slabs: [{ upToKw: 2, perKw: 30_000_00 }, { upToKw: 3, perKw: 18_000_00 }], cap: 78_000_00 },
  exportRate: 300,
  tariffEscalationBps: 300,
  degradationBps: 50,
  epcRates: [{ upToKw: 50, perWp: 4800 }, { upToKw: 100, perWp: 4400 }, { upToKw: 500, perWp: 4000 }, { upToKw: 1_000_000, perWp: 3600 }],
  panelW: 550,
  ppa: { minKw: 50, tariff: 490, termYears: 25, escalationBps: 0 },
  commission: { kitPerKw: 2_500_00, kitMin: 3_000_00, epcTiers: [{ upTo: 1_00_00_000_00, rateBps: 200 }, { upTo: null, rateBps: 150 }], ppaPerKw: 1_500_00 },
  referral: { residentialFlat: 2_000_00, businessPerKw: 300_00, businessCap: 25_000_00 },
  co2KgPerKwh: 0.716,
};

// ---------------- Inputs ----------------
export const SolarSiteSchema = z.object({
  segment: z.enum(SOLAR_SEGMENTS),
  region: z.string().trim().min(2).max(6),
  monthlyUnits: z.number().int().min(1, { message: 'Enter the monthly units (kWh) from the bill' }).max(10_000_000),
  /** Effective tariff, paise per kWh (bill amount ÷ units). */
  tariff: z.number().int().min(100, { message: 'Enter the tariff (₹ per unit)' }).max(5000),
  sanctionedLoadKw: z.number().min(0).max(100_000).optional(),
  roofAreaSqft: z.number().int().min(0).max(10_000_000).optional(),
});
export type SolarSite = z.infer<typeof SolarSiteSchema>;

export const SolarCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(INDIA_MOBILE, { message: 'Enter a 10-digit Indian mobile number' }),
  email: z.string().trim().email().max(200).optional().or(z.literal('').transform(() => undefined)),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, { message: 'Enter a 6-digit PIN code' }).optional().or(z.literal('').transform(() => undefined)),
});

export const SolarQuoteSchema = z.object({
  customer: SolarCustomerSchema,
  consentMethod: z.enum(['meeting_minutes', 'written_email', 'signed_letter', 'recorded_call', 'web_form']),
  consent: z.literal(true, { message: 'Confirm that the customer asked for this quote' }),
  site: SolarSiteSchema,
  model: z.enum(SOLAR_MODELS),
  system: z.enum(SOLAR_SYSTEMS).default('on_grid'),
  /** Optional overrides: a chosen kit, or a chosen capacity for EPC/PPA. */
  kitId: z.string().uuid().optional(),
  capacityKw: z.number().min(0.5).max(100_000).optional(),
  billId: z.string().uuid().optional(),
  referralCode: z.string().trim().max(20).optional().or(z.literal('').transform(() => undefined)),
  notes: z.string().trim().max(2000).optional(),
});
export type SolarQuoteInput = z.infer<typeof SolarQuoteSchema>;

export const SolarKitSchema = z.object({
  name: z.string().trim().min(3).max(120),
  system: z.enum(SOLAR_SYSTEMS),
  capacityKw: z.number().min(0.5).max(1000),
  panelW: z.number().int().min(100).max(1000),
  inverterKw: z.number().min(0.5).max(1000),
  batteryKwh: z.number().min(0).max(10000).optional(),
  phase: z.union([z.literal(1), z.literal(3)]),
  price: z.number().int().min(1).max(1_00_00_00_000_00),
  warrantyYears: z.number().int().min(1).max(30),
  includes: z.array(z.string().trim().min(2).max(120)).max(20),
  description: z.string().trim().min(10).max(2000),
});

// ---------------- Kits ----------------
export interface SolarKitLike { id: string; code: string; name: string; system: string; capacityKw: number; price: number; batteryKwh?: number | null; status?: string }

/** The smallest kit of the chosen type that covers the target; otherwise the largest one. */
export function pickKit<K extends SolarKitLike>(kits: K[], system: string, targetKw: number): K | null {
  const list = kits.filter((k) => k.system === system && (k.status ?? 'active') === 'active').sort((a, b) => a.capacityKw - b.capacityKw);
  if (!list.length) return null;
  return list.find((k) => k.capacityKw >= targetKw - 0.05) ?? list[list.length - 1];
}

// ---------------- Sizing ----------------
export function yieldFor(cfg: SolarConfig, region: string) { return cfg.yieldByState[region] ?? cfg.defaultYield; }

/** Capacity that would cover the yearly consumption, limited by sanctioned load (homes) and roof area (~100 sq ft per kW). */
export function recommendKw(cfg: SolarConfig, site: SolarSite) {
  const yearly = site.monthlyUnits * 12;
  let kw = yearly / yieldFor(cfg, site.region);
  const limits: string[] = [];
  if (site.segment === 'residential' && site.sanctionedLoadKw && kw > site.sanctionedLoadKw) { kw = site.sanctionedLoadKw; limits.push('sanctioned load'); }
  if (site.roofAreaSqft && kw > site.roofAreaSqft / 100) { kw = site.roofAreaSqft / 100; limits.push('roof area'); }
  const step = kw >= 20 ? 5 : kw >= 10 ? 1 : 0.5;
  kw = Math.max(1, Math.ceil(kw / step - 1e-9) * step);
  return { kw: Math.round(kw * 10) / 10, limits };
}

export function subsidyFor(cfg: SolarConfig, segment: string, system: string, kw: number) {
  if (segment !== 'residential' || system !== 'on_grid') return 0;
  let left = kw; let prev = 0; let total = 0;
  for (const s of cfg.subsidy.slabs) {
    const inSlab = Math.max(0, Math.min(left, s.upToKw - prev));
    total += inSlab * s.perKw; left -= inSlab; prev = s.upToKw;
  }
  return Math.min(Math.round(total), cfg.subsidy.cap);
}

export function epcRateFor(cfg: SolarConfig, kw: number) { return (cfg.epcRates.find((r) => kw <= r.upToKw) ?? cfg.epcRates[cfg.epcRates.length - 1]).perWp; }

export interface BoqLine { item: string; spec: string; quantity: number; unit: string; amount: number }
/** Indicative bill of quantities for an EPC project, before GST. */
export function epcBoq(cfg: SolarConfig, kw: number): { lines: BoqLine[]; subtotal: number } {
  const subtotal = Math.round(kw * 1000 * epcRateFor(cfg, kw));
  const modules = Math.ceil((kw * 1000) / cfg.panelW);
  const inverters = Math.max(1, Math.ceil(kw / (kw > 100 ? 100 : kw > 25 ? 25 : 10)));
  const share = (bps: number) => Math.round((subtotal * bps) / 10000);
  const parts: [string, string, number, string, number][] = [
    ['Solar PV modules', `${cfg.panelW} Wp mono PERC / TOPCon, ALMM-listed`, modules, 'nos', 5500],
    ['String inverters', `${kw > 100 ? 100 : kw > 25 ? 25 : 10} kW, grid-tied, with monitoring`, inverters, 'nos', 1500],
    ['Mounting structure', 'Hot-dip galvanised, wind-load certified', Math.round(kw * 10) / 10, 'kWp', 1000],
    ['Balance of system', 'DC/AC cables, ACDB/DCDB, earthing, lightning arrester', 1, 'lot', 1000],
    ['Installation and commissioning', 'Design, installation, testing, commissioning', 1, 'lot', 700],
    ['Net metering and approvals', 'DISCOM liaison, CEIG where applicable', 1, 'lot', 300],
  ];
  const lines = parts.map(([item, spec, quantity, unit, bps]) => ({ item, spec, quantity, unit, amount: share(bps) }));
  lines[0].amount += subtotal - lines.reduce((a, l) => a + l.amount, 0); // rounding to the first line
  return { lines, subtotal };
}

// ---------------- Savings ----------------
export interface Savings { annualGeneration: number; yearOneSavings: number; lifetimeSavings: number; paybackYears: number | null; co2TonnesPerYear: number; years: number }
/** Year-by-year: generation degrades, grid tariff escalates; self-used units save the tariff, exported units earn the export rate. */
export function savingsFor(cfg: SolarConfig, site: SolarSite, kw: number, netCost: number, years = 25, ppaTariff?: number, ppaEscBps = 0): Savings {
  const gen1 = kw * yieldFor(cfg, site.region);
  const use = site.monthlyUnits * 12;
  let cumulative = 0; let payback: number | null = null; let y1 = 0;
  for (let y = 0; y < years; y++) {
    const gen = gen1 * (1 - cfg.degradationBps / 10000) ** y;
    const tariff = site.tariff * (1 + cfg.tariffEscalationBps / 10000) ** y;
    const s = ppaTariff != null
      ? Math.max(0, Math.min(gen, use) * (tariff - ppaTariff * (1 + ppaEscBps / 10000) ** y))
      : Math.min(gen, use) * tariff + Math.max(0, gen - use) * cfg.exportRate;
    if (y === 0) y1 = s;
    const before = cumulative; cumulative += s;
    if (payback == null && netCost > 0 && cumulative >= netCost) payback = Math.round((y + (netCost - before) / s) * 10) / 10;
  }
  return { annualGeneration: Math.round(gen1), yearOneSavings: Math.round(y1), lifetimeSavings: Math.round(cumulative), paybackYears: netCost > 0 ? payback : null, co2TonnesPerYear: Math.round((gen1 * cfg.co2KgPerKwh) / 100) / 10, years };
}

// ---------------- Commission and referral ----------------
export function solarCommission(cfg: SolarConfig, model: string, kw: number, value: number) {
  if (model === 'kit') return Math.max(cfg.commission.kitMin, Math.round(kw * cfg.commission.kitPerKw));
  if (model === 'ppa') return Math.round(kw * cfg.commission.ppaPerKw);
  let left = value; let prev = 0; let total = 0;
  for (const t of cfg.commission.epcTiers) {
    const top = t.upTo ?? Number.MAX_SAFE_INTEGER;
    const part = Math.max(0, Math.min(left, top - prev));
    total += (part * t.rateBps) / 10000; left -= part; prev = top;
    if (left <= 0) break;
  }
  return Math.round(total);
}
export function referralReward(cfg: SolarConfig, segment: string, kw: number) {
  return segment === 'residential' ? cfg.referral.residentialFlat : Math.min(cfg.referral.businessCap, Math.round(kw * cfg.referral.businessPerKw));
}

// ---------------- The whole quote ----------------
export interface SolarQuoteCalc {
  model: string; system: string; capacityKw: number; recommendedKw: number; limits: string[];
  lines: BoqLine[]; subtotal: number; gst: number; total: number; subsidy: number; net: number;
  ppa: { tariff: number; termYears: number; escalationBps: number } | null;
  savings: Savings; commission: number; referralReward: number;
}
export function quoteSolar(cfg: SolarConfig, input: { site: SolarSite; model: string; system: string; capacityKw?: number }, kit: SolarKitLike | null): SolarQuoteCalc {
  const rec = recommendKw(cfg, input.site);
  if (input.model === 'kit') {
    if (!kit) throw new Error('No kit of this type is available');
    const total = kit.price; // kit prices include GST
    const subtotal = Math.round((total * 10000) / (10000 + cfg.gstBps));
    const subsidy = subsidyFor(cfg, input.site.segment, kit.system, kit.capacityKw);
    const net = total - subsidy;
    return {
      model: 'kit', system: kit.system, capacityKw: kit.capacityKw, recommendedKw: rec.kw, limits: rec.limits,
      lines: [{ item: kit.name, spec: `${kit.code} · ${SOLAR_SYSTEM_LABELS[kit.system]}${kit.batteryKwh ? ` · ${kit.batteryKwh} kWh battery` : ''}`, quantity: 1, unit: 'kit', amount: subtotal }],
      subtotal, gst: total - subtotal, total, subsidy, net, ppa: null,
      savings: savingsFor(cfg, input.site, kit.capacityKw, net), commission: solarCommission(cfg, 'kit', kit.capacityKw, total), referralReward: referralReward(cfg, input.site.segment, kit.capacityKw),
    };
  }
  const kw = input.capacityKw ?? rec.kw;
  if (input.model === 'ppa') {
    if (kw < cfg.ppa.minKw) throw new Error(`PPA needs at least ${cfg.ppa.minKw} kW — choose EPC or a kit for smaller sites`);
    return {
      model: 'ppa', system: 'on_grid', capacityKw: kw, recommendedKw: rec.kw, limits: rec.limits,
      lines: [{ item: 'Solar plant built, owned and maintained by Unite Solar', spec: `${kw} kWp on the customer's roof or land`, quantity: Math.round(kw * 10) / 10, unit: 'kWp', amount: 0 }],
      subtotal: 0, gst: 0, total: 0, subsidy: 0, net: 0, ppa: { ...cfg.ppa },
      savings: savingsFor(cfg, input.site, kw, 0, cfg.ppa.termYears, cfg.ppa.tariff, cfg.ppa.escalationBps), commission: solarCommission(cfg, 'ppa', kw, 0), referralReward: referralReward(cfg, input.site.segment, kw),
    };
  }
  const boq = epcBoq(cfg, kw);
  const gst = Math.round((boq.subtotal * cfg.gstBps) / 10000);
  const total = boq.subtotal + gst;
  const subsidy = subsidyFor(cfg, input.site.segment, input.system, kw);
  return {
    model: 'epc', system: input.system, capacityKw: kw, recommendedKw: rec.kw, limits: rec.limits, lines: boq.lines, subtotal: boq.subtotal, gst, total, subsidy, net: total - subsidy, ppa: null,
    savings: savingsFor(cfg, input.site, kw, total - subsidy), commission: solarCommission(cfg, 'epc', kw, total), referralReward: referralReward(cfg, input.site.segment, kw),
  };
}

// ---------------- Reading a power bill ----------------
export interface BillExtract {
  units: number | null; amount: number | null; sanctionedLoadKw: number | null; billingMonths: number; consumerNo: string | null;
  discom: string | null; segment: string | null; monthlyUnits: number | null; tariff: number | null; found: string[];
}
const DISCOMS: [RegExp, string][] = [
  [/MSEDCL|Maharashtra State Electricity/i, 'MSEDCL'], [/BESCOM/i, 'BESCOM'], [/TANGEDCO|TNPDCL|Tamil Nadu (Generation|Power)/i, 'TNPDCL'], [/TSSPDCL|TGSPDCL/i, 'TGSPDCL'],
  [/APSPDCL|APEPDCL|APCPDCL/i, 'APDISCOM'], [/Adani Electricity/i, 'Adani Electricity'], [/Tata Power/i, 'Tata Power'], [/BSES/i, 'BSES'], [/UGVCL|MGVCL|PGVCL|DGVCL|Torrent Power/i, 'Gujarat DISCOM'],
  [/KSEB/i, 'KSEB'], [/JVVNL|AVVNL|JDVVNL/i, 'Rajasthan DISCOM'], [/PSPCL/i, 'PSPCL'], [/UPPCL|PVVNL|MVVNL|DVVNL|PUVVNL/i, 'UPPCL'], [/CESC/i, 'CESC'], [/WBSEDCL/i, 'WBSEDCL'],
];
const num = (s: string) => Number(s.replace(/,/g, ''));
/** Reads the key numbers from the text of an Indian electricity bill. Every field is optional; the person confirms before quoting. */
export function readBill(text: string): BillExtract {
  const t = text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const found: string[] = [];
  const pick = (res: RegExp[]) => { for (const r of res) { const m = t.match(r); if (m) return m[1]; } return null; };
  const unitsS = pick([
    /(?:Units?\s*Consumed|Total\s*Units|Billed\s*Units|Net\s*(?:Billed\s*)?Units|Consumption\s*\(?\s*kWh\s*\)?|Energy\s*Consumed)\s*[:\-]?\s*(?:\(kWh\)\s*)?([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:kWh|Units)\b/i,
  ]);
  const amountS = pick([
    /(?:Net\s*Amount\s*Payable|Total\s*Amount\s*(?:Due|Payable)|Amount\s*Payable|Bill\s*Amount|Current\s*Bill(?:\s*Amount)?|Total\s*Bill)\s*(?:\(?\s*(?:Rs\.?|INR|₹)\s*\)?)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ]);
  const loadM = t.match(/(?:Sanctioned|Connected|Contract)\s*(?:Load|Demand)\s*[:\-]?\s*([\d.]+)\s*(kW|KW|kVA|KVA|HP)?/i);
  const consumer = pick([/(?:Consumer|Account|Service|CA|Connection)\s*(?:No\.?|Number|ID)\s*[:\-]?\s*([A-Z0-9\/-]{5,20})/i]);
  const period = t.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})\s*(?:to|-|–)\s*(\d{2})[\/.-](\d{2})[\/.-](\d{4})/i);
  const biMonthly = /bi-?monthly/i.test(t);
  let months = biMonthly ? 2 : 1;
  if (period) {
    const a = Date.UTC(+period[3], +period[2] - 1, +period[1]); const b = Date.UTC(+period[6], +period[5] - 1, +period[4]);
    const days = (b - a) / 86400000;
    if (days > 0 && days < 400) months = Math.max(1, Math.round(days / 30.4));
  }
  const units = unitsS ? num(unitsS) : null;
  const amount = amountS ? Math.round(num(amountS) * 100) : null;
  let load: number | null = loadM ? Number(loadM[1]) : null;
  if (load != null && loadM?.[2] && /HP/i.test(loadM[2])) load = Math.round(load * 0.746 * 10) / 10;
  const segment = /\bHT\b|High\s*Tension|Industrial/i.test(t) ? 'industrial' : /Commercial|Non[-\s]?Domestic|LT[-\s]?(?:II|2)\b/i.test(t) ? 'commercial' : /Domestic|Residential|LT[-\s]?(?:I|1)\b/i.test(t) ? 'residential' : null;
  const discom = DISCOMS.find(([r]) => r.test(t))?.[1] ?? null;
  if (units != null) found.push('units'); if (amount != null) found.push('amount'); if (load != null) found.push('load'); if (consumer) found.push('consumer number');
  if (discom) found.push('DISCOM'); if (segment) found.push('category'); if (period || biMonthly) found.push('billing period');
  const monthlyUnits = units != null ? Math.round(units / months) : null;
  const tariff = units && amount ? Math.round(amount / units) : null;
  return { units, amount, sanctionedLoadKw: load, billingMonths: months, consumerNo: consumer, discom, segment, monthlyUnits, tariff: tariff && tariff >= 100 && tariff <= 5000 ? tariff : null, found };
}

// ---------------- Referrals ----------------
export const SolarReferralSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(INDIA_MOBILE, { message: 'Enter a 10-digit Indian mobile number' }),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(6),
  segment: z.enum(SOLAR_SEGMENTS),
  monthlyBill: z.number().int().min(0).max(1_00_00_000_00).optional(),
  consent: z.literal(true, { message: 'Please agree to be contacted about solar' }),
});
export const REFERRAL_STATUS_LABELS: Record<string, string> = { new: 'New', quoted: 'Quoted', installed: 'Installed — reward due', rewarded: 'Reward paid', lost: 'Not going ahead' };
