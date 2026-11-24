'use client';
import { useState } from 'react';
import { PT_BENEFIT_SOURCES, PT_MODELS, PT_STATUS, type PtModel, type PtStatus } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, Segmented, StatusBadge, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const rupees = (p?: number | null) => (p == null ? '—' : `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
interface Review { id: string; code: string; title: string; model: PtModel; status: PtStatus; owner: string; taxReview: string; required: { docType: string; label: string; status: string; reference: string | null }[]; supplyValuePaise: number | null; benefitValuePaise: number | null }
interface Ben { id: string; org: string; source: keyof typeof PT_BENEFIT_SOURCES; description: string; netPaise: number; status: string; collectedPaise: number; evidence: string | null }
interface Al { id: string; org: string; period: string; amountPaise: number }
interface O { counts: { profiles: number; collaborations: number }; reviews: Review[]; benefits: Ben[]; allocations: Al[] }

/** POWERTRADE admin: technical/regulatory review of collaborations, tax review, benefit verification, collections, allocations. */
export default function PowertradeAdmin() {
  const q = useQuery<O>('/admin/powertrade/overview');
  const [tab, setTab] = useState('reviews');
  const act = useMutation(async (fn: () => Promise<unknown>) => { await fn(); q.reload(); return true; });
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="POWERTRADE" description="Review energy + business collaborations: accept documents, record tax review and approve after technical and regulatory checks. Unite finance verifies benefits, records collections and approves allocations. Sample records are excluded from counts." />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <>
          <p className="cz-muted" style={{ margin: 0 }}>{q.data.counts.profiles} businesses · {q.data.counts.collaborations} collaborations</p>
          <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'reviews', label: `Collaborations (${q.data.reviews.length})` }, { value: 'benefits', label: `Benefits (${q.data.benefits.length})` }, { value: 'allocations', label: `Allocations (${q.data.allocations.length})` }]} />
          {tab === 'reviews' ? (!q.data.reviews.length ? <Card><EmptyState icon="verify" title="Nothing to review" /></Card> : q.data.reviews.map((c) => (
            <Card key={c.id}>
              <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{c.code} · {c.title}</h3><StatusBadge status={c.status} label={PT_STATUS[c.status]} /></div>
              <p className="cz-muted" style={{ fontSize: 13 }}>{PT_MODELS[c.model].label} · {c.owner}{c.supplyValuePaise ? ` · supply ${rupees(c.supplyValuePaise)}` : ''}{c.benefitValuePaise ? ` · benefit ${rupees(c.benefitValuePaise)}` : ''} · tax review: {c.taxReview}</p>
              <ul style={{ paddingLeft: 18 }}>{c.required.map((d) => <li key={d.docType}>{d.label}: <strong>{d.status}</strong>{d.reference ? ` (${d.reference})` : ''} {d.status === 'provided' && <><Button size="sm" variant="secondary" onClick={() => act.run(() => api.post(`/powertrade/collaborations/${c.id}/documents`, { docType: d.docType, status: 'accepted' }))}>Accept</Button> <Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/powertrade/collaborations/${c.id}/documents`, { docType: d.docType, status: 'rejected' }))}>Reject</Button></>}</li>)}</ul>
              <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {c.required.some((d) => d.docType === 'tax_review') && c.taxReview !== 'cleared' && <Button size="sm" variant="secondary" onClick={() => { const note = window.prompt('Tax review note (GST valuation, separate supplies, invoices)'); if (note) act.run(() => api.post(`/powertrade/collaborations/${c.id}/tax-review`, { result: 'cleared', note })); }}>Record tax review: cleared</Button>}
                {['under_review', 'negotiating'].includes(c.status) && <Button size="sm" variant="accent" onClick={() => act.run(() => api.post(`/powertrade/collaborations/${c.id}/transition`, { to: 'approved', note: 'Technical, regulatory and tax checks done' }))}>Approve</Button>}
                {c.status === 'submitted' && <Button size="sm" variant="secondary" onClick={() => act.run(() => api.post(`/powertrade/collaborations/${c.id}/transition`, { to: 'under_review' }))}>Start review</Button>}
              </div>
            </Card>
          ))) : tab === 'benefits' ? (!q.data.benefits.length ? <Card><EmptyState icon="earnings" title="No benefits waiting" /></Card> : q.data.benefits.map((b) => <BenefitCard key={b.id} b={b} act={(fn) => act.run(fn)} />))
            : (!q.data.allocations.length ? <Card><EmptyState icon="earnings" title="No allocation requests" /></Card> : q.data.allocations.map((a) => (
              <Card key={a.id}><div className="cz-row" style={{ justifyContent: 'space-between' }}><span><strong>{a.org}</strong> · {a.period} · {rupees(a.amountPaise)}</span>
                <span className="cz-row" style={{ gap: 8 }}><Button size="sm" variant="accent" onClick={() => act.run(() => api.post(`/powertrade/allocations/${a.id}/decide`, { decision: 'approve' }))}>Approve</Button><Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/powertrade/allocations/${a.id}/decide`, { decision: 'reject' }))}>Reject</Button></span></div></Card>
            )))}
        </>
      )}
    </div>
  );
}

function BenefitCard({ b, act }: { b: Ben; act: (fn: () => Promise<unknown>) => void }) {
  const [amt, setAmt] = useState(''); const [ref, setRef] = useState('');
  return (
    <Card>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{b.org} · {b.description}</h3><StatusBadge status={b.status} /></div>
      <p className="cz-muted" style={{ fontSize: 13 }}>{PT_BENEFIT_SOURCES[b.source]} · net {rupees(b.netPaise)} · collected {rupees(b.collectedPaise)}{b.evidence ? ` · evidence: ${b.evidence}` : ''}</p>
      {b.status === 'earned' ? <Button size="sm" variant="accent" onClick={() => act(() => api.post(`/powertrade/benefits/${b.id}/verify`))}>Verify</Button> : (
        <form className="cz-row" style={{ gap: 8, alignItems: 'end' }} onSubmit={(e) => { e.preventDefault(); act(() => api.post(`/powertrade/benefits/${b.id}/collect`, { collectedPaise: Math.round(Number(amt) * 100), reference: ref })); }}>
          <TextInput label="Collected (₹)" value={amt} onChange={(e) => setAmt(e.target.value)} /><TextInput label="Bank / settlement reference" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Button type="submit" size="sm" disabled={!amt || ref.length < 3}>Record collection</Button>
        </form>
      )}
    </Card>
  );
}
