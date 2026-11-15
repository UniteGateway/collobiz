import { requireRole, audit } from '@/lib/auth';
import { HttpError } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { startSimulation } from '@/lib/hybrid';

/** Starts a full-year simulation in the background; poll /api/hybrid/jobs/:id for progress. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireRole('analyst');
  const { id } = await ctx.params;
  if (!(await db.hybridScenario.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, 'Scenario not found');
  const j = startSimulation(id, s.email);
  await audit(s, 'hybrid.simulation_started', 'hybridScenario', id);
  return { jobId: j.id };
});
