'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COMMISSION_STATE_LABELS, type CommissionState } from '@collabiz/types';
import { StatusBadge } from '@collabiz/ui';

export const inr = (minor?: number | null) => (minor == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minor / 100));
export const when = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = { estimated: 'neutral', eligible: 'brand', earned: 'brand', approved: 'success', invoiced: 'warning', settled: 'success', on_hold: 'warning', disputed: 'danger', reversed: 'danger' };
export function CommissionBadge({ status }: { status: string }) {
  return <StatusBadge status={status} tone={TONE[status] ?? 'neutral'} label={COMMISSION_STATE_LABELS[status as CommissionState] ?? status} />;
}

const TABS: [string, string][] = [['/earnings', 'Overview'], ['/earnings/summary', 'Summary'], ['/earnings/live', 'Live tracker'], ['/payouts/request', 'Request payout'], ['/payments/history', 'Payments'], ['/payments/bank', 'Bank statements'], ['/gst', 'GST documents'], ['/tax-records', 'Tax records'], ['/commissions/calculator', 'Calculator'], ['/commissions/disputes', 'Disputes']];
export function EarningsTabs() {
  const path = usePathname();
  return <nav aria-label="Earnings sections" className="cz-tabs">{TABS.map(([h, l]) => <Link key={h} href={h} aria-current={path === h ? 'page' : undefined}>{l}</Link>)}</nav>;
}

export const EARNED_NOTE = 'Commission is earned only when the customer pays for the milestone under the contract. Projected and eligible amounts are estimates, not money owed.';
