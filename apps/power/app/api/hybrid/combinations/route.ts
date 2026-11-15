import { z } from 'zod';
import { audit, HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { CombinationSchema, startCombinations } from '@/lib/hybrid';

/** Starts a combination search from a base scenario (its site, prices, product and finance), returns a job id. */
export const POST = handle(async (req: Request) => {
  const s = await requireRole('analyst');
  const b = z.object({ scenarioId: z.string().uuid(), request: CombinationSchema }).parse(await req.json());
  if (!(await db.hybridScenario.findUnique({ where: { id: b.scenarioId }, select: { id: true } }))) throw new HttpError(404, 'Scenario not found');
  const j = startCombinations(b.scenarioId, b.request, s.email);
  await audit(s, 'hybrid.combinations_started', 'hybridScenario', b.scenarioId, undefined, b.request);
  return { jobId: j.id };
});
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const sid = new URL(req.url).searchParams.get('scenarioId');
  return db.hybridCombinationRun.findMany({ where: sid ? { scenarioId: sid } : {}, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, scenarioId: true, request: true, createdAt: true } });
});
