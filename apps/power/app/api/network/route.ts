import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { NetworkSchema, networkAnalysis, networkDefaults } from '@/lib/analysis';
import { loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

export const maxDuration = 120;
/** Module 6 — voltage & evacuation for the default network inputs. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return networkAnalysis(sim, networkDefaults(p), p.prices.ppaSolarRsKwh.value);
});
/** Recalculate with the user's network inputs and value of lost energy (₹/kWh). */
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const b = z.object({ inputs: NetworkSchema, lossValueRsKwh: z.coerce.number().min(0).max(30) }).parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return networkAnalysis(sim, b.inputs as never, b.lossValueRsKwh);
});
