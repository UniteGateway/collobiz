import { z } from 'zod';
import { baseScenario } from '@unite/power-engine';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { ScenarioSchema, ensureSamples } from '@/lib/hybrid';

/** All scenarios with their latest decision and headline results (for the list and the comparison view). */
export const GET = handle(async () => {
  await requireRole('viewer');
  await ensureSamples();
  const rows = await db.hybridScenario.findMany({ orderBy: [{ sampleKey: 'asc' }, { createdAt: 'asc' }], select: { id: true, name: true, sampleKey: true, inputs: true, inputVersion: true, resultVersion: true, results: true, decision: true, reviewStage: true, computedAt: true } });
  return rows.map((r) => {
    const res = r.results as Record<string, any> | null;
    return { id: r.id, name: r.name, sampleKey: r.sampleKey, inputs: r.inputs, inputVersion: r.inputVersion, resultVersion: r.resultVersion, stale: r.resultVersion != null && r.resultVersion !== r.inputVersion, decision: r.decision, reviewStage: r.reviewStage, computedAt: r.computedAt,
      headline: res ? { summary: res.summary, compliance: res.compliance, finance: { capex: res.finance.capex, projectIrr: res.finance.projectIrr, equityIrr: res.finance.equityIrr, minDscr: res.finance.minDscr, lcoeRsKwh: res.finance.lcoeRsKwh, breakEvenTariffRsKwh: res.finance.breakEvenTariffRsKwh, npvCr: res.finance.npvCr }, land: res.land, landed: { landedRsKwh: res.landed.landedRsKwh, buyerSavingRsKwh: res.landed.buyerSavingRsKwh }, decision: res.decision } : null };
  });
});

/** New scenario: a copy of an existing one (or the base template), always a new record. */
export const POST = handle(async (req: Request) => {
  const s = await requireRole('analyst');
  const b = z.object({ fromId: z.string().uuid().optional(), name: z.string().trim().min(3).max(160), inputs: z.record(z.string(), z.unknown()).optional() }).parse(await req.json());
  let inputs: Record<string, unknown> = baseScenario() as never;
  if (b.fromId) { const src = await db.hybridScenario.findUnique({ where: { id: b.fromId } }); if (!src) throw new HttpError(404, 'Scenario not found'); inputs = src.inputs as Record<string, unknown>; }
  if (b.inputs) inputs = { ...inputs, ...b.inputs };
  const parsed = ScenarioSchema.parse({ ...inputs, name: b.name });
  const row = await db.hybridScenario.create({ data: { name: b.name, inputs: parsed as never, createdBy: s.email } });
  await audit(s, 'hybrid.created', 'hybridScenario', row.id, undefined, { fromId: b.fromId });
  return { id: row.id };
});
