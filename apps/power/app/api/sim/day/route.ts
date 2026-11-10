import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { dayView, loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const day = z.coerce.number().int().min(0).max(364).parse(new URL(req.url).searchParams.get('day') ?? '0');
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return dayView(sim, day);
});
