/**
 * COLLABIZ V2 — shared rules for the Deal Passport, AI team plans, project work packages and the tender eligibility analyzer.
 * Pure functions: the API is authoritative, screens reuse them for previews, and they are unit-tested.
 */
import { z } from 'zod';

// ---------------- Deal Passport ----------------
export const PASSPORT_ELIGIBLE_CLAIM_STATES = ['protected', 'contested', 'upheld', 'released', 'expired'];
export const PassportPartySchema = z.object({
  organizationId: z.string().uuid(),
  role: z.enum(['co_seller', 'execution_partner', 'unite_reviewer', 'financier', 'advisor']),
});
export const PASSPORT_PARTY_ROLE_LABELS: Record<string, string> = { co_seller: 'Co-seller', execution_partner: 'Execution partner', unite_reviewer: 'Unite reviewer', financier: 'Financier', advisor: 'Adviser' };
export const PassportNdaSchema = z.object({ typedName: z.string().trim().min(2).max(120) });
export const passportNdaText = (code: string, opportunity: string, owner: string) =>
  `CONFIDENTIALITY UNDERTAKING — DEAL PASSPORT ${code} (DRAFT PENDING LEGAL REVIEW)\n\nOpportunity: ${opportunity}\nRegistered by: ${owner}\n\n1. I will use the information in this Deal Passport only to evaluate and deliver this opportunity with the registering partner and Unite Group.\n2. I will not contact the customer, or share the customer's identity, documents or commercial terms, except as the registering partner or Unite Group agrees in writing.\n3. Access is personal to my organisation, is logged, and can be withdrawn by the registering partner or Unite Group.\n4. Viewing this passport gives no right to commission or fees; rights arise only from a signed commercial agreement.`;

// ---------------- AI team plans ----------------
export const TeamPlanSourceSchema = z.object({
  sourceType: z.enum(['opportunity', 'project', 'tender']),
  sourceId: z.string().uuid(),
  sector: z.string().trim().max(80).optional(),
});
export const TeamPlanInviteSchema = z.object({ roleKey: z.string().trim().min(1).max(40), organizationId: z.string().uuid(), message: z.string().trim().max(1000).optional() });
export const RESPONSIBILITIES: Record<string, string[]> = {
  lead: ['Owns the client relationship and the contract', 'Approves scope, price and team changes', 'Coordinates partners and reports to Unite'],
  certified: ['Provides the certified scope and signs off its quality', 'Supplies certificates and test records'],
  local: ['Site execution in the region', 'Local permits, labour and logistics', 'Daily progress and safety reporting'],
  capacity: ['Additional engineering and installation crews', 'Shares equipment and working capital for the peak period'],
  procurement: ['Sources materials to specification', 'Delivery schedules and inspections'],
  om: ['Operations and maintenance after handover', 'Performance reports and warranty claims'],
};
/** RACI draft: R = responsible, A = accountable, C = consulted, I = informed. Lead is accountable for everything. */
export function responsibilityMatrix(roles: { key: string; role: string; kind: string }[]) {
  const activities = ['Customer & contract', 'Design & engineering', 'Procurement', 'Site execution', 'Quality & certification', 'Commissioning & handover', 'O&M & warranty'];
  const owner: Record<string, string> = { 'Customer & contract': 'lead', 'Design & engineering': 'certified', Procurement: 'procurement', 'Site execution': 'local', 'Quality & certification': 'certified', 'Commissioning & handover': 'local', 'O&M & warranty': 'om' };
  return activities.map((a) => ({
    activity: a,
    cells: Object.fromEntries(roles.map((r) => [r.key, r.kind === 'lead' ? (owner[a] === 'lead' || !roles.some((x) => x.kind === owner[a]) ? 'A/R' : 'A') : r.kind === owner[a] ? 'R' : r.kind === 'capacity' && ['Site execution', 'Commissioning & handover'].includes(a) ? 'C' : 'I'])),
  }));
}

// ---------------- Project work packages ----------------
export const PACKAGE_CATEGORIES = ['civil', 'electrical', 'mechanical', 'procurement', 'installation', 'logistics', 'om', 'consulting', 'custom'] as const;
export const PACKAGE_CATEGORY_LABELS: Record<string, string> = {
  civil: 'Civil works', electrical: 'Electrical', mechanical: 'Mechanical', procurement: 'Equipment procurement', installation: 'Installation & commissioning', logistics: 'Logistics', om: 'Operations & maintenance', consulting: 'Professional consulting', custom: 'Other',
};
export const PACKAGE_STATUS_LABELS: Record<string, string> = { draft: 'Draft', open: 'Open for bids', awarded: 'Awarded', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
export const WorkPackageSchema = z.object({
  category: z.enum(PACKAGE_CATEGORIES),
  title: z.string().trim().min(3).max(160),
  scope: z.string().trim().min(20, { message: 'Describe the scope (at least 20 characters)' }).max(4000),
  budget: z.number().int().min(1).max(1_00_00_00_000_00),
  closesAt: z.string().datetime({ offset: true }),
  eligibility: z.object({ sectors: z.array(z.string()).max(10).default([]), regions: z.array(z.string()).max(20).default([]), certifications: z.array(z.string()).max(10).default([]), minTurnover: z.number().int().min(0).optional() }).default({ sectors: [], regions: [], certifications: [] }),
});
export const PackageBidSchema = z.object({ amount: z.number().int().min(1).max(1_00_00_00_000_00), days: z.number().int().min(1).max(3650), note: z.string().trim().min(10).max(2000) });
/** Work packages split the parent project's value; they never add to it. */
export function packageBudgetCheck(projectValue: number, existing: number[], next: number) {
  const used = existing.reduce((a, b) => a + b, 0);
  return { ok: used + next <= projectValue, used, remaining: projectValue - used };
}
/** Parent progress = each package's progress weighted by its budget (cancelled packages ignored). */
export function rolledUpProgress(pkgs: { budget: number; progress: number; status: string }[]) {
  const live = pkgs.filter((p) => p.status !== 'cancelled' && p.status !== 'draft');
  const total = live.reduce((a, p) => a + p.budget, 0);
  return total ? Math.round(live.reduce((a, p) => a + p.budget * (p.status === 'completed' ? 100 : p.progress), 0) / total) : 0;
}
export function packageEligibility(e: { sectors?: string[]; regions?: string[]; certifications?: string[]; minTurnover?: number }, p: { sectors: string[]; regions: string[]; certifications: string[]; annualTurnover: number | null; verified: boolean }) {
  const reasons: string[] = [];
  if (!p.verified) reasons.push('Your company is not verified yet');
  if (e.sectors?.length && !e.sectors.some((s) => p.sectors.includes(s))) reasons.push('Your sectors do not match this package');
  if (e.regions?.length && !e.regions.some((r) => p.regions.some((x) => x === r || r.startsWith(x) || x.startsWith(r)))) reasons.push('The site is outside your declared coverage');
  for (const c of e.certifications ?? []) if (!p.certifications.includes(c)) reasons.push(`Needs ${c}`);
  if (e.minTurnover && (p.annualTurnover ?? 0) < e.minTurnover) reasons.push('Annual turnover below the package minimum');
  return { eligible: reasons.length === 0, reasons };
}

// ---------------- Tender eligibility analyzer ----------------
export type CriterionKind = 'turnover' | 'net_worth' | 'experience' | 'similar_work' | 'certification' | 'registration' | 'emd' | 'deadline' | 'manpower' | 'equipment' | 'consortium';
export interface Criterion { id: string; kind: CriterionKind; label: string; value: number | null; unit: string | null; page: number; line: number; text: string }
export const CRITERION_LABELS: Record<CriterionKind, string> = {
  turnover: 'Average annual turnover', net_worth: 'Net worth', experience: 'Years in business', similar_work: 'Similar work completed', certification: 'Certification', registration: 'Statutory registration',
  emd: 'Earnest money deposit (EMD)', deadline: 'Submission deadline', manpower: 'Manpower', equipment: 'Equipment', consortium: 'Consortium / JV rules',
};
const amount = (n: string, unit?: string) => { const v = Number(n.replace(/,/g, '')); const u = (unit ?? '').toLowerCase(); return Math.round(v * 100 * (/crore|cr/.test(u) ? 1e7 : /lakh|lac/.test(u) ? 1e5 : 1)); };
const RUPEE = String.raw`(?:Rs\.?|INR|₹)\s*`;
const AMT = String.raw`([\d,]+(?:\.\d+)?)\s*(crores?|cr\.?|lakhs?|lacs?)?`;
const CERTS = /\b(ISO\s?\d{4,5}(?::\d{4})?|CEIG|MNRE|BIS|ALMM|NABL|IEC\s?\d{4,5}|OHSAS\s?18001|CE mark)\b/gi;
const REGS: [RegExp, string][] = [[/\bGST(?:IN)?\b/i, 'GST registration'], [/\bPAN\b/i, 'PAN'], [/\bEPF\b|Provident Fund/i, 'EPF registration'], [/\bESI(?:C)?\b/i, 'ESI registration'], [/\bUdyam\b|\bMSME\b/i, 'MSME / Udyam registration'], [/electrical contractor(?:'s)? licen[cs]e/i, 'Electrical contractor licence'], [/\bCLRA\b|labour licen[cs]e/i, 'Labour licence (CLRA)'], [/\bIEC\b(?!\s?\d)|import.?export code/i, 'Import Export Code']];

/** Finds eligibility conditions in the pages of a tender document, each with its page and line so a person can check the source. */
export function extractTenderCriteria(pages: string[]): Criterion[] {
  const out: Criterion[] = [];
  const add = (kind: CriterionKind, label: string, value: number | null, unit: string | null, page: number, line: number, text: string) => {
    if (out.some((c) => c.kind === kind && c.label === label && c.value === value)) return;
    out.push({ id: `${kind}-${out.length + 1}`, kind, label, value, unit, page, line, text: text.trim().slice(0, 300) });
  };
  pages.forEach((pageText, pi) => {
    pageText.split(/\n/).forEach((raw, li) => {
      const t = raw.replace(/\s+/g, ' ').trim();
      if (t.length < 6) return;
      const page = pi + 1; const line = li + 1;
      let m: RegExpMatchArray | null;
      if ((m = t.match(new RegExp(String.raw`turnover[^.]{0,80}?${RUPEE}?${AMT}`, 'i'))) && /\d/.test(m[1])) add('turnover', CRITERION_LABELS.turnover, amount(m[1], m[2]), 'paise', page, line, t);
      if ((m = t.match(new RegExp(String.raw`net\s*worth[^.]{0,60}?${RUPEE}?${AMT}`, 'i')))) add('net_worth', CRITERION_LABELS.net_worth, amount(m[1], m[2]), 'paise', page, line, t);
      if ((m = t.match(/(?:minimum|at least|not less than)\s*(\d{1,2})\s*years?\s*(?:of\s*)?(?:experience|in (?:business|operation|existence))/i)) || (m = t.match(/(\d{1,2})\s*years?\s*(?:of\s*)?(?:experience|existence)/i))) add('experience', CRITERION_LABELS.experience, Number(m[1]), 'years', page, line, t);
      if ((m = t.match(new RegExp(String.raw`(?:similar\s*work|completed)[^.]{0,120}?(?:value|costing)[^.]{0,30}?${RUPEE}?${AMT}`, 'i')))) add('similar_work', CRITERION_LABELS.similar_work, amount(m[1], m[2]), 'paise', page, line, t);
      else if ((m = t.match(/(?:similar\s*work|similar\s*projects?)[^.]{0,80}?(\d+(?:\.\d+)?)\s*(MW|kW|kWp|MWp)/i))) add('similar_work', CRITERION_LABELS.similar_work, Number(m[1]) * (/^m/i.test(m[2]) ? 1000 : 1), 'kW', page, line, t);
      if ((m = t.match(new RegExp(String.raw`(?:EMD|earnest money(?: deposit)?|bid security)[^.]{0,40}?${RUPEE}${AMT}`, 'i')))) add('emd', CRITERION_LABELS.emd, amount(m[1], m[2]), 'paise', page, line, t);
      if ((m = t.match(/(?:last date|due date|closing date|deadline|submission)[^.]{0,60}?(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i))) add('deadline', CRITERION_LABELS.deadline, Date.UTC(+m[3], +m[2] - 1, +m[1]), 'date', page, line, t);
      if (/engineer|technician|supervisor|electrician|manpower|worker/i.test(t)) for (const k of t.matchAll(/(\d{1,4})\s*(?:nos?\.?\s*)?(?:qualified\s*|skilled\s*)?(engineers?|technicians?|supervisors?|electricians?|workers?)/gi)) add('manpower', `${CRITERION_LABELS.manpower}: ${k[2].toLowerCase().replace(/s?$/, 's')}`, Number(k[1]), 'people', page, line, t);
      if (/(?:own|owned|lease|leased|possess)/i.test(t)) for (const e of t.matchAll(/(hydra crane|crane|JCB|excavator|transit mixer|testing (?:kit|equipment)|megger|earth tester|vehicles?|drones?)/gi)) add('equipment', `${CRITERION_LABELS.equipment}: ${e[1].toLowerCase()}`, null, null, page, line, t);
      if (/consortium|joint venture|\bJV\b/i.test(t)) add('consortium', CRITERION_LABELS.consortium, null, null, page, line, t);
      for (const c of t.matchAll(CERTS)) add('certification', c[1].toUpperCase().replace(/^ISO\s?/, 'ISO').replace(/\s+/g, ' '), null, null, page, line, t);
      if (/registration|registered|licen[cs]e|certificate of|copy of/i.test(t)) for (const [r, label] of REGS) if (r.test(t)) add('registration', label, null, null, page, line, t);
    });
  });
  return out;
}

export interface EligibilityProfile { annualTurnover: number | null; yearsExperience: number | null; certifications: string[]; hasGstin: boolean; employees: number | null; documents: string[] }
export type CheckStatus = 'met' | 'not_met' | 'needs_evidence' | 'info';
/** Compares extracted criteria with a partner's profile. Results are indicative: never "eligible" until an authorised reviewer confirms. */
export function compareEligibility(criteria: Criterion[], p: EligibilityProfile, now = Date.now()) {
  const certs = p.certifications.map((c) => c.toUpperCase().replace(/\s+/g, ''));
  const rows = criteria.map((c) => {
    let status: CheckStatus = 'needs_evidence'; let note = 'Attach the supporting document';
    if (c.kind === 'turnover') ({ status, note } = p.annualTurnover == null ? { status: 'needs_evidence', note: 'Turnover not in your profile — add audited accounts' } : p.annualTurnover >= (c.value ?? 0) ? { status: 'met', note: 'Declared turnover meets this (attach audited accounts)' } : { status: 'not_met', note: 'Declared turnover is below this — consider a consortium partner' });
    else if (c.kind === 'experience') ({ status, note } = p.yearsExperience == null ? { status: 'needs_evidence', note: 'Years in business not in your profile' } : p.yearsExperience >= (c.value ?? 0) ? { status: 'met', note: 'Declared experience meets this' } : { status: 'not_met', note: 'Fewer years than required' });
    else if (c.kind === 'certification') ({ status, note } = certs.includes(c.label.toUpperCase().replace(/\s+/g, '')) ? { status: 'met', note: 'In your profile (self-declared — attach the certificate)' } : { status: 'not_met', note: 'Not in your profile — a certified partner may cover it' });
    else if (c.kind === 'registration') ({ status, note } = c.label === 'GST registration' && p.hasGstin ? { status: 'met', note: 'GSTIN on your profile' } : p.documents.some((d) => d.toLowerCase().includes(c.label.split(' ')[0].toLowerCase())) ? { status: 'met', note: 'Document on file' } : { status: 'needs_evidence', note: 'Attach a copy' });
    else if (c.kind === 'manpower') ({ status, note } = p.employees != null && p.employees >= (c.value ?? 0) ? { status: 'needs_evidence', note: `${p.employees} employees declared — attach CVs and qualifications` } : { status: 'not_met', note: 'Fewer people declared than required' });
    else if (c.kind === 'deadline') ({ status, note } = (c.value ?? 0) < now ? { status: 'not_met', note: 'This date has passed' } : { status: 'info', note: `${Math.ceil(((c.value ?? 0) - now) / 86400000)} days left` });
    else if (c.kind === 'emd') ({ status, note } = { status: 'info', note: 'Arrange the bank guarantee or online payment before the deadline' });
    else if (c.kind === 'consortium') ({ status, note } = { status: 'info', note: 'Check whether a consortium or JV may bid and how experience is counted' });
    return { ...c, status, note };
  });
  const notMet = rows.filter((r) => r.status === 'not_met').length;
  const evidence = rows.filter((r) => r.status === 'needs_evidence').length;
  const deadline = rows.find((r) => r.kind === 'deadline');
  return {
    rows, notMet, evidence,
    summary: !rows.length ? 'No eligibility conditions were found — read the document and add them manually' : notMet ? `${notMet} condition${notMet > 1 ? 's' : ''} not met on your profile — a consortium may help` : evidence ? `No gaps found on your profile; ${evidence} item${evidence > 1 ? 's' : ''} need documents` : 'No gaps found on your profile',
    risk: notMet > 0 ? 'high' : evidence > 2 ? 'medium' : 'low',
    deadlineSoon: !!deadline && (deadline.value ?? 0) - now < 7 * 86400000 && (deadline.value ?? 0) > now,
    disclaimer: 'Indicative only. Extracted automatically from the document and compared with your self-declared profile. Not confirmed until an authorised reviewer checks the tender terms.',
  };
}
