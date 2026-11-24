'use client';
/** COLLABIZ POWERTRADE — shared pieces for the web screens. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PT_STATUS, type PtStatus } from '@collabiz/types';
import { Icon, StatusBadge, type IconName } from '@collabiz/ui';

export const rupees = (paise?: number | null) => {
  if (paise == null) return '—';
  const r = paise / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(2)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};
export const toPaise = (rupeeText: string) => Math.round(Number(rupeeText.replace(/[^\d.]/g, '') || 0) * 100);
const TONE: Partial<Record<PtStatus, string>> = { approved: 'success', contracted: 'success', completed: 'success', in_progress: 'info', partially_fulfilled: 'info', awaiting_documents: 'warning', disputed: 'danger', cancelled: 'neutral', expired: 'neutral' };
export const PtStatusBadge = ({ s }: { s: string }) => <StatusBadge status={s} tone={(TONE[s as PtStatus] ?? 'brand') as never} label={PT_STATUS[s as PtStatus] ?? s} />;

/** Header used on every POWERTRADE screen: product title on the left, photo banner with the tagline on the right. */
export function PtHeader({ title, lead, children }: { title?: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="pt-head" data-screen="powertrade">
      <div className="pt-head-title">
        <p className="pt-brand">Unite business programme</p>
        <h1>{title ?? <>COLLABIZ <span className="pt-power">Power</span><span className="pt-trade">Trade</span></>}</h1>
        <p className="pt-lead">{lead ?? 'Business collaboration + discounted renewable power + product sales + barter + commercial savings.'}</p>
        {children}
      </div>
      <div className="pt-banner">
        <img src="/photos/energy-panel-roof.webp" alt="" aria-hidden />
        <div><strong>Do business. Save on power. Grow together.</strong><span>Collaborate through products, sales, services, rooftops, EPC, barter or investment — and unlock lower power costs with real business growth.</span></div>
      </div>
    </header>
  );
}

const TABS: [string, string, IconName][] = [
  ['/powertrade', 'Overview', 'home'], ['/powertrade/power', 'Get discounted power', 'zap'], ['/powertrade/finance', 'Earn power benefits', 'coins'], ['/powertrade/matches', 'Sell my products', 'package'],
  ['/xchange', 'Barter / XCHANGE', 'barter'], ['/powertrade/collaborations?model=solar_integration', 'Become EPC partner', 'factory'], ['/powertrade/collaborations', 'My collaborations', 'teams'], ['/powertrade/join', 'Partner microsite', 'building'],
];
export function PtNav() {
  const path = usePathname();
  return <nav className="pt-nav" aria-label="POWERTRADE">{TABS.map(([h, l, i]) => <Link key={l} href={h} aria-current={path === h ? 'page' : undefined}><Icon name={i} size={16} />{l}</Link>)}</nav>;
}

export function Widget({ label, value, hint, href, tone = 'blue', icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: string; icon: IconName }) {
  const inner = <><span className="pt-w-icon" data-tone={tone}><Icon name={icon} size={20} /></span><span className="pt-w-text"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</span></>;
  return href ? <Link href={href} className="pt-widget">{inner}</Link> : <div className="pt-widget">{inner}</div>;
}
