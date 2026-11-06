'use client';
import { useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, EmptyState, LoadingState, Select, StatusBadge, TextArea, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 134 — Lead Ownership & Conflict Resolution (duplicates and disputes, independent panel). */
export default function LeadConflicts() {
  const q = useQuery<any>('/admin/lead-conflicts');
  const [ruling, setRuling] = useState<Record<string, { r: string; reason: string }>>({});
  const [sel, setSel] = useState<string | null>(null);
  const dispute = useQuery<any>(sel ? `/lead-disputes/${sel}` : null);
  const [dr, setDr] = useState({ outcome: 'rejected', reason: '' });
  const rule = useMutation(async (id: string) => { const x = ruling[id] ?? { r: 'not_duplicate', reason: '' }; await api.request('POST', `/admin/lead-conflicts/${id}/ruling`, { ruling: x.r, reason: x.reason }, { idempotencyKey: newIdempotencyKey() }); q.reload(); return true; });
  const ruleDispute = useMutation(async () => { await api.request('POST', `/admin/lead-disputes/${sel}/ruling`, dr, { idempotencyKey: newIdempotencyKey() }); dispute.reload(); q.reload(); return true; });
  const Side = ({ t, s }: { t: string; s: any }) => (
    <div><h3>{t}: <span className="cz-mono">{s.code}</span></h3>
      <DescriptionList items={[['Introducer', s.org], ['Registered', new Date(s.registeredAt).toLocaleString()], ['Customer', s.snapshot?.customer?.legalName], ['Tax ID', s.snapshot?.customer?.taxId ?? '—'], ['Consent', `${s.consent?.method ?? '—'} · ${s.consent?.obtainedAt ? new Date(s.consent.obtainedAt).toLocaleDateString() : ''}`], ['Evidence', s.evidenceSummary]]} />
    </div>
  );
  if (q.loading) return <Screen id="134"><LoadingState /></Screen>;
  if (q.error) return <Screen id="134"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  return (
    <Screen id="134" description="Decide on evidence, timestamps and relationship history — not first-click. Panel members must be independent of both parties; appeals go to a different panel member.">
      {rule.error && <Alert tone="danger">{rule.error}</Alert>}
      <h2>Possible duplicates</h2>
      {!q.data.duplicates.length ? <EmptyState title="No duplicates awaiting a ruling" /> : q.data.duplicates.map((d: any) => (
        <Card key={d.id} title={`Similarity ${Math.round(d.score * 100)}% — ${d.reasons.join('; ')}`}>
          <div className="cz-grid cz-grid-2"><Side t="New registration" s={d.claim} /><Side t="Earlier registration" s={d.candidate} /></div>
          <div className="cz-grid cz-grid-2" style={{ alignItems: 'end' }}>
            <Select label="Ruling" value={ruling[d.id]?.r ?? 'not_duplicate'} onChange={(e) => setRuling({ ...ruling, [d.id]: { r: e.target.value, reason: ruling[d.id]?.reason ?? '' } })} options={[{ value: 'not_duplicate', label: 'Not a duplicate — protect both' }, { value: 'duplicate_upheld_earlier', label: 'Duplicate — earlier registration keeps ownership' }, { value: 'duplicate_upheld_this', label: 'Duplicate — new registration has better evidence' }]} />
            <TextArea label="Reason" value={ruling[d.id]?.reason ?? ''} onChange={(e) => setRuling({ ...ruling, [d.id]: { r: ruling[d.id]?.r ?? 'not_duplicate', reason: e.target.value } })} />
          </div>
          <Button onClick={() => rule.run(d.id)} loading={rule.pending}>Record ruling</Button>
        </Card>
      ))}
      <h2 style={{ marginTop: 24 }}>Ownership disputes</h2>
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card>{!q.data.disputes.length ? <EmptyState title="No open disputes" /> : q.data.disputes.map((x: any) => <div key={x.id} style={{ padding: '6px 0' }}><Button size="sm" variant="ghost" onClick={() => setSel(x.id)}>{x.code}</Button> <StatusBadge status={x.status} /></div>)}</Card>
        <Card title={dispute.data ? `${dispute.data.code}: ${dispute.data.claimant} vs ${dispute.data.respondent}` : 'Select a dispute'}>
          {dispute.data && <>
            <Timeline items={dispute.data.entries.map((e: any) => ({ id: e.id, at: e.createdAt, title: `${e.kind} · ${e.org ?? 'Panel'} · ${e.author}`, detail: e.body }))} />
            {ruleDispute.error && <Alert tone="danger">{ruleDispute.error}</Alert>}
            {['open', 'evidence', 'panel_review'].includes(dispute.data.status) && <>
              <Select label="Outcome" value={dr.outcome} onChange={(e) => setDr({ ...dr, outcome: e.target.value })} options={[{ value: 'rejected', label: 'Dispute rejected — introducer keeps ownership' }, { value: 'upheld', label: 'Dispute upheld — introducer loses protection' }, { value: 'split', label: 'Split — shared credit per addendum' }]} />
              <TextArea label="Reasoned decision" value={dr.reason} onChange={(e) => setDr({ ...dr, reason: e.target.value })} />
              <Button onClick={() => ruleDispute.run()} loading={ruleDispute.pending}>Issue ruling</Button>
            </>}
          </>}
        </Card>
      </div>
    </Screen>
  );
}
