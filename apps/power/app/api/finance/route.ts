import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { FinanceSchema, financeAnalysis } from '@/lib/analysis';
import { loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

export const maxDuration = 120;
/** Module 10 — project finance with illustrative cost assumptions (GET) or the user's (POST). */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  return financeAnalysis(await runYear(p.config, p.prices, simRequest(req.url)));
});
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const f = FinanceSchema.parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  return financeAnalysis(await runYear(p.config, p.prices, simRequest(req.url)), f);
});
