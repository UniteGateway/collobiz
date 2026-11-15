import ExcelJS from 'exceljs';
import { DECISION_LABELS, OBJECTIVES, PRODUCTS, REVIEW_LABELS, type HybridScenario } from '@unite/power-engine';
import { HttpError, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { handle } from '@/lib/http';
import { heading, newDoc, para, table } from '@/lib/pdf';

const n0 = (x: number) => Math.round(x).toLocaleString('en-IN');
const p1 = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const cr = (x: number | null | undefined) => (x == null ? '—' : `Rs ${x.toLocaleString('en-IN', { maximumFractionDigits: 1 })} cr`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MODEL_VERSION = 'Hybrid Lab engine 1.0 (hourly MIP, HiGHS)';

/** Technical feasibility and scenario report (A4 PDF) or the financial model and hourly results (Excel). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole('viewer');
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get('format') ?? 'pdf';
  const row = await db.hybridScenario.findUnique({ where: { id }, include: { reviews: { orderBy: { at: 'asc' } } } });
  if (!row) throw new HttpError(404, 'Scenario not found');
  if (!row.results) throw new HttpError(409, 'Simulate the scenario first');
  const sc = row.inputs as unknown as HybridScenario, r = row.results as Record<string, any>, s = r.summary, c = r.compliance, f = r.finance;
  const stale = row.resultVersion !== row.inputVersion;
  const file = `hybrid-${row.id.slice(0, 8)}-v${row.resultVersion}`;
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Unite Hybrid Power Lab';
    const info = wb.addWorksheet('Scenario');
    info.addRows([['Scenario', row.name], ['Scenario ID', row.id], ['Input version', row.inputVersion], ['Result version', row.resultVersion], ['Model', MODEL_VERSION], ['Decision', DECISION_LABELS[r.decision.status as keyof typeof DECISION_LABELS]], ['Costs basis', sc.finance.provenance], ['Note', 'Illustrative inputs are labelled; figures are not a recommendation to sign.']]);
    const fin = wb.addWorksheet('Financials');
    fin.addRow(['Year', 'Delivered MWh', 'Revenue Rs cr', 'Opex Rs cr', 'EBITDA Rs cr', 'Augmentation Rs cr', 'Interest Rs cr', 'Principal Rs cr', 'Tax Rs cr', 'Project CF Rs cr', 'Equity CF Rs cr', 'DSCR', 'BESS capacity share']);
    for (const y of f.years) fin.addRow([y.year, y.deliveredMwh, y.revenueCr, y.opexCr, y.ebitdaCr, y.augmentationCr, y.interestCr, y.principalCr, y.taxCr, y.projectCfCr, y.equityCfCr, y.dscr, y.bessCapacityShare]);
    fin.addRow([]); fin.addRow(['Capex total Rs cr', f.capex.total]); fin.addRow(['Project IRR', f.projectIrr]); fin.addRow(['Equity IRR', f.equityIrr]); fin.addRow(['NPV Rs cr', f.npvCr]); fin.addRow(['LCOE Rs/kWh', f.lcoeRsKwh]); fin.addRow(['Break-even average tariff Rs/kWh', f.breakEvenTariffRsKwh]);
    const mon = wb.addWorksheet('Monthly');
    mon.addRow(['Month', 'Solar MWh', 'Wind MWh', 'Contracted MWh', 'Delivered MWh', 'Shortfall MWh', 'Curtailed MWh']);
    s.monthly.forEach((m: Record<string, number>, i: number) => mon.addRow([MONTHS[i], m.solar, m.wind, m.demand, m.delivered, m.shortfall, m.curtailed]));
    const series = row.series as Record<string, number[]> | null;
    if (series) {
      const hr = wb.addWorksheet('Hourly');
      const keys = Object.keys(series);
      hr.addRow(['Hour', ...keys.map((k) => (k === 'soc' ? 'SOC %' : `${k} MW`))]);
      for (let t = 0; t < series.S.length; t++) hr.addRow([t, ...keys.map((k) => series[k][t])]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${file}.xlsx"` } });
  }
  const { doc, done } = newDoc(`Hybrid power scenario — ${row.name}`, `Technical feasibility, dispatch and commercial summary · Scenario ${row.id.slice(0, 8)} · input v${row.inputVersion}, results v${row.resultVersion} · ${MODEL_VERSION}`);
  if (stale) para(doc, 'WARNING: the inputs changed after these results were computed. Re-run before relying on this report.', '#c2410c');
  heading(doc, 'Decision status');
  para(doc, `${DECISION_LABELS[r.decision.status as keyof typeof DECISION_LABELS]}. ${r.decision.why.join(' ')}`);
  para(doc, `Review stage: ${REVIEW_LABELS[row.reviewStage as keyof typeof REVIEW_LABELS]}. This report does not authorise signature of any agreement.`, '#5b6475');
  heading(doc, 'Configuration');
  table(doc, [['Item', 'Value'], ['Solar', sc.solar.acMw > 0 ? `${sc.solar.acMw} MW AC / ${sc.solar.dcMwp} MWp DC, ${sc.solar.tracker ? 'tracker' : 'fixed tilt'}` : 'None'], ['Wind', sc.wind.capacityMw > 0 ? `${sc.wind.capacityMw} MW (${sc.wind.turbineRatingMw} MW turbines, ${sc.wind.hubHeightM} m hub)` : 'None'],
    ['BESS', sc.bess.powerMw > 0 ? `${sc.bess.powerMw} MW / ${sc.bess.energyMwh} MWh, ηc ${sc.bess.chargeEff}, ηd ${sc.bess.dischargeEff}, ${sc.bess.coupling.toUpperCase()}-coupled, grid charging: ${sc.bess.grid}` : 'None'],
    ['Grid', `${sc.grid.voltageKv} kV, export ${sc.grid.exportMw} MW, import ${sc.grid.importMw} MW`], ['Contract', `${sc.product.contractedMw} MW, ${PRODUCTS[sc.product.kind].label}, allowed shortfall ${p1(sc.product.allowedShortfall)}`],
    ['Route', `${sc.state} → ${sc.destinationState}, ${sc.structure.replace(/_/g, ' ')}`], ['Dispatch objective', OBJECTIVES[sc.objective]]]);
  heading(doc, 'Energy balance (year 1)');
  table(doc, [['Flow', 'MWh'], ['Solar generated', n0(s.solarMwh)], ['Wind generated', n0(s.windMwh)], ['Solar → buyer', n0(s.directSolarMwh)], ['Wind → buyer', n0(s.directWindMwh)], ['Battery (renewable) → buyer', n0(s.batteryRenewableToLoadMwh)], ['Battery (grid-charged) → buyer', n0(s.batteryGridToLoadMwh)], ['Balancing power → buyer', n0(s.balancingMwh)],
    ['Charged from solar / wind / grid', `${n0(s.chargeSolarMwh)} / ${n0(s.chargeWindMwh)} / ${n0(s.chargeGridMwh)}`], ['Battery losses + auxiliary', `${n0(s.batteryLossMwh)} + ${n0(s.auxMwh)}`], ['Merchant export', n0(s.exportMwh)], ['Curtailed', n0(s.curtailSolarMwh + s.curtailWindMwh)], ['Contracted demand', n0(s.demandMwh)], ['Not delivered', n0(s.shortfallMwh)]]);
  heading(doc, 'Delivery compliance (tested hour by hour)');
  table(doc, [['Measure', 'Value'], ['Contracted energy delivered', p1(c.reliability)], ['Hours fully served', `${c.hoursFullyServed} of ${c.hoursWithDemand} (${p1(c.hoursFullyServedShare)})`], ['Worst month', `${MONTHS[c.worstMonth]} — ${p1(c.monthlyFulfilment[c.worstMonth])}`], ['Longest continuous shortfall', `${c.longestShortfallRunHours} h, ${n0(c.largestShortfallEventMwh)} MWh`], ['Renewable share of delivered energy', p1(c.renewableShare)]]);
  for (const x of c.reasons) para(doc, `• ${x}`);
  heading(doc, 'Land and grid (preliminary)');
  table(doc, [['Check', 'Result'], ['Land required / available', `${n0(r.land.requiredAcres)} / ${n0(r.land.availableAcres)} acres`], ['Peak injection / export limit', `${r.grid.maxPoiMw.toFixed(1)} / ${r.grid.exportMw} MW`], ['Transformer loading at peak', p1(r.grid.transformerLoading)]]);
  for (const i of r.grid.issues) para(doc, `• ${i.message}`, i.severity === 'block' ? '#b91c1c' : '#5b6475');
  heading(doc, 'Open-access landed cost');
  table(doc, [['Charge', 'Rs/kWh received', 'Basis'], ...r.landed.lines.map((l: Record<string, any>) => [`${l.label} (${l.jurisdiction})`, l.perKwhReceived.toFixed(3), l.provenance])]);
  para(doc, `Realised tariff Rs ${r.landed.realisedTariffRsKwh.toFixed(2)}/kWh; landed Rs ${r.landed.landedRsKwh.toFixed(2)}/kWh; buyer saving Rs ${r.landed.buyerSavingRsKwh.toFixed(2)}/kWh against Rs ${r.consumerTariff}/kWh. ${r.landed.flags.join(' ')}`);
  heading(doc, 'Project economics');
  table(doc, [['Measure', 'Value'], ['Capex', cr(f.capex.total)], ['Project IRR / equity IRR', `${p1(f.projectIrr)} / ${p1(f.equityIrr)}`], ['NPV', cr(f.npvCr)], ['Minimum / average DSCR', `${f.minDscr?.toFixed(2) ?? '—'} / ${f.avgDscr?.toFixed(2) ?? '—'}`], ['LCOE / LCOS', `Rs ${f.lcoeRsKwh.toFixed(2)} / ${f.lcosRsKwh == null ? '—' : `Rs ${f.lcosRsKwh.toFixed(2)}`} per kWh`], ['Break-even average tariff', f.breakEvenTariffRsKwh == null ? '—' : `Rs ${f.breakEvenTariffRsKwh.toFixed(2)}/kWh`], ['Equity payback', f.paybackYear ? `year ${f.paybackYear}` : 'not within term']]);
  for (const n of f.notes) para(doc, `• ${n}`, '#5b6475');
  heading(doc, 'Data sources and limitations');
  para(doc, `Solar: ${r.sources.solar}. Wind: ${r.sources.wind}. Open-access charges come from versioned tariff records; placeholders are marked illustrative. Grid availability, connectivity, scheduling and metering approvals are not assumed. Results are screening-grade until site measurements, quotations and verified orders replace the illustrative inputs.`, '#5b6475');
  if (row.reviews.length) { heading(doc, 'Review record'); table(doc, [['When', 'Stage', 'By'], ...row.reviews.map((h) => [h.at.toISOString().slice(0, 16).replace('T', ' '), REVIEW_LABELS[h.toStage as keyof typeof REVIEW_LABELS] ?? h.toStage, h.actor])]); }
  doc.end();
  return new Response(new Uint8Array(await done), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${file}.pdf"` } });
});
