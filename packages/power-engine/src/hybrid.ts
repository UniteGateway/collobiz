/**
 * Unite Hybrid Power Lab — hourly solar + wind + BESS dispatch with charging-source accounting.
 *
 * Each day (24 hourly intervals) is a mixed-integer programme solved with HiGHS (MIT). Variables per hour t (MW ≥ 0):
 *   sD/wD   solar / wind → contracted load        sC/wC/gC  solar / wind / grid → battery
 *   sX/wX   solar / wind → merchant export        sK/wK     curtailed solar / wind
 *   bDr/bDg battery → load, from the renewable / grid-charged pool
 *   bXr/bXg battery → merchant export, from each pool
 *   gF      external balancing power delivered to the buyer (only if the contract permits it)
 *   uns     contracted demand not delivered       socR/socG renewable / grid-charged stored energy (MWh)
 *   y       binary: 1 = battery may charge this hour, 0 = may discharge (never both)
 * Constraints:
 *   solar   sD + sC + sX + sK = S_t        (DC-coupled: = S_t + clipped_t, with sD + sX ≤ S_t — clipped DC energy can only charge)
 *   wind    wD + wC + wX + wK = W_t
 *   load    sD + wD + bDr + bDg + gF + uns = L_t
 *   export  sD + wD + sX + wX + bDr + bDg + bXr + bXg ≤ E_t      import  gC ≤ I_t (0 outside permitted hours)
 *   power   sC + wC + gC ≤ P·y,   bDr + bDg + bXr + bXg ≤ P·(1 − y)
 *   SOC     socR' = socR + ηc(sC + wC) − (bDr + bXr)/ηd,   socG' = socG + ηc·gC − (bDg + bXg)/ηd
 *           max(min, reserve)·Cap ≤ socR + socG ≤ max·Cap,   Σ discharge ≤ cycles/day × usable
 * Grid-charged energy can only leave the battery as grid-charged energy, so renewable claims are traceable. Auxiliary load of
 * the BESS (HVAC, controls) is a separate import at the grid price. Every solved hour is checked for all of the above.
 */
import type { Highs } from 'highs';
import { DEFAULT_PLANT, type PlantConfig } from './config';
import { solver } from './dispatch';
import { simulateSolarYear, type WeatherScenario } from './solar';
import { DEFAULT_WIND, ILLUSTRATIVE_SOUTH_INDIA_WIND, hoursInYear, monthOfHour, simulateWindYear, type WindConfig, type WindResource, type WindYear } from './wind';

export const PRODUCTS = {
  solar_hours: { label: 'Solar-hour supply (8 AM–5 PM)', from: 8, to: 17 },
  daytime: { label: 'Daytime supply (6 AM–6 PM)', from: 6, to: 18 },
  evening_peak: { label: 'Evening peak supply', from: 18, to: 22 },
  night: { label: 'Night-time supply (10 PM–6 AM)', from: 22, to: 6 },
  six_to_ten: { label: '6 AM–10 PM supply', from: 6, to: 22 },
  sixteen_hour: { label: '16-hour firm supply', from: 6, to: 22 },
  rtc: { label: '24-hour round-the-clock (RTC)', from: 0, to: 24 },
  custom: { label: 'Custom time-of-day delivery', from: 0, to: 0 },
} as const;
export type ProductKind = keyof typeof PRODUCTS;
export const hoursMask = (from: number, to: number) => Array.from({ length: 24 }, (_, h) => (from <= to ? h >= from && h < to : h >= from || h < to));

export type Objective = 'max_profit' | 'max_compliance' | 'max_peak_revenue' | 'min_curtailment' | 'balanced';
export const OBJECTIVES: Record<Objective, string> = {
  max_profit: 'Maximum annual project profit', max_compliance: 'Maximum PPA delivery compliance', max_peak_revenue: 'Maximum peak-period revenue',
  min_curtailment: 'Minimum curtailment', balanced: 'Balanced (compliance first, then profit)',
};

export interface HybridBess {
  powerMw: number; energyMwh: number; chargeEff: number; dischargeEff: number;
  minSoc: number; maxSoc: number; reserveSoc: number; initialSoc: number; auxMw: number; maxCyclesPerDay: number;
  coupling: 'ac' | 'dc'; allowSolar: boolean; allowWind: boolean;
  grid: 'no' | 'yes' | 'conditional'; gridChargeHours: boolean[];
  fadePerYear: number; fadePerCycle: number; augmentationThreshold: number;
}
export interface HybridScenario {
  name: string; illustrative: boolean; year: number;
  state: string; destinationState: string; structure: 'third_party' | 'captive' | 'group_captive' | 'green_open_access';
  solar: { acMw: number; dcMwp: number; tracker: boolean; weather: WeatherScenario };
  wind: WindConfig & { resource: WindResource; series?: number[]; monthFactor?: number[] };
  bess: HybridBess;
  grid: { exportMw: number; importMw: number; voltageKv: number; customVoltage: boolean; lineKm: number; transformerMva: number; outageDays?: number[] };
  product: { kind: ProductKind; contractedMw: number; hours: boolean[]; months: boolean[]; allowedShortfall: number; externalBalancing: boolean };
  prices: { ppaRsKwh: number; peakRsKwh: number; peakHours: boolean[]; merchantRsKwh: number[]; gridChargeRsKwh: number[]; balancingRsKwh: number; degradationRsKwh: number; shortfallPenaltyRsKwh: number; exportAllowed: boolean; escalation: number };
  objective: Objective;
  land: { availableAcres: number; solarAcresPerMwp: number; windPadAcresPerTurbine: number; windSpacingAcresPerMw: number; bessAcresPerMwh: number; substationAcres: number; coLocated: boolean };
  finance: HybridFinanceInputs;
}

export interface HybridFinanceInputs {
  solarCapexCrPerMwp: number; windCapexCrPerMw: number; bessCapexCrPerMw: number; bessCapexCrPerMwh: number; gridCapexCr: number; landCrPerAcre: number; devCostCr: number; contingency: number;
  solarOmCrPerMwYr: number; windOmCrPerMwYr: number; bessOmCrPerMwhYr: number; omEscalation: number; insurancePct: number;
  augmentationCrPerMwh: number; debtShare: number; interestRate: number; tenorYears: number; discountRate: number; equityDiscountRate: number; taxRate: number; years: number;
  provenance: 'illustrative' | 'quotation' | 'actual';
}

const h24 = (v: number) => Array.from({ length: 24 }, () => v);
const peakEvening = hoursMask(18, 22);
/** Illustrative defaults — orders of magnitude for screening only; every value is editable and labelled. */
export const ILLUSTRATIVE_FINANCE: HybridFinanceInputs = {
  solarCapexCrPerMwp: 3.6, windCapexCrPerMw: 6.8, bessCapexCrPerMw: 0.5, bessCapexCrPerMwh: 1.5, gridCapexCr: 25, landCrPerAcre: 0.05, devCostCr: 6, contingency: 0.04,
  solarOmCrPerMwYr: 0.045, windOmCrPerMwYr: 0.09, bessOmCrPerMwhYr: 0.01, omEscalation: 0.05, insurancePct: 0.003,
  augmentationCrPerMwh: 0.9, debtShare: 0.7, interestRate: 0.095, tenorYears: 15, discountRate: 0.1, equityDiscountRate: 0.14, taxRate: 0.25, years: 25, provenance: 'illustrative',
};
export function baseScenario(over: Partial<HybridScenario> = {}): HybridScenario {
  return {
    name: 'Hybrid scenario', illustrative: true, year: 2027, state: 'AP', destinationState: 'AP', structure: 'third_party',
    solar: { acMw: 40, dcMwp: 52, tracker: false, weather: 'typical' },
    wind: { ...DEFAULT_WIND, capacityMw: 0, resource: ILLUSTRATIVE_SOUTH_INDIA_WIND },
    bess: { powerMw: 20, energyMwh: 80, chargeEff: 0.94, dischargeEff: 0.94, minSoc: 0.1, maxSoc: 0.95, reserveSoc: 0.1, initialSoc: 0.3, auxMw: 0.1, maxCyclesPerDay: 1.5, coupling: 'ac', allowSolar: true, allowWind: true, grid: 'no', gridChargeHours: hoursMask(0, 6), fadePerYear: 0.015, fadePerCycle: 0.00004, augmentationThreshold: 0.8 },
    grid: { exportMw: 40, importMw: 20, voltageKv: 132, customVoltage: false, lineKm: 15, transformerMva: 50 },
    product: { kind: 'six_to_ten', contractedMw: 15, hours: hoursMask(6, 22), months: Array(12).fill(true), allowedShortfall: 0.05, externalBalancing: false },
    prices: { ppaRsKwh: 4.2, peakRsKwh: 6.5, peakHours: peakEvening, merchantRsKwh: h24(3.5).map((v, h) => (h >= 18 && h < 23 ? 7 : h >= 10 && h < 16 ? 2.6 : v)), gridChargeRsKwh: h24(4.5), balancingRsKwh: 9, degradationRsKwh: 0.6, shortfallPenaltyRsKwh: 1.5, exportAllowed: true, escalation: 0 },
    objective: 'balanced',
    land: { availableAcres: 400, solarAcresPerMwp: 4.5, windPadAcresPerTurbine: 1.5, windSpacingAcresPerMw: 35, bessAcresPerMwh: 0.02, substationAcres: 5, coLocated: true },
    finance: ILLUSTRATIVE_FINANCE,
    ...over,
  };
}

// ---------------------------------------------------------------------------------------------------------- inputs
export interface HybridInputs { solarMw: number[]; solarClipMw: number[]; windMw: number[]; loadMw: number[]; exportMw: number[]; H: number; solarMwh: number; windMwh: number; solarSource: string; windSource: string; windYear: WindYear | null }
/** Builds the hourly series for a scenario: solar from the physics model, wind from site data or the labelled synthetic model. */
export function hybridInputs(sc: HybridScenario): HybridInputs {
  const H = hoursInYear(sc.year);
  let solarMw = new Array(H).fill(0), solarClipMw = new Array(H).fill(0);
  if (sc.solar.acMw > 0) {
    const p: PlantConfig = { ...DEFAULT_PLANT, solar: { ...DEFAULT_PLANT.solar, acMw: sc.solar.acMw, dcMwp: sc.solar.dcMwp } };
    const y = simulateSolarYear(p, { scenario: sc.solar.weather });
    const gain = sc.solar.tracker ? 1.15 : 1; // single-axis tracker energy gain — illustrative screening factor
    const hourly: number[] = [], clip: number[] = [];
    for (let i = 0; i < y.intervals.length; i += 4) {
      let a = 0, c = 0; for (let j = 0; j < 4; j++) { a += y.intervals[i + j].acMw; c += y.intervals[i + j].clippedMw; }
      hourly.push(Math.min(sc.solar.acMw, (a / 4) * gain)); clip.push(c / 4);
    }
    if (H === 8784) { hourly.splice(59 * 24, 0, ...hourly.slice(58 * 24, 59 * 24)); clip.splice(59 * 24, 0, ...clip.slice(58 * 24, 59 * 24)); } // 29 Feb repeats 28 Feb
    solarMw = hourly; solarClipMw = clip;
  }
  let windYear: WindYear | null = null, windMw = new Array(H).fill(0);
  if (sc.wind.capacityMw > 0) {
    windYear = sc.wind.series ? { ...simulateWindYear(sc.wind, sc.wind.resource, { year: sc.year }), mw: sc.wind.series } : simulateWindYear(sc.wind, sc.wind.resource, { year: sc.year, monthFactor: sc.wind.monthFactor });
    windMw = windYear.mw;
  }
  const out = new Set(sc.grid.outageDays ?? []);
  const loadMw = Array.from({ length: H }, (_, t) => (sc.product.hours[t % 24] && sc.product.months[monthOfHour(t, sc.year)] ? sc.product.contractedMw : 0));
  const exportMw = Array.from({ length: H }, (_, t) => (out.has(Math.floor(t / 24)) ? 0 : sc.grid.exportMw));
  return { solarMw, solarClipMw, windMw, loadMw, exportMw, H, solarMwh: solarMw.reduce((a, x) => a + x, 0), windMwh: windMw.reduce((a, x) => a + x, 0),
    solarSource: 'Physics model on the illustrative AP climate (PVGIS/NASA POWER not reachable from this environment)', windSource: sc.wind.capacityMw > 0 ? (windYear?.source ?? '') : '—', windYear };
}

// ---------------------------------------------------------------------------------------------------------- one day
export interface HybridHour {
  t: number; S: number; W: number; L: number;
  sD: number; wD: number; bDr: number; bDg: number; gF: number; uns: number;
  sC: number; wC: number; gC: number; sX: number; wX: number; bXr: number; bXg: number; sK: number; wK: number;
  socR: number; socG: number;
}
export interface HybridDay { day: number; hours: HybridHour[]; status: string; objective: number }

const F = (x: number) => (Math.abs(x) < 1e-12 ? '0' : x.toFixed(6));
/**
 * Objective weights. Contracted energy may not be diverted to the merchant market, so in every mode the dispatch penalty on
 * unserved demand exceeds the best merchant price; the contractual penalty actually payable is reported separately.
 */
function weights(sc: HybridScenario) {
  const pr = sc.prices, floor = Math.max(...pr.merchantRsKwh) + 0.5;
  switch (sc.objective) {
    case 'max_compliance': return { pen: 100, curt: 0.01, profit: 0.01 };
    case 'min_curtailment': return { pen: Math.max(floor, pr.shortfallPenaltyRsKwh), curt: 3, profit: 1 };
    case 'balanced': return { pen: Math.max(20, 2 * pr.peakRsKwh, floor), curt: 0.01, profit: 1 };
    default: return { pen: Math.max(floor, pr.shortfallPenaltyRsKwh), curt: 0.01, profit: 1 };
  }
}
/** CPLEX-LP text for one day. Objective in ₹ (MW × 1 h × 1000 = kWh). */
export function buildHybridDayLp(sc: HybridScenario, d: { S: number[]; C: number[]; W: number[]; L: number[]; E: number[] }, socR0: number, socG0: number, capMwh: number, bessUp: boolean, carryNeed: number) {
  const b = sc.bess, pr = sc.prices, w = weights(sc), k = 1000;
  const P = bessUp ? b.powerMw : 0;
  const lo = capMwh * Math.max(b.minSoc, b.reserveSoc), hi = capMwh * b.maxSoc;
  const obj: string[] = [], cons: string[] = [], bounds: string[] = [], bins: string[] = [];
  const add = (c: number, v: string) => { if (Math.abs(c) > 1e-12) obj.push(`${c >= 0 ? '+' : '-'} ${F(Math.abs(c))} ${v}`); };
  const peakBonus = sc.objective === 'max_peak_revenue' ? 1.0 : 0; // extra weight on peak deliveries; profit is reported at real prices
  for (let t = 0; t < 24; t++) {
    const tariff = pr.peakHours[t] ? pr.peakRsKwh : pr.ppaRsKwh;
    const m = pr.merchantRsKwh[t], g = pr.gridChargeRsKwh[t];
    for (const v of ['sD', 'wD']) add(k * w.profit * tariff, `${v}${t}`);
    add(k * (w.profit * (tariff + (pr.peakHours[t] ? peakBonus : 0)) - pr.degradationRsKwh), `bDr${t}`);
    add(k * (w.profit * tariff - pr.degradationRsKwh), `bDg${t}`);
    add(k * w.profit * (tariff - pr.balancingRsKwh), `gF${t}`);
    for (const v of ['sX', 'wX']) add(k * w.profit * m, `${v}${t}`);
    for (const v of ['bXr', 'bXg']) add(k * (w.profit * m - pr.degradationRsKwh), `${v}${t}`);
    add(-k * w.profit * g, `gC${t}`);
    add(-k * w.pen, `uns${t}`);
    add(-k * w.curt, `sK${t}`); add(-k * w.curt, `wK${t}`);
    // Constraints.
    const dc = b.coupling === 'dc';
    cons.push(` s${t}: sD${t} + sC${t} + sX${t} + sK${t} = ${F(d.S[t] + (dc ? d.C[t] : 0))}`);
    if (dc) cons.push(` sa${t}: sD${t} + sX${t} <= ${F(d.S[t])}`);
    cons.push(` w${t}: wD${t} + wC${t} + wX${t} + wK${t} = ${F(d.W[t])}`);
    cons.push(` l${t}: sD${t} + wD${t} + bDr${t} + bDg${t} + gF${t} + uns${t} = ${F(d.L[t])}`);
    cons.push(` x${t}: sD${t} + wD${t} + sX${t} + wX${t} + bDr${t} + bDg${t} + bXr${t} + bXg${t} <= ${F(d.E[t])}`);
    cons.push(` pc${t}: sC${t} + wC${t} + gC${t} - ${F(P)} y${t} <= 0`);
    cons.push(` pd${t}: bDr${t} + bDg${t} + bXr${t} + bXg${t} + ${F(P)} y${t} <= ${F(P)}`);
    const prevR = t === 0 ? null : `socR${t - 1}`, prevG = t === 0 ? null : `socG${t - 1}`;
    cons.push(` br${t}: socR${t}${prevR ? ` - ${prevR}` : ''} - ${F(b.chargeEff)} sC${t} - ${F(b.chargeEff)} wC${t} + ${F(1 / b.dischargeEff)} bDr${t} + ${F(1 / b.dischargeEff)} bXr${t} = ${F(t === 0 ? socR0 : 0)}`);
    cons.push(` bg${t}: socG${t}${prevG ? ` - ${prevG}` : ''} - ${F(b.chargeEff)} gC${t} + ${F(1 / b.dischargeEff)} bDg${t} + ${F(1 / b.dischargeEff)} bXg${t} = ${F(t === 0 ? socG0 : 0)}`);
    cons.push(` sl${t}: socR${t} + socG${t} >= ${F(Math.min(lo, socR0 + socG0))}`);
    cons.push(` sh${t}: socR${t} + socG${t} <= ${F(hi)}`);
    const gridOk = b.grid !== 'no' && b.gridChargeHours[t];
    bounds.push(` 0 <= gC${t} <= ${F(gridOk ? Math.min(sc.grid.importMw, P) : 0)}`);
    if (!b.allowSolar) bounds.push(` sC${t} = 0`);
    if (!b.allowWind) bounds.push(` wC${t} = 0`);
    if (!sc.prices.exportAllowed) for (const v of ['sX', 'wX', 'bXr', 'bXg']) bounds.push(` ${v}${t} = 0`);
    if (!sc.product.externalBalancing) bounds.push(` gF${t} = 0`);
    bounds.push(` 0 <= y${t} <= 1`); bins.push(`y${t}`);
  }
  const usable = capMwh * (b.maxSoc - Math.max(b.minSoc, b.reserveSoc));
  if (P > 0) cons.push(` cyc: ${Array.from({ length: 24 }, (_, t) => `bDr${t} + bDg${t} + bXr${t} + bXg${t}`).join(' + ')} <= ${F(b.maxCyclesPerDay * usable)}`);
  // Stored renewable energy is worth serving tomorrow's pre-dawn demand, up to that need — slightly less than serving today.
  if (carryNeed > 1e-6 && P > 0) {
    obj.push(`+ ${F(k * Math.max(w.pen, w.profit * sc.prices.peakRsKwh) * b.dischargeEff * 0.98)} carry`);
    cons.push(` cr: carry - socR23 - socG23 <= ${F(-lo)}`);
    bounds.push(` 0 <= carry <= ${F(carryNeed / b.dischargeEff)}`);
  }
  return `Maximize\n obj: ${obj.join(' ')}\nSubject To\n${cons.join('\n')}\nBounds\n${bounds.join('\n')}\nBinaries\n ${bins.join(' ')}\nEnd`;
}

const TOL = 1e-4;
/** Throws on any broken balance, limit, SOC step or simultaneous charge/discharge. */
export function checkHybridHour(sc: HybridScenario, h: HybridHour, prevR: number, prevG: number, capMwh: number, E: number, clip: number, P: number) {
  const b = sc.bess, bad = (m: string) => { throw new Error(`Hybrid dispatch check failed at hour ${h.t}: ${m}`); };
  const sAvail = h.S + (b.coupling === 'dc' ? clip : 0);
  if (Math.abs(sAvail - (h.sD + h.sC + h.sX + h.sK)) > TOL) bad('solar balance');
  if (Math.abs(h.W - (h.wD + h.wC + h.wX + h.wK)) > TOL) bad('wind balance');
  if (Math.abs(h.L - (h.sD + h.wD + h.bDr + h.bDg + h.gF + h.uns)) > TOL) bad('load balance');
  if (h.sD + h.wD + h.sX + h.wX + h.bDr + h.bDg + h.bXr + h.bXg > E + TOL) bad('export limit');
  if (h.gC > sc.grid.importMw + TOL) bad('import limit');
  const ch = h.sC + h.wC + h.gC, dis = h.bDr + h.bDg + h.bXr + h.bXg;
  if (ch > P + TOL || dis > P + TOL) bad('battery power');
  if (ch > TOL && dis > TOL) bad('simultaneous charge and discharge');
  if (Math.abs(prevR + b.chargeEff * (h.sC + h.wC) - (h.bDr + h.bXr) / b.dischargeEff - h.socR) > 1e-3) bad('renewable SOC step');
  if (Math.abs(prevG + b.chargeEff * h.gC - (h.bDg + h.bXg) / b.dischargeEff - h.socG) > 1e-3) bad('grid-charged SOC step');
  if (h.socR + h.socG > capMwh * b.maxSoc + 1e-3) bad('SOC above maximum');
  if (h.socR < -1e-3 || h.socG < -1e-3) bad('negative SOC pool');
  for (const v of [h.sD, h.wD, h.bDr, h.bDg, h.gF, h.uns, h.sC, h.wC, h.gC, h.sX, h.wX, h.bXr, h.bXg, h.sK, h.wK]) if (v < -TOL) bad('negative flow');
}

const NAMES = ['sD', 'wD', 'bDr', 'bDg', 'gF', 'uns', 'sC', 'wC', 'gC', 'sX', 'wX', 'bXr', 'bXg', 'sK', 'wK'] as const;
export async function dispatchHybridDay(hs: Highs, sc: HybridScenario, x: HybridInputs, day: number, socR0: number, socG0: number, capMwh: number, bessDownDays = new Set<number>()): Promise<HybridDay> {
  const o = day * 24, sl = (a: number[]) => a.slice(o, o + 24);
  const d = { S: sl(x.solarMw), C: sl(x.solarClipMw), W: sl(x.windMw), L: sl(x.loadMw), E: sl(x.exportMw) };
  // Energy tomorrow needs from storage before renewables first cover the load.
  let need = 0;
  if (o + 24 < x.H) for (let t = o + 24; t < o + 48; t++) { const re = x.solarMw[t] + x.windMw[t]; if (x.loadMw[t] > 0 && re >= x.loadMw[t]) break; need += Math.max(0, x.loadMw[t] - re); }
  const up = !bessDownDays.has(day) && sc.bess.powerMw > 0 && capMwh > 0;
  const r = hs.solve(buildHybridDayLp(sc, d, socR0, socG0, capMwh, up, need), { presolve: 'on', mip_rel_gap: 1e-4, time_limit: 20 } as never);
  if (r.Status !== 'Optimal') throw new Error(`Hybrid solver day ${day}: ${r.Status}`);
  const cols = r.Columns as Record<string, { Primal: number }>;
  const v = (n: string) => Math.max(0, cols[n]?.Primal ?? 0);
  const hours: HybridHour[] = [];
  let pr = socR0, pg = socG0;
  for (let t = 0; t < 24; t++) {
    const h = { t: o + t, S: d.S[t], W: d.W[t], L: d.L[t], socR: cols[`socR${t}`].Primal, socG: cols[`socG${t}`].Primal } as HybridHour;
    for (const n of NAMES) (h as unknown as Record<string, number>)[n] = v(`${n}${t}`);
    if (h.sC + h.wC + h.gC < 1e-7) { h.sC = 0; h.wC = 0; h.gC = 0; }
    if (h.bDr + h.bDg + h.bXr + h.bXg < 1e-7) { h.bDr = 0; h.bDg = 0; h.bXr = 0; h.bXg = 0; }
    checkHybridHour(sc, h, pr, pg, capMwh, d.E[t], d.C[t], up ? sc.bess.powerMw : 0);
    pr = h.socR; pg = h.socG;
    hours.push(h);
  }
  return { day, hours, status: r.Status, objective: r.ObjectiveValue };
}

// ---------------------------------------------------------------------------------------------------------- year
export interface HybridRunOptions { days?: number[]; bessDownDays?: number[]; onProgress?: (done: number, total: number) => void }
export interface HybridResult { scenario: HybridScenario; inputs: HybridInputs; days: HybridDay[]; summary: HybridSummary; compliance: Compliance; computedMs: number; screening: boolean }

export async function simulateHybrid(sc: HybridScenario, o: HybridRunOptions = {}): Promise<HybridResult> {
  const t0 = Date.now();
  const x = hybridInputs(sc);
  const hs = await solver();
  const all = Array.from({ length: x.H / 24 }, (_, i) => i);
  const days = o.days ?? all;
  const cap = sc.bess.energyMwh;
  const down = new Set(o.bessDownDays ?? []);
  let socR = cap * sc.bess.initialSoc, socG = 0;
  const out: HybridDay[] = [];
  let prevDay = -2;
  for (const [i, day] of days.entries()) {
    if (day !== prevDay + 1) { socR = cap * sc.bess.initialSoc; socG = 0; } // screening days are independent
    const r = await dispatchHybridDay(hs, sc, x, day, socR, socG, cap, down);
    socR = r.hours[23].socR; socG = r.hours[23].socG; prevDay = day;
    out.push(r);
    o.onProgress?.(i + 1, days.length);
  }
  const summary = summarizeHybrid(sc, out);
  return { scenario: sc, inputs: x, days: out, summary, compliance: compliance(sc, out, summary), computedMs: Date.now() - t0, screening: days.length !== all.length };
}

/** Representative screening days: the 3rd, 13th and 23rd of every month (36 days) plus the year's 6 lowest-resource days. */
export function screeningDays(sc: HybridScenario) {
  const x = hybridInputs(sc), D = x.H / 24;
  const daily = Array.from({ length: D }, (_, d) => { let e = 0; for (let t = d * 24; t < d * 24 + 24; t++) e += x.solarMw[t] + x.windMw[t]; return { d, e }; });
  const set = new Set<number>();
  for (let m = 0; m < 12; m++) for (const dom of [2, 12, 22]) { const doy = Array.from({ length: m }, (_, i) => [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i]).reduce((a, b) => a + b, 0) + dom; set.add(Math.min(D - 1, doy)); }
  daily.sort((a, b) => a.e - b.e).slice(0, 6).forEach((x) => set.add(x.d));
  return [...set].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------------------------------------- results
export interface HybridSummary {
  hours: number; solarMwh: number; windMwh: number; generationMwh: number;
  directSolarMwh: number; directWindMwh: number; batteryRenewableToLoadMwh: number; batteryGridToLoadMwh: number; balancingMwh: number;
  deliveredMwh: number; renewableDeliveredMwh: number; demandMwh: number; shortfallMwh: number;
  chargeSolarMwh: number; chargeWindMwh: number; chargeGridMwh: number; dischargeMwh: number; batteryLossMwh: number; auxMwh: number;
  exportMwh: number; curtailSolarMwh: number; curtailWindMwh: number; peakDeliveredMwh: number; offPeakDeliveredMwh: number;
  equivalentCycles: number;
  revenue: { ppa: number; peak: number; merchant: number; gridChargeCost: number; balancingCost: number; auxCost: number; penalties: number; net: number };
  monthly: { solar: number; wind: number; delivered: number; demand: number; shortfall: number; curtailed: number }[];
  solverDays: number; nonOptimalDays: number;
}
export function summarizeHybrid(sc: HybridScenario, days: HybridDay[]): HybridSummary {
  const s = { solarMwh: 0, windMwh: 0, directSolarMwh: 0, directWindMwh: 0, batteryRenewableToLoadMwh: 0, batteryGridToLoadMwh: 0, balancingMwh: 0, demandMwh: 0, shortfallMwh: 0, chargeSolarMwh: 0, chargeWindMwh: 0, chargeGridMwh: 0, dischargeMwh: 0, exportMwh: 0, curtailSolarMwh: 0, curtailWindMwh: 0, peakDeliveredMwh: 0, offPeakDeliveredMwh: 0 };
  const rev = { ppa: 0, peak: 0, merchant: 0, gridChargeCost: 0, balancingCost: 0, auxCost: 0, penalties: 0, net: 0 };
  const monthly = Array.from({ length: 12 }, () => ({ solar: 0, wind: 0, delivered: 0, demand: 0, shortfall: 0, curtailed: 0 }));
  const pr = sc.prices, k = 1000;
  let n = 0;
  for (const d of days) for (const h of d.hours) {
    n++;
    const m = monthOfHour(h.t, sc.year), hod = h.t % 24, peak = pr.peakHours[hod];
    const toLoad = h.sD + h.wD + h.bDr + h.bDg + h.gF, dis = h.bDr + h.bDg + h.bXr + h.bXg;
    s.solarMwh += h.S; s.windMwh += h.W; s.directSolarMwh += h.sD; s.directWindMwh += h.wD; s.batteryRenewableToLoadMwh += h.bDr; s.batteryGridToLoadMwh += h.bDg; s.balancingMwh += h.gF;
    s.demandMwh += h.L; s.shortfallMwh += h.uns; s.chargeSolarMwh += h.sC; s.chargeWindMwh += h.wC; s.chargeGridMwh += h.gC; s.dischargeMwh += dis;
    s.exportMwh += h.sX + h.wX + h.bXr + h.bXg; s.curtailSolarMwh += h.sK; s.curtailWindMwh += h.wK;
    if (peak) s.peakDeliveredMwh += toLoad; else s.offPeakDeliveredMwh += toLoad;
    const tariff = peak ? pr.peakRsKwh : pr.ppaRsKwh;
    if (peak) rev.peak += toLoad * tariff * k; else rev.ppa += toLoad * tariff * k;
    rev.merchant += (h.sX + h.wX + h.bXr + h.bXg) * pr.merchantRsKwh[hod] * k;
    rev.gridChargeCost += h.gC * pr.gridChargeRsKwh[hod] * k;
    rev.balancingCost += h.gF * pr.balancingRsKwh * k;
    rev.auxCost += sc.bess.powerMw > 0 ? sc.bess.auxMw * pr.gridChargeRsKwh[hod] * k : 0;
    rev.penalties += h.uns * pr.shortfallPenaltyRsKwh * k;
    const mm = monthly[m]; mm.solar += h.S; mm.wind += h.W; mm.delivered += toLoad; mm.demand += h.L; mm.shortfall += h.uns; mm.curtailed += h.sK + h.wK;
  }
  rev.net = rev.ppa + rev.peak + rev.merchant - rev.gridChargeCost - rev.balancingCost - rev.auxCost - rev.penalties;
  const charged = s.chargeSolarMwh + s.chargeWindMwh + s.chargeGridMwh;
  const usable = sc.bess.energyMwh * (sc.bess.maxSoc - Math.max(sc.bess.minSoc, sc.bess.reserveSoc));
  const delivered = s.directSolarMwh + s.directWindMwh + s.batteryRenewableToLoadMwh + s.batteryGridToLoadMwh + s.balancingMwh;
  const first = days[0]?.hours[0], last = days[days.length - 1]?.hours[23];
  const storedChange = first && last ? last.socR + last.socG - (first.socR + first.socG) : 0; // approx for loss; exact loss uses ηc/ηd
  void storedChange;
  return {
    hours: n, ...s, generationMwh: s.solarMwh + s.windMwh, deliveredMwh: delivered, renewableDeliveredMwh: s.directSolarMwh + s.directWindMwh + s.batteryRenewableToLoadMwh,
    batteryLossMwh: charged * (1 - sc.bess.chargeEff) + s.dischargeMwh * (1 / sc.bess.dischargeEff - 1), auxMwh: sc.bess.powerMw > 0 ? sc.bess.auxMw * n : 0,
    equivalentCycles: usable > 0 ? s.dischargeMwh / sc.bess.dischargeEff / usable : 0, revenue: rev, monthly, solverDays: days.length, nonOptimalDays: days.filter((d) => d.status !== 'Optimal').length,
  };
}

// ---------------------------------------------------------------------------------------------------------- compliance
export type TechStatus = 'feasible' | 'feasible_with_conditions' | 'infeasible';
export interface Compliance {
  reliability: number; hoursWithDemand: number; hoursFullyServed: number; hoursFullyServedShare: number;
  monthlyFulfilment: number[]; worstMonth: number; worstDay: { day: number; shortfallMwh: number } | null;
  longestShortfallRunHours: number; largestShortfallEventMwh: number; indicativeExtraBessMwh: number;
  renewableShare: number; meetsAllowedShortfall: boolean; technical: TechStatus; reasons: string[];
}
/** Interval-level compliance. Annual energy totals never decide compliance on their own. */
export function compliance(sc: HybridScenario, days: HybridDay[], s: HybridSummary): Compliance {
  let hd = 0, served = 0, run = 0, best = 0, event = 0, bestEvent = 0;
  const dayShort = new Map<number, number>();
  for (const d of days) for (const h of d.hours) {
    if (h.L > 1e-9) { hd++; if (h.uns <= 1e-3) served++; }
    if (h.uns > 1e-3) { run++; event += h.uns; best = Math.max(best, run); bestEvent = Math.max(bestEvent, event); } else { run = 0; event = 0; }
    dayShort.set(d.day, (dayShort.get(d.day) ?? 0) + h.uns);
  }
  const monthlyFulfilment = s.monthly.map((m) => (m.demand > 0 ? (m.demand - m.shortfall) / m.demand : 1));
  const worstMonth = monthlyFulfilment.indexOf(Math.min(...monthlyFulfilment));
  const worst = [...dayShort.entries()].sort((a, b) => b[1] - a[1])[0];
  const reliability = s.demandMwh > 0 ? (s.demandMwh - s.shortfallMwh) / s.demandMwh : 1;
  const usableShare = sc.bess.maxSoc - Math.max(sc.bess.minSoc, sc.bess.reserveSoc);
  const reasons: string[] = [];
  const allowed = 1 - sc.product.allowedShortfall;
  const meets = reliability >= allowed - 1e-9;
  if (!meets) reasons.push(`Delivers ${(reliability * 100).toFixed(1)}% of contracted energy; the contract allows a shortfall of ${(sc.product.allowedShortfall * 100).toFixed(1)}% at most.`);
  if (Math.min(...monthlyFulfilment) < allowed) reasons.push(`Worst month delivers ${(Math.min(...monthlyFulfilment) * 100).toFixed(1)}% of its contracted energy.`);
  if (s.batteryGridToLoadMwh + s.balancingMwh > 0) reasons.push('Part of the delivered energy is grid-charged or external balancing power and is not renewable unless the contract and accounting allow it.');
  if (s.curtailSolarMwh + s.curtailWindMwh > 0.05 * s.generationMwh) reasons.push(`${(((s.curtailSolarMwh + s.curtailWindMwh) / Math.max(1, s.generationMwh)) * 100).toFixed(1)}% of generation is curtailed by the export limit or lack of storage.`);
  const technical: TechStatus = !meets ? 'infeasible' : reasons.length ? 'feasible_with_conditions' : 'feasible';
  return {
    reliability, hoursWithDemand: hd, hoursFullyServed: served, hoursFullyServedShare: hd ? served / hd : 1, monthlyFulfilment, worstMonth,
    worstDay: worst && worst[1] > 0 ? { day: worst[0], shortfallMwh: worst[1] } : null, longestShortfallRunHours: best, largestShortfallEventMwh: bestEvent,
    indicativeExtraBessMwh: usableShare > 0 ? bestEvent / sc.bess.dischargeEff / usableShare : 0,
    renewableShare: s.deliveredMwh > 0 ? s.renewableDeliveredMwh / s.deliveredMwh : 0, meetsAllowedShortfall: meets, technical, reasons,
  };
}

/** Energy conservation over the whole run: generation = direct + charge + export + curtail; storage change = in − out − losses. */
export function reconcile(r: HybridResult) {
  const s = r.summary, b = r.scenario.bess;
  let clip = 0; if (b.coupling === 'dc') for (const d of r.days) for (const h of d.hours) clip += r.inputs.solarClipMw[h.t];
  const gen = s.solarMwh + clip + s.windMwh;
  const used = s.directSolarMwh + s.directWindMwh + s.chargeSolarMwh + s.chargeWindMwh + s.curtailSolarMwh + s.curtailWindMwh + (s.exportMwh - r.days.reduce((a, d) => a + d.hours.reduce((x, h) => x + h.bXr + h.bXg, 0), 0));
  let storeIn = 0, storeOut = 0;
  for (const d of r.days) for (const h of d.hours) { storeIn += b.chargeEff * (h.sC + h.wC + h.gC); storeOut += (h.bDr + h.bDg + h.bXr + h.bXg) / b.dischargeEff; }
  // Days in a screening run are independent, so compare per-day storage change.
  let storeDelta = 0;
  for (const d of r.days) { const first = d.hours[0], last = d.hours[23]; const startR = first.socR - b.chargeEff * (first.sC + first.wC) + (first.bDr + first.bXr) / b.dischargeEff; const startG = first.socG - b.chargeEff * first.gC + (first.bDg + first.bXg) / b.dischargeEff; storeDelta += last.socR + last.socG - startR - startG; }
  return { generationError: gen - used, storageError: storeIn - storeOut - storeDelta, demandError: s.demandMwh - (s.deliveredMwh + s.shortfallMwh) };
}

export type HybridSolver = Highs;
