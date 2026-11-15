'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, PageHeader, Segmented, StatusBadge, TextArea } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Offer { id: string; code: string; title: string; summary: string; categoryLabel: string; side: string; status: string; statusLabel: string; publisher: string; publisherKyb: string; city: string | null; region: string | null; expiresOn: string; regulated: boolean; upfrontRequired: boolean; checks: string[] }
const CHECKS: [string, string][] = [
  ['publisher_kyb_verified', 'Publisher’s business verification (KYB) is complete'], ['authority_to_offer_confirmed', 'Publisher confirmed authority to make this offer'],
  ['documents_reviewed', 'Supporting documents were reviewed'], ['duplicate_check_done', 'Checked for duplicate listings'], ['category_permitted', 'Category is permitted on COLLABIZ'],
];

/** Business offer checks — COLLABIZ moderators approve, reject, suspend or reinstate partner offers, recording the checks done. */
export default function BusinessOfferChecks() {
  const [status, setStatus] = useState('pending_verification');
  const q = useQuery<Offer[]>(`/admin/business-offers?status=${status}`);
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <PageHeader title="Business offer checks" description="Partners’ offers go live only after these checks. Record only the checks you actually did — they are shown to everyone who views the offer." />
      <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: 'pending_verification', label: 'Waiting for checks' }, { value: 'active', label: 'Live' }, { value: 'suspended', label: 'Suspended' }, { value: 'all', label: 'All' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <Card><EmptyState icon="verify" title="Nothing here">No offers in this state.</EmptyState></Card> : (
        q.data.map((o) => <Review key={o.id} o={o} onDone={q.reload} />)
      )}
    </div>
  );
}

function Review({ o, onDone }: { o: Offer; onDone: () => void }) {
  const [checks, setChecks] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const act = useMutation(async (decision: string) => { await api.request('POST', `/admin/business-offers/${o.id}/moderate`, { decision, checks, note: note || undefined }, { idempotent: true }); onDone(); return true; });
  return (
    <Card title={o.title} subtitle={`${o.code} · ${o.categoryLabel} · ${o.side === 'offering' ? 'Offering' : 'Seeking'} · ${o.publisher}${o.city ? `, ${o.city}` : ''}`}
      actions={<StatusBadge status={o.status} label={o.statusLabel} tone={o.status === 'active' ? 'success' : o.status === 'suspended' ? 'danger' : 'warning'} />}>
      <div data-review={o.code} className="cz-stack" style={{ gap: 8 }}>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.summary}</p>
        <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Publisher KYB: <strong>{o.publisherKyb}</strong> · Expires {o.expiresOn} · {o.upfrontRequired ? 'Upfront payment required' : 'No upfront payment'}{o.regulated ? ' · Regulated category: discovery only' : ''}</p>
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        {o.status === 'pending_verification' && (
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="cz-muted" style={{ fontSize: 13, marginBottom: 4 }}>Checks you completed</legend>
            {CHECKS.map(([k, l]) => <Checkbox key={k} label={l} checked={checks.includes(k)} onChange={(e) => setChecks(e.target.checked ? [...checks, k] : checks.filter((x) => x !== k))} />)}
          </fieldset>
        )}
        {o.status !== 'pending_verification' && o.checks.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{o.checks.map((c) => <li key={c}>{c}</li>)}</ul>}
        <TextArea label="Note to the publisher (required to reject or suspend)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="cz-row" style={{ gap: 8 }}>
          {o.status === 'pending_verification' && <><Button size="sm" loading={act.pending} disabled={!checks.includes('publisher_kyb_verified')} onClick={() => act.run('approve')}>Approve and publish</Button><Button size="sm" variant="ghost" disabled={note.length < 5} onClick={() => act.run('reject')}>Reject</Button></>}
          {['active', 'negotiating'].includes(o.status) && <Button size="sm" variant="danger" disabled={note.length < 5} onClick={() => act.run('suspend')}>Suspend</Button>}
          {o.status === 'suspended' && <Button size="sm" onClick={() => act.run('reinstate')}>Reinstate</Button>}
        </div>
      </div>
    </Card>
  );
}
