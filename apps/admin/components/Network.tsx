'use client';
/** Unite Solar Network admin: section tabs and shared helpers. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const inr = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(Number(p) / 100).toLocaleString('en-IN')}`);
export const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
export const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  draft: 'neutral', applied: 'warning', approved: 'info', agreement_signed: 'info', setup: 'info', live: 'success', suspended: 'danger', rejected: 'neutral', closed: 'neutral',
  unpaid: 'neutral', submitted: 'warning', verified: 'success', pending: 'warning', qualified: 'info', payable: 'info', paid: 'success', reversed: 'neutral', blocked: 'danger',
  available: 'success', reserved: 'warning', allocated: 'info', expired: 'neutral', requested: 'warning', dispatched: 'info', delivered: 'info', installed: 'info', accepted: 'success',
  confirmed: 'success', returned: 'neutral', damaged: 'danger', open: 'warning', assigned: 'info', in_progress: 'info', resolved: 'success', cancelled: 'neutral', received: 'success',
};
const TABS: [string, string][] = [['/workspace/network', 'Overview & reports'], ['/workspace/network/applications', 'Applications'], ['/workspace/network/territories', 'Territories'], ['/workspace/network/catalogue', 'Plans & catalogue'], ['/workspace/network/orders', 'Orders & stock'], ['/workspace/network/commissions', 'Commissions & settlements'], ['/workspace/network/demo', 'Demo & service']];

export function NetworkTabs() {
  const path = usePathname();
  return <nav aria-label="Unite Solar network" className="cz-tabs" style={{ marginBottom: 16 }}>{TABS.map(([h, l]) => <Link key={h} href={h} aria-current={path === h || (h !== '/workspace/network' && path.startsWith(h)) ? 'page' : undefined}>{l}</Link>)}</nav>;
}
