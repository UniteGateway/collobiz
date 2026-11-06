'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, DescriptionList, LoadingState, StatusBadge, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TradingTabs, when } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 092 — Shipping & Logistics Tracking (dispatch, tracking events, line-by-line goods receipt with proof of delivery). */
export default function Shipping() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/trading/purchase-orders/${id}`);
  const o = q.data;
  const [ship, setShip] = useState({ carrier: '', trackingNo: '', eta: '' });
  const [ev, setEv] = useState({ status: '', location: '' });
  const [grn, setGrn] = useState<Record<string, { received: string; damaged: string }>>({});
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  useEffect(() => { if (o) setGrn(Object.fromEntries(o.lines.map((l: any) => [l.item, { received: String(l.quantity), damaged: '0' }]))); }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const dispatch = useMutation(async () => { await api.post(`/trading/purchase-orders/${id}/shipment`, { ...ship, eta: ship.eta || undefined }); q.reload(); return true; });
  const track = useMutation(async () => { await api.post(`/trading/purchase-orders/${id}/shipment/events`, { status: ev.status, location: ev.location || undefined }); setEv({ status: '', location: '' }); q.reload(); return true; });
  const receive = useMutation(async () => {
    const fd = new FormData();
    fd.append('payload', JSON.stringify({ lines: Object.entries(grn).map(([item, v]) => ({ item, received: Number(v.received) || 0, damaged: Number(v.damaged) || 0 })), note: note || undefined }));
    files.forEach((f) => fd.append('files', f));
    const r = await api.request<any>('POST', `/trading/purchase-orders/${id}/receipt`, undefined, { form: fd, idempotencyKey: newIdempotencyKey() });
    q.reload(); return r;
  });
  if (q.loading) return <Screen id="092"><LoadingState /></Screen>;
  if (q.error) return <Screen id="092"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const s = o.shipment;
  const err = dispatch.error ?? track.error ?? receive.error;
  return (
    <Screen id="092" title={`Shipping — ${o.number}`} actions={<StatusBadge status={o.status} />}>
      <TradingTabs />
      {err && <Alert tone="danger">{err}</Alert>}
      {receive.data?.exceptions?.length > 0 && <Alert tone="warning">Received with exceptions on: {receive.data.exceptions.map((x: any) => x.item).join(', ')}. You can raise a claim from the Claims tab.</Alert>}
      {!s && o.side === 'supplier' && o.status === 'in_fulfilment' && (
        <Card title="Dispatch">
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label="Carrier" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} error={dispatch.fieldErrors.carrier} />
            <TextInput label="Tracking / LR number" value={ship.trackingNo} onChange={(e) => setShip({ ...ship, trackingNo: e.target.value })} error={dispatch.fieldErrors.trackingNo} />
            <TextInput label="ETA" type="date" value={ship.eta} onChange={(e) => setShip({ ...ship, eta: e.target.value })} />
            <Button onClick={() => dispatch.run()} loading={dispatch.pending}>Mark dispatched</Button>
          </div>
        </Card>
      )}
      {!s && o.status !== 'in_fulfilment' && <Alert tone="info">Shipping details appear once the supplier dispatches the order.</Alert>}
      {s && (
        <Card title="Shipment" actions={<StatusBadge status={s.status} />}>
          <DescriptionList items={[['Carrier', s.carrier], ['Tracking', <span key="t" className="cz-mono">{s.trackingNo}</span>], ['Dispatched', when(s.dispatchedAt)], ['ETA', when(s.eta)], ...(s.receivedAt ? [['Received', when(s.receivedAt)] as [string, React.ReactNode], ['Receipt note', s.receiptNote ?? '—'] as [string, React.ReactNode], ['Proof of delivery', `${s.proofOfDelivery.length} file(s)`] as [string, React.ReactNode]] : [])]} />
          <h3>Tracking</h3>
          <Timeline items={s.events.map((e: any, i: number) => ({ id: String(i), at: e.at, title: `${e.status}${e.location ? ` — ${e.location}` : ''}`, detail: e.note ?? undefined }))} />
          {s.receivedLines && <DataTable caption="Goods receipt" rows={s.receivedLines.map((l: any, i: number) => ({ ...l, id: String(i), ordered: o.lines.find((x: any) => x.item === l.item)?.quantity }))} columns={[{ key: 'item', header: 'Item' }, { key: 'ordered', header: 'Ordered' }, { key: 'received', header: 'Received' }, { key: 'damaged', header: 'Damaged' }]} />}
          {o.side === 'supplier' && s.status === 'in_transit' && (
            <div className="cz-row" style={{ alignItems: 'flex-end' }}>
              <TextInput label="Tracking status" value={ev.status} onChange={(e) => setEv({ ...ev, status: e.target.value })} />
              <TextInput label="Location" value={ev.location} onChange={(e) => setEv({ ...ev, location: e.target.value })} />
              <Button variant="secondary" onClick={() => track.run()} disabled={ev.status.trim().length < 2} loading={track.pending}>Add tracking update</Button>
            </div>
          )}
        </Card>
      )}
      {s && o.side === 'buyer' && o.status === 'shipped' && (
        <Card title="Record goods receipt">
          {o.lines.map((l: any) => (
            <div key={l.item} className="cz-row" style={{ alignItems: 'flex-end' }}>
              <span style={{ minWidth: 240 }}>{l.item} (ordered {l.quantity} {l.unit})</span>
              <TextInput label={`Received: ${l.item}`} inputMode="decimal" value={grn[l.item]?.received ?? ''} onChange={(e) => setGrn({ ...grn, [l.item]: { ...grn[l.item], received: e.target.value } })} />
              <TextInput label={`Damaged: ${l.item}`} inputMode="decimal" value={grn[l.item]?.damaged ?? ''} onChange={(e) => setGrn({ ...grn, [l.item]: { ...grn[l.item], damaged: e.target.value } })} />
            </div>
          ))}
          <TextInput label="Receipt note" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="cz-field"><span className="cz-label">Proof of delivery photos</span><input aria-label="Proof of delivery photos" type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} /></label>
          <Button onClick={() => receive.run()} loading={receive.pending}>Confirm receipt</Button>
        </Card>
      )}
    </Screen>
  );
}
