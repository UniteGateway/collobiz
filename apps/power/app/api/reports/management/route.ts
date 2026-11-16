import { requireRole } from '@/lib/auth';
import { handle } from '@/lib/http';
import { financeAnalysis, networkAnalysis, networkDefaults, routeAnalysis, routeInputs, RouteSchema } from '@/lib/analysis';
import { cr, heading, newDoc, para, pctS, table } from '@/lib/pdf';
import { loadProject, runYear, yearView } from '@/lib/sim';
import { projectIdOf, simRequest } from '@/lib/simreq';
import { approvedTariffs } from '@/lib/tariffs';

export const maxDuration = 120;
const n0 = (v: number) => Math.round(v).toLocaleString('en-IN');
const MODE: Record<string, string> = { max_profit: 'Maximum profit', max_savings: 'Maximum savings', max_reliability: 'Maximum reliability' };

/** Module 12 — management report (PDF): generation, dispatch, reliability, evacuation, open access and finance on one basis. */
export const GET = handle(async (req: Request) => {
  await requireRole('viewer');
  const p = await loadProject(projectIdOf(req.url));
  const r = simRequest(req.url);
  const sim = await runYear(p.config, p.prices, r);
  const y = yearView(sim), s = y.summary;
  const net = networkAnalysis(sim, networkDefaults(p), p.prices.ppaSolarRsKwh.value);
  const oa = routeAnalysis(await approvedTariffs(), routeInputs(p, sim, RouteSchema.parse({})), false).result;
  const fin = financeAnalysis(sim);
  const { doc, done } = newDoc(`Management report — ${p.name}`, `${p.config.site.location} · ${MODE[r.mode]} dispatch · ${r.scenario.replace(/_/g, ' ')} weather${r.cufTarget ? ` · calibrated to ${pctS(r.cufTarget)} CUF (${(r.cufBasis ?? "dc").toUpperCase()})` : ''}`);
  para(doc, 'All figures come from one simulated year on the inputs below. Climate inputs, tariff records and cost assumptions marked illustrative are placeholders, not measured or official values; treat results as indicative until they are replaced.', '#7a4b00');
  heading(doc, 'Plant');
  table(doc, [['Item', 'Value'], ['Solar', `${p.config.solar.dcMwp} MWp DC / ${p.config.solar.acMw} MW AC`], ['Battery', `${p.config.bess.powerMw} MW / ${p.config.bess.energyMwh} MWh`], ['Contract', `${p.config.delivery.contractedMw} MW, ${p.config.delivery.windowStartHour}:00–${p.config.delivery.windowEndHour}:00`], ['Export', `${p.config.delivery.gridExportMw} MW at ${p.config.delivery.exportVoltageKv} kV`]]);
  heading(doc, 'Generation and delivery (year)');
  table(doc, [['', 'MWh'], ['Solar AC generation', n0(y.solar.acMwh)], ['Delivered to the contract — direct', n0(s.directMwh)], ['Delivered to the contract — battery', n0(s.batteryToLoadMwh)], ['Exported outside the contract', n0(s.exportUncontractedMwh + s.batteryToExportMwh)], ['Curtailed', n0(s.curtailedMwh)], ['Contract not served', n0(s.unservedMwh)]]);
  table(doc, [['Metric', 'Value'], ['CUF (DC / AC)', `${pctS(y.solar.cufDc.value)} / ${pctS(y.solar.cufAc.value)}`], ['Contract coverage', pctS(s.demandCoverage)], ['Battery equivalent cycles', s.equivalentCycles.toFixed(0)], ['Feasibility', `${y.feasibility.annual.feasibility.replace(/_/g, ' ')} — ${y.feasibility.annual.feasibleDays} feasible, ${y.feasibility.annual.conditionalDays} conditional, ${y.feasibility.annual.notFeasibleDays} not feasible days`]]);
  heading(doc, 'Evacuation (Module 6)');
  table(doc, [['Voltage', 'Loss %', 'Capex', '25-yr cost'], ...net.results.map((x) => [`${x.kv} kV${x.kv === net.recommendedKv ? ' (lowest cost)' : ''}${x.thermalOk ? '' : ' — over thermal limit'}`, pctS(x.lossPct, 2), `Rs ${x.capexCr.toFixed(1)} cr`, `Rs ${x.totalCostCr.toFixed(1)} cr`])]);
  net.flags.forEach((f) => para(doc, `• ${f.message}`, f.severity === 'critical' ? '#a40000' : '#7a4b00'));
  heading(doc, 'Open access — Andhra Pradesh consumer (Module 7)');
  table(doc, [['', 'Value'], ['Energy injected / received', `${n0(oa.energyInjectedMwh)} / ${n0(oa.energyReceivedMwh)} MWh`], ['Charges a year', cr(oa.chargesRs)], ['Landed cost', `Rs ${oa.landedRsKwh.toFixed(2)}/kWh`], ['Saving against Rs 7.50/kWh discom tariff', `Rs ${oa.buyerSavingRsKwh.toFixed(2)}/kWh`], ['Share of charges from illustrative records', pctS(oa.illustrativeShare, 0)]]);
  heading(doc, 'Finance (Module 10)');
  const f = fin.result;
  table(doc, [['', 'Value'], ['Capital cost', `Rs ${f.capex.total.toFixed(1)} cr (debt ${f.debtCr.toFixed(1)}, equity ${f.equityCr.toFixed(1)})`], ['Project IRR / equity IRR', `${f.projectIrr == null ? 'n/a' : pctS(f.projectIrr)} / ${f.equityIrr == null ? 'n/a' : pctS(f.equityIrr)}`], ['NPV', `Rs ${f.npvCr.toFixed(1)} cr`], ['Minimum / average DSCR', f.minDscr == null ? 'No debt' : `${f.minDscr.toFixed(2)} / ${f.avgDscr!.toFixed(2)}`], ['LCOE at the POI', `Rs ${f.lcoeRsKwh.toFixed(2)}/kWh`]]);
  table(doc, [['Sensitivity', 'Project IRR', 'NPV', 'Min DSCR'], ...fin.sensitivity.map((c) => [c.label.replace(/\u2212/g, '-'), c.projectIrr == null ? 'n/a' : pctS(c.projectIrr), `Rs ${c.npvCr.toFixed(1)} cr`, c.minDscr == null ? '—' : c.minDscr.toFixed(2)])]);
  f.notes.forEach((t) => para(doc, `• ${t}`, '#5b6475'));
  doc.end();
  const pdf = await done;
  return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="management-report-${new Date().toISOString().slice(0, 10)}.pdf"` } });
});
