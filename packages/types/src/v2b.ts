/** COLLABIZ V2 Phase 2 — payment states, overdue rules, contribution ledger, consortium agreements, resolution centre. */
import { z } from 'zod';

// ---------------- 06 Milestone payment assurance ----------------
export const PAYMENT_STATES = ['projected', 'contracted', 'earned', 'approved', 'invoiced', 'partially_paid', 'paid', 'disputed'] as const;
export const PAYMENT_STATE_LABELS: Record<string, string> = { projected: 'Projected', contracted: 'Contracted', earned: 'Earned', approved: 'Approved', invoiced: 'Invoiced', partially_paid: 'Partially paid', paid: 'Paid', disputed: 'Disputed' };
export const PAYMENT_TERMS_DAYS = 30;
/**
 * One display state per milestone. Projected = planned only; Contracted = project under an executed contract;
 * Earned = work submitted for certification; Approved = certified by the client; then invoice and money received.
 */
export function paymentState(m: { status: string; contracted: boolean }, inv: { amount: number; received: number; status: string } | null, disputed = false) {
  if (disputed) return 'disputed';
  if (inv) return inv.status === 'paid' || inv.received >= inv.amount ? 'paid' : inv.received > 0 ? 'partially_paid' : 'invoiced';
  if (m.status === 'certified') return 'approved';
  if (m.status === 'submitted') return 'earned';
  return m.contracted ? 'contracted' : 'projected';
}
export function overdueDays(due: string | Date | null, outstanding: number, today = new Date()) {
  if (!due || outstanding <= 0) return 0;
  const d = Math.floor((today.getTime() - new Date(due).getTime()) / 86400000);
  return d > 0 ? d : 0;
}
export const ReceiptSchema = z.object({
  amount: z.number().int().min(1, { message: 'Enter the amount received' }).max(1_00_00_00_000_00),
  reference: z.string().trim().min(3, { message: 'Enter the bank / UTR reference' }).max(80),
  receivedAt: z.string().date().optional(),
  note: z.string().trim().max(500).optional(),
});

// ---------------- 05 Consortium contributions and agreements ----------------
export const CONTRIBUTION_KINDS = ['introduction', 'capital', 'equipment', 'services', 'technical', 'manpower'] as const;
export const CONTRIBUTION_KIND_LABELS: Record<string, string> = { introduction: 'Business introduction', capital: 'Capital / finance', equipment: 'Equipment', services: 'Services', technical: 'Technical know-how', manpower: 'Manpower' };
export const ContributionSchema = z.object({ kind: z.enum(CONTRIBUTION_KINDS), description: z.string().trim().min(5).max(500), pledgedValue: z.number().int().min(0).max(1_00_00_00_000_00) });
export const ContributionDeliverySchema = z.object({ deliveredValue: z.number().int().min(0).max(1_00_00_00_000_00), evidence: z.string().trim().min(5).max(500) });
/** Delivered vs pledged per member; gaps over 10% are flagged for the members to resolve (never decided automatically). */
export function contributionLedger(rows: { orgId: string; pledgedValue: number; deliveredValue: number | null }[], sharePct: Record<string, number> = {}) {
  const byOrg = new Map<string, { pledged: number; delivered: number }>();
  for (const r of rows) { const x = byOrg.get(r.orgId) ?? { pledged: 0, delivered: 0 }; x.pledged += r.pledgedValue; x.delivered += r.deliveredValue ?? 0; byOrg.set(r.orgId, x); }
  const totalDelivered = [...byOrg.values()].reduce((a, x) => a + x.delivered, 0);
  return [...byOrg.entries()].map(([orgId, x]) => {
    const deliveredPct = totalDelivered ? Math.round((x.delivered / totalDelivered) * 1000) / 10 : 0;
    const agreed = sharePct[orgId];
    const flags: string[] = [];
    if (x.pledged && x.delivered < x.pledged * 0.9) flags.push('Delivered less than pledged');
    if (agreed != null && totalDelivered && Math.abs(deliveredPct - agreed) > 10) flags.push(`Contribution ${deliveredPct}% vs agreed share ${agreed}%`);
    return { orgId, pledged: x.pledged, delivered: x.delivered, deliveredPct, agreedSharePct: agreed ?? null, flags };
  });
}
export const AGREEMENT_KINDS = ['mou', 'jv', 'amendment'] as const;
export const AGREEMENT_KIND_LABELS: Record<string, string> = { mou: 'Memorandum of understanding', jv: 'Joint venture terms', amendment: 'Amendment' };
export const DECISION_RULES: Record<string, string> = { unanimous: 'All members must agree', majority: 'Members holding more than 50% of shares decide', lead: 'The lead member decides, after consulting members' };
export const TeamAgreementSchema = z.object({
  kind: z.enum(AGREEMENT_KINDS),
  title: z.string().trim().min(5).max(160),
  decisionRule: z.enum(['unanimous', 'majority', 'lead']),
  authority: z.string().trim().min(10).max(2000),
  body: z.string().trim().min(40, { message: 'Write the terms (at least 40 characters)' }).max(20000),
});

// ---------------- 10 Resolution centre ----------------
export const RESOLUTION_KINDS = ['lead', 'commission', 'xchange', 'contract'] as const;
export const RESOLUTION_KIND_LABELS: Record<string, string> = { lead: 'Lead ownership', commission: 'Commission', xchange: 'XCHANGE delivery', contract: 'Contract responsibility' };
export const ContractDisputeSchema = z.object({
  againstOrgId: z.string().uuid(),
  subject: z.string().trim().min(5).max(160),
  statement: z.string().trim().min(30, { message: 'Explain what happened (at least 30 characters)' }).max(5000),
  amount: z.number().int().min(0).max(1_00_00_00_000_00).optional(),
});
export const ResolutionDecisionSchema = z.object({ decision: z.enum(['upheld', 'partly_upheld', 'not_upheld', 'settled']), note: z.string().trim().min(20, { message: 'Give the reasons (at least 20 characters)' }).max(5000) });
export const RESOLUTION_DECISION_LABELS: Record<string, string> = { upheld: 'Upheld', partly_upheld: 'Partly upheld', not_upheld: 'Not upheld', settled: 'Settled by the parties' };
export const APPEAL_DAYS = 14;
/** Rules-based evidence digest — a reading aid for reviewers, never a decision. */
export function evidenceDigest(events: { at: string | Date; who: string; what: string }[]) {
  const sorted = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const parties = [...new Set(sorted.map((e) => e.who))];
  const span = sorted.length > 1 ? Math.round((+new Date(sorted[sorted.length - 1].at) - +new Date(sorted[0].at)) / 86400000) : 0;
  return { count: sorted.length, parties, spanDays: span, first: sorted[0] ?? null, last: sorted[sorted.length - 1] ?? null, note: 'A summary of the recorded events to help the reviewer. It is not a finding; the reviewer decides on the evidence.' };
}
