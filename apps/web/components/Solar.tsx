'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SOLAR_MODEL_LABELS, SOLAR_SYSTEM_LABELS } from '@collabiz/types';

/** ₹ with Indian grouping (from paise). */
export const rupees = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
/** ₹ in lakh / crore for big numbers. */
export const lakh = (p: number) => { const r = p / 100; return r >= 1_00_00_000 ? `₹${(r / 1_00_00_000).toFixed(2)} Cr` : r >= 1_00_000 ? `₹${(r / 1_00_000).toFixed(2)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };
export const perUnit = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
export const kwLabel = (kw: number) => `${kw.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kW`;
export const modelSystem = (model: string, system: string) => `${SOLAR_MODEL_LABELS[model] ?? model}${model === 'kit' ? ` · ${SOLAR_SYSTEM_LABELS[system] ?? system}` : ''}`;
export const SOLAR_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { draft: 'neutral', sent: 'info', accepted: 'info', won: 'success', installed: 'success', paid: 'success', declined: 'danger', expired: 'warning' };

const TABS: [string, string][] = [['/solar', 'Overview'], ['/solar/new', 'New quote'], ['/solar/kits', 'Solar kits'], ['/solar/commission', 'Commission'], ['/solar/referrals', 'Referrals']];
/** Sub-navigation of the Unite Solar desk. */
export function SolarNav() {
  const path = usePathname();
  const active = TABS.slice().reverse().find(([h]) => path === h || (h !== '/solar' && path.startsWith(h)) || (h === '/solar' && path.startsWith('/solar/quotes')))?.[0];
  return (
    <nav className="cz-tabs cz-no-print" aria-label="Solar desk">
      {TABS.map(([href, label]) => <Link key={href} href={href} aria-current={active === href ? 'page' : undefined}>{label}</Link>)}
    </nav>
  );
}
