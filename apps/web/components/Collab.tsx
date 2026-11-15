'use client';
/** Shared pieces of the COLLAB journey: types, money, match reasons, offer cards and the journey stepper. */
import Link from 'next/link';
import { Stepper } from '@collabiz/ui';
import { api } from '@/lib/api';

export interface Reason { code: string; text: string; points: number }
export interface OfferView {
  id: string; code: string; title: string; summary: string; sector: string; sectorName: string; city: string | null; region: string | null; country: string; estimatedValue: number | null;
  category: string; categoryLabel: string; side: 'offering' | 'seeking'; status: string; statusLabel: string; expiresOn: string; upfrontRequired: boolean; upfrontAmount: number | null;
  eligibility: string | null; territory: string | null; regulated: boolean; checks: string[]; publisher: string; confidential: boolean; isOwner: boolean; publishedAt: string | null;
  moderationNote: string | null; renewals: number; applicants?: number;
}
export interface Money { pipelineValue: number; contractValue: number; invoiced: number; collected: number }

export const inr = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
/** POST with an idempotency key (every state-changing Collab call is idempotent on the server). */
export const send = <T = unknown,>(path: string, body: unknown = {}) => api.request<T>('POST', path, body, { idempotent: true });

export const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  active: 'success', negotiating: 'info', verified: 'success', pending_verification: 'warning', under_review: 'warning', draft: 'neutral', closed: 'neutral', expired: 'neutral', suspended: 'danger', rejected: 'danger',
};

export function Reasons({ reasons, score }: { reasons: Reason[]; score?: number }) {
  return (
    <div className="cz-collab-reasons">
      {score != null && <span className="cz-collab-score" aria-label={`Match score ${score} out of 100`}>{score}</span>}
      <ul aria-label="Why this matched">{reasons.map((r) => <li key={r.code}>{r.text}{r.points ? <span className="cz-muted"> · +{r.points}</span> : null}</li>)}</ul>
    </div>
  );
}

export function OfferCard({ o, score, reasons }: { o: OfferView; score?: number; reasons?: Reason[] }) {
  return (
    <article className="cz-product cz-collab-offer" data-offer={o.title}>
      <span className="cz-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className={o.side === 'offering' ? 'cz-offer-badge' : 'cz-tag'}>{o.side === 'offering' ? 'Offering' : 'Seeking'}</span>
        <span className="cz-tag">{o.categoryLabel}</span>
        {!o.upfrontRequired && <span className="cz-tag cz-collab-zero">No upfront fee</span>}
        {o.regulated && <span className="cz-tag">Discovery only</span>}
      </span>
      <h3><Link href={`/business-offers/${o.id}`}>{o.title}</Link></h3>
      <p>{o.summary.length > 180 ? `${o.summary.slice(0, 177)}…` : o.summary}</p>
      <span className="cz-muted" style={{ fontSize: 13 }}>{o.publisher}{o.city ? ` · ${o.city}` : ''}{o.region ? `, ${o.region}` : ''} · {o.sectorName}</span>
      {o.estimatedValue != null && <span className="cz-price">{inr(o.estimatedValue)}<span className="cz-muted" style={{ fontSize: 12, fontWeight: 400 }}> indicative</span></span>}
      {reasons && <Reasons reasons={reasons} score={score} />}
    </article>
  );
}

const STAGES = ['Application', 'Shortlisted', 'Proposal', 'Agreement', 'Signed', 'Execution'];
const STAGE_INDEX: Record<string, number> = { application: 0, shortlisted: 1, proposal: 2, agreement: 3, agreement_signed: 4, execution: 5 };
export const stageLabel = (s: string) => STAGES[STAGE_INDEX[s] ?? 0];
export function JourneyStepper({ stage }: { stage: string }) {
  return <Stepper steps={STAGES} current={STAGE_INDEX[stage] ?? 0} />;
}

/** The four money figures, deliberately shown side by side and never summed. */
export function MoneyRow({ m }: { m: Money }) {
  const items: [string, number, string][] = [
    ['Pipeline', m.pipelineValue, 'Proposals not yet agreed'], ['Contract value', m.contractValue, 'Agreed in a signed or ready-to-sign agreement'],
    ['Invoiced', m.invoiced, 'Against certified milestones'], ['Collected', m.collected, 'Payments recorded by the client'],
  ];
  return (
    <dl className="cz-collab-money">{items.map(([l, v, h]) => (
      <div key={l}><dt>{l}</dt><dd>{inr(v)}</dd><span className="cz-muted">{h}</span></div>
    ))}</dl>
  );
}
