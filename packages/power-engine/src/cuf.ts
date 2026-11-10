/**
 * Module 11 — CUF & reliability validation. Every utilisation figure states its numerator and denominator. Figures with
 * different denominators are never added together: in particular, solar CUF plus battery utilisation is NOT a plant CUF.
 */
import { DT_H, STEPS_PER_DAY, type PlantConfig } from './config';
import type { DayResult, PeriodSummary } from './dispatch';
import { monthOfDay, type SolarYear } from './solar';

export interface Metric { label: string; value: number; numerator: string; denominator: string }
export type Feasibility = 'feasible' | 'conditional' | 'not_feasible';
export const FEASIBILITY_LABELS: Record<Feasibility, string> = { feasible: 'Feasible', conditional: 'Conditionally feasible', not_feasible: 'Not feasible' };
export type LimitingFactor = 'none' | 'solar_energy' | 'battery_capacity' | 'discharge_power' | 'losses' | 'weather' | 'export_constraint' | 'contract_demand';
export const LIMITING_LABELS: Record<LimitingFactor, string> = {
  none: 'None — demand met', solar_energy: 'Available solar energy', battery_capacity: 'Battery capacity (MWh)', discharge_power: 'Battery discharge power (MW)',
  losses: 'Conversion losses', weather: 'Weather', export_constraint: 'Grid export constraint', contract_demand: 'Contracted demand above plant capability',
};

/** Thresholds: feasible ≥ 99.5% of contracted energy served from the plant; conditional ≥ 90% (or met only with firming). */
export const FEASIBLE_AT = 0.995;
export const CONDITIONAL_AT = 0.9;

export function cufMetrics(p: PlantConfig, solar: SolarYear, s: PeriodSummary): Metric[] {
  const h = s.days * 24, windowH = (p.delivery.windowEndHour - p.delivery.windowStartHour) * s.days;
  const usable = p.bess.energyMwh * (p.bess.maxSocFraction - p.bess.minSocFraction);
  return [
    { label: 'Solar CUF (DC basis)', value: solar.cufDc.value, numerator: 'Solar AC energy at inverter output', denominator: solar.cufDc.denominator },
    { label: 'Solar CUF (AC basis)', value: solar.cufAc.value, numerator: 'Solar AC energy at inverter output', denominator: solar.cufAc.denominator },
    { label: 'Grid-export utilisation', value: s.poiMwh / (p.delivery.gridExportMw * h), numerator: 'All energy through the point of interconnection', denominator: `${p.delivery.gridExportMw} MW export limit × ${h} h` },
    { label: 'Contracted-capacity energy utilisation', value: (s.directMwh + s.batteryToLoadMwh) / (p.delivery.contractedMw * windowH), numerator: 'Plant energy delivered to the buyer (solar direct + battery)', denominator: `${p.delivery.contractedMw} MW × ${windowH} delivery-window hours` },
    { label: 'BESS equivalent full cycles', value: s.equivalentCycles, numerator: 'Battery energy discharged', denominator: `Usable capacity ${usable.toFixed(1)} MWh (one cycle = one full usable discharge)` },
  ];
}

/** Share of contracted demand served, by hour of day (0–23). */
export function hourlyCoverage(days: DayResult[]) {
  const need = new Array(24).fill(0), got = new Array(24).fill(0);
  for (const d of days) d.intervals.forEach((it, t) => { const h = Math.floor(t * DT_H); need[h] += it.load; got[h] += it.sd + it.bd + it.gp; });
  return need.map((n, h) => ({ hour: h, coverage: n > 0 ? got[h] / n : null as number | null }));
}

/** Share of delivery-window intervals in which the full contracted MW was supplied by the plant (no firming). */
export function firmAvailability(days: DayResult[]) {
  let n = 0, ok = 0;
  for (const d of days) for (const it of d.intervals) if (it.load > 0) { n++; if (it.sd + it.bd >= it.load - 1e-3) ok++; }
  return n ? ok / n : 1;
}

export interface DayAssessment { day: number; month: number; demandMwh: number; servedMwh: number; coverage: number; feasibility: Feasibility; limiting: LimitingFactor; detail: string }

/**
 * Classifies one day and names what limited delivery. Physical reasoning on the day's numbers:
 *  direct = Σ min(solar, load);  deficit = demand − direct;  surplus = solar − direct.
 *  If the surplus could not cover the deficit even with no losses → solar energy (or weather on a weak day).
 *  If it could without losses but not after round-trip losses → losses.
 *  Else if the deficit exceeds usable battery energy → battery capacity; if the deficit's peak MW exceeds battery power →
 *  discharge power; if the plant exported at its limit while load was unmet → export constraint.
 */
export function assessDay(p: PlantConfig, d: DayResult, typicalDailySolarMwh?: number): DayAssessment {
  let deficit = 0, surplus = 0, demand = 0, served = 0, maxDeficitMw = 0, exportBound = false, solarMwh = 0;
  for (const it of d.intervals) {
    const sd0 = Math.min(it.solar, it.load);
    deficit += (it.load - sd0) * DT_H; surplus += (it.solar - sd0) * DT_H; demand += it.load * DT_H; solarMwh += it.solar * DT_H;
    served += (it.sd + it.bd) * DT_H;
    maxDeficitMw = Math.max(maxDeficitMw, it.load - sd0);
    if (it.uns > 1e-3 && it.exportMw >= (p.delivery.gridExportMw - 1e-3)) exportBound = true;
  }
  const coverage = demand > 0 ? served / demand : 1;
  const usable = d.intervals.length ? p.bess.energyMwh * (p.bess.maxSocFraction - p.bess.minSocFraction) : 0;
  const feasibility: Feasibility = coverage >= FEASIBLE_AT ? 'feasible' : coverage >= CONDITIONAL_AT ? 'conditional' : 'not_feasible';
  let limiting: LimitingFactor = 'none', detail = 'All contracted energy delivered from the plant.';
  if (feasibility !== 'feasible') {
    const rte = p.bess.roundTripEfficiency;
    if (exportBound) { limiting = 'export_constraint'; detail = `Exports reached the ${p.delivery.gridExportMw} MW limit while load was unmet.`; }
    else if (surplus < deficit) {
      const weak = typicalDailySolarMwh != null && solarMwh < 0.8 * typicalDailySolarMwh;
      limiting = weak ? 'weather' : 'solar_energy';
      detail = `${weak ? 'Low-irradiance day: ' : ''}solar surplus ${surplus.toFixed(0)} MWh is below the ${deficit.toFixed(0)} MWh needed outside solar hours even with no losses.`;
    } else if (surplus * rte < deficit) { limiting = 'losses'; detail = `Surplus ${surplus.toFixed(0)} MWh covers the deficit only before round-trip losses (${(rte * 100).toFixed(0)}%).`; }
    else if (deficit > usable) { limiting = 'battery_capacity'; detail = `Deficit ${deficit.toFixed(0)} MWh exceeds usable battery energy ${usable.toFixed(0)} MWh.`; }
    else if (maxDeficitMw > p.bess.powerMw + 1e-6) { limiting = 'discharge_power'; detail = `Deficit reaches ${maxDeficitMw.toFixed(1)} MW; battery power is ${p.bess.powerMw} MW.`; }
    else if (d.intervals.slice(0, firstSolarCover(d)).some((it) => it.uns > 1e-3)) { limiting = 'battery_capacity'; detail = 'Demand before the sun is up needs energy stored the previous evening; the battery could not hold enough for both the evening and the next morning.'; }
    else { limiting = 'contract_demand'; detail = 'Dispatch chose other uses for stored energy (e.g. higher-value export) under the selected mode.'; }
  }
  return { day: d.day, month: monthOfDay(d.day), demandMwh: demand, servedMwh: served, coverage, feasibility, limiting, detail };
}

/** Index of the first interval in which solar alone covers the load (start of the solar-covered part of the day). */
function firstSolarCover(d: DayResult) { const i = d.intervals.findIndex((it) => it.load > 0 && it.solar >= it.load); return i < 0 ? d.intervals.length : i; }

export interface FeasibilityReport {
  annual: { coverage: number; feasibility: Feasibility; limiting: LimitingFactor; feasibleDays: number; conditionalDays: number; notFeasibleDays: number };
  monthly: { month: number; coverage: number; feasibility: Feasibility; limiting: LimitingFactor }[];
  days: DayAssessment[];
  limitingCounts: Record<LimitingFactor, number>;
  /** Energy test independent of dispatch: can annual solar output, even after storage losses, cover the contract at all? */
  energyTest: { annualDemandMwh: number; annualSolarMwh: number; maxDeliverableMwh: number; ratio: number };
  note: string;
}

const dominant = (xs: LimitingFactor[]) => {
  const c = new Map<LimitingFactor, number>();
  xs.filter((x) => x !== 'none').forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
};
const classify = (cov: number): Feasibility => (cov >= FEASIBLE_AT ? 'feasible' : cov >= CONDITIONAL_AT ? 'conditional' : 'not_feasible');

export function feasibilityReport(p: PlantConfig, days: DayResult[], solar: SolarYear): FeasibilityReport {
  const typical = solar.acMwh / 365;
  const ass = days.map((d) => assessDay(p, d, typical));
  const counts = { none: 0, solar_energy: 0, battery_capacity: 0, discharge_power: 0, losses: 0, weather: 0, export_constraint: 0, contract_demand: 0 } as Record<LimitingFactor, number>;
  ass.forEach((a) => counts[a.limiting]++);
  const sum = (xs: DayAssessment[], k: 'demandMwh' | 'servedMwh') => xs.reduce((a, x) => a + x[k], 0);
  const monthly = Array.from({ length: 12 }, (_, m) => {
    const xs = ass.filter((a) => a.month === m);
    const cov = sum(xs, 'demandMwh') > 0 ? sum(xs, 'servedMwh') / sum(xs, 'demandMwh') : 1;
    return { month: m, coverage: cov, feasibility: classify(cov), limiting: classify(cov) === 'feasible' ? 'none' as LimitingFactor : dominant(xs.map((x) => x.limiting)) };
  }).filter((_, m) => ass.some((a) => a.month === m));
  const demand = sum(ass, 'demandMwh'), served = sum(ass, 'servedMwh');
  const cov = demand > 0 ? served / demand : 1;
  // Upper bound independent of dispatch: direct overlap + surplus shifted at RTE, capped by demand.
  let direct = 0, surplus = 0, deficit = 0;
  for (const d of days) for (const it of d.intervals) { const sd0 = Math.min(it.solar, it.load); direct += sd0 * DT_H; surplus += (it.solar - sd0) * DT_H; deficit += (it.load - sd0) * DT_H; }
  const maxDeliverable = direct + Math.min(deficit, surplus * p.bess.roundTripEfficiency);
  let limiting = cov >= FEASIBLE_AT ? 'none' as LimitingFactor : dominant(ass.map((a) => a.limiting));
  if (cov < FEASIBLE_AT && maxDeliverable < demand * FEASIBLE_AT && limiting !== 'export_constraint') limiting = 'contract_demand';
  return {
    annual: { coverage: cov, feasibility: classify(cov), limiting, feasibleDays: ass.filter((a) => a.feasibility === 'feasible').length, conditionalDays: ass.filter((a) => a.feasibility === 'conditional').length, notFeasibleDays: ass.filter((a) => a.feasibility === 'not_feasible').length },
    monthly, days: ass, limitingCounts: counts,
    energyTest: { annualDemandMwh: demand, annualSolarMwh: days.reduce((a, d) => a + d.intervals.reduce((b, it) => b + it.solar * DT_H, 0), 0), maxDeliverableMwh: maxDeliverable, ratio: demand > 0 ? maxDeliverable / demand : 1 },
    note: 'Solar CUF and battery cycling are separate measures with different denominators and are never added. Battery discharge is stored solar energy, not extra generation.',
  };
}

/** Days per month used to report STEPS for a given day count. */
export const intervalsOf = (days: number) => days * STEPS_PER_DAY;
