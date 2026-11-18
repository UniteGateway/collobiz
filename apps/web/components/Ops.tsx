'use client';
/** Shared bits for Launch, Capacity, Micro-contracts, Demand pools and Commit. */
import Link from 'next/link';
import { OPS_STATES, RATE_UNITS } from '@collabiz/types';

export const rs = (n: number | null | undefined) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
export const num = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
export const dt = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
export const toNum = (s: string) => (s.trim() === '' ? undefined : Number(s));
export const STATE_OPTIONS = OPS_STATES.map(([value, label]) => ({ value, label }));
export const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A clickable card with an eyebrow, title, meta grid and footer. */
export function OpsCard({ href, eyebrow, badges, title, text, meta, foot, tone = 'navy', testId }: {
  href?: string; eyebrow: string; badges?: React.ReactNode; title: string; text?: string | null; meta: [string, React.ReactNode][]; foot?: React.ReactNode; tone?: 'navy' | 'green' | 'amber' | 'violet'; testId?: string;
}) {
  const body = (
    <>
      <div className="cz-ops-card-top"><span className={`cz-ops-eyebrow cz-ops-${tone}`}>{eyebrow}</span><span className="cz-ops-badges">{badges}</span></div>
      <h3>{title}</h3>
      {text && <p className="cz-ops-text">{text}</p>}
      <dl className="cz-ops-meta">{meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {foot && <div className="cz-ops-foot">{foot}</div>}
    </>
  );
  return href ? <Link href={href} className="cz-ops-card" data-testid={testId}>{body}</Link> : <article className="cz-ops-card" data-testid={testId}>{body}</article>;
}
export const DemoTag = ({ on }: { on?: boolean }) => (on ? <span className="cz-ops-demo">Demo</span> : null);
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return <div className="cz-ops-meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}><span style={{ width: `${pct}%` }} /></div>;
}

export interface CapacityOffer { id: string; type: string; typeLabel: string; title: string; units: number; free: number; from: string; to: string; rateUnit: string; rate: number | null; state: string; stateName: string; city: string | null; notes: string | null; status: string; demo: boolean; org: string | null; mine?: boolean }
export const rateText = (o: Pick<CapacityOffer, 'rate' | 'rateUnit'>) => (o.rateUnit === 'negotiable' || o.rate == null ? 'Negotiable' : `${rs(o.rate)} ${RATE_UNITS.find((r) => r.code === o.rateUnit)?.label ?? ''}`);

export interface Micro { id: string; code: string; kind: string; kindLabel: string; state: string | null; stateName: string; title: string; scope: string; acceptance: string; quantity: number; unit: string; priceRs: number; due: string; status: string; poster: string | null;
  isPoster: boolean; isWorker: boolean; demo: boolean; delivery: string | null; paymentRef: string | null; paymentConfirmed: boolean; history: { status: string; at: string; note?: string }[]; applied?: boolean; applications?: number | unknown[]; application?: string }
export const MICRO_STATUS: Record<string, string> = { open: 'Open', assigned: 'In progress', submitted: 'Submitted for review', accepted: 'Accepted — payment due', paid: 'Paid', cancelled: 'Cancelled' };

export interface Pool { id: string; code: string; title: string; spec: string; unit: string; state: string; stateName: string; targetQty: number; committed: number; buyers: number; joinBy: string; neededBy: string | null; status: string; demo: boolean; myQty: number | null; myAcceptedQuoteId: string | null; isStarter: boolean }
export const POOL_STATUS: Record<string, string> = { open: 'Open for buyers', closed_to_joining: 'Joining closed', closed: 'Closed', cancelled: 'Cancelled' };
export function PoolCard({ p }: { p: Pool }) {
  return (
    <OpsCard href={`/pools/${p.id}`} testId="pool-card" eyebrow={POOL_STATUS[p.status] ?? p.status} tone="amber" badges={<><span className="cz-muted">{p.stateName}</span><DemoTag on={p.demo} /></>} title={p.title} text={p.spec}
      meta={[['Committed', <span key="c"><strong>{num(p.committed)}</strong> of {num(p.targetQty)} {p.unit}</span>], ['Buyers', String(p.buyers)], ['Joining closes', dt(p.joinBy)], ['You', p.myQty != null ? `${num(p.myQty)} ${p.unit}` : '—']]}
      foot={<Meter value={p.committed} max={p.targetQty} label={`${p.committed} of ${p.targetQty} ${p.unit} committed`} />} />
  );
}
