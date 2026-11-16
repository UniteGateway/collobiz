import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { RouteSchema, routeAnalysis, routeInputs } from '@/lib/analysis';
import { loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';
import { approvedTariffs } from '@/lib/tariffs';

export const maxDuration = 120;
/** Modules 7–8 — delivered cost of open-access supply from approved tariff records. GET: AP → AP defaults. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  const u = new URL(req.url);
  const b = RouteSchema.parse({ destinationState: u.searchParams.get('to') ?? 'AP', compare: u.searchParams.get('compare') === '1' });
  return routeAnalysis(await approvedTariffs(), routeInputs(p, sim, b), b.compare);
});
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const b = RouteSchema.parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return routeAnalysis(await approvedTariffs(), routeInputs(p, sim, b), b.compare);
});
