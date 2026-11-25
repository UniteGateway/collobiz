'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CE_CATEGORIES } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, commissionLabel, rupees, type CeCard } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Offer { owedPaise: number; paidPaise: number; opportunities: (CeCard & { version: number; companyRateBps: number | null; companyFixedPaise: number | null; uniteMarginBps: number | null; uniteMarginPaise: number | null; reviewNote: string | null; approvedVersion: number | null; openCounter: { id: string; proposedRateBps: number | null; proposedFixedPaise: number | null; note: string } | null; engagements: { id: string; code: string; earner: string; stage: string; stageLabel: string; status: string; customer: string | null }[] })[] }
const STATUS_NOTE: Record<string, string> = { draft: 'Draft — submit it to Unite for review.', in_review: 'With Unite for review.', negotiating: 'Unite proposed changes — please answer below.', live: 'Live to members.', paused: 'Paused.' };
const NEEDS_COMPANY = new Set(['lead_registered', 'quoted', 'order_confirmed', 'payment_verified', 'commission_approved']);

export default function ComearnOffer() { return <Suspense><Inner /></Suspense>; }

/** Offer commissions — my company's earning opportunities, members working on them and what we need to record next. */
function Inner() {
  const sp = useSearchParams();
  const q = useQuery<Offer>('/comearn/offer');
  const status = useMutation(async (id: string, s: 'submit' | 'live' | 'paused' | 'closed') => { await api.post(`/comearn/opportunities/${id}/status`, { status: s }); q.reload(); return true; });
  const answer = useMutation(async (nid: string, decision: 'accept' | 'decline') => { await api.post(`/comearn/negotiations/${nid}/respond`, { decision }); q.reload(); return true; });
  const d = q.data;
  return (
    <Screen page={{ key: 'comearn-offer', title: 'Offer commissions', access: 'partner' }} header={false}>
      <CeHeader title="Offer commissions" lead="Grow your business through COLLABIZ members. You verify every amount and pay commissions directly; COMEARN keeps the records." >
        <div className="pt-cta"><ButtonLink href="/comearn/post" variant="accent">Create earning opportunity</ButtonLink></div>
      </CeHeader>
      <CeNav />
      {sp.get('unpublished') && <Alert tone="warning">Saved as a draft but not submitted: {sp.get('unpublished')}</Alert>}
      {sp.get('submitted') && <Alert tone="success">Submitted to Unite. We review the terms, may propose changes, then add the Unite margin and release it to members.</Alert>}
      {answer.error && <Alert tone="danger">{answer.error}</Alert>}
      {status.error && <Alert tone="danger">{status.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <>
          <section className="ce-stats">
            <div className="ce-stat"><span>Commissions owed</span><strong>{rupees(d.owedPaise)}</strong><small>Verified, not yet transferred</small></div>
            <div className="ce-stat"><span>Commissions paid</span><strong>{rupees(d.paidPaise)}</strong></div>
            <div className="ce-stat"><span>Opportunities</span><strong>{d.opportunities.length}</strong><small>{d.opportunities.filter((o) => o.status === 'live').length} live</small></div>
          </section>
          {!d.opportunities.length ? <Card><EmptyState icon="sparkles" title="No earning opportunities yet" action={<ButtonLink href="/comearn/post">Create one</ButtonLink>}>Post what you will pay commission for. Posting is free.</EmptyState></Card>
            : d.opportunities.map((o) => (
              <Card key={o.id} title={<><Link href={`/comearn/opportunities/${o.id}`}>{o.title}</Link></>} subtitle={`${o.code} · ${CE_CATEGORIES[o.category]} · ${commissionLabel(o)} · terms v${o.version}`}
                actions={<span className="cz-row" style={{ gap: 6 }}><StatusBadge status={o.status} />
                  {o.status === 'draft' && <Button size="sm" onClick={() => status.run(o.id, 'submit')}>Submit to Unite</Button>}
                  {o.status === 'paused' && o.approvedVersion === o.version && <Button size="sm" onClick={() => status.run(o.id, 'live')}>Resume</Button>}
                  {o.status === 'live' && <Button size="sm" variant="ghost" onClick={() => status.run(o.id, 'paused')}>Pause</Button>}</span>}>
                <p className="ce-muted" data-ce-terms>{STATUS_NOTE[o.status] ?? ''}{o.companyRateBps != null ? ` Your offer ${o.companyRateBps / 100}%` : o.companyFixedPaise != null ? ` Your offer ${rupees(o.companyFixedPaise)}` : ''}{o.uniteMarginBps != null ? ` · Unite margin ${o.uniteMarginBps / 100}% · members see ${(o.rateBps ?? 0) / 100}%` : o.uniteMarginPaise != null ? ` · Unite margin ${rupees(o.uniteMarginPaise)} · members see ${rupees(o.fixedPaise)}` : ''}</p>
                {o.reviewNote && <p className="ce-muted">Unite: {o.reviewNote}</p>}
                {o.openCounter && <Alert tone="info"><strong>Unite proposes {o.openCounter.proposedRateBps != null ? `${o.openCounter.proposedRateBps / 100}%` : rupees(o.openCounter.proposedFixedPaise)}.</strong> {o.openCounter.note} <span className="cz-row" style={{ gap: 6, marginTop: 6 }}><Button size="sm" onClick={() => answer.run(o.openCounter!.id, 'accept')}>Accept</Button><Button size="sm" variant="ghost" onClick={() => answer.run(o.openCounter!.id, 'decline')}>Keep my terms</Button></span></Alert>}
                {o.engagements.length ? <ul className="vai-list">{o.engagements.map((e) => (
                  <li key={e.id} data-ce-engagement={e.earner}><div><strong>{e.earner}</strong>{e.customer && <> · customer {e.customer}</>}<p>{e.stageLabel}{e.status !== 'active' ? ` · ${e.status}` : ''}</p></div>
                    <ButtonLink size="sm" variant={NEEDS_COMPANY.has(e.stage) && e.status === 'active' ? 'primary' : 'ghost'} href={`/comearn/engagements/${e.id}`}>{NEEDS_COMPANY.has(e.stage) && e.status === 'active' ? 'Record next step' : 'Open'}</ButtonLink></li>))}</ul>
                  : <p className="ce-muted">No members working on this yet.</p>}
              </Card>
            ))}
        </>
      )}
    </Screen>
  );
}
