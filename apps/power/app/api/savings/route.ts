import { ILLUSTRATIVE_CONSUMER } from '@unite/power-engine';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { ConsumerSchema, computeSavings } from '@/lib/savingsCalc';
import { loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

/** GET: savings for the illustrative consumer (dashboard). POST: savings for the consumer in the body. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return { consumer: { ...ILLUSTRATIVE_CONSUMER, allocation: 1, ppaTariffRsKwh: p.prices.ppaSolarRsKwh.value, peakBessTariffRsKwh: p.prices.peakBessRsKwh.value }, ...computeSavings({ ...ILLUSTRATIVE_CONSUMER, allocation: 1, ppaTariffRsKwh: p.prices.ppaSolarRsKwh.value, peakBessTariffRsKwh: p.prices.peakBessRsKwh.value }, sim) };
});
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const c = ConsumerSchema.parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return { consumer: c, ...computeSavings(c, sim) };
});
