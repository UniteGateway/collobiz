/**
 * Proof passport (track record from records both sides confirmed), credit notes, expenses and the profit report.
 * Money in paise.
 */
import { z } from 'zod';

// ============================================================================ Proof
export const PROOF_LEVELS = ['New', 'Emerging', 'Established', 'Proven'] as const;
export type ProofLevel = (typeof PROOF_LEVELS)[number];
/**
 * Level from confirmed records only. Established needs 10+ records and, where measured, ≥ 80% on time;
 * Proven needs 30+ records, ≥ 90% on time and no upheld disputes in the record.
 */
export function proofLevel(records: number, onTimePct: number | null, disputesUpheld = 0): ProofLevel {
  const ok = (min: number) => onTimePct === null || onTimePct >= min;
  if (records >= 30 && ok(90) && disputesUpheld === 0) return 'Proven';
  if (records >= 10 && ok(80)) return 'Established';
  return records > 0 ? 'Emerging' : 'New';
}
export const pct = (num: number, den: number) => (den ? Math.round((num / den) * 100) : null);

// ============================================================================ Credit notes and expenses
export const CREDIT_NOTE_REASONS = [
  { code: 'rate_difference', label: 'Rate difference' }, { code: 'deficiency', label: 'Deficiency in service or supply' }, { code: 'discount', label: 'Discount after sale' },
  { code: 'return', label: 'Goods returned' }, { code: 'cancellation', label: 'Cancellation' },
] as const;
export const creditReasonLabel = (c: string) => CREDIT_NOTE_REASONS.find((r) => r.code === c)?.label ?? c;
export const CreditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.enum(CREDIT_NOTE_REASONS.map((r) => r.code) as unknown as [string, ...string[]]),
  amount: z.number().int().positive('Enter the credit amount'),
  note: z.string().trim().min(5, 'Explain the credit (at least 5 characters)').max(1000),
});
/** Credit cannot exceed what is left on the invoice after earlier credit notes. */
export const creditRoom = (invoiceAmount: number, credited: number) => Math.max(0, invoiceAmount - credited);

export const EXPENSE_CATEGORIES = ['rent', 'salaries', 'travel', 'utilities', 'marketing', 'software', 'professional_fees', 'logistics', 'other'] as const;
export const EXPENSE_LABELS: Record<string, string> = { rent: 'Rent', salaries: 'Salaries & wages', travel: 'Travel', utilities: 'Power & utilities', marketing: 'Marketing', software: 'Software & subscriptions', professional_fees: 'Professional fees', logistics: 'Logistics', other: 'Other' };
export const ExpenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: z.enum(EXPENSE_CATEGORIES), amount: z.number().int().positive('Enter the amount'),
  description: z.string().trim().min(3).max(300), vendor: z.string().trim().max(120).optional(),
});

// ============================================================================ Profit report
export interface PnlInputs {
  pipeline: number; contractValue: number;
  invoicesIssued: number; creditNotesIssued: number; microEarned: number; royaltyIncome: number;
  receiptsIn: number; refundsPaid: number;
  supplierInvoices: number; creditNotesReceived: number; microPaid: number;
  commissionExpense: number; expenses: number; royaltyPaid: number; commissionLiability: number;
}
/** Each measure stays separate: pipeline and contract value are not revenue; invoiced revenue is not cash. */
export function profitReport(i: PnlInputs) {
  const invoicedRevenue = i.invoicesIssued - i.creditNotesIssued + i.microEarned;
  const collectedCash = i.receiptsIn - i.refundsPaid;
  const directCosts = i.supplierInvoices - i.creditNotesReceived + i.microPaid;
  const grossProfit = invoicedRevenue + i.royaltyIncome - directCosts;
  const operatingExpenses = i.expenses + i.royaltyPaid;
  const netProfit = grossProfit - i.commissionExpense - operatingExpenses;
  return {
    pipeline: i.pipeline, contractValue: i.contractValue, invoicedRevenue, royaltyIncome: i.royaltyIncome, collectedCash,
    directCosts, grossProfit, commissionExpense: i.commissionExpense, operatingExpenses, netProfit, commissionLiability: i.commissionLiability,
  };
}
export const PNL_MEASURES: { key: keyof ReturnType<typeof profitReport>; group: string; label: string; help: string }[] = [
  { key: 'pipeline', group: 'Not revenue', label: 'Pipeline value', help: 'Open CRM deals today — not revenue' },
  { key: 'contractValue', group: 'Not revenue', label: 'Contract value', help: 'Projects you lead whose contract was executed in the period' },
  { key: 'invoicedRevenue', group: 'Revenue and cash', label: 'Invoiced revenue', help: 'Invoices issued in the period, less credit notes issued, plus micro-contracts paid to you' },
  { key: 'royaltyIncome', group: 'Revenue and cash', label: 'Royalty income', help: 'Royalty on franchisee sales for the period' },
  { key: 'collectedCash', group: 'Revenue and cash', label: 'Collected cash', help: 'Confirmed payments received in the period, less refunds paid' },
  { key: 'directCosts', group: 'Profit', label: 'Direct costs', help: 'Supplier invoices received, less credits received, plus micro-contracts you paid' },
  { key: 'grossProfit', group: 'Profit', label: 'Gross profit', help: 'Invoiced revenue + royalty income − direct costs' },
  { key: 'commissionExpense', group: 'Profit', label: 'Commission expense', help: 'Commissions approved in the period that you pay' },
  { key: 'operatingExpenses', group: 'Profit', label: 'Operating expenses', help: 'Recorded expenses plus royalty you pay as a franchisee' },
  { key: 'netProfit', group: 'Profit', label: 'Net profit', help: 'Gross profit − commission expense − operating expenses' },
  { key: 'commissionLiability', group: 'Owed', label: 'Commission liability', help: 'Approved commissions you owe that are not settled yet (today)' },
];
/** Indian financial year containing a date: April to March. */
export function financialYear(d: Date) { const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; }
