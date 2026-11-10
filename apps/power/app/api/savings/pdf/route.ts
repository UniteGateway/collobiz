import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { cr, heading, inr, newDoc, para, pctS, table } from '@/lib/pdf';
import { ConsumerSchema, computeSavings } from '@/lib/savingsCalc';
import { loadProject, runYear } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';

/** Commercial proposal PDF for an industrial consumer. */
export const POST = handle(async (req: Request) => {
  await requireRole('viewer');
  const c = ConsumerSchema.parse(await req.json());
  const p = await loadProject(projectIdOf(req.url));
  const sim = await runYear(p.config, p.prices, simRequest(req.url));
  const { supply, result: s } = computeSavings(c, sim);
  const { doc, done } = newDoc(`Power supply proposal — ${c.name}`, `${p.name} · ${p.config.site.location} → ${c.location} · receiving at ${c.receivingVoltageKv} kV`);
  heading(doc, 'Summary');
  table(doc, [['', 'Monthly', 'Annual'], ['Present electricity bill', inr(s.present.total), inr(s.present.total * 12)], ['Proposed bill (plant + discom)', inr(s.proposed.total), inr(s.proposed.total * 12)], ['Saving', inr(s.monthlySaving), inr(s.annualSaving)], ['Saving, % of present bill', pctS(s.savingPct), ''], ['Peak-hour (evening) saving', inr(s.peakSavingMonthly), inr(s.peakSavingMonthly * 12)]]);
  para(doc, `Over the ${c.contractYears}-year term the projected saving is ${cr(s.lifetimeSaving)} (discom tariff escalation ${pctS(c.discomEscalation)} a year, PPA escalation ${pctS(c.ppaEscalation)} a year).`);
  heading(doc, 'Energy');
  table(doc, [['Per month', 'kWh'], ['Consumption', Math.round(c.monthlyKwh).toLocaleString('en-IN')], ['Plant energy injected for you', Math.round((supply.solarMwh + supply.batteryMwh) * 1000).toLocaleString('en-IN')], ['Lost in transmission and distribution', Math.round(s.proposed.lostKwh).toLocaleString('en-IN')], ['Plant energy used at your premises', Math.round(s.proposed.plantKwh).toLocaleString('en-IN')], ['Still bought from the discom (shortfall/backup)', Math.round(s.proposed.discomKwh).toLocaleString('en-IN')], ['Share of consumption from the plant', pctS(s.proposed.coverage)]]);
  heading(doc, 'Bill build-up (monthly)');
  table(doc, [['Item', 'Present', 'Proposed'], ['Energy (ToD)', inr(s.present.energy), inr(s.proposed.plantCharge + s.proposed.discomEnergy)], ['  of which plant energy', '', inr(s.proposed.plantCharge)], ['  of which discom energy', inr(s.present.energy), inr(s.proposed.discomEnergy)], ['Open-access charges', '', inr(s.proposed.openAccess)], ['Demand charges', inr(s.present.demand), inr(s.proposed.demand)], ['Electricity duty', inr(s.present.duty), inr(s.proposed.duty)], ['Fixed charges', inr(s.present.fixed), inr(s.proposed.fixed)], ['Total', inr(s.present.total), inr(s.proposed.total)]]);
  heading(doc, 'Tariffs and charges used');
  table(doc, [['Input', 'Value'], ['Solar PPA tariff', `Rs ${c.ppaTariffRsKwh}/kWh`], ['Peak BESS tariff', `Rs ${c.peakBessTariffRsKwh}/kWh`], ['Open-access charges (all-in)', `Rs ${c.openAccessChargesRsKwh}/kWh delivered`], ['Losses on the route', pctS(c.lossFraction)], ['Present rates (peak / normal / off-peak)', `Rs ${c.rate.peak} / ${c.rate.normal} / ${c.rate.offpeak} per kWh`], ['Demand charge', `Rs ${c.demandChargeRsKvaMonth}/kVA/month`]]);
  heading(doc, `Years 1–${Math.min(c.contractYears, 25)}`);
  table(doc, [['Year', 'Present', 'Proposed', 'Saving'], ...s.years.slice(0, 25).map((y) => [y.year, cr(y.present), cr(y.proposed), cr(y.saving)])]);
  heading(doc, 'Important');
  para(doc, `${s.note} Plant output is simulated (${sim.solar.weather.label}; dispatch mode: ${sim.req.mode.replace(/_/g, ' ')}). Open-access charges, losses and any waivers must be confirmed against the orders in force and the approvals actually granted. This proposal is not an offer to contract.`, '#5b6475');
  doc.end();
  const pdf = await done;
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="proposal-${c.name.replace(/[^\w-]+/g, '-').slice(0, 40)}.pdf"` } });
});
