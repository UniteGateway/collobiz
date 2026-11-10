import { DISPATCH_MODES, type DispatchMode } from '@unite/power-engine';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { loadProject, revenueOf, runYear, yearView } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

/** Runs the year in all three operating modes (cached) for side-by-side comparison. */
export const maxDuration = 300;
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const base = simRequest(req.url);
  const out = [];
  for (const mode of Object.keys(DISPATCH_MODES) as DispatchMode[]) {
    const sim = await runYear(p.config, p.prices, { ...base, mode });
    const v = yearView(sim);
    out.push({ mode, label: DISPATCH_MODES[mode], summary: v.summary, revenue: revenueOf(sim), feasibility: v.feasibility.annual, firmAvailability: v.firmAvailability });
  }
  return { modes: out };
});
