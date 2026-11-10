/**
 * Module 4 — smart dispatch. Each day of 96 × 15-minute intervals is solved as a linear programme (HiGHS), carrying the
 * battery's state of charge from one day to the next. Variables per interval (MW, ≥ 0):
 *   sd solar→load, sc solar→battery, se solar→export (uncontracted), cur curtailed solar,
 *   bd battery→load, be battery→export, gc grid→battery, gp grid→load (firming), uns unserved load; soc (MWh).
 * Constraints per interval:
 *   solar:   S = sd + sc + se + cur                       (all solar is accounted for)
 *   load:    L = sd + bd + gp + uns                        (all contracted demand is accounted for)
 *   POI:     sd + se + bd + be ≤ export limit              (everything leaving the plant passes the interconnection)
 *   power:   sc + gc ≤ P_bess,  bd + be ≤ P_bess
 *   SOC:     soc' = soc + ηc(sc + gc)Δt − (bd + be)Δt/ηd,  soc_min ≤ soc ≤ soc_max
 *   cycles:  Σ(bd + be)Δt ≤ max cycles/day × usable energy
 * Modes change only the objective. A small curtailment penalty below the battery throughput cost means the solver never
 * charges and discharges together just to avoid curtailment; every solution is checked for that and for energy balance.
 * Delivery through the grid to the buyer is modelled as energy at the POI; open-access losses are applied in Module 7.
 */
import type { Highs } from 'highs';
import { DT_H, STEPS_PER_DAY, type PlantConfig } from './config';
import { chargeEff, dischargeEff, socBounds, stepBess } from './bess';
import type { PriceInputs } from './prices';

export type DispatchMode = 'max_profit' | 'max_savings' | 'max_reliability';
export const DISPATCH_MODES: Record<DispatchMode, string> = { max_profit: 'Maximum developer profit', max_savings: 'Maximum industrial customer savings', max_reliability: 'Maximum reliability 6 AM–10 PM' };

export interface DispatchOptions {
  mode: DispatchMode;
  /** Allow sale of uncontracted energy (to the grid / exchange). */
  allowExport: boolean;
  /** Allow separately priced grid power to firm up the contract (priority 8). */
  allowGridFirming: boolean;
  /** Contracted demand by interval of the day (96 values, MW). Defaults to the contract over the delivery window. */
  demandProfile?: number[];
  /** Grid export limit override (e.g. transformer outage stress case), MW. */
  exportLimitMw?: number;
}

export interface Interval {
  sd: number; sc: number; se: number; cur: number; bd: number; be: number; gc: number; gp: number; uns: number;
  socMwh: number; // at end of interval
  solar: number; load: number; exportMw: number; // exportMw = everything at the POI
}
export interface DayResult { day: number; intervals: Interval[]; socStartMwh: number; socEndMwh: number; objective: number; solver: 'highs' | 'rules' }

export function demandProfile(p: PlantConfig) {
  return Array.from({ length: STEPS_PER_DAY }, (_, s) => { const h = s * DT_H; return h >= p.delivery.windowStartHour && h < p.delivery.windowEndHour ? p.delivery.contractedMw : 0; });
}

let highsP: Promise<Highs> | null = null;
export async function solver(): Promise<Highs> {
  if (!highsP) highsP = (require('highs') as (o?: object) => Promise<Highs>)({});
  return highsP;
}

const f = (x: number) => (Math.abs(x) < 1e-12 ? '0' : x.toFixed(6));

/** Builds the CPLEX-LP text for one day. Prices are ₹/kWh; objective is ₹ (MW × h × 1000 = kWh). */
export function buildDayLp(p: PlantConfig, solar: number[], load: number[], prices: PriceInputs, o: DispatchOptions, socStart: number, capacityMwh: number, hourOfDay: (s: number) => number, carryNeedMwh = 0) {
  const b = p.bess, ec = chargeEff(b), ed = dischargeEff(b);
  const { min, max } = socBounds(b, capacityMwh);
  const X = o.exportLimitMw ?? p.delivery.gridExportMw;
  const k = DT_H * 1000;
  const deg = prices.degradationRsKwh.value, curtPen = Math.min(0.05, deg / 10);
  const obj: string[] = [];
  const add = (c: number, v: string) => { if (Math.abs(c) > 1e-12) obj.push(`${c >= 0 ? '+' : '-'} ${f(Math.abs(c))} ${v}`); };
  const peak = (s: number) => { const h = hourOfDay(s); return h >= p.delivery.peakStartHour && h < p.delivery.peakEndHour; };
  for (let t = 0; t < STEPS_PER_DAY; t++) {
    const h = Math.floor(hourOfDay(t));
    const merchant = prices.merchantRsKwh.value[h], grid = prices.gridRsKwh.value[h], cust = prices.consumerTariffRsKwh.value[h];
    const ppa = prices.ppaSolarRsKwh.value, bessT = peak(t) ? prices.peakBessRsKwh.value : ppa, dc = prices.deliveryChargeRsKwh.value;
    if (o.mode === 'max_profit') {
      add(k * (ppa - dc), `sd${t}`); add(k * (bessT - dc - deg), `bd${t}`);
      add(k * merchant, `se${t}`); add(k * (merchant - deg), `be${t}`);
      add(-k * grid, `gc${t}`); add(k * (bessT - grid - dc), `gp${t}`);
      add(-k * prices.shortfallPenaltyRsKwh.value, `uns${t}`);
    } else if (o.mode === 'max_savings') {
      // Value to the buyer: avoided tariff minus price paid, for each kWh supplied; the developer's export is a tie-breaker.
      add(k * Math.max(0.01, cust - ppa), `sd${t}`); add(k * (Math.max(0.01, cust - bessT) - deg / 10), `bd${t}`);
      add(k * 0.01 * merchant, `se${t}`); add(k * (0.01 * merchant - deg), `be${t}`);
      add(-k * grid * 0.1, `gc${t}`); add(k * 0.001, `gp${t}`);
      add(-k * 50, `uns${t}`);
    } else {
      // Reliability: unserved demand dominates; small terms keep the rest sensible.
      add(-k * 100, `uns${t}`); add(k * 0.01, `sd${t}`); add(k * (0.01 - deg / 100), `bd${t}`);
      add(k * 0.001 * merchant, `se${t}`); add(k * (0.001 * merchant - deg), `be${t}`); add(-k * 0.01 * grid, `gc${t}`); add(-k * 0.5, `gp${t}`);
    }
    add(-k * curtPen, `cur${t}`);
  }
  const cons: string[] = [];
  const bounds: string[] = [];
  for (let t = 0; t < STEPS_PER_DAY; t++) {
    cons.push(` s${t}: sd${t} + sc${t} + se${t} + cur${t} = ${f(solar[t])}`);
    cons.push(` l${t}: sd${t} + bd${t} + gp${t} + uns${t} = ${f(load[t])}`);
    cons.push(` x${t}: sd${t} + se${t} + bd${t} + be${t} <= ${f(X)}`);
    cons.push(` pc${t}: sc${t} + gc${t} <= ${f(b.powerMw)}`);
    cons.push(` pd${t}: bd${t} + be${t} <= ${f(b.powerMw)}`);
    const prev = t === 0 ? f(socStart) : `soc${t - 1}`;
    cons.push(t === 0
      ? ` b${t}: soc${t} - ${f(ec * DT_H)} sc${t} - ${f(ec * DT_H)} gc${t} + ${f(DT_H / ed)} bd${t} + ${f(DT_H / ed)} be${t} = ${prev}`
      : ` b${t}: soc${t} - ${prev} - ${f(ec * DT_H)} sc${t} - ${f(ec * DT_H)} gc${t} + ${f(DT_H / ed)} bd${t} + ${f(DT_H / ed)} be${t} = 0`);
    bounds.push(` ${f(min)} <= soc${t} <= ${f(max)}`);
    if (!(b.gridChargingAllowed)) bounds.push(` gc${t} = 0`);
    if (!o.allowGridFirming) bounds.push(` gp${t} = 0`);
    if (!o.allowExport) { bounds.push(` se${t} = 0`); bounds.push(` be${t} = 0`); }
  }
  // Energy kept at the end of the day is worth what it will earn serving tomorrow's demand before the sun is up, up to that
  // need (stored MWh × ηd). Without this term each day would drain the battery and leave the next morning unserved.
  if (carryNeedMwh > 1e-6) {
    const ppa = prices.ppaSolarRsKwh.value;
    const perMwh = o.mode === 'max_reliability' ? 100_000 : o.mode === 'max_savings' ? 50_000 : 1000 * Math.max(0, ppa - prices.deliveryChargeRsKwh.value - prices.degradationRsKwh.value + prices.shortfallPenaltyRsKwh.value);
    const val = perMwh * ed * 0.99; // slightly below serving today, so today's demand always comes first
    obj.push(`+ ${f(val)} carry`);
    cons.push(` cr1: carry - soc${STEPS_PER_DAY - 1} <= ${f(-min)}`);
    bounds.push(` 0 <= carry <= ${f(carryNeedMwh / ed)}`);
  }
  const usable = capacityMwh * (b.maxSocFraction - b.minSocFraction);
  cons.push(` cyc: ${Array.from({ length: STEPS_PER_DAY }, (_, t) => `${f(DT_H)} bd${t} + ${f(DT_H)} be${t}`).join(' + ')} <= ${f(b.maxCyclesPerDay * usable)}`);
  return `Maximize\n obj: ${obj.join(' ') || '0 sd0'}\nSubject To\n${cons.join('\n')}\nBounds\n${bounds.join('\n')}\nEnd`;
}

const TOL = 1e-4;
/** Throws if any interval breaks energy balance, POI or battery limits, or charges and discharges at once. */
export function checkInterval(p: PlantConfig, it: Interval, prevSoc: number, capacityMwh: number, exportLimit: number) {
  const b = p.bess, { min, max } = socBounds(b, capacityMwh);
  const bad = (m: string) => { throw new Error(`Dispatch check failed: ${m}`); };
  if (Math.abs(it.solar - (it.sd + it.sc + it.se + it.cur)) > TOL) bad('solar balance');
  if (Math.abs(it.load - (it.sd + it.bd + it.gp + it.uns)) > TOL) bad('load balance');
  if (it.sd + it.se + it.bd + it.be > exportLimit + TOL) bad('export limit');
  const ch = it.sc + it.gc, dis = it.bd + it.be;
  if (ch > b.powerMw + TOL || dis > b.powerMw + TOL) bad('battery power');
  if (ch > TOL && dis > TOL) bad('simultaneous charge and discharge');
  const expect = prevSoc + chargeEff(b) * ch * DT_H - (dis * DT_H) / dischargeEff(b);
  if (Math.abs(expect - it.socMwh) > 1e-3) bad('state of charge');
  if (it.socMwh < min - 1e-3 || it.socMwh > max + 1e-3) bad('state of charge bounds');
  for (const v of [it.sd, it.sc, it.se, it.cur, it.bd, it.be, it.gc, it.gp, it.uns]) if (v < -TOL) bad('negative flow');
}

/** Optimised dispatch for one day with HiGHS. */
export async function dispatchDay(p: PlantConfig, solar: number[], prices: PriceInputs, o: DispatchOptions, socStart: number, capacityMwh = p.bess.energyMwh, day = 0, nextSolar?: number[]): Promise<DayResult> {
  const load = o.demandProfile ?? demandProfile(p);
  const hs = await solver();
  const lp = buildDayLp(p, solar, load, prices, o, socStart, capacityMwh, (s) => s * DT_H, nextSolar ? morningNeedMwh(load, nextSolar) : 0);
  const r = hs.solve(lp, { presolve: 'on' } as never);
  if (r.Status !== 'Optimal') throw new Error(`Dispatch solver: ${r.Status}`);
  const v = (n: string) => Math.max(0, (r.Columns as Record<string, { Primal: number }>)[n]?.Primal ?? 0);
  const X = o.exportLimitMw ?? p.delivery.gridExportMw;
  const intervals: Interval[] = [];
  let prev = socStart;
  for (let t = 0; t < STEPS_PER_DAY; t++) {
    let sc = v(`sc${t}`), gc = v(`gc${t}`), bd = v(`bd${t}`), be = v(`be${t}`);
    // Clean tiny numerical noise so exclusivity checks are exact.
    if (sc + gc < 1e-7) { sc = 0; gc = 0; }
    if (bd + be < 1e-7) { bd = 0; be = 0; }
    const it: Interval = { sd: v(`sd${t}`), sc, se: v(`se${t}`), cur: v(`cur${t}`), bd, be, gc, gp: v(`gp${t}`), uns: v(`uns${t}`), socMwh: (r.Columns as Record<string, { Primal: number }>)[`soc${t}`].Primal, solar: solar[t], load: load[t], exportMw: 0 };
    it.exportMw = it.sd + it.se + it.bd + it.be;
    checkInterval(p, it, prev, capacityMwh, X);
    prev = it.socMwh;
    intervals.push(it);
  }
  return { day, intervals, socStartMwh: socStart, socEndMwh: prev, objective: r.ObjectiveValue, solver: 'highs' };
}

/** Energy the next day needs from storage before its solar output first covers the load (MWh, at the load). */
export function morningNeedMwh(load: number[], solar: number[]) {
  let need = 0;
  for (let t = 0; t < STEPS_PER_DAY; t++) { if (load[t] > 0 && solar[t] >= load[t]) break; need += Math.max(0, load[t] - solar[t]) * DT_H; }
  return need;
}

/**
 * Rule-based dispatch (no solver), following the brief's priority list literally: solar to load, surplus to battery, then
 * export, then curtail; battery covers deficits in the delivery window. Used as a cross-check and a fast preview.
 */
export function dispatchDayRules(p: PlantConfig, solar: number[], o: DispatchOptions, socStart: number, capacityMwh = p.bess.energyMwh, day = 0): DayResult {
  const load = o.demandProfile ?? demandProfile(p);
  const X = o.exportLimitMw ?? p.delivery.gridExportMw;
  let st = { capacityMwh, socMwh: socStart };
  const intervals: Interval[] = [];
  for (let t = 0; t < STEPS_PER_DAY; t++) {
    const S = solar[t], L = load[t];
    const sd = Math.min(S, L, X);
    let surplus = S - sd, deficit = L - sd;
    let sc = 0, bd = 0, se = 0;
    if (surplus > 0) { const r = stepBess(p.bess, st, surplus, 0); sc = r.charge; st = r.next; surplus -= sc; }
    else if (deficit > 0) { const r = stepBess(p.bess, st, 0, Math.min(deficit, X - sd)); bd = r.discharge; st = r.next; deficit -= bd; }
    if (o.allowExport) { se = Math.min(surplus, X - sd - bd); surplus -= se; }
    const it: Interval = { sd, sc, se, cur: surplus, bd, be: 0, gc: 0, gp: 0, uns: deficit, socMwh: st.socMwh, solar: S, load: L, exportMw: sd + se + bd };
    intervals.push(it);
  }
  return { day, intervals, socStartMwh: socStart, socEndMwh: st.socMwh, objective: 0, solver: 'rules' };
}

export interface PeriodSummary {
  days: number;
  solarMwh: number; directMwh: number; chargedMwh: number; dischargedMwh: number; batteryToLoadMwh: number; batteryToExportMwh: number;
  exportUncontractedMwh: number; curtailedMwh: number; gridChargeMwh: number; gridFirmMwh: number; unservedMwh: number; demandMwh: number;
  batteryLossMwh: number; poiMwh: number; equivalentCycles: number; demandCoverage: number;
}
export function summarize(p: PlantConfig, days: DayResult[], capacityMwh = p.bess.energyMwh): PeriodSummary {
  const s = { days: days.length, solarMwh: 0, directMwh: 0, chargedMwh: 0, dischargedMwh: 0, batteryToLoadMwh: 0, batteryToExportMwh: 0, exportUncontractedMwh: 0, curtailedMwh: 0, gridChargeMwh: 0, gridFirmMwh: 0, unservedMwh: 0, demandMwh: 0, batteryLossMwh: 0, poiMwh: 0, equivalentCycles: 0, demandCoverage: 0 };
  for (const d of days) for (const it of d.intervals) {
    s.solarMwh += it.solar * DT_H; s.directMwh += it.sd * DT_H; s.chargedMwh += (it.sc + it.gc) * DT_H; s.dischargedMwh += (it.bd + it.be) * DT_H;
    s.batteryToLoadMwh += it.bd * DT_H; s.batteryToExportMwh += it.be * DT_H; s.exportUncontractedMwh += it.se * DT_H; s.curtailedMwh += it.cur * DT_H;
    s.gridChargeMwh += it.gc * DT_H; s.gridFirmMwh += it.gp * DT_H; s.unservedMwh += it.uns * DT_H; s.demandMwh += it.load * DT_H; s.poiMwh += it.exportMw * DT_H;
  }
  const socChange = days.length ? days[days.length - 1].socEndMwh - days[0].socStartMwh : 0;
  s.batteryLossMwh = s.chargedMwh - s.dischargedMwh - socChange; // energy conservation: in = out + losses + Δstored
  const usable = capacityMwh * (p.bess.maxSocFraction - p.bess.minSocFraction);
  s.equivalentCycles = usable > 0 ? s.dischargedMwh / usable : 0;
  s.demandCoverage = s.demandMwh > 0 ? (s.directMwh + s.batteryToLoadMwh + s.gridFirmMwh) / s.demandMwh : 1;
  return s;
}

/** Runs dispatch for a range of days (default: whole year), carrying SOC across days. */
export async function dispatchRange(p: PlantConfig, solarYear: number[], prices: PriceInputs, o: DispatchOptions, fromDay = 0, toDay = 364, capacityMwh = p.bess.energyMwh) {
  const days: DayResult[] = [];
  let soc = capacityMwh * p.bess.initialSocFraction;
  for (let d = fromDay; d <= toDay; d++) {
    const solar = solarYear.slice(d * STEPS_PER_DAY, (d + 1) * STEPS_PER_DAY);
    const next = d < 364 ? solarYear.slice((d + 1) * STEPS_PER_DAY, (d + 2) * STEPS_PER_DAY) : solarYear.slice(0, STEPS_PER_DAY);
    const r = await dispatchDay(p, solar, prices, o, soc, capacityMwh, d, next);
    days.push(r); soc = r.socEndMwh;
  }
  return { days, summary: summarize(p, days, capacityMwh) };
}
