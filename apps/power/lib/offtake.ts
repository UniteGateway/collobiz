/** Offtake rules store and the check used by the offtake page and the savings offer. */
import { z } from 'zod';
import { DT_H, SEED_OFFTAKE_RULES, offtakeCheck, type OfftakeInputs, type OfftakeRule } from '@unite/power-engine';
import { db } from './db';
import type { YearSim } from './sim';

export async function activeRules(): Promise<OfftakeRule[]> {
  if (!(await db.offtakeRule.count())) await db.offtakeRule.createMany({ data: SEED_OFFTAKE_RULES.map((r) => ({ ...r, enteredBy: 'seed' })) });
  return (await db.offtakeRule.findMany({ where: { active: true }, orderBy: [{ state: 'asc' }, { key: 'asc' }] })).map((r) => ({ state: r.state, structure: r.structure as OfftakeRule['structure'], key: r.key as OfftakeRule['key'], value: r.value, confidence: r.confidence as OfftakeRule['confidence'], source: r.source, sourceUrl: r.sourceUrl ?? undefined, effectiveFrom: r.effectiveFrom ?? undefined, note: r.note ?? undefined }));
}

export const LOAD_SHAPES: Record<string, { label: string; shape: number[] }> = {
  flat: { label: 'Round the clock (3 shifts)', shape: Array(24).fill(1 / 24) },
  two_shift: { label: 'Two shifts, 6 AM–10 PM', shape: Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 22 ? 0.9 : 0.1)) },
  day_shift: { label: 'Day shift, 8 AM–8 PM', shape: Array.from({ length: 24 }, (_, h) => (h >= 8 && h < 20 ? 0.9 : 0.1)) },
};
for (const s of Object.values(LOAD_SHAPES)) { const t = s.shape.reduce((a, b) => a + b, 0); s.shape = s.shape.map((x) => x / t); }

const n = z.coerce.number();
export const OfftakeRequestSchema = z.object({
  state: z.string().min(2).max(3), structure: z.enum(['third_party', 'group_captive', 'captive']),
  contractDemandKva: n.positive(), sanctionedLoadKw: n.positive().optional(), monthlyConsumptionKwh: n.positive(), loadShape: z.enum(['flat', 'two_shift', 'day_shift']),
  proposedOaMw: n.min(0), rooftopKwp: n.min(0), rooftopKwhPerKwpYear: n.min(0).max(2500).default(1450), lossFraction: n.min(0).max(0.5).default(0.05),
  ownershipPct: n.min(0).max(100).optional(), plantConsumptionSharePct: n.min(0).max(100).optional(),
});
export type OfftakeRequest = z.infer<typeof OfftakeRequestSchema>;

/**
 * Builds the check from the simulated plant: OA energy per MW of contracted capacity follows the plant's monthly and hourly
 * delivery shape (solar direct + battery), scaled to the proposed MW and reduced by route losses.
 */
export function offtakeFromSim(req: OfftakeRequest, sim: YearSim, rules: OfftakeRule[]) {
  const monthly = Array(12).fill(0), hourly = Array(24).fill(0);
  const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  sim.days.forEach((d) => { let doy = d.day, m = 0; while (doy >= md[m]) { doy -= md[m]; m++; } d.intervals.forEach((it, t) => { const e = (it.sd + it.bd) * DT_H; monthly[m] += e; hourly[Math.floor(t * DT_H)] += e; }); });
  const perMw = 1 / Math.max(1e-9, sim.plant.delivery.contractedMw);
  const scale = req.proposedOaMw * perMw * 1000 * (1 - req.lossFraction); // MWh at plant → kWh at consumer for the proposed MW
  const ht = hourly.reduce((a, b) => a + b, 0) || 1;
  const rtMonthly = monthly.map((x) => (req.rooftopKwp * req.rooftopKwhPerKwpYear * (x / Math.max(1e-9, monthly.reduce((a, b) => a + b, 0)))));
  const inputs: OfftakeInputs = {
    state: req.state, structure: req.structure, contractDemandKva: req.contractDemandKva, sanctionedLoadKw: req.sanctionedLoadKw,
    monthlyConsumptionKwh: md.map((d) => (req.monthlyConsumptionKwh * d * 12) / 365), hourlyLoadShape: LOAD_SHAPES[req.loadShape].shape,
    proposedOaMw: req.proposedOaMw, oaMonthlyKwh: monthly.map((x) => x * scale), oaHourlyShape: hourly.map((x) => x / ht),
    rooftopKwp: req.rooftopKwp, rooftopMonthlyKwh: rtMonthly, ownershipPct: req.ownershipPct, plantConsumptionSharePct: req.plantConsumptionSharePct,
  };
  const result = offtakeCheck(inputs, rules);
  // Largest MW that never exceeds the load in any hour (no banking needed), from the same shapes.
  const dailyLoad = req.monthlyConsumptionKwh * 12 / 365, dailyPerMw = (monthly.reduce((a, b) => a + b, 0) * perMw * 1000 * (1 - req.lossFraction)) / 365;
  let noSurplusMw = Infinity;
  for (let h = 0; h < 24; h++) { const s = dailyPerMw * (hourly[h] / ht); if (s > 0) noSurplusMw = Math.min(noSurplusMw, (dailyLoad * LOAD_SHAPES[req.loadShape].shape[h] - (req.rooftopKwp * req.rooftopKwhPerKwpYear / 365) * (hourly[h] / ht)) / s); }
  const annualPerMwKwh = dailyPerMw * 365;
  return { inputs, result, noSurplusMw: Math.max(0, Number.isFinite(noSurplusMw) ? noSurplusMw : 0), energyMatchMw: Math.max(0, (req.monthlyConsumptionKwh * 12 - req.rooftopKwp * req.rooftopKwhPerKwpYear) / annualPerMwKwh), annualPerMwKwh };
}
