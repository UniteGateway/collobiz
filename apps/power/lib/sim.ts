/**
 * Server-side simulation service. The engine runs only on the server; results are cached in memory by a hash of every
 * input (plant, prices, mode, weather scenario, CUF target) and the year summary is stored in SimulationRun.
 */
import { createHash } from 'node:crypto';
import {
  DEFAULT_PLANT, DEFAULT_PRICES, DT_H, STEPS_PER_DAY, calibrateToCuf, capacityTrajectory, cufMetrics, dispatchRange, feasibilityReport, firmAvailability, hourlyCoverage, simulateSolarYear, summarize,
  type DayResult, type DispatchMode, type PlantConfig, type PriceInputs, type SolarYear, type WeatherScenario,
} from '@unite/power-engine';
import { db } from './db';

export interface SimRequest { mode: DispatchMode; scenario: WeatherScenario; cufTarget?: number | null; cufBasis?: 'dc' | 'ac'; allowExport?: boolean; allowGridFirming?: boolean; exportLimitMw?: number | null }
export interface YearSim { key: string; plant: PlantConfig; prices: PriceInputs; req: SimRequest; solar: SolarYear; days: DayResult[]; computedMs: number }

const cache = new Map<string, Promise<YearSim>>();
const MAX = 24;
export const simKey = (p: PlantConfig, pr: PriceInputs, r: SimRequest) => createHash('sha256').update(JSON.stringify([p, pr, r])).digest('hex').slice(0, 32);

export async function loadProject(id?: string | null) {
  const proj = id ? await db.project.findUnique({ where: { id } }) : await db.project.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!proj) return { id: null as string | null, name: DEFAULT_PLANT.site.name, config: DEFAULT_PLANT, prices: DEFAULT_PRICES, version: 0 };
  return { id: proj.id, name: proj.name, config: proj.config as unknown as PlantConfig, prices: proj.prices as unknown as PriceInputs, version: proj.version };
}

export function runYear(plant: PlantConfig, prices: PriceInputs, req: SimRequest): Promise<YearSim> {
  const key = simKey(plant, prices, req);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = (async () => {
    const t0 = Date.now();
    const solar = req.cufTarget ? calibrateToCuf(plant, req.cufTarget, req.cufBasis ?? 'dc', { scenario: req.scenario }).year : simulateSolarYear(plant, { scenario: req.scenario });
    const r = await dispatchRange(plant, solar.intervals.map((x) => x.acMw), prices, { mode: req.mode, allowExport: req.allowExport ?? true, allowGridFirming: req.allowGridFirming ?? false, exportLimitMw: req.exportLimitMw ?? undefined });
    return { key, plant, prices, req, solar, days: r.days, computedMs: Date.now() - t0 };
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  if (cache.size > MAX) cache.delete(cache.keys().next().value!);
  return job;
}

/** Year results for the dashboards: totals, CUF metrics, feasibility, monthly and daily aggregates. */
export function yearView(s: YearSim) {
  const { plant, solar, days } = s;
  const fe = feasibilityReport(plant, days, solar);
  const sum = summarize(plant, days);
  const monthly = Array.from({ length: 12 }, () => ({ solar: 0, direct: 0, battery: 0, charged: 0, exported: 0, curtailed: 0, unserved: 0, demand: 0 }));
  const daily = days.map((d) => {
    const t = { solar: 0, direct: 0, battery: 0, charged: 0, exported: 0, curtailed: 0, unserved: 0, demand: 0 };
    for (const it of d.intervals) { t.solar += it.solar * DT_H; t.direct += it.sd * DT_H; t.battery += it.bd * DT_H; t.charged += (it.sc + it.gc) * DT_H; t.exported += (it.se + it.be) * DT_H; t.curtailed += it.cur * DT_H; t.unserved += it.uns * DT_H; t.demand += it.load * DT_H; }
    const m = fe.days.find((a) => a.day === d.day)!.month;
    (Object.keys(t) as (keyof typeof t)[]).forEach((k) => { monthly[m][k] += t[k]; });
    return { day: d.day, ...t };
  });
  return {
    key: s.key, computedMs: s.computedMs, req: s.req, revenue: revenueOf(s),
    solar: { acMwh: solar.acMwh, dcMwh: solar.dcMwh, clippedMwh: solar.clippedMwh, cufDc: solar.cufDc, cufAc: solar.cufAc, peakAcMw: solar.peakAcMw, weather: solar.weather, irradianceScale: solar.irradianceScale },
    summary: sum, metrics: cufMetrics(plant, solar, sum), hourlyCoverage: hourlyCoverage(days), firmAvailability: firmAvailability(days),
    feasibility: { annual: fe.annual, monthly: fe.monthly, limitingCounts: fe.limitingCounts, energyTest: fe.energyTest, note: fe.note, worstDays: [...fe.days].sort((a, b) => a.coverage - b.coverage).slice(0, 10) },
    monthly, daily,
    bess: {
      trajectory: capacityTrajectory(plant.bess, sum.equivalentCycles * (365 / Math.max(1, days.length)), 25),
      dailySoc: days.map((d) => { const v = d.intervals.map((i) => i.socMwh); return { day: d.day, min: Math.min(...v) / plant.bess.energyMwh * 100, max: Math.max(...v) / plant.bess.energyMwh * 100 }; }),
      usableMwh: plant.bess.energyMwh * (plant.bess.maxSocFraction - plant.bess.minSocFraction),
    },
  };
}

/** One day at 15-minute resolution for the interactive graph. */
export function dayView(s: YearSim, day: number) {
  const d = s.days[Math.max(0, Math.min(364, day))];
  const cap = s.plant.bess.energyMwh;
  const sol = s.solar.intervals.slice(d.day * STEPS_PER_DAY, (d.day + 1) * STEPS_PER_DAY);
  return {
    day: d.day,
    points: d.intervals.map((it, t) => {
      const h = Math.floor(t * DT_H);
      return {
        t, time: `${String(h).padStart(2, '0')}:${String((t % 4) * 15).padStart(2, '0')}`,
        solar: it.solar, direct: it.sd, charge: it.sc + it.gc, discharge: it.bd + it.be, batteryToLoad: it.bd, export: it.exportMw, uncontractedExport: it.se + it.be,
        curtailed: it.cur, unserved: it.uns, load: it.load, gridFirm: it.gp, soc: (it.socMwh / cap) * 100, socMwh: it.socMwh,
        price: s.prices.merchantRsKwh.value[h], consumerTariff: s.prices.consumerTariffRsKwh.value[h], clipped: sol[t].clippedMw, dc: sol[t].dcMw, poa: sol[t].poa,
      };
    }),
    socStartMwh: d.socStartMwh, socEndMwh: d.socEndMwh,
  };
}

export async function recordRun(projectId: string | null, s: YearSim) {
  if (!projectId) return;
  const v = yearView(s);
  await db.simulationRun.create({ data: { projectId, inputsHash: s.key, mode: s.req.mode, scenario: s.req.scenario, summary: v.summary as never, feasibility: v.feasibility.annual as never, monthly: v.monthly as never, durationMs: s.computedMs } });
}

/**
 * Developer revenue for the simulated year (₹), by stream. Solar delivered to the buyer earns the PPA tariff; battery energy
 * delivered in the peak window earns the peak tariff (otherwise the PPA tariff); uncontracted exports earn the merchant
 * price; grid energy bought is a cost. Open-access charges borne by the developer are deducted per kWh delivered.
 */
export function revenueOf(s: YearSim) {
  const pr = s.prices, p = s.plant;
  const k = DT_H * 1000;
  let ppa = 0, peak = 0, merchant = 0, gridCost = 0, delivery = 0, peakMwh = 0;
  for (const d of s.days) d.intervals.forEach((it, t) => {
    const h = Math.floor(t * DT_H), isPeak = h >= p.delivery.peakStartHour && h < p.delivery.peakEndHour;
    ppa += it.sd * k * pr.ppaSolarRsKwh.value + (isPeak ? 0 : it.bd * k * pr.ppaSolarRsKwh.value);
    if (isPeak) { peak += it.bd * k * pr.peakBessRsKwh.value; peakMwh += it.bd * DT_H; }
    merchant += (it.se + it.be) * k * pr.merchantRsKwh.value[h];
    gridCost += (it.gc + it.gp) * k * pr.gridRsKwh.value[h];
    delivery += (it.sd + it.bd) * k * pr.deliveryChargeRsKwh.value;
  });
  return { ppa, peak, merchant, gridCost, deliveryCharges: delivery, net: ppa + peak + merchant - gridCost - delivery, peakBatteryMwh: peakMwh, provenance: [pr.ppaSolarRsKwh.provenance, pr.peakBessRsKwh.provenance, pr.merchantRsKwh.provenance] };
}
