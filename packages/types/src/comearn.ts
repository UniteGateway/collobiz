/**
 * COLLABIZ COMEARN — Opportunities to Earn. Shared rules for the commission marketplace.
 * Money is integer paise; rates are basis points (100 bps = 1%). Commission is always computed by the server from the
 * opportunity's frozen terms and the amount the paying company verified — never from what anyone typed as "potential".
 */
import { z } from 'zod';

export const CE_TYPES = {
  lead_generation: { label: 'Lead generation', earn: 'Qualified customer introduction' },
  sales_conversion: { label: 'Sales conversion', earn: 'Successful purchase order' },
  business_introduction: { label: 'Business introduction', earn: 'Successful commercial agreement' },
  dealer_development: { label: 'Dealer development', earn: 'Appointment of dealers' },
  franchise_development: { label: 'Franchise development', earn: 'Successful franchise onboarding' },
  procurement: { label: 'Procurement', earn: 'Connecting buyers and suppliers' },
  export_orders: { label: 'Export orders', earn: 'International business conversion' },
  technology_collaboration: { label: 'Technology collaboration', earn: 'Successful technology partnership' },
  project_development: { label: 'Project development', earn: 'Completion of agreed milestones' },
  recurring_sales: { label: 'Recurring sales', earn: 'Commission on repeat transactions, if agreed' },
} as const;
export type CeType = keyof typeof CE_TYPES;

export const CE_CATEGORIES = { solar: 'Solar', real_estate: 'Real Estate', industrial: 'Industrial', franchise: 'Franchise', exports: 'Exports', software: 'Software', logistics: 'Logistics', other: 'Other' } as const;
export type CeCategory = keyof typeof CE_CATEGORIES;

export const CE_MODELS = { percent: 'Percentage of business value', fixed: 'Fixed amount', milestone: 'Milestone-based', recurring: 'Recurring on repeat transactions' } as const;
export type CeModel = keyof typeof CE_MODELS;

export const CE_TRIGGERS = { customer_payment: 'Customer payment received', order_confirmed: 'Order confirmed', agreement_signed: 'Commercial agreement signed', milestone_completed: 'Agreed milestone completed' } as const;
export type CeTrigger = keyof typeof CE_TRIGGERS;

/** The eight tracker stages, in order. Who records each stage is enforced by the API. */
export const CE_STAGES = {
  selected: { label: 'Opportunity selected', by: 'earner' },
  agreement_accepted: { label: 'Commission agreement accepted', by: 'earner' },
  lead_registered: { label: 'Customer lead registered and protected', by: 'earner' },
  quoted: { label: 'Meeting and quotation completed', by: 'company' },
  order_confirmed: { label: 'Order confirmed', by: 'company' },
  payment_verified: { label: 'Customer payment verified', by: 'company' },
  commission_approved: { label: 'Commission approved', by: 'company' },
  commission_paid: { label: 'Commission transferred', by: 'company' },
} as const;
export type CeStage = keyof typeof CE_STAGES;
export const CE_STAGE_ORDER = Object.keys(CE_STAGES) as CeStage[];

const opt = (s: z.ZodString) => s.optional().or(z.literal('').transform(() => undefined));
const money = z.number().int().min(1);

export const CeMilestoneSchema = z.object({ label: z.string().trim().min(2).max(120), pct: z.number().min(0.01).max(100) });
export const CeOpportunitySchema = z.object({
  title: z.string().trim().min(5).max(140),
  type: z.enum(Object.keys(CE_TYPES) as [CeType, ...CeType[]]),
  category: z.enum(Object.keys(CE_CATEGORIES) as [CeCategory, ...CeCategory[]]),
  description: z.string().trim().min(20).max(3000),
  idealEarner: opt(z.string().trim().max(600)),
  territory: z.string().trim().min(2).max(200),
  estimatedValuePaise: money.optional(),
  model: z.enum(Object.keys(CE_MODELS) as [CeModel, ...CeModel[]]),
  rateBps: z.number().int().min(1).max(5000).optional(),       // percent / recurring (max 50%)
  fixedPaise: money.optional(),                                  // fixed
  milestones: z.array(CeMilestoneSchema).max(10).default([]),    // milestone — % of the commission pool per milestone
  recurringMonths: z.number().int().min(1).max(60).optional(),
  trigger: z.enum(Object.keys(CE_TRIGGERS) as [CeTrigger, ...CeTrigger[]]),
  paymentDays: z.number().int().min(0).max(180).default(30),
  maxEarners: z.number().int().min(1).max(1000).optional(),
  licenceNote: opt(z.string().trim().max(300)),
  source: z.object({ module: z.enum(['franchise', 'venture_ai', 'xchange', 'exim', 'leaddna', 'adbuz']), id: z.string().trim().min(1).max(80) }).optional(),
}).superRefine((o, c) => {
  if ((o.model === 'percent' || o.model === 'recurring' || o.model === 'milestone') && o.rateBps == null) c.addIssue({ code: 'custom', path: ['rateBps'], message: 'Enter the commission percentage' });
  if (o.model === 'fixed' && o.fixedPaise == null) c.addIssue({ code: 'custom', path: ['fixedPaise'], message: 'Enter the commission amount' });
  if (o.model === 'recurring' && o.recurringMonths == null) c.addIssue({ code: 'custom', path: ['recurringMonths'], message: 'For how many months is repeat business paid?' });
  if (o.model === 'milestone') {
    const t = o.milestones.reduce((s, m) => s + m.pct, 0);
    if (!o.milestones.length) c.addIssue({ code: 'custom', path: ['milestones'], message: 'Add the milestones' });
    else if (Math.abs(t - 100) > 0.01) c.addIssue({ code: 'custom', path: ['milestones'], message: `Milestones must add up to 100% (now ${Math.round(t * 100) / 100}%)` });
  }
});
export type CeOpportunityInput = z.infer<typeof CeOpportunitySchema>;
export type CeTerms = Pick<CeOpportunityInput, 'model' | 'rateBps' | 'fixedPaise' | 'milestones' | 'recurringMonths' | 'trigger' | 'paymentDays'>;

export const CeLeadSchema = z.object({
  customerName: z.string().trim().min(2).max(160), customerCompany: opt(z.string().trim().max(160)), city: z.string().trim().min(2).max(100),
  contactName: z.string().trim().min(2).max(120), phone: opt(z.string().trim().regex(/^[+\d][\d\s-]{7,18}$/, 'Enter a valid phone number')), email: opt(z.string().trim().email()),
  gstin: opt(z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN')),
  requirement: z.string().trim().min(10).max(1500), estimatedValuePaise: money.optional(),
  consent: z.literal(true, { message: 'Confirm the customer agreed to be contacted by this company' }),
}).refine((l) => l.phone || l.email, { path: ['phone'], message: 'Enter a phone number or email' });

export const CeStageSchema = z.object({
  stage: z.enum(['quoted', 'order_confirmed', 'payment_verified', 'commission_approved', 'commission_paid']),
  note: opt(z.string().trim().max(600)),
  amountPaise: money.optional(),       // order value / verified customer payment
  reference: opt(z.string().trim().max(120)), // invoice, payment or bank transfer reference
  tdsPaise: z.number().int().min(0).optional(),
  milestoneIndex: z.number().int().min(0).max(9).optional(),
  tdsCertificateRef: opt(z.string().trim().max(120)),
});

/** Commission on a verified amount (or for one milestone). Never negative; fixed ignores the amount. */
export function ceCommission(t: CeTerms, verifiedAmountPaise: number, milestoneIndex?: number): number {
  const base = Math.max(0, Math.round(verifiedAmountPaise));
  if (t.model === 'fixed') return t.fixedPaise ?? 0;
  const pool = Math.round((base * (t.rateBps ?? 0)) / 10000);
  if (t.model === 'milestone') { const m = t.milestones?.[milestoneIndex ?? 0]; return m ? Math.round((pool * m.pct) / 100) : 0; }
  return pool;
}
/** Indicative potential commission shown while posting/browsing — labelled as an estimate, not a promise. */
export function cePotential(t: CeTerms, estimatedValuePaise?: number | null): number | null {
  if (t.model === 'fixed') return t.fixedPaise ?? null;
  if (!estimatedValuePaise) return null;
  return Math.round((estimatedValuePaise * (t.rateBps ?? 0)) / 10000);
}
/** Platform fee on a settled commission (basis points from admin settings; 0 = off). */
export const cePlatformFee = (commissionPaise: number, feeBps: number) => Math.round((commissionPaise * Math.max(0, feeBps)) / 10000);
/** Stable fingerprint of a customer for lead protection: GSTIN if given, else normalised phone/email + name. */
export function ceLeadFingerprint(l: { customerName: string; phone?: string; email?: string; gstin?: string }) {
  if (l.gstin) return `gst:${l.gstin.toUpperCase()}`;
  const phone = (l.phone ?? '').replace(/\D/g, '').slice(-10);
  if (phone) return `ph:${phone}`;
  return `em:${(l.email ?? '').trim().toLowerCase()}`;
}
/** The next stage after `s`, or null at the end. */
export const ceNextStage = (s: CeStage): CeStage | null => CE_STAGE_ORDER[CE_STAGE_ORDER.indexOf(s) + 1] ?? null;

// ---------------------------------------------------------------- reverse marketplace (member requirements + commission bids)
export const CeRequirementSchema = z.object({
  title: z.string().trim().min(5).max(140),
  category: z.enum(Object.keys(CE_CATEGORIES) as [CeCategory, ...CeCategory[]]),
  description: z.string().trim().min(20).max(2000),
  city: z.string().trim().min(2).max(100),
  estimatedValuePaise: money.optional(),
  closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerName: z.string().trim().min(2).max(160), customerCompany: opt(z.string().trim().max(160)),
  contactName: z.string().trim().min(2).max(120), phone: opt(z.string().trim().regex(/^[+\d][\d\s-]{7,18}$/, 'Enter a valid phone number')), email: opt(z.string().trim().email()),
  gstin: opt(z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN')),
  consent: z.literal(true, { message: 'Confirm the customer agreed to receive offers from businesses' }),
}).refine((l) => l.phone || l.email, { path: ['phone'], message: 'Enter a phone number or email' });

export const CeBidSchema = z.object({
  model: z.enum(['percent', 'fixed']), rateBps: z.number().int().min(1).max(5000).optional(), fixedPaise: money.optional(),
  trigger: z.enum(Object.keys(CE_TRIGGERS) as [CeTrigger, ...CeTrigger[]]), paymentDays: z.number().int().min(0).max(180).default(30),
  proposal: z.string().trim().min(20).max(1500),
}).superRefine((b, c) => {
  if (b.model === 'percent' && b.rateBps == null) c.addIssue({ code: 'custom', path: ['rateBps'], message: 'Enter the commission percentage' });
  if (b.model === 'fixed' && b.fixedPaise == null) c.addIssue({ code: 'custom', path: ['fixedPaise'], message: 'Enter the commission amount' });
});

// ---------------------------------------------------------------- team formation and commission pool
/** Team roles, the member capability role each maps to (for matching), and an illustrative starting split in % —
 *  the lead member can change every share and every member must accept before the split applies. */
export const CE_TEAM_ROLES = {
  creator: { label: 'Opportunity creator', capability: null, suggestedPct: 25 },
  introducer: { label: 'Customer introducer', capability: 'sales_agent', suggestedPct: 25 },
  technical: { label: 'Technical consultant', capability: 'engineer', suggestedPct: 15 },
  negotiator: { label: 'Sales negotiator', capability: 'sales_agent', suggestedPct: 15 },
  coordinator: { label: 'Project coordinator', capability: 'service', suggestedPct: 10 },
  other: { label: 'Other contributor', capability: null, suggestedPct: 10 },
} as const;
export type CeTeamRole = keyof typeof CE_TEAM_ROLES;
export const CeTeamInviteSchema = z.object({ orgId: z.string().uuid(), role: z.enum(Object.keys(CE_TEAM_ROLES) as [CeTeamRole, ...CeTeamRole[]]), sharePct: z.number().min(1).max(90) });

/** Shares are basis points of the pool. The lead keeps whatever the others do not take; others may take at most 90%. */
export function ceLeadShareBp(othersBp: number[]) { return 10000 - othersBp.reduce((s, x) => s + x, 0); }
/** Splits an amount across shares (basis points summing to 10000); rounding remainder goes to the first (lead) entry. */
export function ceAllocate(amountPaise: number, sharesBp: number[]): number[] {
  const parts = sharesBp.map((bp) => Math.floor((amountPaise * bp) / 10000));
  const rest = amountPaise - parts.reduce((s, x) => s + x, 0);
  if (parts.length) parts[0] += rest;
  return parts;
}

// ---------------------------------------------------------------- reputation
/** Performance from recorded COMEARN activity only. Null when there is too little history to say anything. */
export function ceReputation(x: { engagements: number; converted: number; paid: number; onTime: number; disputesLost: number }) {
  if (x.engagements < 1) return null;
  const conversion = Math.round((x.converted / x.engagements) * 100);
  const onTimePct = x.paid ? Math.round((x.onTime / x.paid) * 100) : null;
  return { engagements: x.engagements, conversionPct: conversion, paid: x.paid, onTimePct, disputesLost: x.disputesLost };
}

// ---------------------------------------------------------------- Unite review, margin, ratings
/** What members see after Unite keeps its margin. The member must still receive something (≥ 0.01% or ₹1). */
export function ceMemberTerms(company: { model: CeModel; rateBps?: number | null; fixedPaise?: number | null }, margin: { bps?: number | null; paise?: number | null }) {
  if (company.model === 'fixed') {
    const m = Math.max(0, margin.paise ?? 0); const member = (company.fixedPaise ?? 0) - m;
    return member >= 100 ? { fixedPaise: member, rateBps: null, marginPaise: m, marginBps: null } : null;
  }
  const m = Math.max(0, margin.bps ?? 0); const member = (company.rateBps ?? 0) - m;
  return member >= 1 ? { rateBps: member, fixedPaise: null, marginBps: m, marginPaise: null } : null;
}
export const CeReleaseSchema = z.object({ marginBps: z.number().int().min(0).max(5000).optional(), marginPaise: z.number().int().min(0).optional(), note: opt(z.string().trim().max(600)) });
export const CeCounterSchema = z.object({ rateBps: z.number().int().min(1).max(5000).optional(), fixedPaise: money.optional(), note: z.string().trim().min(5).max(1000) })
  .refine((c) => c.rateBps != null || c.fixedPaise != null, { path: ['rateBps'], message: 'Propose a rate or an amount' });
export const CeRatingSchema = z.object({ stars: z.number().int().min(1).max(5), comment: opt(z.string().trim().max(600)) });
/** Average of real ratings; null when there are none (never a default score). */
export function ceRatingSummary(stars: number[]) { return stars.length ? { avg: Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10, count: stars.length } : null; }
