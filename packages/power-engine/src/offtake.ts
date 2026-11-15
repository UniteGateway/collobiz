/**
 * How much solar a consumer can take — open access (third party / group captive / captive) and rooftop — checked against
 * the consumer's contract demand, sanctioned load and actual consumption.
 *
 * Every limit is a rule record with a source and a confidence:
 *   verified   — read in the gazette / commission order (order number and date recorded)
 *   secondary  — reported by a law firm, trade press or analyst summary; must be confirmed before an offer is final
 *   user       — entered by the analyst for this case
 * A state limit that nobody has recorded is UNKNOWN: the check says so and does not assume "no limit".
 *
 * Physical limits apply regardless of regulation: energy beyond what the consumer uses in a settlement period is surplus
 * that only banking (where allowed, with its charges and caps) can absorb, otherwise it is lapsed or sold elsewhere.
 */
export type RuleConfidence = 'verified' | 'secondary' | 'user';
export type OfftakeStructure = 'third_party' | 'group_captive' | 'captive' | 'rooftop';
export type RuleKey =
  | 'oa_min_contract_demand_kw'      // open access eligibility threshold (kW / kVA of contract demand or sanctioned load)
  | 'oa_capacity_pct_of_cd'          // max open-access RE capacity as % of contract demand
  | 're_total_capacity_pct_of_cd'    // max rooftop + open access RE capacity together, % of contract demand
  | 'banking_allowed'                // 1 = allowed, 0 = not allowed
  | 'banking_cap_pct_of_consumption' // max banked energy, % of the consumer's consumption in the settlement period
  | 'banking_charge_pct'             // banking charge, % of energy banked
  | 'banking_settlement'             // 1 = monthly, 12 = annual (months)
  | 'net_metering_cap_kw'            // rooftop net-metering ceiling, kW
  | 'net_metering_pct_of_load'       // rooftop net-metering ceiling, % of sanctioned load / contract demand
  | 'captive_min_ownership_pct'      // captive / group captive: collective ownership (% equity with voting rights)
  | 'captive_min_consumption_pct';   // captive / group captive: collective consumption, % of generation in the year

export interface OfftakeRule {
  state: string;                     // 'ALL' for national rules
  structure: OfftakeStructure | 'all_open_access' | 'all';
  key: RuleKey;
  value: number;
  confidence: RuleConfidence;
  source: string; sourceUrl?: string; effectiveFrom?: string; note?: string;
}
export const RULE_LABELS: Record<RuleKey, string> = {
  oa_min_contract_demand_kw: 'Open-access eligibility: minimum contract demand / sanctioned load (kW)',
  oa_capacity_pct_of_cd: 'Open-access RE capacity limit (% of contract demand)',
  re_total_capacity_pct_of_cd: 'Rooftop + open-access RE capacity limit together (% of contract demand)',
  banking_allowed: 'Banking allowed (1 = yes, 0 = no)',
  banking_cap_pct_of_consumption: 'Banking limit (% of consumption in the settlement period)',
  banking_charge_pct: 'Banking charge (% of banked energy)',
  banking_settlement: 'Banking settlement period (months)',
  net_metering_cap_kw: 'Rooftop net-metering ceiling (kW)',
  net_metering_pct_of_load: 'Rooftop net-metering ceiling (% of sanctioned load)',
  captive_min_ownership_pct: 'Captive: minimum collective ownership (%)',
  captive_min_consumption_pct: 'Captive: minimum collective consumption (% of generation)',
};

/**
 * Starting rules. National rules come from the central rules as reported by law firms and the trade press (secondary until
 * someone records the gazette reference). State entries are only those found reported in the sources listed; every other
 * state limit is deliberately left unknown.
 */
export const SEED_OFFTAKE_RULES: OfftakeRule[] = [
  { state: 'ALL', structure: 'third_party', key: 'oa_min_contract_demand_kw', value: 100, confidence: 'secondary', source: 'Electricity (Promoting Renewable Energy through Green Energy Open Access) Rules, 2022 as amended 2023 — 100 kW, aggregation of connections in the same distribution division allowed', sourceUrl: 'https://nishithdesai.com/research-and-articles/hotline/green-hotline/ministry-of-power-notifies-new-green-energy-open-access-rules-2022-6243' },
  { state: 'ALL', structure: 'group_captive', key: 'oa_min_contract_demand_kw', value: 100, confidence: 'secondary', source: 'GEOA Rules 2022 (as amended) — threshold applies to non-captive consumers; confirm treatment of group captive users in the state regulations', sourceUrl: 'https://ksandk.com/energy/green-energy-open-access' },
  { state: 'ALL', structure: 'captive', key: 'oa_min_contract_demand_kw', value: 0, confidence: 'secondary', source: 'GEOA Rules 2022 — no minimum load for captive consumers', sourceUrl: 'https://ksandk.com/energy/green-energy-open-access' },
  { state: 'ALL', structure: 'group_captive', key: 'captive_min_ownership_pct', value: 26, confidence: 'secondary', source: 'Electricity Rules 2005, Rule 3, as amended by the Electricity (Amendment) Rules 2026 (notified 13 Mar 2026) — collective for all captive users', sourceUrl: 'https://www.khaitanco.com/sites/default/files/2026-03/ERGO_Electricity%20Amendment%20Rules%202026_20%20March%202026.pdf', effectiveFrom: '2026-04-01', note: 'Users holding under 26% are limited to their proportionate share of generation (proportionality); confirm wording in G.S.R. 186(E).' },
  { state: 'ALL', structure: 'group_captive', key: 'captive_min_consumption_pct', value: 51, confidence: 'secondary', source: 'Electricity Rules 2005, Rule 3, as amended 2026 — at least 51% of the plant’s annual generation consumed by captive users collectively', sourceUrl: 'https://www.khaitanco.com/sites/default/files/2026-03/ERGO_Electricity%20Amendment%20Rules%202026_20%20March%202026.pdf', effectiveFrom: '2026-04-01' },
  { state: 'ALL', structure: 'captive', key: 'captive_min_ownership_pct', value: 26, confidence: 'secondary', source: 'Electricity Rules 2005, Rule 3 (as amended 2026)', sourceUrl: 'https://www.khaitanco.com/sites/default/files/2026-03/ERGO_Electricity%20Amendment%20Rules%202026_20%20March%202026.pdf' },
  { state: 'ALL', structure: 'captive', key: 'captive_min_consumption_pct', value: 51, confidence: 'secondary', source: 'Electricity Rules 2005, Rule 3 (as amended 2026)', sourceUrl: 'https://www.khaitanco.com/sites/default/files/2026-03/ERGO_Electricity%20Amendment%20Rules%202026_20%20March%202026.pdf' },
  { state: 'ALL', structure: 'rooftop', key: 'net_metering_cap_kw', value: 500, confidence: 'secondary', source: 'Electricity (Rights of Consumers) Amendment Rules 2021 — net metering up to 500 kW or the sanctioned load, whichever is lower; larger systems on gross metering / net billing per the State Commission', sourceUrl: 'https://renewablewatch.in/2021/06/30/ministry-of-power-approves-net-metering-for-rooftop-systems-up-to-500-kw-capacity/', note: 'A draft amendment of 12 Mar 2026 to these Rules was reported; status not checked.' },
  { state: 'ALL', structure: 'rooftop', key: 'net_metering_pct_of_load', value: 100, confidence: 'secondary', source: 'Electricity (Rights of Consumers) Amendment Rules 2021 — capped at the sanctioned load', sourceUrl: 'https://renewablewatch.in/2021/06/30/ministry-of-power-approves-net-metering-for-rooftop-systems-up-to-500-kw-capacity/' },
  { state: 'RJ', structure: 'rooftop', key: 'net_metering_cap_kw', value: 1000, confidence: 'secondary', source: 'RERC raised the rooftop net-metering cap from 500 kW to 1 MW (trade press)', sourceUrl: 'https://constructionworld.in/energy-infrastructure/power-and-renewable-energy/rajasthan-raises-net-metering-cap-to-1-mw-for-rooftop-solar-installations/50813' },
  { state: 'MH', structure: 'rooftop', key: 'net_metering_cap_kw', value: 5000, confidence: 'secondary', source: 'MERC net-metering amendment 2023 — 5 MW or contract demand / sanctioned load, whichever is lower (reported)', sourceUrl: 'https://www.heavengreenenergy.com/blog/solar-capacity-sanctioned-load', note: 'Reported by a solar company blog; confirm in the MERC regulation.' },
  { state: 'TN', structure: 'third_party', key: 'banking_allowed', value: 0, confidence: 'secondary', source: 'TNERC GEOA Regulations 2025 — banking not allowed for third-party purchase (reported)', sourceUrl: 'https://www.sunwavetech.com/blog/solar-open-access-state-comparison-india-2026', note: 'Reported by an industry blog; confirm in the TNERC regulation.' },
  { state: 'TN', structure: 'all_open_access', key: 'banking_charge_pct', value: 8, confidence: 'secondary', source: 'TNERC GEOA Regulations 2025 — 8% banking charge (reported)', sourceUrl: 'https://www.sunwavetech.com/blog/solar-open-access-state-comparison-india-2026', note: 'Reported by an industry blog; confirm.' },
];

/** The rule that applies: state-specific beats national; an exact structure beats a group of structures. */
export function ruleFor(rules: OfftakeRule[], state: string, structure: OfftakeStructure, key: RuleKey): OfftakeRule | null {
  const fits = (r: OfftakeRule) => r.key === key && (r.structure === structure || r.structure === 'all' || (r.structure === 'all_open_access' && structure !== 'rooftop'));
  const rank = (r: OfftakeRule) => (r.state === state ? 0 : 2) + (r.structure === structure ? 0 : 1);
  const c = rules.filter((r) => fits(r) && (r.state === state || r.state === 'ALL')).sort((a, b) => rank(a) - rank(b));
  return c[0] ?? null;
}

export interface OfftakeInputs {
  state: string;
  structure: Exclude<OfftakeStructure, 'rooftop'>;
  contractDemandKva: number; sanctionedLoadKw?: number; powerFactor?: number;
  /** Consumer's consumption, kWh, by month (12 values). */
  monthlyConsumptionKwh: number[];
  /** Consumer's load by hour of day as a share of the day's consumption (24 values, sums to 1). Optional. */
  hourlyLoadShape?: number[];
  /** Proposed open-access supply: contracted capacity (MW AC) and energy received at the consumer by month (kWh, 12 values). */
  proposedOaMw: number; oaMonthlyKwh: number[];
  /** OA energy received by hour of day as a share of the day's OA energy (24 values). Optional; with the load shape it shows hours of surplus. */
  oaHourlyShape?: number[];
  /** Rooftop solar already installed or proposed at the premises. */
  rooftopKwp: number; rooftopMonthlyKwh: number[];
  /** Captive only: the consumer's (or the captive users' collective) equity share and share of the plant generation they consume. */
  ownershipPct?: number; plantConsumptionSharePct?: number;
}
export type Severity = 'block' | 'warning' | 'info';
export interface OfftakeFinding { severity: Severity; check: string; message: string; rule?: OfftakeRule | null }
export interface OfftakeResult {
  findings: OfftakeFinding[];
  maxOaMwByRules: number | null; maxOaMwBindingRule: string | null;
  annual: { consumptionKwh: number; oaKwh: number; rooftopKwh: number; reShare: number; surplusKwh: number; bankableKwh: number | null; lapsedKwh: number | null };
  monthly: { month: number; consumption: number; oa: number; rooftop: number; surplus: number }[];
  hourlySurplusShare: number | null;
  rooftop: { netMeteringLimitKw: number | null; withinNetMetering: boolean | null; arrangement: string };
  unknownRules: string[];
  ok: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const src = (r: OfftakeRule | null) => (r ? ` [${r.confidence === 'verified' ? 'verified' : r.confidence === 'user' ? 'user-entered' : 'secondary source — confirm'}: ${r.source}]` : '');

/** Checks an open-access + rooftop offer against eligibility, capacity, energy and captive rules. */
export function offtakeCheck(i: OfftakeInputs, rules: OfftakeRule[] = SEED_OFFTAKE_RULES): OfftakeResult {
  const f: OfftakeFinding[] = [];
  const unknown: string[] = [];
  const get = (key: RuleKey, s: OfftakeStructure = i.structure) => { const r = ruleFor(rules, i.state, s, key); if (!r) unknown.push(`${RULE_LABELS[key]} — ${i.state}${s === 'rooftop' ? ' rooftop' : ` ${s.replace('_', ' ')}`}`); return r; };
  const pf = i.powerFactor ?? 0.95;
  const cdKw = i.contractDemandKva * pf, cdMw = cdKw / 1000;

  // 1. Eligibility.
  const elig = get('oa_min_contract_demand_kw');
  if (elig) {
    if (cdKw < elig.value) f.push({ severity: 'block', check: 'Eligibility', message: `Contract demand ≈ ${cdKw.toFixed(0)} kW is below the ${elig.value} kW open-access threshold.${src(elig)}`, rule: elig });
    else f.push({ severity: 'info', check: 'Eligibility', message: `Contract demand ≈ ${cdKw.toFixed(0)} kW meets the ${elig.value} kW threshold.${src(elig)}`, rule: elig });
  }

  // 2. Capacity limits.
  const caps: { mw: number; label: string }[] = [];
  const oaCap = get('oa_capacity_pct_of_cd');
  if (oaCap) caps.push({ mw: (cdMw * oaCap.value) / 100, label: `${oaCap.value}% of contract demand${src(oaCap)}` });
  const totCap = get('re_total_capacity_pct_of_cd');
  if (totCap) caps.push({ mw: Math.max(0, (cdMw * totCap.value) / 100 - i.rooftopKwp / 1000), label: `${totCap.value}% of contract demand less ${i.rooftopKwp} kWp rooftop${src(totCap)}` });
  const binding = caps.sort((a, b) => a.mw - b.mw)[0] ?? null;
  if (binding && i.proposedOaMw > binding.mw + 1e-9) f.push({ severity: 'block', check: 'Capacity', message: `Proposed ${i.proposedOaMw} MW exceeds the ${binding.mw.toFixed(2)} MW allowed (${binding.label}).` });
  if (!caps.length) f.push({ severity: 'warning', check: 'Capacity', message: `No capacity limit is recorded for ${i.state} ${i.structure.replace('_', ' ')}. Do not assume there is none — record the state rule before finalising the capacity.` });
  if (i.proposedOaMw > cdMw * 1.5) f.push({ severity: 'warning', check: 'Capacity', message: `Proposed ${i.proposedOaMw} MW is ${((i.proposedOaMw / Math.max(1e-9, cdMw)) * 100).toFixed(0)}% of contract demand — solar peaks will far exceed the load; most of it would be surplus.` });

  // 3. Energy: physical use versus surplus, by month, then banking.
  const cons = i.monthlyConsumptionKwh, oa = i.oaMonthlyKwh, rt = i.rooftopMonthlyKwh;
  const monthly = MONTHS.map((_, m) => { const surplus = Math.max(0, oa[m] + rt[m] - cons[m]); return { month: m, consumption: cons[m], oa: oa[m], rooftop: rt[m], surplus }; });
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const consumptionKwh = sum(cons), oaKwh = sum(oa), rooftopKwh = sum(rt), surplusKwh = sum(monthly.map((m) => m.surplus));
  // Within each hour solar can exceed the load even when the month balances: show the share that needs banking.
  let hourlySurplusShare: number | null = null;
  if (i.hourlyLoadShape && i.oaHourlyShape) {
    let sur = 0, tot = 0;
    for (const m of monthly) for (let h = 0; h < 24; h++) { const l = m.consumption * i.hourlyLoadShape[h], s = m.oa * i.oaHourlyShape[h] + (m.rooftop * i.oaHourlyShape[h]); sur += Math.max(0, s - l); tot += s; }
    hourlySurplusShare = tot > 0 ? sur / tot : 0;
  }
  const bankAllowed = get('banking_allowed', i.structure);
  const bankCap = get('banking_cap_pct_of_consumption');
  const bankCharge = get('banking_charge_pct');
  let bankable: number | null = null, lapsed: number | null = null;
  const needsBanking = surplusKwh > 0 || (hourlySurplusShare ?? 0) > 0;
  if (needsBanking) {
    const timeSurplus = hourlySurplusShare != null ? hourlySurplusShare * (oaKwh + rooftopKwh) : surplusKwh;
    if (bankAllowed && bankAllowed.value === 0) { bankable = 0; lapsed = timeSurplus; f.push({ severity: 'block', check: 'Banking', message: `About ${(timeSurplus / 1000).toFixed(0)} MWh a year arrives when the plant needs no power, but banking is not allowed for this structure — that energy is lost to the consumer.${src(bankAllowed)}` }); }
    else if (bankCap) { bankable = Math.min(timeSurplus, monthly.reduce((a, m) => a + (m.consumption * bankCap.value) / 100, 0)); lapsed = timeSurplus - bankable; if (lapsed > 0) f.push({ severity: 'warning', check: 'Banking', message: `${(lapsed / 1000).toFixed(0)} MWh a year exceeds the banking limit of ${bankCap.value}% of consumption.${src(bankCap)}` }); }
    else f.push({ severity: 'warning', check: 'Banking', message: `About ${(timeSurplus / 1000).toFixed(0)} MWh a year (${(((hourlySurplusShare ?? surplusKwh / Math.max(1, oaKwh + rooftopKwh))) * 100).toFixed(0)}% of the solar energy) arrives when the consumer is not using it. The banking rules for ${i.state} are not recorded — the offer depends on them.` });
    if (bankCharge) f.push({ severity: 'info', check: 'Banking', message: `Banking charge ${bankCharge.value}% of banked energy applies.${src(bankCharge)}` });
  }
  if (surplusKwh > 0) f.push({ severity: 'warning', check: 'Energy', message: `In ${monthly.filter((m) => m.surplus > 0).map((m) => MONTHS[m.month]).join(', ')} the solar supply exceeds the month’s consumption by ${(surplusKwh / 1000).toFixed(0)} MWh in total.` });
  const reShare = consumptionKwh > 0 ? Math.min(1, (oaKwh + rooftopKwh - (lapsed ?? 0)) / consumptionKwh) : 0;

  // 4. Captive tests.
  if (i.structure !== 'third_party') {
    const own = get('captive_min_ownership_pct'), use = get('captive_min_consumption_pct');
    if (own && i.ownershipPct != null && i.ownershipPct < own.value) f.push({ severity: 'block', check: 'Captive', message: `Captive users hold ${i.ownershipPct}% of the equity; at least ${own.value}% is required.${src(own)}` });
    if (use && i.plantConsumptionSharePct != null && i.plantConsumptionSharePct < use.value) f.push({ severity: 'block', check: 'Captive', message: `Captive users consume ${i.plantConsumptionSharePct}% of the plant’s generation; at least ${use.value}% is required, verified every year. If the test fails, cross-subsidy and additional surcharge become payable for the whole year.${src(use)}` });
    if (i.ownershipPct == null || i.plantConsumptionSharePct == null) f.push({ severity: 'warning', check: 'Captive', message: 'Enter the captive users’ collective ownership and consumption share to test captive status.' });
    if (own?.note) f.push({ severity: 'info', check: 'Captive', message: own.note });
  }

  // 5. Rooftop.
  const nmKw = get('net_metering_cap_kw', 'rooftop'), nmPct = get('net_metering_pct_of_load', 'rooftop');
  const load = i.sanctionedLoadKw ?? cdKw;
  const limits = [nmKw ? nmKw.value : Infinity, nmPct ? (load * nmPct.value) / 100 : Infinity];
  const nmLimit = Number.isFinite(Math.min(...limits)) ? Math.min(...limits) : null;
  const within = nmLimit == null ? null : i.rooftopKwp <= nmLimit;
  const arrangement = i.rooftopKwp === 0 ? 'No rooftop' : within == null ? 'Unknown — record the state net-metering rule' : within ? 'Net metering' : 'Gross metering or net billing (above the net-metering ceiling)';
  if (i.rooftopKwp > 0 && within === false) f.push({ severity: 'warning', check: 'Rooftop', message: `${i.rooftopKwp} kWp rooftop exceeds the net-metering ceiling of ${nmLimit!.toFixed(0)} kW: the excess is settled by gross metering or net billing at the State Commission’s rate, not at the retail tariff.${src(nmKw)}` });
  if (i.rooftopKwp > load) f.push({ severity: 'warning', check: 'Rooftop', message: `Rooftop ${i.rooftopKwp} kWp is above the sanctioned load of ${load.toFixed(0)} kW.` });

  return {
    findings: f, maxOaMwByRules: binding ? binding.mw : null, maxOaMwBindingRule: binding?.label ?? null,
    annual: { consumptionKwh, oaKwh, rooftopKwh, reShare, surplusKwh, bankableKwh: bankable, lapsedKwh: lapsed },
    monthly, hourlySurplusShare, rooftop: { netMeteringLimitKw: nmLimit, withinNetMetering: within, arrangement }, unknownRules: [...new Set(unknown)], ok: !f.some((x) => x.severity === 'block'),
  };
}

/** Largest OA capacity that keeps solar within the consumer's use: physical limit from hourly shapes (no banking assumed). */
export function maxOaWithoutSurplus(annualConsumptionKwh: number, loadShape: number[], solarShapePerMw: number[], solarKwhPerMwYear: number) {
  // Daily solar per MW by hour vs daily load by hour; the binding hour gives the MW at which solar first exceeds the load.
  const dailyLoad = annualConsumptionKwh / 365, dailySolarPerMw = solarKwhPerMwYear / 365;
  let mw = Infinity;
  for (let h = 0; h < 24; h++) if (solarShapePerMw[h] > 0) mw = Math.min(mw, (dailyLoad * loadShape[h]) / (dailySolarPerMw * solarShapePerMw[h]));
  return Number.isFinite(mw) ? mw : 0;
}
