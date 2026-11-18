'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CAPACITY_TYPES, RATE_UNITS } from '@collabiz/types';
import { Alert, Button, Card, DataTable, Segmented, Select, Skeleton, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { STATE_OPTIONS, addDays, dt, num, rateText, toNum, type CapacityOffer } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Bk { id: string; title: string; typeLabel: string; units: number; from: string; to: string; note: string | null; status: string; decisionNote: string | null; org: string }
interface Mine { offers: CapacityOffer[]; requests: Bk[]; bookings: Bk[] }

function MyCapacity() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get('publish') ? 'publish' : 'capacity');
  const q = useQuery<Mine>('/capacity/mine');
  const [f, setF] = useState({ type: 'workers', title: '', units: '', from: addDays(1), to: addDays(30), rateUnit: 'day', rate: '', state: 'TG', city: '', notes: '' });
  const publish = useMutation(async () => { await api.post('/capacity/offers', { ...f, units: toNum(f.units), rate: f.rateUnit === 'negotiable' ? null : toNum(f.rate), city: f.city || undefined, notes: f.notes || undefined }); q.reload(); setTab('capacity'); return true; });
  const act = useMutation(async (path: string, b: object = {}) => { await api.post(path, b); q.reload(); return true; });
  const d = q.data;
  const bkCols = (mineSide: boolean) => [
    { key: 't', header: 'Capacity', render: (b: Bk) => <span>{b.title}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{b.typeLabel}</span></span> },
    { key: 'o', header: mineSide ? 'Owner' : 'Requested by', render: (b: Bk) => b.org },
    { key: 'u', header: 'Units', render: (b: Bk) => num(b.units) },
    { key: 'd', header: 'Dates', render: (b: Bk) => `${dt(b.from)} – ${dt(b.to)}` },
    { key: 's', header: 'Status', render: (b: Bk) => <StatusBadge status={b.status} /> },
    { key: 'a', header: '', render: (b: Bk) => b.status === 'requested' && !mineSide ? <span className="cz-row" style={{ gap: 6 }}><Button size="sm" onClick={() => act.run(`/capacity/bookings/${b.id}/decide`, { decision: 'accept' })}>Accept</Button><Button size="sm" variant="ghost" onClick={() => act.run(`/capacity/bookings/${b.id}/decide`, { decision: 'decline' })}>Decline</Button></span>
      : mineSide && ['requested', 'accepted'].includes(b.status) ? <Button size="sm" variant="ghost" onClick={() => act.run(`/capacity/bookings/${b.id}/cancel`)}>Cancel</Button> : b.decisionNote ?? '' },
  ];
  return (
    <Screen page={{ key: 'capacity-mine', title: 'My capacity & bookings', access: 'partner' }} eyebrow="Capacity" description="Publish dated availability, accept or decline booking requests, and track what you booked from others.">
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'capacity', label: 'My capacity' }, { value: 'requests', label: `Requests to me${d ? ` (${d.requests.filter((r) => r.status === 'requested').length})` : ''}` }, { value: 'bookings', label: 'My bookings' }, { value: 'publish', label: 'Publish capacity' }]} />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      <div style={{ marginTop: 14 }}>
        {tab === 'publish' ? (
          <Card title="What is available">
            <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); publish.run(); }}>
              {publish.error && <Alert tone="danger">{publish.error}</Alert>}
              <div className="cz-grid cz-grid-2">
                <Select label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={CAPACITY_TYPES.map((c) => ({ value: c.code, label: c.label }))} />
                <TextInput label="How many" inputMode="numeric" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value.replace(/\D/g, '') })} error={publish.fieldErrors.units} />
                <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={publish.fieldErrors.title} placeholder="e.g. Certified solar installation crew" />
                <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={STATE_OPTIONS} />
                <TextInput label="Available from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} error={publish.fieldErrors.from} />
                <TextInput label="Available until" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} error={publish.fieldErrors.to} />
                <Select label="Rate" value={f.rateUnit} onChange={(e) => setF({ ...f, rateUnit: e.target.value })} options={RATE_UNITS.map((r) => ({ value: r.code, label: r.label }))} />
                {f.rateUnit !== 'negotiable' ? <TextInput label="Rate (₹)" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} error={publish.fieldErrors.rate} /> : <TextInput label="City (optional)" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}
              </div>
              <TextArea label="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} />
              <div><Button type="submit" loading={publish.pending}>Publish capacity</Button></div>
            </form>
          </Card>
        ) : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={200} /> : tab === 'capacity' ? (
          <DataTable rows={d.offers} caption="My capacity" columns={[
            { key: 't', header: 'Capacity', render: (o) => o.title }, { key: 'y', header: 'Type', render: (o) => o.typeLabel }, { key: 'f', header: 'Free now', render: (o) => `${num(o.free)} / ${num(o.units)}` },
            { key: 'd', header: 'Dates', render: (o) => `${dt(o.from)} – ${dt(o.to)}` }, { key: 'r', header: 'Rate', render: (o) => rateText(o) }, { key: 's', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
            { key: 'a', header: '', render: (o) => o.status === 'open' ? <Button size="sm" variant="ghost" onClick={() => act.run(`/capacity/offers/${o.id}/withdraw`)}>Withdraw</Button> : null },
          ]} empty={<p className="cz-muted">Nothing published yet. Use “Publish capacity”.</p>} />
        ) : tab === 'requests' ? <DataTable rows={d.requests} caption="Requests to me" columns={bkCols(false)} empty={<p className="cz-muted">No booking requests yet.</p>} />
          : <DataTable rows={d.bookings} caption="My bookings" columns={bkCols(true)} empty={<p className="cz-muted">You have not booked anyone’s capacity yet.</p>} />}
      </div>
    </Screen>
  );
}
export default function Page() { return <Suspense><MyCapacity /></Suspense>; }
