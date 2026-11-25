'use client';
/** COLLABIZ COMEARN — Opportunities to Earn. Shared pieces for the app screens. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CE_CATEGORIES, CE_MODELS, CE_STAGES, CE_STAGE_ORDER, type CeStage } from '@collabiz/types';
import { Icon, type IconName } from '@collabiz/ui';
import { rupees } from './Powertrade';
export { rupees, toPaise } from './Powertrade';

export function CeHeader({ title, lead, children }: { title?: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="ce-head" data-screen="comearn">
      <Link href="/comearn" className="ce-logo" aria-label="COMEARN home"><img src="/brands/comearn.png" alt="comearn — Opportunities to Earn. Powered by COLLABIZ" width={1000} height={297} /></Link>
      <div className="ce-head-text">
        <h1>{title ?? 'Your earning home'}</h1>
        <p className="ce-lead">{lead ?? 'You bring the opportunity. We connect the business. You earn the commission.'}</p>
        {children}
      </div>
    </header>
  );
}

const TABS: [string, string, IconName][] = [['/comearn', 'Home', 'home'], ['/comearn/explore', 'Explore', 'search'], ['/comearn/post', 'Post', 'sparkles'], ['/comearn/my', 'My Leads', 'leads'], ['/comearn/earnings', 'Earnings', 'coins']];
export function CeNav() {
  const path = usePathname();
  const active = (h: string) => (h === '/comearn' ? path === h : path.startsWith(h)) || (h === '/comearn/post' && path.startsWith('/comearn/offer'));
  return <nav className="ce-nav" aria-label="COMEARN">{TABS.map(([h, l, i]) => <Link key={h} href={h} aria-current={active(h) ? 'page' : undefined}><Icon name={i} size={18} /><span>{l}</span></Link>)}</nav>;
}

export interface CeCard { rating?: { avg: number; count: number } | null; uniteGuaranteed?: boolean; sample?: boolean; companyOrgId?: string; featured?: boolean; source?: { module: string; id: string } | null; id: string; code: string; title: string; type: string; typeLabel: string; category: keyof typeof CE_CATEGORIES; territory: string; model: keyof typeof CE_MODELS; rateBps: number | null; fixedPaise: number | null; trigger: string; estimatedValuePaise: number | null; potentialPaise: number | null; status: string; company: string; earners?: number; mine?: boolean; why?: string }
export const commissionLabel = (c: Pick<CeCard, 'model' | 'rateBps' | 'fixedPaise'>) => (c.model === 'fixed' ? rupees(c.fixedPaise) : `${(c.rateBps ?? 0) / 100}%${c.model === 'recurring' ? ' recurring' : c.model === 'milestone' ? ' in milestones' : ''}`);

export function OppCard({ o }: { o: CeCard }) {
  return (
    <Link href={`/comearn/opportunities/${o.id}`} className="ce-card" data-ce-opp={o.title}>
      <span className="ce-card-top"><span className="ce-chip">{CE_CATEGORIES[o.category]}</span>{o.uniteGuaranteed && <GuaranteedBadge />}{o.featured && <span className="ce-featured">Featured</span>}{o.sample && <span className="vai-sample">Sample</span>}<span className="ce-type">{o.typeLabel}</span></span>
      <strong>{o.title}</strong>
      <span className="ce-muted">{o.company} · {o.territory}</span>
      <Stars rating={o.rating} />
      <span className="ce-card-foot"><span className="ce-rate">{commissionLabel(o)}</span>{o.potentialPaise != null && <span className="ce-muted">up to {rupees(o.potentialPaise)} <small>(estimate)</small></span>}</span>
      {o.why && <span className="ce-why"><Icon name="sparkles" size={13} /> {o.why}</span>}
    </Link>
  );
}

/** The eight-step commission tracker. */
export function Tracker({ stage, stages }: { stage: CeStage; stages?: { key: string; label: string; done: boolean; at: string | null; by: string }[] }) {
  const cur = CE_STAGE_ORDER.indexOf(stage);
  const list = stages ?? CE_STAGE_ORDER.map((k, i) => ({ key: k, label: CE_STAGES[k].label, done: i <= cur, at: null, by: CE_STAGES[k].by }));
  return (
    <ol className="ce-track" aria-label="Commission tracker">
      {list.map((s, i) => <li key={s.key} data-done={s.done || undefined} data-current={i === cur + 1 || undefined}><span className="ce-dot">{s.done ? <Icon name="check" size={12} /> : i + 1}</span><span><strong>{s.label}</strong><small>{s.done && s.at ? new Date(s.at).toLocaleDateString('en-IN') : s.by === 'company' ? 'Recorded by the company' : 'Done by you'}</small></span></li>)}
    </ol>
  );
}
export const CATEGORY_ICON: Record<string, IconName> = { solar: 'sun', real_estate: 'building', industrial: 'factory', franchise: 'teams', exports: 'globe', software: 'zap', logistics: 'package', other: 'target' };

export interface CeRep { conversionPct: number; engagements: number; paid: number; onTimePct: number | null; disputesLost: number }
/** Track record from recorded COMEARN activity — "New on COMEARN" when there is no history (nothing is estimated). */
export function RepLine({ rep, as }: { rep: { asEarner: CeRep | null; asCompany: CeRep | null; verified: boolean; rating?: { avg: number; count: number } | null; ratingAsEarner?: { avg: number; count: number } | null } | null | undefined; as: 'company' | 'earner' }) {
  if (!rep) return null;
  const r = as === 'company' ? rep.asCompany : rep.asEarner;
  return <span className="ce-rep" data-ce-rep>{rep.verified && <span className="ce-verified">Verified</span>}<Stars rating={as === 'company' ? rep.rating : rep.ratingAsEarner} />{r ? <>{r.engagements} engagements · {r.conversionPct}% converted · {r.paid} paid{as === 'company' && r.onTimePct != null ? ` · ${r.onTimePct}% on time` : ''}{r.disputesLost ? ` · ${r.disputesLost} disputes` : ''}</> : 'New on COMEARN — no track record yet'}</span>;
}
export const SOURCE_LABEL: Record<string, string> = { franchise: 'From Franchise', venture_ai: 'From Venture AI', xchange: 'From XCHANGE', exim: 'From UNITE EXIM', leaddna: 'From LeadDNA', adbuz: 'From ADBUZ', requirement: 'From a customer requirement' };

/** Average of real ratings from paid engagements; "No ratings yet" otherwise. */
export function Stars({ rating, label = 'company rating' }: { rating?: { avg: number; count: number } | null; label?: string }) {
  if (!rating) return <span className="ce-stars ce-muted" data-ce-stars="none">No ratings yet</span>;
  const full = Math.round(rating.avg);
  return <span className="ce-stars" data-ce-stars={rating.avg} aria-label={`${rating.avg} out of 5 ${label}, ${rating.count} ratings`}><span aria-hidden>{'★'.repeat(full)}{'☆'.repeat(5 - full)}</span> {rating.avg.toFixed(1)} <small>({rating.count})</small></span>;
}
export const GuaranteedBadge = () => <span className="ce-guaranteed" title="Unite Guaranteed — see the guarantee terms on the listing"><img src="/brands/comearn-mark.png" alt="" aria-hidden />Unite Guaranteed</span>;
