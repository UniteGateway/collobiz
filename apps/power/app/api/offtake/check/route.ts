import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { OfftakeRequestSchema, activeRules, offtakeFromSim } from '@/lib/offtake';
import { loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

/** How much open-access and rooftop solar this consumer can take, using the simulated plant's delivery shape. */
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const b = OfftakeRequestSchema.parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return offtakeFromSim(b, sim, await activeRules());
});
