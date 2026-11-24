'use client';
/** COLLABIZ VENTURE AI — shared pieces for the web screens. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { VAI_OPP_STATUS, type VaiRole } from '@collabiz/types';
import { Icon, StatusBadge, type IconName } from '@collabiz/ui';
import { rupees } from './Powertrade';
export { rupees, toPaise } from './Powertrade';

export function VaiHeader({ title, lead, children }: { title?: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="pt-head vai-head" data-screen="venture-ai">
      <div className="pt-head-title">
        <p className="pt-brand">COLLABIZ · Global business creation engine</p>
        <h1>{title ?? <>Venture <span className="pt-power">AI</span></>}</h1>
        <p className="pt-lead">{lead ?? 'Find a real market gap, combine member capabilities into a product, check the numbers, and form a team — with every binding step approved by people.'}</p>
        {children}
      </div>
      <div className="pt-banner vai-banner">
        <span className="vai-flow" aria-hidden>{(['target', 'sparkles', 'coins', 'teams', 'rocket'] as IconName[]).map((i) => <span key={i}><Icon name={i} size={18} /></span>)}</span>
        <div><strong>Opportunity → Product → Numbers → Team → Launch</strong><span>Scores and financials come from transparent formulas. AI drafts are labelled; nothing is invented or sent without you.</span></div>
      </div>
    </header>
  );
}

const TABS: [string, string, IconName][] = [
  ['/venture-ai', 'Command centre', 'home'], ['/venture-ai/opportunities', 'Opportunities', 'target'], ['/venture-ai/new', 'Propose a product', 'sparkles'], ['/venture-ai/capabilities', 'My capabilities', 'factory'],
];
export function VaiNav() {
  const path = usePathname();
  return <nav className="pt-nav" aria-label="Venture AI">{TABS.map(([h, l, i]) => <Link key={h} href={h} aria-current={path === h ? 'page' : undefined}><Icon name={i} size={16} />{l}</Link>)}</nav>;
}

const TONE: Record<string, string> = { approved: 'success', in_review: 'info', rejected: 'neutral', draft: 'brand', archived: 'neutral' };
export const OppStatus = ({ s }: { s: string }) => <StatusBadge status={s} tone={(TONE[s] ?? 'brand') as never} label={VAI_OPP_STATUS[s as keyof typeof VAI_OPP_STATUS] ?? s} />;
export const SampleTag = () => <span className="vai-sample" title="Demonstration data created by Unite — not a live opportunity">Sample</span>;
export function ScoreBadge({ score }: { score: { score: number | null; label: string; classification?: string } | null }) {
  if (!score) return <span className="vai-score" data-c="none">Not scored</span>;
  return <span className="vai-score" data-c={score.classification ?? (score.score != null && score.score >= 80 ? 'priority' : score.score != null && score.score >= 65 ? 'validate' : 'uncertain')} title={score.label}>{score.score ?? '—'}<small>{score.label}</small></span>;
}
export const lakh = (rupeeText: string) => Math.round(Number(rupeeText || 0) * 1e5 * 100);

export interface VaiOppRow { id: string; code: string; title: string; type: string; status: string; score: { score: number | null; label: string; classification?: string } | null; investmentPaise: number | null; roles: number; sample: boolean; mine: boolean }
export interface VaiDash {
  capability: { id: string; roles: VaiRole[] } | null; provider: 'rules' | 'anthropic'; killSwitch: boolean; opportunities: VaiOppRow[];
  ventures: { id: string; code: string; name: string; status: string; role: VaiRole; sample: boolean }[];
  invitations: { id: string; venture: string; role: VaiRole; message: string; investmentPaise: number | null; earningsNote: string | null; risksNote: string | null; matchReasons: string[] | null }[];
}


export function OppList({ rows }: { rows: VaiOppRow[] }) {
  return <ul className="vai-list">{rows.map((o) => (
    <li key={o.id} data-opportunity={o.title}>
      <div><Link href={`/venture-ai/opportunities/${o.id}`}><strong>{o.title}</strong></Link> {o.sample && <SampleTag />}
        <p>{o.code} · {o.roles} roles{o.investmentPaise ? ` · ${rupees(o.investmentPaise)} investment` : ''}</p></div>
      <div className="cz-row" style={{ gap: 8, alignItems: 'center' }}><OppStatus s={o.status} /><ScoreBadge score={o.score} /></div>
    </li>))}</ul>;
}
