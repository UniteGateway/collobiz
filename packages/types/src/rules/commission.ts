/**
 * Commission calculation — §4.2 "Commission transparency": projected vs eligible vs earned vs approved
 * vs invoiced vs paid; auditable schedules and deductions. All amounts are integer minor units (paise).
 */
export type CommissionBasis = 'percent' | 'flat' | 'tiered';
export interface Tier { upTo: number | null; ratePct: number } // upTo in minor units; null = no cap
export interface Deduction { label: string; amount?: number; pct?: number }
export interface CommissionInput {
  dealValue: number;
  basis: CommissionBasis;
  ratePct?: number;
  flatAmount?: number;
  tiers?: Tier[];
  deductions?: Deduction[];
  gstPct?: number; // added on top when partner is GST-registered
  tdsPct?: number; // withheld at source
  sharePct?: number; // beneficiary share of pool (team splits); default 100
}
export interface CommissionBreakdown {
  gross: number;
  share: number;
  deductions: { label: string; amount: number }[];
  taxable: number;
  gst: number;
  tds: number;
  payable: number;
}

const r = (n: number) => Math.round(n);

export function calculateCommission(i: CommissionInput): CommissionBreakdown {
  if (!Number.isFinite(i.dealValue) || i.dealValue < 0) throw new Error('dealValue must be a non-negative number');
  let gross = 0;
  if (i.basis === 'percent') {
    if (i.ratePct == null || i.ratePct < 0 || i.ratePct > 100) throw new Error('ratePct must be 0-100');
    gross = r((i.dealValue * i.ratePct) / 100);
  } else if (i.basis === 'flat') {
    if (i.flatAmount == null || i.flatAmount < 0) throw new Error('flatAmount required');
    gross = r(i.flatAmount);
  } else {
    const tiers = i.tiers ?? [];
    if (!tiers.length) throw new Error('tiers required for tiered basis');
    let prev = 0;
    for (const t of tiers) {
      const cap = t.upTo == null ? i.dealValue : Math.min(t.upTo, i.dealValue);
      if (cap > prev) gross += ((cap - prev) * t.ratePct) / 100;
      prev = Math.max(prev, cap);
      if (t.upTo == null || t.upTo >= i.dealValue) break;
    }
    gross = r(gross);
  }
  const sharePct = i.sharePct ?? 100;
  if (sharePct < 0 || sharePct > 100) throw new Error('sharePct must be 0-100');
  const share = r((gross * sharePct) / 100);
  const deductions = (i.deductions ?? []).map((d) => ({ label: d.label, amount: r(d.amount ?? (share * (d.pct ?? 0)) / 100) }));
  const taxable = Math.max(0, share - deductions.reduce((s, d) => s + d.amount, 0));
  const gst = r((taxable * (i.gstPct ?? 0)) / 100);
  const tds = r((taxable * (i.tdsPct ?? 0)) / 100);
  return { gross, share, deductions, taxable, gst, tds, payable: taxable + gst - tds };
}

/** Format minor units as currency for display (default INR). */
export function formatMoney(minor: number, currency = 'INR', locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}
