import { z } from 'zod';
import { CHECKLIST, REVIEW_LABELS, REVIEW_STAGES, canEnter, gridCheck, landCheck, type DecisionStatus, type HybridScenario } from '@unite/power-engine';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { ScenarioSchema } from '@/lib/hybrid';

type Ctx = { params: Promise<{ id: string }> };
/** Scenario with inputs, results (if computed for these inputs), quick checks and the review state. ?series=1 adds hourly series. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  await requireRole('viewer');
  const { id } = await ctx.params;
  const withSeries = new URL(req.url).searchParams.get('series') === '1';
  const r = await db.hybridScenario.findUnique({ where: { id }, include: { reviews: { orderBy: { at: 'desc' }, take: 30 } } });
  if (!r) throw new HttpError(404, 'Scenario not found');
  const sc = r.inputs as unknown as HybridScenario;
  const checklist = r.checklist as Record<string, boolean>;
  const decision = (r.decision ?? 'insufficient_data') as DecisionStatus;
  return {
    id: r.id, name: r.name, sampleKey: r.sampleKey, inputs: r.inputs, inputVersion: r.inputVersion, resultVersion: r.resultVersion, stale: r.resultVersion != null && r.resultVersion !== r.inputVersion,
    results: r.results, series: withSeries ? r.series : undefined, computedAt: r.computedAt,
    quick: { land: landCheck(sc), grid: gridCheck(sc) },
    review: { stage: r.reviewStage, stageLabel: REVIEW_LABELS[r.reviewStage as keyof typeof REVIEW_LABELS], checklist, items: CHECKLIST, stages: REVIEW_STAGES.map((s) => ({ key: s, label: REVIEW_LABELS[s], ...canEnter(s, checklist, decision) })), history: r.reviews },
  };
});

/** Saves edited inputs as a new input version; existing results become stale until re-simulated. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const s = await requireRole('analyst');
  const { id } = await ctx.params;
  const b = z.object({ inputs: z.record(z.string(), z.unknown()), expectedVersion: z.number().int() }).parse(await req.json());
  const parsed = ScenarioSchema.parse(b.inputs);
  const r = await db.hybridScenario.findUnique({ where: { id } });
  if (!r) throw new HttpError(404, 'Scenario not found');
  const u = await db.hybridScenario.updateMany({ where: { id, inputVersion: b.expectedVersion }, data: { inputs: parsed as never, name: parsed.name, inputVersion: { increment: 1 }, reviewStage: 'draft' } });
  if (!u.count) throw new HttpError(409, 'Someone else changed this scenario. Reload and try again.');
  await audit(s, 'hybrid.inputs_changed', 'hybridScenario', id, { version: r.inputVersion }, { version: r.inputVersion + 1 });
  return { inputVersion: r.inputVersion + 1, note: r.reviewStage !== 'draft' ? 'Inputs changed, so the review returned to Draft.' : undefined };
});
