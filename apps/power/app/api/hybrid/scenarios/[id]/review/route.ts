import { z } from 'zod';
import { CHECKLIST, REVIEW_STAGES, canEnter, type DecisionStatus } from '@unite/power-engine';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';

/**
 * Pre-signature review. Analysts confirm checklist items and move the scenario forward stage by stage; only an admin can
 * record "Approved for signature", and only when every item is confirmed and the results are current. Nothing here signs.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('analyst');
  const { id } = await ctx.params;
  const b = z.object({ checklist: z.record(z.string(), z.boolean()).refine((c) => Object.keys(c).every((k) => k in CHECKLIST), { message: 'Unknown checklist item' }).optional(), toStage: z.enum(REVIEW_STAGES).optional(), note: z.string().trim().max(2000).optional() }).parse(await req.json());
  const r = await db.hybridScenario.findUnique({ where: { id } });
  if (!r) throw new HttpError(404, 'Scenario not found');
  const checklist = { ...(r.checklist as Record<string, boolean>), ...(b.checklist ?? {}) };
  let stage = r.reviewStage;
  if (b.toStage && b.toStage !== stage) {
    const from = REVIEW_STAGES.indexOf(stage as never), to = REVIEW_STAGES.indexOf(b.toStage);
    if (to > from + 1) throw new HttpError(409, 'Move one stage at a time');
    if (to > from) {
      if (r.resultVersion == null || r.resultVersion !== r.inputVersion) throw new HttpError(409, 'Run the simulation for the current inputs first');
      const g = canEnter(b.toStage, checklist, (r.decision ?? 'insufficient_data') as DecisionStatus);
      if (!g.ok) throw new HttpError(409, `Not yet: ${g.blockers.join('; ')}`);
      if (b.toStage === 'approved_for_signature' && s.role !== 'admin') throw new HttpError(403, 'Only an admin can record approval for signature');
      if (to >= REVIEW_STAGES.indexOf('ready_for_negotiation') && !b.note) throw new HttpError(400, 'Add a note recording who reviewed what');
    }
    stage = b.toStage;
  }
  await db.$transaction([
    db.hybridScenario.update({ where: { id }, data: { checklist, reviewStage: stage } }),
    db.hybridReviewEvent.create({ data: { scenarioId: id, fromStage: r.reviewStage, toStage: stage, checklist: b.checklist as never, note: b.note, actor: `${s.name} (${s.role})` } }),
  ]);
  await audit(s, 'hybrid.review', 'hybridScenario', id, { stage: r.reviewStage }, { stage, checklist: b.checklist });
  return { stage, checklist };
});
