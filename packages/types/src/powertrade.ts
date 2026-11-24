/**
 * COLLABIZ POWERTRADE — Do Business. Save on Power. Grow Together.
 * Shared rules for the energy + business collaboration layer. Money is integer paise; units are kWh.
 * Savings, sales, earned benefits and cash are always kept apart: a benefit reduces the *economic* power expense only when
 * it is verified, collected and allocated with approval — the utility or power supplier's invoice is never waived.
 */
import { z } from 'zod';

export const PT_MODELS = {
  discounted_ppa: { label: 'Discounted power (PPA)', text: 'Buy solar, wind, hybrid or captive power at an agreed tariff.' },
  sponsored_power: { label: 'Sponsored / rewarded power', text: 'Use verified commercial earnings to support your power expense.' },
  product_for_power: { label: 'Product-for-Power', text: 'Supply products under one contract and buy power under a separate PPA, with a documented commercial benefit.' },
  solar_integration: { label: 'Solar integration partner', text: 'Supply steel, transformers, cement, cables, services, rooftops or land for renewable projects.' },
  distribution: { label: 'Distribution + power benefits', text: 'Sell approved products or introduce customers and earn agreed commissions.' },
  group_captive: { label: 'Group captive', text: 'Take equity in a captive plant and consume its power, subject to captive rules.' },
} as const;
export type PtModel = keyof typeof PT_MODELS;
export const PT_MODEL_KEYS = Object.keys(PT_MODELS) as PtModel[];

export const PT_INTERESTS = {
  buy_power: 'Buy discounted power', sell_products: 'Sell products', supply_unite: 'Supply Unite projects', exchange: 'Exchange products or services',
  epc_partner: 'Become an EPC partner', distributor: 'Become a distributor', offer_rooftop_land: 'Offer rooftop or land', invest: 'Invest in eligible projects',
  find_customers: 'Find customers', export_import: 'Export / import', group_captive: 'Join a group captive',
} as const;
export type PtInterest = keyof typeof PT_INTERESTS;

export const PT_CONTRIBUTION_KINDS = {
  product: 'Products', capacity: 'Manufacturing capacity', service: 'Services', epc: 'EPC / installation', distribution: 'Distribution / sales reach',
  rooftop: 'Rooftop', land: 'Land', logistics: 'Logistics', capital: 'Capital', export: 'Export / import access',
} as const;
export type PtContributionKind = keyof typeof PT_CONTRIBUTION_KINDS;

export const PT_SOURCES = { solar: 'Solar', wind: 'Wind', solar_wind: 'Solar + wind', solar_bess: 'Solar + battery', wind_bess: 'Wind + battery', rtc: 'Round-the-clock (FDRE)' } as const;
export type PtSource = keyof typeof PT_SOURCES;

/** Power arrangements the comparison covers. Network charges apply to open-access structures only. */
export const PT_ARRANGEMENTS = {
  rooftop_epc: { label: 'Rooftop — you own it (EPC)', openAccess: false, capex: true, complexity: 1 },
  rooftop_resco: { label: 'Rooftop — developer owns it (RESCO / BOOT PPA)', openAccess: false, capex: false, complexity: 1 },
  third_party: { label: 'Third-party open access PPA', openAccess: true, capex: false, complexity: 2 },
  group_captive: { label: 'Group captive', openAccess: true, capex: true, complexity: 3 },
  captive: { label: 'Captive (own plant)', openAccess: true, capex: true, complexity: 3 },
} as const;
export type PtArrangement = keyof typeof PT_ARRANGEMENTS;

export const PT_OBJECTIVES = {
  lowest_tariff: 'Lowest landed tariff', max_savings: 'Most verified savings', lowest_capital: 'Lowest capital needed',
  lowest_complexity: 'Lowest regulatory complexity', best_combined: 'Best savings + earned business benefits',
} as const;
export type PtObjective = keyof typeof PT_OBJECTIVES;

/** Deal execution workflow. Each move is recorded with the person who made it. */
export const PT_STATUS = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review', awaiting_documents: 'Awaiting documents', negotiating: 'Negotiating',
  approved: 'Approved', contracted: 'Contracted', in_progress: 'In progress', partially_fulfilled: 'Partially fulfilled', completed: 'Completed',
  disputed: 'Disputed', cancelled: 'Cancelled', expired: 'Expired',
} as const;
export type PtStatus = keyof typeof PT_STATUS;
export const PT_TRANSITIONS: Record<PtStatus, PtStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['under_review', 'awaiting_documents', 'cancelled'],
  under_review: ['awaiting_documents', 'negotiating', 'approved', 'cancelled'],
  awaiting_documents: ['under_review', 'cancelled', 'expired'],
  negotiating: ['under_review', 'approved', 'cancelled', 'expired'],
  approved: ['contracted', 'cancelled'],
  contracted: ['in_progress', 'disputed'],
  in_progress: ['partially_fulfilled', 'completed', 'disputed'],
  partially_fulfilled: ['in_progress', 'completed', 'disputed'],
  completed: [], disputed: ['in_progress', 'cancelled'], cancelled: [], expired: [],
};
/** Moves that need a Unite reviewer (technical, regulatory, tax and legal checks), not just the parties. */
export const PT_REVIEW_MOVES: PtStatus[] = ['approved'];

/** Documents each model needs before it can be approved. */
export const PT_DOCUMENTS: Record<string, string> = {
  supply_agreement: 'Product supply agreement', purchase_order: 'Purchase order', product_invoice: 'Product invoice', ppa: 'Renewable PPA',
  benefit_agreement: 'Commercial benefit / rebate agreement', tax_review: 'Tax review (GST valuation, separate supplies)', settlement_authorisation: 'Settlement authorisation',
  reconciliation: 'Reconciliation evidence', electricity_bill: 'Recent electricity bills', regulatory_approval: 'Open-access / captive approvals',
  epc_agreement: 'EPC partnership agreement', distribution_agreement: 'Distribution agreement', referral_agreement: 'Referral commission agreement',
  captive_agreement: 'Group-captive participation agreement', shareholding: 'Shareholding and consumption evidence', mou: 'Collaboration MoU',
};
export const PT_REQUIRED_DOCS: Record<PtModel, string[]> = {
  discounted_ppa: ['electricity_bill', 'ppa', 'regulatory_approval'],
  sponsored_power: ['benefit_agreement', 'tax_review', 'settlement_authorisation', 'reconciliation'],
  product_for_power: ['supply_agreement', 'purchase_order', 'product_invoice', 'ppa', 'benefit_agreement', 'tax_review', 'settlement_authorisation', 'reconciliation'],
  solar_integration: ['epc_agreement', 'purchase_order', 'product_invoice'],
  distribution: ['distribution_agreement', 'referral_agreement'],
  group_captive: ['electricity_bill', 'captive_agreement', 'shareholding', 'regulatory_approval', 'ppa'],
};

export const PT_BENEFIT_SOURCES = { commission: 'Sales commission', referral: 'Referral commission', rebate: 'Supply rebate', distribution_margin: 'Distribution margin', service_fee: 'Service fee', other: 'Other lawful incentive' } as const;
export type PtBenefitSource = keyof typeof PT_BENEFIT_SOURCES;
/** anticipated → earned → verified (by Unite finance) → collected (cash received). Only collected money can be allocated. */
export const PT_BENEFIT_STATUS = { anticipated: 'Anticipated (not earned)', earned: 'Earned', verified: 'Verified', collected: 'Collected' } as const;
export type PtBenefitStatus = keyof typeof PT_BENEFIT_STATUS;

// ---------------------------------------------------------------- forms
const opt = (s: z.ZodString) => s.optional().or(z.literal('').transform(() => undefined));
const paise = z.number().int().min(0).max(1e14);
export const PtProfileSchema = z.object({
  industry: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(40),
  discom: opt(z.string().trim().max(80)),
  gstin: opt(z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN')),
  about: opt(z.string().trim().max(800)),
  interests: z.array(z.enum(Object.keys(PT_INTERESTS) as [PtInterest, ...PtInterest[]])).min(1, 'Choose at least one').max(11),
  shareProducts: z.boolean().default(true),
  shareEnergySummary: z.boolean().default(false),
});
export const PtEnergyNeedSchema = z.object({
  monthlyUnits: z.number().int().min(1).max(1e9),
  tariffPaisePerKwh: z.number().int().min(100).max(10000),
  contractDemandKva: z.number().min(1).max(1e6),
  voltageKv: z.number().min(0.4).max(400),
  consumerCategory: z.enum(['ht_industrial', 'ht_commercial', 'lt_industrial', 'lt_commercial', 'other']),
  peakSharePct: z.number().min(0).max(100).optional(),
  preferredSources: z.array(z.enum(Object.keys(PT_SOURCES) as [PtSource, ...PtSource[]])).min(1).max(6),
  rtcNeeded: z.boolean().default(false),
  ppaYears: z.number().int().min(1).max(30).default(15),
  rooftopKwp: z.number().min(0).max(100000).default(0),
});
export const PtContributionSchema = z.object({
  kind: z.enum(Object.keys(PT_CONTRIBUTION_KINDS) as [PtContributionKind, ...PtContributionKind[]]),
  title: z.string().trim().min(3).max(120),
  description: opt(z.string().trim().max(800)),
  keywords: z.array(z.string().trim().toLowerCase().min(2).max(40)).max(12).default([]),
  capacity: opt(z.string().trim().max(120)),
  locations: opt(z.string().trim().max(200)),
  exportCapable: z.boolean().default(false),
});
export const PtScenarioSchema = z.object({
  arrangements: z.array(z.enum(Object.keys(PT_ARRANGEMENTS) as [PtArrangement, ...PtArrangement[]])).min(1),
  ppaPaisePerKwh: z.number().int().min(100).max(2000),
  capacityMw: z.number().min(0.01).max(1000),
  sourceState: z.string().trim().length(2).toUpperCase(),
  cufPct: z.number().min(5).max(80).default(20),
  ownershipPct: z.number().min(0).max(100).optional(),
  objective: z.enum(Object.keys(PT_OBJECTIVES) as [PtObjective, ...PtObjective[]]).default('max_savings'),
  verifiedBenefitsPaise: paise.default(0),
});
export const PtCollaborationSchema = z.object({
  model: z.enum(PT_MODEL_KEYS as [PtModel, ...PtModel[]]),
  title: z.string().trim().min(5).max(160),
  summary: z.string().trim().min(10).max(1500),
  counterpartyOrgId: z.string().uuid().optional(),
  supplyValuePaise: paise.optional(),
  benefitValuePaise: paise.optional(),
  powerTariffPaisePerKwh: z.number().int().min(100).max(2000).optional(),
  powerUnitsPerMonth: z.number().int().min(1).max(1e9).optional(),
});
export const PtTransitionSchema = z.object({ to: z.enum(Object.keys(PT_STATUS) as [PtStatus, ...PtStatus[]]), note: z.string().trim().max(600).optional() });
export const PtDocumentSchema = z.object({ docType: z.string().refine((d) => d in PT_DOCUMENTS, 'Unknown document'), status: z.enum(['missing', 'provided', 'accepted', 'rejected']), reference: opt(z.string().trim().max(300)) });
export const PtBenefitSchema = z.object({
  source: z.enum(Object.keys(PT_BENEFIT_SOURCES) as [PtBenefitSource, ...PtBenefitSource[]]),
  description: z.string().trim().min(5).max(300),
  grossPaise: paise.refine((v) => v > 0, 'Enter the amount'),
  costsPaise: paise.default(0),
  taxesPaise: paise.default(0),
  status: z.enum(['anticipated', 'earned']).default('earned'),
  collaborationId: z.string().uuid().optional(),
  evidence: opt(z.string().trim().max(600)),
}).refine((b) => b.costsPaise + b.taxesPaise <= b.grossPaise, { path: ['costsPaise'], message: 'Costs and taxes cannot exceed the gross amount' });
export const PtCollectSchema = z.object({ collectedPaise: paise.refine((v) => v > 0, 'Enter the amount received'), reference: z.string().trim().min(3).max(200) });
export const PtAllocationSchema = z.object({ benefitId: z.string().uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'), amountPaise: paise.refine((v) => v > 0, 'Enter the amount'), note: opt(z.string().trim().max(300)) });
export const PtSavingSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'), baselinePaise: paise, actualPaise: paise, evidence: z.string().trim().min(3).max(300) });
export const PtReverseSchema = z.object({ text: z.string().trim().min(15, 'Describe your business in a sentence or two').max(1200) });

// ---------------------------------------------------------------- calculator
export interface CommercialInput {
  currentBillPaise: number;          // present monthly power expense
  newPowerExpensePaise: number;      // expected monthly expense under the new arrangement
  savingsVerified: boolean;          // savings measured from bills, not estimated
  productSalesPaise: number; productGrossMarginPct: number;
  rebatesPaise: number; commissionsPaise: number;
  benefitCostsPaise: number; benefitTaxesPaise: number;
  collectedPaise: number;            // benefits actually received in cash
  approvedAllocationPaise: number;   // amount approved for power-expense support
}
export interface CommercialResult {
  existingPowerExpense: number; newPowerExpense: number; energySavings: number; savingsLabel: 'verified' | 'estimated';
  grossBusinessSales: number; grossProfitFromSupply: number; earnedBenefitsGross: number; netCommercialBenefit: number;
  collected: number; availableForPowerSupport: number; residualEconomicPowerExpense: number; cashTimingGap: number;
  notes: string[];
}
/** Transparent month-level comparison in integer paise. Turnover is never treated as profit. */
export function commercialBenefit(i: CommercialInput): CommercialResult {
  const r = (n: number) => Math.round(n);
  const savings = Math.max(0, i.currentBillPaise - i.newPowerExpensePaise);
  const grossProfit = r(i.productSalesPaise * (Math.min(100, Math.max(0, i.productGrossMarginPct)) / 100));
  const earned = i.rebatesPaise + i.commissionsPaise;
  const net = Math.max(0, earned - i.benefitCostsPaise - i.benefitTaxesPaise);
  const available = Math.min(i.approvedAllocationPaise, i.collectedPaise, net);
  const residual = Math.max(0, i.newPowerExpensePaise - available);
  const notes = [
    'Economic comparison only: the power supplier and the DISCOM are paid in full under their own invoices.',
    'Product sales are turnover; only the gross profit is shown as a benefit, and it is not applied to power unless separately allocated.',
  ];
  if (!i.savingsVerified) notes.push('Savings are estimated until confirmed from actual bills.');
  if (i.approvedAllocationPaise > i.collectedPaise) notes.push('Only collected money can support the power expense; the rest waits for collection.');
  if (available < i.approvedAllocationPaise) notes.push('The approved allocation is capped by the net benefit after costs and taxes.');
  if (residual === 0 && i.newPowerExpensePaise > 0) notes.push('Residual economic power expense is zero because verified, collected and approved benefits cover it — not because power is free.');
  return {
    existingPowerExpense: i.currentBillPaise, newPowerExpense: i.newPowerExpensePaise, energySavings: savings, savingsLabel: i.savingsVerified ? 'verified' : 'estimated',
    grossBusinessSales: i.productSalesPaise, grossProfitFromSupply: grossProfit, earnedBenefitsGross: earned, netCommercialBenefit: net,
    collected: i.collectedPaise, availableForPowerSupport: available, residualEconomicPowerExpense: residual, cashTimingGap: Math.max(0, Math.min(i.approvedAllocationPaise, net) - i.collectedPaise),
    notes,
  };
}

// ---------------------------------------------------------------- reverse matching (rules, no language model)
const PRODUCT_WORDS = ['steel', 'structure', 'mounting', 'transformer', 'cable', 'cement', 'textile', 'yarn', 'fabric', 'inverter', 'module', 'panel', 'battery', 'switchgear', 'pump', 'fabrication', 'packaging', 'chemical', 'plastic', 'paper', 'food', 'pharma', 'furniture', 'ply', 'paint', 'glass', 'aluminium', 'copper', 'logistics', 'transport', 'installation', 'epc', 'o&m', 'tableware'];
export interface ReverseParse { monthlyUnits: number | null; products: string[]; wants: PtInterest[]; industry: string | null }
/** Reads "I have a steel factory consuming 15 lakh units per month…" into structured hints. Users confirm before use. */
export function parseReverse(text: string): ReverseParse {
  const t = text.toLowerCase();
  let units: number | null = null;
  const m = t.match(/([\d.,]+)\s*(lakh|lac|crore|cr|million|mn|thousand|k)?\s*(?:units|kwh)/);
  if (m) {
    const n = Number(m[1].replace(/,/g, ''));
    const mult = { lakh: 1e5, lac: 1e5, crore: 1e7, cr: 1e7, million: 1e6, mn: 1e6, thousand: 1e3, k: 1e3 }[m[2] as string] ?? 1;
    if (Number.isFinite(n)) units = Math.round(n * mult);
  }
  const products = PRODUCT_WORDS.filter((w) => t.includes(w));
  const wants: PtInterest[] = [];
  if (/cheap|discount|lower|reduce|save|solar|renewable|power|electric/.test(t)) wants.push('buy_power');
  if (/customer|buyer|sell|market|order/.test(t)) wants.push('find_customers', 'sell_products');
  if (/export|import|international/.test(t)) wants.push('export_import');
  if (/supply|vendor|supplier/.test(t)) wants.push('supply_unite');
  if (/barter|exchange/.test(t)) wants.push('exchange');
  if (/captive|equity|invest/.test(t)) wants.push('group_captive');
  const ind = t.match(/\b(steel|textile|cement|transformer|chemical|pharma|food|plastic|paper|retail|hotel|hospital|cold storage|warehouse|data centre|epc)\b/);
  return { monthlyUnits: units, products: [...new Set(products)], wants: [...new Set(wants)], industry: ind ? ind[1] : null };
}
