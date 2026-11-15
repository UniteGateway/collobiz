/**
 * Hybrid Power Lab service. Simulations and combination searches run as background jobs in this server process (progress
 * is polled); results are stored with the input version they came from, so a stale result is never shown as current.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DECISION_LABELS, HYBRID_SAMPLES, OBJECTIVES, PRODUCTS, evaluate, generateCombinations, reconcile, simulateHybrid,
  type CombinationRequest, type HybridResult, type HybridScenario,
} from '@unite/power-engine';
import { db } from './db';
import { approvedTariffs } from './tariffs';

export interface Job { id: string; kind: 'simulate' | 'combinations'; status: 'running' | 'done' | 'failed'; done: number; total: number; startedAt: number; error?: string; resultId?: string }
const jobs = new Map<string, Job>();
export const getJob = (id: string) => jobs.get(id) ?? null;
function start(kind: Job['kind'], total: number, work: (j: Job) => Promise<string>) {
  const j: Job = { id: randomUUID(), kind, status: 'running', done: 0, total, startedAt: Date.now() };
  jobs.set(j.id, j);
  work(j).then((rid) => { j.status = 'done'; j.resultId = rid; }).catch((e) => { j.status = 'failed'; j.error = (e as Error).message; });
  if (jobs.size > 200) jobs.delete(jobs.keys().next().value!);
  return j;
}

export async function ensureSamples() {
  if (await db.hybridScenario.count()) return;
  for (const s of HYBRID_SAMPLES) await db.hybridScenario.create({ data: { sampleKey: s.key, name: s.scenario.name, inputs: s.scenario as never, createdBy: 'seed' } });
}

const nonneg = z.number().finite().min(0);
const frac = z.number().min(0).max(1);
const mask24 = z.array(z.boolean()).length(24);
/** Structural and range checks; the engine's grid and land checks report the engineering limits. */
export const ScenarioSchema = z.object({
  name: z.string().trim().min(3).max(160),
  year: z.number().int().min(2024).max(2060),
  state: z.string().min(2).max(3), destinationState: z.string().min(2).max(3),
  structure: z.enum(['third_party', 'captive', 'group_captive', 'green_open_access']),
  solar: z.object({ acMw: nonneg.max(2000), dcMwp: nonneg.max(3000), tracker: z.boolean(), weather: z.enum(['typical', 'sunny', 'monsoon_heavy', 'low_production']) }).refine((s) => s.acMw === 0 || s.dcMwp >= s.acMw * 0.8, { message: 'DC capacity is unusually low for this AC rating', path: ['dcMwp'] }),
  wind: z.object({ capacityMw: nonneg.max(2000), turbineRatingMw: z.number().min(0.5).max(15), hubHeightM: z.number().min(40).max(200), rotorDiameterM: z.number().min(40).max(250), wakeLoss: frac, electricalLoss: frac, availability: frac, shearExponent: z.number().min(0).max(0.5) }).passthrough(),
  bess: z.object({ powerMw: nonneg.max(2000), energyMwh: nonneg.max(10000), chargeEff: z.number().min(0.5).max(1), dischargeEff: z.number().min(0.5).max(1), minSoc: frac, maxSoc: frac, reserveSoc: frac, initialSoc: frac, auxMw: nonneg.max(50), maxCyclesPerDay: z.number().min(0).max(4), coupling: z.enum(['ac', 'dc']), allowSolar: z.boolean(), allowWind: z.boolean(), grid: z.enum(['no', 'yes', 'conditional']), gridChargeHours: mask24 }).passthrough()
    .refine((b) => b.maxSoc > b.minSoc, { message: 'Maximum SOC must be above minimum SOC', path: ['maxSoc'] })
    .refine((b) => (b.powerMw === 0) === (b.energyMwh === 0), { message: 'Give both BESS power and energy, or neither', path: ['energyMwh'] })
    .refine((b) => b.powerMw === 0 || b.energyMwh / b.powerMw <= 12, { message: 'Duration over 12 hours is outside the model range', path: ['energyMwh'] }),
  grid: z.object({ exportMw: nonneg.max(5000), importMw: nonneg.max(5000), voltageKv: z.number().min(0.4).max(1200), customVoltage: z.boolean(), lineKm: nonneg.max(500), transformerMva: nonneg.max(10000) }).passthrough(),
  product: z.object({ kind: z.enum(Object.keys(PRODUCTS) as [keyof typeof PRODUCTS]), contractedMw: nonneg.max(2000), hours: mask24, months: z.array(z.boolean()).length(12), allowedShortfall: frac, externalBalancing: z.boolean() }),
  prices: z.object({ ppaRsKwh: nonneg.max(50), peakRsKwh: nonneg.max(50), peakHours: mask24, merchantRsKwh: z.array(nonneg).length(24), gridChargeRsKwh: z.array(nonneg).length(24), balancingRsKwh: nonneg, degradationRsKwh: nonneg, shortfallPenaltyRsKwh: nonneg, exportAllowed: z.boolean(), escalation: z.number().min(-0.1).max(0.2) }),
  objective: z.enum(Object.keys(OBJECTIVES) as [keyof typeof OBJECTIVES]),
}).passthrough();

const r2 = (x: number) => Math.round(x * 100) / 100;
/** Stores the summary and the hourly series needed by the charts (rounded to 0.01 MW). */
export function compact(r: HybridResult, consumerTariff: number, records: Awaited<ReturnType<typeof approvedTariffs>>) {
  const ev = evaluate(r, consumerTariff, records);
  const hrs = r.days.flatMap((d) => d.hours);
  const pick = (f: (h: (typeof hrs)[number]) => number) => hrs.map((h) => r2(f(h)));
  const series = {
    S: pick((h) => h.S), W: pick((h) => h.W), L: pick((h) => h.L), solarDirect: pick((h) => h.sD), windDirect: pick((h) => h.wD), batteryRenewable: pick((h) => h.bDr), batteryGrid: pick((h) => h.bDg), balancing: pick((h) => h.gF),
    chargeSolar: pick((h) => h.sC), chargeWind: pick((h) => h.wC), chargeGrid: pick((h) => h.gC), export: pick((h) => h.sX + h.wX + h.bXr + h.bXg), curtailed: pick((h) => h.sK + h.wK), unserved: pick((h) => h.uns),
    soc: pick((h) => ((h.socR + h.socG) / Math.max(1e-9, r.scenario.bess.energyMwh)) * 100), socGrid: pick((h) => h.socG),
  };
  const byHour = Array.from({ length: 24 }, (_, hod) => { const xs = hrs.filter((h) => h.t % 24 === hod && h.L > 0); return { hour: hod, served: xs.length ? xs.filter((h) => h.uns <= 1e-3).length / xs.length : null, avgShortfall: xs.length ? xs.reduce((a, h) => a + h.uns, 0) / xs.length : 0 }; });
  return {
    results: {
      summary: r.summary, compliance: r.compliance, reconciliation: reconcile(r), computedMs: r.computedMs, screening: r.screening,
      land: ev.land, grid: ev.grid, landed: ev.landed, finance: ev.finance, decision: { ...ev.decision, label: DECISION_LABELS[ev.decision.status] },
      byHour, sources: { solar: r.inputs.solarSource, wind: r.inputs.windSource, windCuf: r.inputs.windYear?.cuf ?? null }, consumerTariff,
    },
    series, decision: ev.decision.status,
  };
}

export function startSimulation(id: string, userEmail: string) {
  return start('simulate', 365, async (j) => {
    const row = await db.hybridScenario.findUniqueOrThrow({ where: { id } });
    const sc = row.inputs as unknown as HybridScenario;
    j.total = sc.year % 4 === 0 ? 366 : 365;
    const r = await simulateHybrid(sc, { onProgress: (d) => { j.done = d; } });
    const c = compact(r, (row.inputs as { consumerTariffRsKwh?: number }).consumerTariffRsKwh ?? 7.4, await approvedTariffs());
    // Only store if nobody changed the inputs meanwhile.
    await db.hybridScenario.updateMany({ where: { id, inputVersion: row.inputVersion }, data: { results: c.results as never, series: c.series as never, decision: c.decision, resultVersion: row.inputVersion, computedAt: new Date() } });
    await db.auditLog.create({ data: { action: 'hybrid.simulated', entity: 'hybridScenario', entityId: id, after: { inputVersion: row.inputVersion, decision: c.decision, by: userEmail } as never } });
    return id;
  });
}

export const CombinationSchema = z.object({
  solarAcMw: z.object({ min: nonneg, max: nonneg, step: z.number().positive() }), windMw: z.object({ min: nonneg, max: nonneg, step: z.number().positive() }),
  bessMw: z.object({ min: nonneg, max: nonneg, step: z.number().positive() }), bessHours: z.array(z.number().min(0.5).max(12)).min(1).max(4),
  budgetCr: z.number().positive().optional(), rankBy: z.enum(['reliability', 'equity_irr', 'npv', 'lcoe', 'capex']),
});
export function startCombinations(scenarioId: string, req: CombinationRequest, userEmail: string) {
  return start('combinations', 1, async (j) => {
    const row = await db.hybridScenario.findUniqueOrThrow({ where: { id: scenarioId } });
    const res = await generateCombinations(row.inputs as unknown as HybridScenario, { ...req, maxCombinations: 60 }, (d, t) => { j.done = d; j.total = t; });
    const saved = await db.hybridCombinationRun.create({ data: { scenarioId, request: req as never, result: res as never, createdBy: userEmail } });
    return saved.id;
  });
}
