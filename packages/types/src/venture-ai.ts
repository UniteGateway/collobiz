/**
 * COLLABIZ VENTURE AI — From Opportunity to Enterprise.
 * Deterministic engines (scoring, financial model, combination sizing, role matching) and form schemas. Numbers are always
 * computed here in code; language models may only explain and draft text. Money in integer paise.
 */
import { z } from 'zod';

export const VAI_ROLES = {
  manufacturer: 'Manufacturer', oem: 'OEM manufacturer', technology: 'Technology provider', ip_owner: 'Patent / IP owner', raw_material: 'Raw material supplier',
  designer: 'Product designer', engineer: 'Engineer', researcher: 'Research consultant', investor: 'Investor', business_owner: 'Business owner', distributor: 'Distributor',
  dealer: 'Dealer', franchise: 'Franchise partner', sales_agent: 'Sales agent', marketing: 'Marketing agency', exporter: 'Exporter', importer: 'Importer', logistics: 'Logistics provider',
  warehouse: 'Warehouse owner', finance: 'Financial institution', legal: 'Legal consultant', accountant: 'Accountant', quality: 'Quality inspection agency',
  installer: 'Installation contractor', service: 'Service provider', land_owner: 'Land / property owner',
} as const;
export type VaiRole = keyof typeof VAI_ROLES;
export const VAI_ROLE_KEYS = Object.keys(VAI_ROLES) as VaiRole[];

export const VAI_OPP_TYPES = {
  demand: 'Demand product', future: 'Future product', innovation: 'Innovation product', economical: 'Economical product', combination: 'Combination product',
} as const;
export type VaiOppType = keyof typeof VAI_OPP_TYPES;

export const VAI_EVIDENCE_KINDS = { verified: 'Verified fact', assumption: 'Assumption', forecast: 'Forecast' } as const;
export type VaiEvidenceKind = keyof typeof VAI_EVIDENCE_KINDS;

export const VAI_OPP_STATUS = { draft: 'Draft', in_review: 'In review', approved: 'Approved', rejected: 'Not approved', archived: 'Archived' } as const;
export const VAI_VENTURE_STATUS = { forming: 'Forming team', planning: 'Planning', executing: 'Executing', paused: 'Paused', closed: 'Closed' } as const;

// ---------------------------------------------------------------- scoring
export const VAI_CRITERIA = {
  market_demand: { label: 'Market demand', weight: 20 }, profitability: { label: 'Profitability', weight: 20 }, supplier_readiness: { label: 'Supplier readiness', weight: 15 },
  competitive_advantage: { label: 'Competitive advantage', weight: 10 }, capital_availability: { label: 'Capital availability', weight: 10 },
  member_capability: { label: 'Member capability', weight: 10 }, scalability: { label: 'Scalability', weight: 10 }, regulatory_readiness: { label: 'Regulatory readiness', weight: 5 },
} as const;
export type VaiCriterion = keyof typeof VAI_CRITERIA;
export const VAI_MANDATORY_CHECKS = { legal: 'Legal', financial: 'Financial', engineering: 'Engineering', safety: 'Safety' } as const;
export type VaiCheck = keyof typeof VAI_MANDATORY_CHECKS;

export interface VaiCriterionInput { value: number | null; evidence: 'strong' | 'some' | 'none' }
export interface VaiScoreResult {
  score: number | null; classification: 'priority' | 'validate' | 'uncertain' | 'blocked' | 'incomplete'; label: string;
  weightsUsed: Record<string, number>; missing: string[]; evidenceQuality: number; failedChecks: string[]; contributions: { key: string; label: string; value: number; weight: number; points: number }[];
}
/** Weighted 0–100 decision aid. Missing criteria are listed, not guessed; any failed mandatory check overrides the score. */
export function scoreOpportunity(inputs: Partial<Record<VaiCriterion, VaiCriterionInput>>, weights: Partial<Record<VaiCriterion, number>> = {}, checks: Partial<Record<VaiCheck, 'pass' | 'fail' | 'pending'>> = {}): VaiScoreResult {
  const w = Object.fromEntries((Object.keys(VAI_CRITERIA) as VaiCriterion[]).map((k) => [k, weights[k] ?? VAI_CRITERIA[k].weight])) as Record<VaiCriterion, number>;
  const present = (Object.keys(VAI_CRITERIA) as VaiCriterion[]).filter((k) => inputs[k]?.value != null);
  const missing = (Object.keys(VAI_CRITERIA) as VaiCriterion[]).filter((k) => inputs[k]?.value == null).map((k) => VAI_CRITERIA[k].label);
  const totalW = present.reduce((s, k) => s + w[k], 0);
  const contributions = present.map((k) => { const v = Math.max(0, Math.min(100, inputs[k]!.value!)); return { key: k, label: VAI_CRITERIA[k].label, value: v, weight: w[k], points: totalW ? (v * w[k]) / totalW : 0 }; });
  const score = present.length ? Math.round(contributions.reduce((s, c) => s + c.points, 0)) : null;
  const evid: number[] = present.map((k) => (inputs[k]!.evidence === 'strong' ? 1 : inputs[k]!.evidence === 'some' ? 0.5 : 0));
  const evidenceQuality = present.length ? Math.round((evid.reduce((a, b) => a + b, 0) / (Object.keys(VAI_CRITERIA).length)) * 100) : 0;
  const failedChecks = (Object.keys(checks) as VaiCheck[]).filter((k) => checks[k] === 'fail').map((k) => VAI_MANDATORY_CHECKS[k]);
  let classification: VaiScoreResult['classification'];
  if (failedChecks.length) classification = 'blocked';
  else if (missing.length > 2 || score == null) classification = 'incomplete';
  else classification = score >= 80 ? 'priority' : score >= 65 ? 'validate' : 'uncertain';
  const label = { priority: 'Priority opportunity', validate: 'Further validation required', uncertain: 'High uncertainty', blocked: `Blocked — failed ${failedChecks.join(', ')} check`, incomplete: 'Not enough evidence to score' }[classification];
  return { score, classification, label, weightsUsed: w, missing, evidenceQuality, failedChecks, contributions };
}

// ---------------------------------------------------------------- financial engine
export interface VaiFinanceInput {
  unitPricePaise: number;              // price to the end customer
  unitCostPaise: number;               // BOM + OEM manufacturing
  freightPerUnitPaise: number; dutyPct: number; packagingPerUnitPaise: number;
  dealerMarginPct: number; distributorMarginPct: number; salesCommissionPct: number; marketingPctOfRevenue: number;
  year1Units: number; growthPct: number; years: number;
  fixedCostsPerYearPaise: number; capexPaise: number; workingCapitalDays: number; taxPct: number;
}
export interface VaiFinanceYear { year: number; units: number; revenue: number; cogs: number; channel: number; marketing: number; fixed: number; ebitda: number; tax: number; netProfit: number; workingCapital: number; cashFlow: number; cumulative: number }
export interface VaiFinanceResult { years: VaiFinanceYear[]; unitContributionPaise: number; breakEvenUnitsPerYear: number | null; paybackYear: number | null; roiPct: number | null; irrPct: number | null; notes: string[] }
const rnd = Math.round;
/** Five-year model with net revenue after dealer/distributor margins. Deterministic; every assumption is an input. */
export function financialModel(i: VaiFinanceInput): VaiFinanceResult {
  const landed = i.unitCostPaise + i.freightPerUnitPaise + rnd((i.unitCostPaise * i.dutyPct) / 100) + i.packagingPerUnitPaise;
  const channelPct = i.dealerMarginPct + i.distributorMarginPct + i.salesCommissionPct;
  const netPerUnit = rnd(i.unitPricePaise * (1 - channelPct / 100));
  const contribution = netPerUnit - landed - rnd((i.unitPricePaise * i.marketingPctOfRevenue) / 100);
  const years: VaiFinanceYear[] = [];
  let cum = -i.capexPaise; let prevWc = 0;
  for (let y = 1; y <= i.years; y++) {
    const units = rnd(i.year1Units * (1 + i.growthPct / 100) ** (y - 1));
    const revenue = units * i.unitPricePaise;
    const cogs = units * landed;
    const channel = rnd((revenue * channelPct) / 100);
    const marketing = rnd((revenue * i.marketingPctOfRevenue) / 100);
    const ebitda = revenue - cogs - channel - marketing - i.fixedCostsPerYearPaise;
    const tax = ebitda > 0 ? rnd((ebitda * i.taxPct) / 100) : 0;
    const netProfit = ebitda - tax;
    const wc = rnd((cogs * i.workingCapitalDays) / 365);
    const cashFlow = netProfit - (wc - prevWc);
    prevWc = wc; cum += cashFlow;
    years.push({ year: y, units, revenue, cogs, channel, marketing, fixed: i.fixedCostsPerYearPaise, ebitda, tax, netProfit, workingCapital: wc, cashFlow, cumulative: cum });
  }
  const payback = years.find((y) => y.cumulative >= 0)?.year ?? null;
  const flows = [-i.capexPaise, ...years.map((y) => y.cashFlow)];
  const npv = (r: number) => flows.reduce((s, f, t) => s + f / (1 + r) ** t, 0);
  let irr: number | null = null;
  if (i.capexPaise > 0 && npv(-0.99) * npv(10) < 0) { let lo = -0.99, hi = 10; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; } irr = Math.round(((lo + hi) / 2) * 1000) / 10; }
  const total = years.reduce((s, y) => s + y.netProfit, 0);
  const notes = ['Projection from the assumptions shown — not a forecast of actual results.'];
  if (contribution <= 0) notes.push('Each unit loses money after channel margins and landed cost: price, cost or margins must change.');
  return { years, unitContributionPaise: contribution, breakEvenUnitsPerYear: contribution > 0 ? Math.ceil(i.fixedCostsPerYearPaise / contribution) : null, paybackYear: payback,
    roiPct: i.capexPaise > 0 ? Math.round((total / i.capexPaise) * 1000) / 10 : null, irrPct: irr, notes };
}
/** Net profit in the final year when price, cost or volume move (sensitivity table). */
export function vaiSensitivity(i: VaiFinanceInput) {
  const last = (x: VaiFinanceInput) => { const r = financialModel(x).years; return r[r.length - 1].netProfit; };
  return [
    { case: 'Base', netProfit: last(i) },
    { case: 'Price −10%', netProfit: last({ ...i, unitPricePaise: rnd(i.unitPricePaise * 0.9) }) },
    { case: 'Unit cost +10%', netProfit: last({ ...i, unitCostPaise: rnd(i.unitCostPaise * 1.1) }) },
    { case: 'Volume −20%', netProfit: last({ ...i, year1Units: rnd(i.year1Units * 0.8) }) },
  ];
}

// ---------------------------------------------------------------- combination sizing: Solar Conveyor
export interface VaiConveyorInput { motorKw: number; hoursPerDay: number; loadFactorPct: number; daysPerYear: number; peakSunHours: number; performanceRatioPct: number; batteryHours: number; depthOfDischargePct: number; solarCostPaisePerWp: number; batteryCostPaisePerKwh: number; gridTariffPaisePerKwh: number }
export interface VaiConveyorResult { energyKwhPerDay: number; solarKwp: number; batteryKwh: number; solarCostPaise: number; batteryCostPaise: number; totalCostPaise: number; annualGridSavingPaise: number; simplePaybackYears: number | null; notes: string[] }
/** Concept-level sizing for a solar-assisted conveyor: energy, PV size, battery and indicative cost. Not an engineering design. */
export function sizeSolarConveyor(i: VaiConveyorInput): VaiConveyorResult {
  const energy = i.motorKw * (i.loadFactorPct / 100) * i.hoursPerDay;
  const kwp = energy / (i.peakSunHours * (i.performanceRatioPct / 100));
  const batt = (i.motorKw * (i.loadFactorPct / 100) * i.batteryHours) / Math.max(0.1, i.depthOfDischargePct / 100);
  const solarCost = rnd(kwp * 1000 * i.solarCostPaisePerWp);
  const battCost = rnd(batt * i.batteryCostPaisePerKwh);
  const saving = rnd(energy * i.daysPerYear * i.gridTariffPaisePerKwh);
  return {
    energyKwhPerDay: Math.round(energy * 10) / 10, solarKwp: Math.round(kwp * 10) / 10, batteryKwh: Math.round(batt * 10) / 10, solarCostPaise: solarCost, batteryCostPaise: battCost,
    totalCostPaise: solarCost + battCost, annualGridSavingPaise: saving, simplePaybackYears: saving > 0 ? Math.round(((solarCost + battCost) / saving) * 10) / 10 : null,
    notes: ['Concept sizing from the assumptions shown — not certified engineering. A qualified engineer must design motors, drives, structures and protection.', 'Costs are assumptions to be replaced by supplier quotations.'],
  };
}

// ---------------------------------------------------------------- role matching
export interface VaiCapabilityLike { roles: string[]; categories: string[]; countries: string[]; certifications: string[]; investmentMaxPaise: number | null; spareCapacity: string | null; available: boolean; verified: boolean; completedCollaborations: number }
export interface VaiRoleNeed { role: VaiRole; categories: string[]; countries: string[]; investmentPaise?: number | null; certifications?: string[] }
/** Transparent capability match: points for each fit, with the reason shown. A member without the role never matches. */
export function matchRole(need: VaiRoleNeed, c: VaiCapabilityLike): { percent: number; reasons: string[]; gaps: string[] } | null {
  if (!c.roles.includes(need.role)) return null;
  const reasons = [`Offers the ${VAI_ROLES[need.role].toLowerCase()} role`]; const gaps: string[] = [];
  let pts = 30; const max = 100;
  const cat = need.categories.filter((x) => c.categories.map((y) => y.toLowerCase()).includes(x.toLowerCase()));
  if (!need.categories.length) pts += 20; else if (cat.length) { pts += 20; reasons.push(`Works in ${cat.join(', ')}`); } else gaps.push('Different product categories');
  if (!need.countries.length || c.countries.some((x) => need.countries.includes(x))) { pts += 15; if (need.countries.length) reasons.push(`Operates in ${c.countries.filter((x) => need.countries.includes(x)).join(', ')}`); } else gaps.push('Not in the target countries');
  if (need.role === 'investor' && need.investmentPaise) { if (c.investmentMaxPaise != null && c.investmentMaxPaise >= need.investmentPaise) { pts += 10; reasons.push('Investment capacity covers the requirement'); } else gaps.push('Investment capacity below the requirement'); } else pts += 10;
  const certs = (need.certifications ?? []).filter((x) => c.certifications.includes(x));
  if (!(need.certifications ?? []).length || certs.length) { pts += 5; if (certs.length) reasons.push(`Holds ${certs.join(', ')}`); } else gaps.push('Missing required certifications');
  if (c.available) { pts += 10; reasons.push('Available for new ventures'); } else gaps.push('Marked not available');
  if (c.verified) { pts += 5; reasons.push('Verified business'); } else gaps.push('Business not yet verified');
  if (c.completedCollaborations > 0) { pts += 5; reasons.push(`${c.completedCollaborations} completed collaboration${c.completedCollaborations > 1 ? 's' : ''} on COLLABIZ`); }
  if (c.spareCapacity) reasons.push(`Spare capacity: ${c.spareCapacity}`);
  return { percent: Math.min(max, pts), reasons, gaps };
}

// ---------------------------------------------------------------- forms
const opt = (s: z.ZodString) => s.optional().or(z.literal('').transform(() => undefined));
const list = z.array(z.string().trim().min(1).max(60)).max(30).default([]);
export const VaiCapabilitySchema = z.object({
  roles: z.array(z.enum(VAI_ROLE_KEYS as [VaiRole, ...VaiRole[]])).min(1, 'Choose at least one role').max(26),
  categories: list, countries: z.array(z.string().trim().length(2).toUpperCase()).min(1).max(40), locations: opt(z.string().trim().max(300)),
  capacity: opt(z.string().trim().max(200)), spareCapacity: opt(z.string().trim().max(200)), machinery: opt(z.string().trim().max(500)), technology: opt(z.string().trim().max(500)),
  moq: opt(z.string().trim().max(120)), investmentMinPaise: z.number().int().min(0).optional(), investmentMaxPaise: z.number().int().min(0).optional(),
  certifications: list, territories: list, languages: list, experience: opt(z.string().trim().max(800)),
  available: z.boolean().default(true), contactPermission: z.enum(['via_collabiz', 'after_acceptance']).default('via_collabiz'),
});
export const VaiEvidenceSchema = z.object({ kind: z.enum(['verified', 'assumption', 'forecast']), statement: z.string().trim().min(5).max(600), source: opt(z.string().trim().max(300)), sourceDate: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)) })
  .refine((e) => e.kind !== 'verified' || (e.source && e.sourceDate), { path: ['source'], message: 'A verified fact needs its source and date' });
export const VaiRoleNeedSchema = z.object({ role: z.enum(VAI_ROLE_KEYS as [VaiRole, ...VaiRole[]]), count: z.number().int().min(1).max(20).default(1), categories: list, countries: z.array(z.string().length(2)).max(20).default([]), note: opt(z.string().trim().max(300)) });
export const VaiOpportunitySchema = z.object({
  title: z.string().trim().min(5).max(140), type: z.enum(Object.keys(VAI_OPP_TYPES) as [VaiOppType, ...VaiOppType[]]),
  problem: z.string().trim().min(10).max(1500), marketGap: z.string().trim().min(10).max(1500), targetCustomers: z.string().trim().min(5).max(600),
  proposedSolution: z.string().trim().min(10).max(2000), competitors: opt(z.string().trim().max(800)), technology: opt(z.string().trim().max(800)), manufacturing: opt(z.string().trim().max(800)),
  investmentPaise: z.number().int().min(0).optional(), marginPct: z.number().min(-100).max(100).optional(), countries: z.array(z.string().length(2)).min(1).max(20),
  risks: opt(z.string().trim().max(1500)), regulatory: opt(z.string().trim().max(1500)), roles: z.array(VaiRoleNeedSchema).max(30).default([]), evidence: z.array(VaiEvidenceSchema).max(30).default([]),
});
export const VaiScoreInputSchema = z.object({
  criteria: z.record(z.string(), z.object({ value: z.number().min(0).max(100).nullable(), evidence: z.enum(['strong', 'some', 'none']) })),
  checks: z.record(z.string(), z.enum(['pass', 'fail', 'pending'])).default({}),
});
export const VaiInviteSchema = z.object({ capabilityId: z.string().uuid(), role: z.enum(VAI_ROLE_KEYS as [VaiRole, ...VaiRole[]]), message: z.string().trim().min(10).max(1200), investmentPaise: z.number().int().min(0).optional(), earningsNote: z.string().trim().max(400).optional(), risksNote: z.string().trim().max(600).optional() });
export const VaiTaskSchema = z.object({ title: z.string().trim().min(3).max(160), assigneeMemberId: z.string().uuid().optional(), dueOn: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)), milestone: z.boolean().default(false) });
export const VaiFinanceSchema = z.object({
  unitPricePaise: z.number().int().min(1), unitCostPaise: z.number().int().min(0), freightPerUnitPaise: z.number().int().min(0).default(0), dutyPct: z.number().min(0).max(300).default(0),
  packagingPerUnitPaise: z.number().int().min(0).default(0), dealerMarginPct: z.number().min(0).max(80).default(0), distributorMarginPct: z.number().min(0).max(80).default(0),
  salesCommissionPct: z.number().min(0).max(50).default(0), marketingPctOfRevenue: z.number().min(0).max(80).default(0), year1Units: z.number().int().min(1), growthPct: z.number().min(-50).max(500).default(0),
  years: z.number().int().min(1).max(10).default(5), fixedCostsPerYearPaise: z.number().int().min(0).default(0), capexPaise: z.number().int().min(0).default(0),
  workingCapitalDays: z.number().int().min(0).max(365).default(60), taxPct: z.number().min(0).max(60).default(25),
});
export const VaiConveyorSchema = z.object({
  motorKw: z.number().min(0.1).max(5000), hoursPerDay: z.number().min(0.5).max(24), loadFactorPct: z.number().min(5).max(100).default(70), daysPerYear: z.number().int().min(1).max(366).default(300),
  peakSunHours: z.number().min(1).max(8).default(5), performanceRatioPct: z.number().min(40).max(95).default(78), batteryHours: z.number().min(0).max(24).default(2), depthOfDischargePct: z.number().min(20).max(100).default(80),
  solarCostPaisePerWp: z.number().int().min(500).max(20000).default(3800), batteryCostPaisePerKwh: z.number().int().min(100000).max(10000000).default(1800000), gridTariffPaisePerKwh: z.number().int().min(100).max(3000).default(850),
});
export const VaiAgentRunSchema = z.object({ agent: z.enum(['research', 'innovation', 'strategy', 'branding', 'legal', 'collaboration']), instruction: z.string().trim().min(5).max(2000) });
