/**
 * Module 10 — project finance for the solar + BESS plant (screening model).
 *
 * Year 1 comes from the simulated dispatch (revenue, variable costs, delivered energy, battery cycles). Later years scale
 * year 1 by solar degradation and tariff escalation; BESS fade is tracked and augmentation is bought when usable capacity
 * falls below the threshold. Debt is a level annuity. Every cost assumption is editable and labelled with its provenance.
 *
 *   Project IRR   on  −capex, (EBITDA − unlevered tax − augmentation) per year
 *   Equity IRR    on  −equity, (EBITDA − interest − principal − tax − augmentation) per year
 *   DSCR          =   (EBITDA − tax) / (interest + principal)
 *   LCOE          =   (capex + PV(opex + augmentation)) / PV(delivered energy)
 */
import { irr } from './hybridDecision';

export interface ProjectFinanceInputs {
  solarCapexCrPerMwp: number; bessCapexCrPerMw: number; bessCapexCrPerMwh: number; evacuationCapexCr: number; devCostCr: number; contingency: number;
  solarOmCrPerMwpYr: number; bessOmCrPerMwhYr: number; omEscalation: number; insurancePct: number; augmentationCrPerMwh: number;
  debtShare: number; interestRate: number; tenorYears: number; discountRate: number; taxRate: number; years: number; tariffEscalation: number;
  provenance: 'illustrative' | 'quotation' | 'actual';
}
/** Illustrative defaults — orders of magnitude for screening only. Replace with quotations before relying on results. */
export const ILLUSTRATIVE_PROJECT_FINANCE: ProjectFinanceInputs = {
  solarCapexCrPerMwp: 3.6, bessCapexCrPerMw: 0.5, bessCapexCrPerMwh: 1.5, evacuationCapexCr: 18, devCostCr: 5, contingency: 0.04,
  solarOmCrPerMwpYr: 0.045, bessOmCrPerMwhYr: 0.01, omEscalation: 0.05, insurancePct: 0.003, augmentationCrPerMwh: 0.9,
  debtShare: 0.7, interestRate: 0.095, tenorYears: 15, discountRate: 0.1, taxRate: 0.25, years: 25, tariffEscalation: 0, provenance: 'illustrative',
};

export interface PlantFinanceSpec { dcMwp: number; bessMw: number; bessMwh: number; annualDegradation: number; fadePerYear: number; fadePerCycle: number; augmentationThreshold: number }
/** Year-1 operating result from the simulation (rupees and MWh). */
export interface YearOne { revenueRs: number; variableCostRs: number; deliveredMwh: number; equivalentCycles: number }
export interface Shifts { tariff?: number; capex?: number; generation?: number; interestPp?: number }

export interface ProjectFinanceYear { year: number; revenueCr: number; opexCr: number; ebitdaCr: number; augmentationCr: number; interestCr: number; principalCr: number; taxCr: number; projectCfCr: number; equityCfCr: number; dscr: number | null; deliveredMwh: number }
export interface ProjectFinanceResult {
  capex: { solar: number; bessPower: number; bessEnergy: number; evacuation: number; development: number; contingency: number; total: number };
  debtCr: number; equityCr: number; years: ProjectFinanceYear[];
  projectIrr: number | null; equityIrr: number | null; npvCr: number; minDscr: number | null; avgDscr: number | null; paybackYear: number | null; lcoeRsKwh: number; notes: string[];
}

const Cr = 1e7;
const pv = (xs: number[], r: number) => xs.reduce((a, x, i) => a + x / (1 + r) ** (i + 1), 0);

export function projectFinance(p: PlantFinanceSpec, y1: YearOne, f: ProjectFinanceInputs, s: Shifts = {}): ProjectFinanceResult {
  const capexF = 1 + (s.capex ?? 0), tariffF = 1 + (s.tariff ?? 0), genF0 = 1 + (s.generation ?? 0), rate = f.interestRate + (s.interestPp ?? 0) / 100;
  const capex = { solar: p.dcMwp * f.solarCapexCrPerMwp * capexF, bessPower: p.bessMw * f.bessCapexCrPerMw * capexF, bessEnergy: p.bessMwh * f.bessCapexCrPerMwh * capexF, evacuation: f.evacuationCapexCr * capexF, development: f.devCostCr, contingency: 0, total: 0 };
  const base = capex.solar + capex.bessPower + capex.bessEnergy + capex.evacuation + capex.development;
  capex.contingency = base * f.contingency; capex.total = base + capex.contingency;
  const debt = capex.total * f.debtShare, equity = capex.total - debt;
  const annuity = debt > 0 && f.tenorYears > 0 ? (rate > 0 ? (debt * rate) / (1 - (1 + rate) ** -f.tenorYears) : debt / f.tenorYears) : 0;
  let bal = debt, capShare = 1, cumEq = -equity, payback: number | null = null;
  const years: ProjectFinanceYear[] = [];
  for (let y = 1; y <= f.years; y++) {
    const gen = genF0 * (1 - p.annualDegradation) ** (y - 1);
    let aug = 0;
    if (p.bessMwh > 0) { capShare -= p.fadePerYear + p.fadePerCycle * y1.equivalentCycles; if (capShare < p.augmentationThreshold) { aug = p.bessMwh * (1 - capShare) * f.augmentationCrPerMwh; capShare = 1; } }
    const revenue = (y1.revenueRs * gen * tariffF * (1 + f.tariffEscalation) ** (y - 1) - y1.variableCostRs * gen) / Cr;
    const opex = (p.dcMwp * f.solarOmCrPerMwpYr + p.bessMwh * f.bessOmCrPerMwhYr) * (1 + f.omEscalation) ** (y - 1) + capex.total * f.insurancePct;
    const ebitda = revenue - opex;
    const interest = y <= f.tenorYears ? bal * rate : 0, principal = y <= f.tenorYears ? annuity - interest : 0;
    bal -= principal;
    const dep = capex.total / f.years;
    const tax = Math.max(0, ebitda - interest - dep) * f.taxRate, unleveredTax = Math.max(0, ebitda - dep) * f.taxRate;
    const projectCf = ebitda - unleveredTax - aug, equityCf = ebitda - interest - principal - tax - aug;
    cumEq += equityCf; if (payback == null && cumEq >= 0) payback = y;
    years.push({ year: y, revenueCr: revenue, opexCr: opex, ebitdaCr: ebitda, augmentationCr: aug, interestCr: interest, principalCr: principal, taxCr: tax, projectCfCr: projectCf, equityCfCr: equityCf, dscr: interest + principal > 0 ? (ebitda - tax) / (interest + principal) : null, deliveredMwh: y1.deliveredMwh * gen });
  }
  const dscrs = years.map((y) => y.dscr).filter((x): x is number => x != null);
  const lcoe = ((capex.total + pv(years.map((y) => y.opexCr + y.augmentationCr), f.discountRate)) * Cr) / Math.max(1, pv(years.map((y) => y.deliveredMwh * 1000), f.discountRate));
  return {
    capex, debtCr: debt, equityCr: equity, years,
    projectIrr: irr([-capex.total, ...years.map((y) => y.projectCfCr)]), equityIrr: equity > 0 ? irr([-equity, ...years.map((y) => y.equityCfCr)]) : null,
    npvCr: -capex.total + pv(years.map((y) => y.projectCfCr), f.discountRate),
    minDscr: dscrs.length ? Math.min(...dscrs) : null, avgDscr: dscrs.length ? dscrs.reduce((a, b) => a + b, 0) / dscrs.length : null, paybackYear: payback, lcoeRsKwh: lcoe,
    notes: [
      `Cost assumptions are ${f.provenance === 'illustrative' ? 'ILLUSTRATIVE — replace with quotations' : f.provenance === 'quotation' ? 'from quotations' : 'verified actuals'}.`,
      'Later years scale the simulated year 1 by solar degradation and tariff escalation; re-simulate later years before financial close.',
      'Straight-line depreciation over the project life and a flat tax rate are screening simplifications.',
    ],
  };
}

export interface SensitivityCase { key: string; label: string; shifts: Shifts }
export const SENSITIVITY_CASES: SensitivityCase[] = [
  { key: 'base', label: 'Base case', shifts: {} },
  { key: 'tariff_down', label: 'Tariff −10%', shifts: { tariff: -0.1 } },
  { key: 'tariff_up', label: 'Tariff +10%', shifts: { tariff: 0.1 } },
  { key: 'capex_up', label: 'Capex +10%', shifts: { capex: 0.1 } },
  { key: 'capex_down', label: 'Capex −10%', shifts: { capex: -0.1 } },
  { key: 'gen_down', label: 'Generation −8% (weak-resource year)', shifts: { generation: -0.08 } },
  { key: 'rate_up', label: 'Interest +1 percentage point', shifts: { interestPp: 1 } },
];
export function sensitivity(p: PlantFinanceSpec, y1: YearOne, f: ProjectFinanceInputs) {
  return SENSITIVITY_CASES.map((c) => { const r = projectFinance(p, y1, f, c.shifts); return { key: c.key, label: c.label, projectIrr: r.projectIrr, equityIrr: r.equityIrr, npvCr: r.npvCr, minDscr: r.minDscr, lcoeRsKwh: r.lcoeRsKwh }; });
}
