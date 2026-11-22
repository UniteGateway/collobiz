'use client';
import { useState } from 'react';
import { BannerHeader } from '@/components/Banner';
import { ENERGY_STATES } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface L { id: string; code: string; side: string; categoryLabel: string; title: string; stateName: string; district: string | null; capacityMw: number; tariffRsKwh: number | null; description: string; status: string; owner: string; ownerKyb: string; demo: boolean; private: Record<string, unknown> | null }
interface T { id: string; name: string; licenceNo: string; authority: string; category: string; validUntil: string; status: string }

/** Unite Green Park — check energy listings before they go live, and keep the licensed-trader directory. */
export default function EnergyAdmin() {
  const [status, setStatus] = useState('pending');
  const q = useQuery<L[]>(`/energy/admin/listings?status=${status}`);
  const tr = useQuery<T[]>('/energy/traders');
  const [f, setF] = useState({ name: '', licenceNo: '', authority: 'CERC', state: '', category: '', validUntil: '', website: '', verified: false });
  const add = useMutation(async () => { await api.post('/energy/admin/traders', { ...f, state: f.state || undefined, website: f.website || undefined }); setF({ ...f, name: '', licenceNo: '', category: '', validUntil: '', website: '', verified: false }); tr.reload(); return true; });
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Unite Green Park" description="Energy listings go live only after a check. Buyer details are visible to you for the check and stay hidden from sellers until the buyer accepts an introduction." />
      <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Waiting for checks' }, { value: 'live', label: 'Live' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <Card><EmptyState icon="verify" title="Nothing here">No energy listings in this state.</EmptyState></Card> : q.data.map((l) => <Review key={l.id} l={l} onDone={q.reload} />)}
      <Card title="Licensed electricity traders" subtitle="Record only licences you have checked against the CERC/SERC register.">
        {add.error && <Alert tone="danger">{add.error}</Alert>}
        <div className="cz-grid cz-grid-3">
          <TextInput label="Trader name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={add.fieldErrors.name} />
          <TextInput label="Licence number" value={f.licenceNo} onChange={(e) => setF({ ...f, licenceNo: e.target.value })} error={add.fieldErrors.licenceNo} />
          <Select label="Authority" value={f.authority} onChange={(e) => setF({ ...f, authority: e.target.value })} options={[{ value: 'CERC', label: 'CERC' }, { value: 'SERC', label: 'SERC' }]} />
          <Select label="State (SERC)" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={[{ value: '', label: '—' }, ...ENERGY_STATES.map((s) => ({ value: s.code, label: s.name }))]} />
          <TextInput label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} error={add.fieldErrors.category} />
          <TextInput label="Valid until" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} error={add.fieldErrors.validUntil} />
          <TextInput label="Website (optional)" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        </div>
        <Checkbox label="I checked this licence against the regulator’s register" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />
        <Button onClick={() => add.run()} loading={add.pending}>Add trader</Button>
        <ul className="cz-ws-list" style={{ marginTop: 12 }}>{(tr.data ?? []).map((t) => <li key={t.id}><span>{t.name} · {t.authority} {t.licenceNo} · {t.category} · to {t.validUntil}</span><span className="cz-muted">{t.status}</span></li>)}</ul>
      </Card>
    </div>
  );
}

function Review({ l, onDone }: { l: L; onDone: () => void }) {
  const [note, setNote] = useState('');
  const act = useMutation(async (decision: string) => { await api.post(`/energy/admin/listings/${l.id}/moderate`, { decision, note: note || undefined }); onDone(); return true; });
  return (
    <div data-energy-review={l.code}><Card title={`${l.code} · ${l.title}`} actions={<StatusBadge status={l.status} label={l.status} />}>
      <div className="cz-stack" style={{ gap: 8 }}>
        <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>{l.side === 'plant' ? 'Supply' : 'Demand'} · {l.categoryLabel} · {l.capacityMw} MW · {l.stateName}{l.district ? `, ${l.district}` : ''} · listed by <strong>{l.owner}</strong> (KYB {l.ownerKyb}){l.demo ? ' · demo' : ''}</p>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{l.description}</p>
        {l.private && <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>{Object.entries(l.private).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</p>}
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        {l.status === 'pending' && <>
          <TextArea label="Note to the business (needed to reject)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="cz-row" style={{ gap: 8 }}><Button size="sm" onClick={() => act.run('approve')} loading={act.pending}>Approve and publish</Button><Button size="sm" variant="ghost" disabled={note.trim().length < 5} onClick={() => act.run('reject')}>Reject</Button></div>
        </>}
      </div>
    </Card></div>
  );
}
