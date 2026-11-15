import { ILLUSTRATIVE_CONSUMER } from '@unite/power-engine';
import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { ConsumerSchema, computeSavings } from '@/lib/savingsCalc';
import { loadProject, runYear } from '@/lib/sim';
import { activeRules, offtakeFromSim } from '@/lib/offtake';
import { projectIdOf, simRequest } from '@/lib/simreq';

/** GET: savings for the illustrative consumer (dashboard). POST: savings for the consumer in the body. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  return { consumer: { ...ILLUSTRATIVE_CONSUMER, allocation: 1, state: 'AP', structure: 'third_party', loadShape: 'two_shift', rooftopKwp: 0, ppaTariffRsKwh: p.prices.ppaSolarRsKwh.value, peakBessTariffRsKwh: p.prices.peakBessRsKwh.value }, ...computeSavings({ ...ILLUSTRATIVE_CONSUMER, allocation: 1, ppaTariffRsKwh: p.prices.ppaSolarRsKwh.value, peakBessTariffRsKwh: p.prices.peakBessRsKwh.value }, sim) };
});
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const c = ConsumerSchema.parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  const offtake = offtakeFromSim({ state: c.state, structure: c.structure, contractDemandKva: c.contractDemandKva, sanctionedLoadKw: c.sanctionedLoadKw, monthlyConsumptionKwh: c.monthlyKwh, loadShape: c.loadShape, proposedOaMw: p.config.delivery.contractedMw * c.allocation, rooftopKwp: c.rooftopKwp, rooftopKwhPerKwpYear: 1450, lossFraction: c.lossFraction, ownershipPct: c.ownershipPct, plantConsumptionSharePct: c.plantConsumptionSharePct }, sim, await activeRules());
  return { consumer: c, ...computeSavings(c, sim), offtake };
});
