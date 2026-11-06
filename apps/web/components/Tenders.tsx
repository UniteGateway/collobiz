'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { sectorName } from '@collabiz/types';
import { Button, DescriptionList, Money, StatusBadge, TextInput } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

export const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Loads a tender shaped for the caller's role (issuer / evaluator / bidder / admin). */
export function useTender() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/tenders/${id}`);
  return { id, ...q };
}

/** Tabs depend on role: bidders never see evaluation tabs; evaluators only see their envelope kind. */
export function TenderTabs({ t }: { t: any }) {
  const path = usePathname();
  const ev = t.evaluatorRole as string | null;
  const issuerSide = t.role === 'issuer' || t.role === 'evaluator';
  const tabs: [string, string][] = [['documents', 'Overview & documents']];
  if (t.role === 'bidder') tabs.push(['bid', 'My bid']);
  if (issuerSide && (t.role === 'issuer' || ev !== 'commercial')) tabs.push(['technical', 'Technical evaluation']);
  if (issuerSide && (t.role === 'issuer' || ev !== 'technical')) tabs.push(['commercial', 'Commercial evaluation']);
  if (issuerSide) tabs.push(['comparison', 'Bid comparison']);
  if (t.role === 'issuer' || t.role === 'bidder' || (t.role === 'evaluator' && t.canManage)) tabs.push(['negotiation', 'Negotiation']);
  if (t.status === 'awarded' && (t.role === 'issuer' || t.role === 'evaluator' || t.role === 'bidder')) tabs.push(['award', 'Award & contracts']);
  return <nav aria-label="Tender sections" className="cz-tabs">{tabs.map(([p, l]) => <Link key={p} href={`/tenders/${t.id}/${p}`} aria-current={path === `/tenders/${t.id}/${p}` ? 'page' : undefined}>{l}</Link>)}</nav>;
}

export function TenderSummary({ t }: { t: any }) {
  const el = t.eligibility ?? {};
  return (
    <DescriptionList items={[
      ['Reference', <span className="cz-mono">{t.code}</span> ],
      ['Status', <StatusBadge status={t.status} /> ],
      ['Issuer', t.issuer ],
      ['Sector', sectorName(t.sector) ],
      ...(t.workPackage ? [['Work package', t.workPackage] as [string, React.ReactNode]] : []),
      ['Indicative budget', t.budget != null ? <Money minor={t.budget} currency={t.currency} /> : 'Not disclosed' ],
      ['Bids close', fmt(t.closesAt) ],
      ['Evaluation', `${t.techWeight}% technical / ${100 - t.techWeight}% commercial · technical pass mark ${t.minTechScore}` ],
      ['Eligibility', [`${el.minLevel ?? 'registered'} level or higher`, el.sectors?.length ? `sectors: ${el.sectors.map(sectorName).join(', ')}` : null, el.certifications?.length ? `certifications: ${el.certifications.join(', ')}` : null].filter(Boolean).join(' · ') ],
      ['Sealed bids received', String(t.bidCount ?? 0) ],
    ]} />
  );
}

export const SEALED_NOTE = 'Bids are sealed: both envelopes are encrypted and nobody — including the issuer, evaluators and COLLABIZ staff — can read them before opening. Technical envelopes open first; commercial envelopes open only for technically qualified bids.';

/** Inline score form used by technical (070) and commercial (071) evaluation. Scores are final once recorded. */
export function ScoreForm({ label, onSubmit, pending, error }: { label: string; onSubmit: (score: number, comment: string) => void; pending: boolean; error?: string | null }) {
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  return (
    <div className="cz-row" style={{ alignItems: 'flex-end' }} aria-label={label} role="group">
      <TextInput label="Score (0–100)" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} />
      <TextInput label="Justification" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button onClick={() => onSubmit(Number(score), comment)} loading={pending} disabled={score === '' || comment.trim().length < 5}>Record score</Button>
      {error && <span className="cz-error-text" role="alert">{error}</span>}
    </div>
  );
}
