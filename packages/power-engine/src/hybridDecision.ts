/**
 * Hybrid Lab — land and grid checks, landed cost, project finance, decision status, combination generator, pre-signature
 * review and the regulatory source register. Pure functions; every figure states whether it is an assumption.
 */
import { ILLUSTRATIVE_VOLTAGES, lineLossMw } from './network';
import { deliveredCost, illustrativeTariffs, type RouteResult, type TariffRecord } from './openaccess';
import { screeningDays, simulateHybrid, summarizeHybrid, type HybridResult, type HybridScenario, type HybridSummary } from './hybrid';
import { turbines } from './wind';

// ---------------------------------------------------------------------------------------------------------- land
export interface LandCheck { solarAcres: number; windPadAcres: number; windSpacingAcres: number; bessAcres: number; substationAcres: number; requiredAcres: number; availableAcres: number; remainingAcres: number; ok: boolean; notes: string[] }
export function landCheck(sc: HybridScenario): LandCheck {
  const l = sc.land, n = turbines(sc.wind);
  const solar = sc.solar.dcMwp * l.solarAcresPerMwp * (sc.solar.tracker ? 1.2 : 1);
  const pads = n * l.windPadAcresPerTurbine, spacing = sc.wind.capacityMw * l.windSpacingAcresPerMw;
  const bess = sc.bess.energyMwh * l.bessAcresPerMwh + (sc.bess.energyMwh > 0 ? 1 : 0); // + fire separation / access allowance
  // Co-located: turbines sit inside the solar block, so the spacing area overlaps solar land; pads still take ground.
  const required = (l.coLocated ? Math.max(solar + pads, spacing) : solar + Math.max(spacing, pads)) + bess + l.substationAcres;
  const notes = ['Preliminary — subject to site survey, layout, setbacks, drainage, zoning and permits.'];
  if (n > 0) notes.push(`Wind spacing (${l.windSpacingAcresPerMw} acres/MW) is a screening assumption; micro-siting and setbacks are site-specific.`);
  if (l.coLocated && n > 0) notes.push('Solar and wind share land; shading from towers and access to turbine pads must be designed.');
  return { solarAcres: solar, windPadAcres: pads, windSpacingAcres: spacing, bessAcres: bess, substationAcres: l.substationAcres, requiredAcres: required, availableAcres: l.availableAcres, remainingAcres: l.availableAcres - required, ok: required <= l.availableAcres, notes };
}

// ---------------------------------------------------------------------------------------------------------- grid
export interface GridCheck { simultaneousMw: number; exportMw: number; importMw: number; maxPoiMw: number; transformerLoading: number; voltageKnown: boolean; thermalOk: boolean | null; annualLineLossMwh: number | null; issues: { severity: 'block' | 'warning' | 'info'; message: string }[] }
export function gridCheck(sc: HybridScenario, r?: HybridResult): GridCheck {
  const issues: GridCheck['issues'] = [];
  const sim = sc.solar.acMw + sc.wind.capacityMw + sc.bess.powerMw;
  const maxPoi = r ? Math.max(0, ...r.days.flatMap((d) => d.hours.map((h) => h.sD + h.wD + h.sX + h.wX + h.bDr + h.bDg + h.bXr + h.bXg))) : Math.min(sim, sc.grid.exportMw);
  if (sc.grid.exportMw < sc.product.contractedMw) issues.push({ severity: 'block', message: `Export limit ${sc.grid.exportMw} MW is below the contracted ${sc.product.contractedMw} MW.` });
  if (sim > sc.grid.exportMw) issues.push({ severity: 'warning', message: `Solar + wind + BESS can inject ${sim.toFixed(0)} MW at once against a ${sc.grid.exportMw} MW export limit: needs a power plant controller, curtailment and an interconnection agreement that allows it.` });
  if (sc.bess.grid !== 'no' && sc.grid.importMw <= 0) issues.push({ severity: 'block', message: 'Grid charging is enabled but the import limit is 0 MW.' });
  if (sc.bess.grid === 'conditional') issues.push({ severity: 'warning', message: 'Grid charging is conditional: confirm the permitted periods, metering and how grid-charged energy is accounted.' });
  const v = ILLUSTRATIVE_VOLTAGES.find((x) => x.kv === sc.grid.voltageKv);
  const loading = sc.grid.transformerMva > 0 ? maxPoi / (sc.grid.transformerMva * 0.98) : Infinity;
  if (loading > 1) issues.push({ severity: 'block', message: `Peak injection ${maxPoi.toFixed(1)} MW exceeds the ${sc.grid.transformerMva} MVA transformer rating.` });
  else if (loading > 0.9) issues.push({ severity: 'warning', message: `Transformer loaded to ${(loading * 100).toFixed(0)}% at peak.` });
  let thermalOk: boolean | null = null, lineLoss: number | null = null;
  if (!v) issues.push({ severity: 'info', message: `No screening data for ${sc.grid.voltageKv} kV${sc.grid.customVoltage ? ' (custom voltage)' : ''}; line losses and thermal limit not estimated.` });
  else {
    thermalOk = maxPoi <= v.thermalLimitMw;
    if (!thermalOk) issues.push({ severity: 'block', message: `${maxPoi.toFixed(0)} MW exceeds the indicative ${v.thermalLimitMw} MW single-circuit limit at ${v.kv} kV.` });
    if (r) lineLoss = r.days.reduce((a, d) => a + d.hours.reduce((x, h) => x + lineLossMw(h.sD + h.wD + h.sX + h.wX + h.bDr + h.bDg + h.bXr + h.bXg, v, sc.grid.lineKm, 1, 0.98), 0), 0);
  }
  issues.push({ severity: 'info', message: `Availability of ${sc.grid.voltageKv} kV at the connection point and the approved connectivity quantum must be confirmed with the STU/CTU.` });
  return { simultaneousMw: sim, exportMw: sc.grid.exportMw, importMw: sc.grid.importMw, maxPoiMw: maxPoi, transformerLoading: loading, voltageKnown: !!v, thermalOk, annualLineLossMwh: lineLoss, issues };
}

// ---------------------------------------------------------------------------------------------------------- landed cost
export function landedCost(sc: HybridScenario, s: HybridSummary, consumerTariffRsKwh: number, records: TariffRecord[] = illustrativeTariffs(), asOf = new Date().toISOString().slice(0, 10)): RouteResult & { realisedTariffRsKwh: number } {
  const realised = s.deliveredMwh > 0 ? (s.revenue.ppa + s.revenue.peak) / (s.deliveredMwh * 1000) : sc.prices.ppaRsKwh;
  const r = deliveredCost(records, { sourceState: sc.state, destinationState: sc.destinationState, receivingKv: sc.grid.voltageKv, capacityMw: sc.product.contractedMw, energyInjectedMwh: s.deliveredMwh * (8760 / Math.max(1, s.hours)), structure: sc.structure, istsConnected: false, confirmedConditions: {}, ppaRsKwh: realised, consumerTariffRsKwh, developerBears: [], asOf });
  return { ...r, realisedTariffRsKwh: realised };
}

// ---------------------------------------------------------------------------------------------------------- finance
export interface FinanceYear { year: number; revenueCr: number; opexCr: number; ebitdaCr: number; augmentationCr: number; interestCr: number; principalCr: number; taxCr: number; projectCfCr: number; equityCfCr: number; dscr: number | null; deliveredMwh: number; bessCapacityShare: number }
export interface FinanceResult {
  capex: { solar: number; wind: number; bessPower: number; bessEnergy: number; grid: number; land: number; development: number; contingency: number; total: number };
  years: FinanceYear[]; projectIrr: number | null; equityIrr: number | null; npvCr: number; minDscr: number | null; avgDscr: number | null; paybackYear: number | null;
  lcoeRsKwh: number; lcosRsKwh: number | null; breakEvenTariffRsKwh: number | null; maxAffordableCapexCr: number; provenance: string; notes: string[];
}
export function irr(cfs: number[]) {
  const npv = (r: number) => cfs.reduce((a, c, i) => a + c / (1 + r) ** i, 0);
  let lo = -0.9, hi = 1.0;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (npv(lo) * npv(m) <= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
const pv = (xs: number[], r: number) => xs.reduce((a, x, i) => a + x / (1 + r) ** (i + 1), 0);

/** Year-1 dispatch scaled by degradation for later years — a screening model; re-simulate later years for bankable figures. */
export function financeModel(sc: HybridScenario, s: HybridSummary, tariffShiftRsKwh = 0): FinanceResult {
  const f = sc.finance, l = landCheck(sc), Cr = 1e7, scale = 8760 / Math.max(1, s.hours);
  const capex = { solar: sc.solar.dcMwp * f.solarCapexCrPerMwp, wind: sc.wind.capacityMw * f.windCapexCrPerMw, bessPower: sc.bess.powerMw * f.bessCapexCrPerMw, bessEnergy: sc.bess.energyMwh * f.bessCapexCrPerMwh, grid: f.gridCapexCr, land: l.requiredAcres * f.landCrPerAcre, development: f.devCostCr, contingency: 0, total: 0 };
  const base = capex.solar + capex.wind + capex.bessPower + capex.bessEnergy + capex.grid + capex.land + capex.development;
  capex.contingency = base * f.contingency; capex.total = base + capex.contingency;
  const debt = capex.total * f.debtShare, equity = capex.total - debt;
  const annuity = debt > 0 ? (debt * f.interestRate) / (1 - (1 + f.interestRate) ** -f.tenorYears) : 0;
  const delivered1 = s.deliveredMwh * scale, solarShare = s.deliveredMwh > 0 ? (s.directSolarMwh + s.chargeSolarMwh * sc.bess.chargeEff * sc.bess.dischargeEff) / s.deliveredMwh : 0;
  const rev1 = (s.revenue.ppa + s.revenue.peak + s.revenue.merchant) * scale + tariffShiftRsKwh * delivered1 * 1000;
  const var1 = (s.revenue.gridChargeCost + s.revenue.balancingCost + s.revenue.auxCost + s.revenue.penalties) * scale;
  const cyclesYr = s.equivalentCycles * scale;
  let bal = debt, capShare = 1, cumEq = -equity;
  const years: FinanceYear[] = [];
  let payback: number | null = null;
  for (let y = 1; y <= f.years; y++) {
    const solarF = (1 - 0.02) * (1 - 0.005) ** (y - 1);
    const genF = solarShare * solarF + (1 - solarShare);
    let aug = 0;
    if (sc.bess.energyMwh > 0) { capShare -= sc.bess.fadePerYear + sc.bess.fadePerCycle * cyclesYr; if (capShare < sc.bess.augmentationThreshold) { aug = sc.bess.energyMwh * (1 - capShare) * f.augmentationCrPerMwh; capShare = 1; } }
    const esc = (1 + sc.prices.escalation) ** (y - 1), om = (1 + f.omEscalation) ** (y - 1);
    const revenue = (rev1 * genF * esc - var1) / Cr;
    const opex = (sc.solar.dcMwp * f.solarOmCrPerMwYr + sc.wind.capacityMw * f.windOmCrPerMwYr + sc.bess.energyMwh * f.bessOmCrPerMwhYr) * om + capex.total * f.insurancePct;
    const ebitda = revenue - opex;
    const interest = y <= f.tenorYears ? bal * f.interestRate : 0, principal = y <= f.tenorYears ? annuity - interest : 0;
    bal -= principal;
    const dep = capex.total / f.years;
    const tax = Math.max(0, ebitda - interest - dep) * f.taxRate, unleveredTax = Math.max(0, ebitda - dep) * f.taxRate;
    const projectCf = ebitda - unleveredTax - aug, equityCf = ebitda - interest - principal - tax - aug;
    cumEq += equityCf; if (payback == null && cumEq >= 0) payback = y;
    years.push({ year: y, revenueCr: revenue, opexCr: opex, ebitdaCr: ebitda, augmentationCr: aug, interestCr: interest, principalCr: principal, taxCr: tax, projectCfCr: projectCf, equityCfCr: equityCf, dscr: interest + principal > 0 ? (ebitda - tax) / (interest + principal) : null, deliveredMwh: delivered1 * genF, bessCapacityShare: capShare });
  }
  const dscrs = years.map((y) => y.dscr).filter((x): x is number => x != null);
  const costs = years.map((y) => y.opexCr + y.augmentationCr), energy = years.map((y) => y.deliveredMwh * 1000);
  const lcoe = ((capex.total + pv(costs, f.discountRate)) * Cr) / Math.max(1, pv(energy, f.discountRate));
  const bessCap = capex.bessPower + capex.bessEnergy;
  const dis = s.dischargeMwh * scale * 1000;
  const lcos = dis > 0 ? ((bessCap * (1 + f.contingency) + pv(years.map((y) => sc.bess.energyMwh * f.bessOmCrPerMwhYr * (1 + f.omEscalation) ** (y.year - 1) + y.augmentationCr), f.discountRate)) * Cr + pv(years.map(() => s.revenue.gridChargeCost * scale), f.discountRate)) / pv(years.map(() => dis), f.discountRate) : null;
  const npv = -capex.total + pv(years.map((y) => y.projectCfCr), f.discountRate);
  return {
    capex, years, projectIrr: irr([-capex.total, ...years.map((y) => y.projectCfCr)]), equityIrr: irr([-equity, ...years.map((y) => y.equityCfCr)]), npvCr: npv,
    minDscr: dscrs.length ? Math.min(...dscrs) : null, avgDscr: dscrs.length ? dscrs.reduce((a, b) => a + b, 0) / dscrs.length : null, paybackYear: payback,
    lcoeRsKwh: lcoe, lcosRsKwh: lcos, breakEvenTariffRsKwh: null, maxAffordableCapexCr: capex.total + npv, provenance: f.provenance,
    notes: [`Costs are ${f.provenance === 'illustrative' ? 'ILLUSTRATIVE assumptions' : f.provenance === 'quotation' ? 'from quotations' : 'verified actuals'}.`, 'Later years scale year-1 dispatch by solar degradation; BESS fade and augmentation are modelled; re-simulate later years before financial close.', 'Straight-line depreciation and a flat tax rate are simplifications for screening.'],
  };
}
/** Average tariff change (₹/kWh, all delivered energy) that makes project NPV zero, reported as the break-even average tariff. */
export function withBreakEven(sc: HybridScenario, s: HybridSummary): FinanceResult {
  const base = financeModel(sc, s);
  let lo = -20, hi = 20;
  const npv = (d: number) => financeModel(sc, s, d).npvCr;
  if (npv(lo) > 0 || npv(hi) < 0) return base;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (npv(m) < 0) lo = m; else hi = m; }
  const realised = s.deliveredMwh > 0 ? (s.revenue.ppa + s.revenue.peak) / (s.deliveredMwh * 1000) : sc.prices.ppaRsKwh;
  return { ...base, breakEvenTariffRsKwh: realised + (lo + hi) / 2 };
}

// ---------------------------------------------------------------------------------------------------------- decision
export type DecisionStatus = 'feasible' | 'feasible_with_conditions' | 'infeasible' | 'insufficient_data' | 'regulatory_review_required';
export const DECISION_LABELS: Record<DecisionStatus, string> = { feasible: 'Feasible', feasible_with_conditions: 'Feasible with Conditions', infeasible: 'Infeasible', insufficient_data: 'Insufficient Data', regulatory_review_required: 'Regulatory Review Required' };
/**
 * Technical failure first; then missing data; then regulatory review; then conditions. Financial returns never make a
 * scenario feasible by themselves.
 */
export function decide(sc: HybridScenario, r: HybridResult, land: LandCheck, grid: GridCheck, landed: RouteResult) {
  const why: string[] = [];
  const blocks = grid.issues.filter((i) => i.severity === 'block');
  if (r.compliance.technical === 'infeasible' || !land.ok || blocks.length) {
    if (r.compliance.technical === 'infeasible') why.push(...r.compliance.reasons.slice(0, 1));
    if (!land.ok) why.push(`Needs ${land.requiredAcres.toFixed(0)} acres; ${land.availableAcres} available.`);
    why.push(...blocks.map((b) => b.message));
    return { status: 'infeasible' as DecisionStatus, why };
  }
  const missing: string[] = [];
  if (sc.solar.acMw > 0) missing.push('solar resource (illustrative climate, not site data)');
  if (sc.wind.capacityMw > 0 && sc.wind.resource.provenance === 'illustrative' && !sc.wind.series) missing.push('wind resource (synthetic, not measured)');
  if (sc.finance.provenance === 'illustrative') missing.push('costs (illustrative)');
  if (r.screening) missing.push('full-year simulation (screening days only)');
  if (missing.length) return { status: 'insufficient_data' as DecisionStatus, why: [`Technically ${r.compliance.technical === 'feasible' ? 'feasible' : 'feasible with conditions'} on the data used, but these inputs are not verified: ${missing.join('; ')}.`] };
  if (landed.illustrativeShare > 0) return { status: 'regulatory_review_required' as DecisionStatus, why: ['Open-access charges include unverified placeholders.'] };
  if (r.compliance.technical === 'feasible_with_conditions' || grid.issues.some((i) => i.severity === 'warning')) return { status: 'feasible_with_conditions' as DecisionStatus, why: [...r.compliance.reasons, ...grid.issues.filter((i) => i.severity === 'warning').map((i) => i.message)] };
  return { status: 'feasible' as DecisionStatus, why: [] };
}

/** Everything the scenario page shows, from one simulation. */
export function evaluate(r: HybridResult, consumerTariffRsKwh = 7.4, records?: TariffRecord[]) {
  const sc = r.scenario, land = landCheck(sc), grid = gridCheck(sc, r), landed = landedCost(sc, r.summary, consumerTariffRsKwh, records);
  const finance = withBreakEven(sc, r.summary);
  return { land, grid, landed, finance, decision: decide(sc, r, land, grid, landed) };
}

// ---------------------------------------------------------------------------------------------------------- combinations
export interface Range { min: number; max: number; step: number }
export interface CombinationRequest { solarAcMw: Range; windMw: Range; bessMw: Range; bessHours: number[]; budgetCr?: number; rankBy: 'reliability' | 'equity_irr' | 'npv' | 'lcoe' | 'capex'; maxCombinations?: number }
const values = (r: Range) => { const out: number[] = []; for (let v = r.min; v <= r.max + 1e-9; v += r.step > 0 ? r.step : Infinity) out.push(Math.round(v * 100) / 100); return out; };
export interface CombinationRow { id: string; solarAcMw: number; windMw: number; bessMw: number; bessMwh: number; pruned?: string; reliability?: number; hoursServed?: number; equityIrr?: number | null; projectIrr?: number | null; npvCr?: number; lcoe?: number; capexCr?: number; curtailedShare?: number; landAcres?: number; technical?: string; decision?: DecisionStatus; pareto?: boolean }
/**
 * Enumerates combinations, prunes the impossible ones before simulating (land, grid, budget, nothing to deliver with),
 * screens the rest on representative and worst-resource days, ranks them and marks the Pareto set (reliability ↑, NPV ↑,
 * capex ↓). Screening results are labelled; confirm the shortlist with a full-year run.
 */
export async function generateCombinations(base: HybridScenario, req: CombinationRequest, onProgress?: (done: number, total: number) => void) {
  const rows: CombinationRow[] = [];
  for (const s of values(req.solarAcMw)) for (const w of values(req.windMw)) for (const p of values(req.bessMw)) for (const h of p > 0 ? req.bessHours : [0]) rows.push({ id: `S${s}-W${w}-B${p}x${h}`, solarAcMw: s, windMw: w, bessMw: p, bessMwh: p * h });
  if (rows.length > (req.maxCombinations ?? 80)) throw new Error(`${rows.length} combinations requested; narrow the ranges to ${req.maxCombinations ?? 80} or fewer`);
  const scOf = (c: CombinationRow): HybridScenario => ({ ...base, name: c.id, solar: { ...base.solar, acMw: c.solarAcMw, dcMwp: c.solarAcMw * (base.solar.acMw > 0 ? base.solar.dcMwp / base.solar.acMw : 1.3) }, wind: { ...base.wind, capacityMw: c.windMw }, bess: { ...base.bess, powerMw: c.bessMw, energyMwh: c.bessMwh } });
  const days = screeningDays(scOf(rows[0]));
  let done = 0;
  for (const c of rows) {
    const sc = scOf(c), land = landCheck(sc), fin0 = financeModel(sc, summarizeHybrid(sc, []));
    c.landAcres = land.requiredAcres; c.capexCr = fin0.capex.total;
    if (c.solarAcMw + c.windMw <= 0) c.pruned = 'No generation';
    else if (!land.ok) c.pruned = `Land: needs ${land.requiredAcres.toFixed(0)} acres`;
    else if (req.budgetCr && fin0.capex.total > req.budgetCr) c.pruned = `Over budget (₹${fin0.capex.total.toFixed(0)} cr)`;
    else if (gridCheck(sc).issues.some((i) => i.severity === 'block')) c.pruned = 'Grid connection limit';
    if (!c.pruned) {
      const r = await simulateHybrid(sc, { days });
      const fin = financeModel(sc, r.summary);
      Object.assign(c, { reliability: r.compliance.reliability, hoursServed: r.compliance.hoursFullyServedShare, equityIrr: fin.equityIrr, projectIrr: fin.projectIrr, npvCr: fin.npvCr, lcoe: fin.lcoeRsKwh, curtailedShare: r.summary.generationMwh > 0 ? (r.summary.curtailSolarMwh + r.summary.curtailWindMwh) / r.summary.generationMwh : 0, technical: r.compliance.technical, decision: decide(sc, r, land, gridCheck(sc, r), { illustrativeShare: 1 } as RouteResult).status });
    }
    onProgress?.(++done, rows.length);
  }
  const live = rows.filter((c) => !c.pruned);
  for (const c of live) c.pareto = !live.some((o) => o !== c && o.reliability! >= c.reliability! && o.npvCr! >= c.npvCr! && o.capexCr! <= c.capexCr! && (o.reliability! > c.reliability! || o.npvCr! > c.npvCr! || o.capexCr! < c.capexCr!));
  const key: Record<CombinationRequest['rankBy'], (c: CombinationRow) => number> = { reliability: (c) => -(c.reliability ?? 0), equity_irr: (c) => -(c.equityIrr ?? -1), npv: (c) => -(c.npvCr ?? -1e9), lcoe: (c) => c.lcoe ?? 1e9, capex: (c) => c.capexCr ?? 1e9 };
  live.sort((a, b) => (a.technical === 'infeasible' ? 1 : 0) - (b.technical === 'infeasible' ? 1 : 0) || key[req.rankBy](a) - key[req.rankBy](b));
  return { ranked: live, pruned: rows.filter((c) => c.pruned), screeningDays: days.length, note: `Screened on ${days.length} representative and worst-resource days with illustrative resource data. Confirm the shortlist with full-year runs before relying on it.` };
}

// ---------------------------------------------------------------------------------------------------------- review
export const REVIEW_STAGES = ['draft', 'data_verified', 'technical_review', 'grid_review', 'regulatory_review', 'commercial_review', 'financial_review', 'risk_review', 'ready_for_negotiation', 'ready_for_legal_review', 'approved_for_signature'] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];
export const REVIEW_LABELS: Record<ReviewStage, string> = {
  draft: 'Draft scenario', data_verified: 'Data verified', technical_review: 'Technical review', grid_review: 'Grid review', regulatory_review: 'Regulatory review', commercial_review: 'Commercial review',
  financial_review: 'Financial review', risk_review: 'Risk review', ready_for_negotiation: 'Ready for negotiation', ready_for_legal_review: 'Ready for legal review', approved_for_signature: 'Approved for signature',
};
export const CHECKLIST = {
  site_generation_data: 'Verified site and generation data', land: 'Land feasibility', connectivity: 'Connectivity availability', export_import: 'Export/import permission',
  schedule_feasible: 'PPA schedule feasibility', bess_charging_permission: 'BESS charging permissions', re_accounting: 'Renewable-energy accounting', oa_charges: 'Open-access charges verified',
  current_regulations: 'Current regulations confirmed', financial_assumptions: 'Financial assumptions', buyer_credit: 'Buyer creditworthiness', payment_security: 'Payment security',
  penalties: 'Contract penalties', firming_source: 'Source of firming / backup power', grid_scheduling: 'Grid and scheduling approvals', metering: 'Metering requirements',
  engineering_signoff: 'Technical engineering sign-off', legal_review: 'Legal review',
} as const;
export type ChecklistKey = keyof typeof CHECKLIST;
/** Items that must be confirmed before a stage can be entered. Approval for signature needs every item and a human approver. */
export const STAGE_REQUIRES: Partial<Record<ReviewStage, ChecklistKey[]>> = {
  data_verified: ['site_generation_data'],
  technical_review: ['site_generation_data', 'land', 'schedule_feasible'],
  grid_review: ['connectivity', 'export_import', 'metering'],
  regulatory_review: ['oa_charges', 'current_regulations', 'bess_charging_permission', 're_accounting'],
  commercial_review: ['buyer_credit', 'payment_security', 'penalties', 'firming_source'],
  financial_review: ['financial_assumptions'],
  risk_review: ['grid_scheduling'],
  ready_for_legal_review: ['engineering_signoff'],
  approved_for_signature: Object.keys(CHECKLIST) as ChecklistKey[],
};
export function canEnter(stage: ReviewStage, confirmed: Partial<Record<ChecklistKey, boolean>>, decision: DecisionStatus) {
  const missing = REVIEW_STAGES.slice(1, REVIEW_STAGES.indexOf(stage) + 1).flatMap((s) => STAGE_REQUIRES[s] ?? []).filter((k, i, a) => a.indexOf(k) === i && !confirmed[k]);
  const blockers: string[] = missing.map((k) => CHECKLIST[k]);
  if (REVIEW_STAGES.indexOf(stage) >= REVIEW_STAGES.indexOf('ready_for_negotiation') && (decision === 'infeasible' || decision === 'insufficient_data')) blockers.unshift(`The scenario is ${DECISION_LABELS[decision]} — fix that before negotiation`);
  return { ok: blockers.length === 0, blockers };
}

// ---------------------------------------------------------------------------------------------------------- policy register
export interface PolicySource { id: string; title: string; authority: string; scope: string; url: string; status: 'not_reviewed' | 'reviewed' | 'draft_only'; note: string }
/**
 * Sources the brief names. None has been reviewed by this tool: the environment cannot reach these sites, so nothing from
 * them is applied. A reviewer records the order number, effective date and the specific charges as tariff records.
 */
export const POLICY_SOURCES: PolicySource[] = [
  { id: 'cerc-regs', title: 'CERC regulations (Grid Code, Connectivity & GNA incl. amendments, DSM, sharing of ISTS charges and losses)', authority: 'CERC', scope: 'Interstate', url: 'https://cercind.gov.in', status: 'not_reviewed', note: 'Requester cites a Fourth Amendment to the Connectivity and GNA Regulations dated 11 Nov 2026 — not verified here.' },
  { id: 'geoa', title: 'Electricity (Promoting Renewable Energy through Green Energy Open Access) Rules and portal', authority: 'Ministry of Power', scope: 'National', url: 'https://greenopenaccess.in', status: 'not_reviewed', note: '' },
  { id: 'mop-ess', title: 'National Framework for Energy Storage Systems; storage guidelines', authority: 'Ministry of Power', scope: 'National', url: 'https://powermin.gov.in', status: 'not_reviewed', note: '' },
  { id: 'mnre', title: 'MNRE hybrid / RTC / FDRE guidelines', authority: 'MNRE', scope: 'National', url: 'https://mnre.gov.in', status: 'not_reviewed', note: '' },
  { id: 'grid-india', title: 'Scheduling, metering and DSM procedures', authority: 'Grid-India', scope: 'Interstate', url: 'https://grid-india.in', status: 'not_reviewed', note: '' },
  { id: 'ctuil', title: 'ISTS connectivity applications and availability', authority: 'CTUIL', scope: 'Interstate', url: 'https://ctuil.in', status: 'not_reviewed', note: '' },
  { id: 'ap-icep-2024', title: 'Andhra Pradesh Integrated Clean Energy Policy 2024 and operational guidelines', authority: 'Govt. of AP / NREDCAP', scope: 'AP', url: 'https://nredcap.in', status: 'not_reviewed', note: '' },
  { id: 'ts-cgep-2025', title: 'Telangana Clean and Green Energy Policy 2025 (hybrid, RE-RTC, BESS provisions)', authority: 'Govt. of Telangana / TGREDCO', scope: 'TS', url: 'https://tgredco.telangana.gov.in', status: 'not_reviewed', note: '' },
  ...['TN', 'KA', 'GJ', 'MH', 'RJ', 'OD'].map((s) => ({ id: `${s.toLowerCase()}-oa`, title: `${s} open-access regulations and current tariff order`, authority: `${s} State Electricity Regulatory Commission`, scope: s, url: '', status: 'not_reviewed' as const, note: 'Add the order and its charges as tariff records.' })),
];
