import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { loadProject, recordRun, runYear, yearView } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

export const maxDuration = 120;
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const r = simRequest(req.url);
  const sim = await runYear(p.config, p.prices, r);
  if (sim.computedMs > 0 && p.id) recordRun(p.id, sim).catch(() => undefined);
  return { project: { id: p.id, name: p.name, version: p.version, config: p.config, prices: p.prices }, ...yearView(sim) };
});
