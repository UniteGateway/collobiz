/**
 * Server-side analysis for Modules 6–8 and 10, built on the simulated year:
 *  - voltage & evacuation (losses and indicative capex per voltage, from the 15-minute POI export profile),
 *  - open-access delivered cost (intra-state and interstate, from approved tariff records),
 *  - project finance (year 1 from the simulation, later years scaled).
 */
import { z } from 'zod';
import {
  DEFAULT_NETWORK, DT_H, EXPORT_VOLTAGES_KV, ILLUSTRATIVE_PROJECT_FINANCE, ILLUSTRATIVE_VOLTAGES, STATES, compareVoltages, deliveredCost, networkFlags, projectFinance, sensitivity,
  type NetworkInputs, type ProjectFinanceInputs, type RouteInputs, type TariffRecord,
} from '@unite/power-engine';
import { revenueOf, type YearSim } from './sim';

type Project = { config: YearSim['plant']; prices: YearSim['prices'] };

// ------------------------------------------------------------------ Module 6
export const NetworkSchema = z.object({
  injectionKv: z.coerce.number().refine((v) => (EXPORT_VOLTAGES_KV as readonly number[]).includes(v), 'Choose a listed voltage'),
  receivingKv: z.coerce.number().min(0.4).max(765), lineKm: z.coerce.number().min(0.1).max(500), circuits: z.coerce.number().int().min(1).max(2),
  powerFactor: z.coerce.number().min(0.8).max(1),
  transformers: z.array(z.object({ name: z.string().min(1).max(80), mva: z.coerce.number().min(1).max(1000), noLoadLossKw: z.coerce.number().min(0).max(1000), loadLossKwRated: z.coerce.number().min(0).max(5000), capexCrPerMva: z.coerce.number().min(0).max(5) })).max(4),
  wheelingNetworks: z.array(z.enum(['STU', 'DISCOM', 'ISTS'])).max(3), interface: z.enum(['STU', 'CTU']),
  connectivity: z.enum(['not_applied', 'applied', 'in_principle', 'granted']), meteringReady: z.boolean(), schedulingArranged: z.boolean(),
  evacuationCostCr: z.coerce.number().min(0).max(1000),
});
export function networkDefaults(p: Project): NetworkInputs {
  return { ...DEFAULT_NETWORK, injectionKv: p.config.delivery.exportVoltageKv };
}
export function networkAnalysis(sim: YearSim, n: NetworkInputs, lossValueRsKwh: number) {
  const profile = sim.days.flatMap((d) => d.intervals.map((i) => i.exportMw));
  const results = compareVoltages(profile, DT_H, n, lossValueRsKwh);
  const ok = results.filter((r) => r.thermalOk);
  const best = (ok.length ? ok : results).reduce((a, b) => (b.totalCostCr < a.totalCostCr ? b : a));
  const selected = results.find((r) => r.kv === n.injectionKv)!;
  return {
    inputs: n, lossValueRsKwh, results, recommendedKv: best.kv, selected, flags: networkFlags(n), voltages: ILLUSTRATIVE_VOLTAGES,
    poiMwh: profile.reduce((a, p) => a + p * DT_H, 0), peakMw: Math.max(0, ...profile),
    note: 'Planning estimates with illustrative conductor and cost figures — not a load-flow study and not the transmission utility’s connectivity terms.',
  };
}

// ------------------------------------------------------------------ Modules 7–8
const stateCode = z.string().refine((s) => s in STATES, 'Unknown state');
export const RouteSchema = z.object({
  sourceState: stateCode.default('AP'), destinationState: stateCode.default('AP'),
  receivingKv: z.coerce.number().min(0.4).max(765).default(33), capacityMw: z.coerce.number().min(0.1).max(1000).optional(),
  energyInjectedMwh: z.coerce.number().min(1).max(5_000_000).optional(),
  structure: z.enum(['third_party', 'group_captive', 'captive', 'green_open_access']).default('third_party'),
  istsConnected: z.boolean().default(false), confirmedConditions: z.record(z.string(), z.array(z.string())).default({}),
  ppaRsKwh: z.coerce.number().min(0).max(30).optional(), consumerTariffRsKwh: z.coerce.number().min(0).max(30).default(7.5),
  developerBears: z.array(z.string()).default([]), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), bankedMwh: z.coerce.number().min(0).optional(),
  compare: z.boolean().default(false),
});
export type RouteBody = z.infer<typeof RouteSchema>;
/** Delivered energy from the simulation: what the plant supplied to the contracted load in the year. */
export function deliveredMwh(sim: YearSim) {
  let mwh = 0;
  for (const d of sim.days) for (const i of d.intervals) mwh += (i.sd + i.bd) * DT_H;
  return mwh * (365 / Math.max(1, sim.days.length));
}
export function routeInputs(p: Project, sim: YearSim, b: RouteBody): RouteInputs {
  return {
    sourceState: b.sourceState, destinationState: b.destinationState, receivingKv: b.receivingKv, capacityMw: b.capacityMw ?? p.config.delivery.contractedMw,
    energyInjectedMwh: b.energyInjectedMwh ?? Math.round(deliveredMwh(sim)), structure: b.structure, istsConnected: b.istsConnected, confirmedConditions: b.confirmedConditions,
    ppaRsKwh: b.ppaRsKwh ?? p.prices.ppaSolarRsKwh.value, consumerTariffRsKwh: b.consumerTariffRsKwh, developerBears: b.developerBears as RouteInputs['developerBears'],
    asOf: b.asOf ?? new Date().toISOString().slice(0, 10), bankedMwh: b.bankedMwh,
  };
}
export function routeAnalysis(records: TariffRecord[], r: RouteInputs, compare: boolean) {
  const result = deliveredCost(records, r);
  const byState = compare ? Object.entries(STATES).map(([code, name]) => {
    const x = deliveredCost(records, { ...r, destinationState: code });
    return { code, name, landedRsKwh: x.landedRsKwh, buyerSavingRsKwh: x.buyerSavingRsKwh, lossPct: 1 - x.energyReceivedMwh / Math.max(1e-9, x.energyInjectedMwh), illustrativeShare: x.illustrativeShare, interstate: code !== r.sourceState };
  }).sort((a, b) => a.landedRsKwh - b.landedRsKwh) : null;
  const waivers = records.filter((x) => x.waiver).map((x) => ({ key: x.key, jurisdiction: x.jurisdiction, waives: x.waiver!.waives, fraction: x.waiver!.fraction, conditions: x.waiver!.conditions, provenance: x.provenance, notes: x.notes }));
  return { inputs: r, result, byState, waivers, states: STATES };
}

// ------------------------------------------------------------------ Module 10
export const FinanceSchema = z.object({
  solarCapexCrPerMwp: z.number().min(0).max(20), bessCapexCrPerMw: z.number().min(0).max(10), bessCapexCrPerMwh: z.number().min(0).max(10), evacuationCapexCr: z.number().min(0).max(2000),
  devCostCr: z.number().min(0).max(500), contingency: z.number().min(0).max(0.3), solarOmCrPerMwpYr: z.number().min(0).max(1), bessOmCrPerMwhYr: z.number().min(0).max(1),
  omEscalation: z.number().min(0).max(0.2), insurancePct: z.number().min(0).max(0.05), augmentationCrPerMwh: z.number().min(0).max(10), debtShare: z.number().min(0).max(0.9),
  interestRate: z.number().min(0).max(0.25), tenorYears: z.number().int().min(1).max(25), discountRate: z.number().min(0.01).max(0.3), taxRate: z.number().min(0).max(0.5),
  years: z.number().int().min(5).max(35), tariffEscalation: z.number().min(-0.05).max(0.1), provenance: z.enum(['illustrative', 'quotation', 'actual']),
}).refine((f) => f.tenorYears <= f.years, { message: 'Loan tenor cannot exceed the project life', path: ['tenorYears'] });

export function financeAnalysis(sim: YearSim, f: ProjectFinanceInputs = ILLUSTRATIVE_PROJECT_FINANCE) {
  const rev = revenueOf(sim), p = sim.plant, scale = 365 / Math.max(1, sim.days.length);
  let poi = 0, discharged = 0;
  for (const d of sim.days) for (const i of d.intervals) { poi += i.exportMw * DT_H; discharged += (i.bd + i.be) * DT_H; }
  const usable = p.bess.energyMwh * (p.bess.maxSocFraction - p.bess.minSocFraction);
  const y1 = { revenueRs: (rev.ppa + rev.peak + rev.merchant) * scale, variableCostRs: (rev.gridCost + rev.deliveryCharges) * scale, deliveredMwh: poi * scale, equivalentCycles: usable > 0 ? (discharged * scale) / usable : 0 };
  const spec = { dcMwp: p.solar.dcMwp, bessMw: p.bess.powerMw, bessMwh: p.bess.energyMwh, annualDegradation: p.solar.annualDegradation, fadePerYear: p.bess.fadePerYear, fadePerCycle: p.bess.fadePerCycle, augmentationThreshold: p.bess.augmentationThreshold };
  return { inputs: f, yearOne: { ...y1, revenueBreakdown: { ppa: rev.ppa * scale, peak: rev.peak * scale, merchant: rev.merchant * scale }, priceProvenance: rev.provenance }, result: projectFinance(spec, y1, f), sensitivity: sensitivity(spec, y1, f) };
}
