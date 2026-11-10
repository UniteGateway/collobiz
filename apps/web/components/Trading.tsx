'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const inr = (minor?: number | null) => (minor == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minor / 100));
export const when = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleString('en-IN', d.length === 10 ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

const TABS: [string, string][] = [['/trading', 'Marketplace'], ['/trading/suppliers', 'Suppliers'], ['/trading/enquiry', 'Enquiries'], ['/trading/quotations', 'Quotations'], ['/trading/orders', 'Orders'], ['/trading/claims', 'Claims'], ['/trading/territories', 'Territories'], ['/xchange', 'XCHANGE barter']];
export function TradingTabs() {
  const path = usePathname();
  return <nav aria-label="Trading sections" className="cz-tabs">{TABS.map(([h, l]) => <Link key={h} href={h} aria-current={path === h || (h !== '/trading' && path.startsWith(h)) ? 'page' : undefined}>{l}</Link>)}</nav>;
}

export type Line = { item: string; quantity: number | string; unit: string; unitPrice?: number | string; spec?: string };
