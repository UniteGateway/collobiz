'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PROPERTY_KIND_LABELS, UNIT_STATUS_LABELS, UNIT_TYPES, UNIT_TYPE_LABELS } from '@collabiz/types';
import { Alert, Button, Card, LoadingState, PageHeader, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Unit { id: string; unitNo: string; unitType: string; areaSqft: number; price: number; status: string; partner: string | null; buyerName: string | null; heldUntil: string | null; agentRera: string | null; commission: number | null }
interface P { id: string; code: string; name: string; kind: string; city: string; owner: string | null; reraNumber: string | null; openToPartners: boolean; commissionBps: number; units: Unit[] }
/** Matches a typed unit type by its code or its label ("land parcel", "industrial shed", "shed"); defaults to plot. */
const typeOf = (x = '') => { const v = x.trim().toLowerCase(); return UNIT_TYPES.find((t) => t === v.replace(/ /g, '_') || UNIT_TYPE_LABELS[t].toLowerCase() === v) ?? 'plot'; };
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { available: 'success', held: 'warning', booked: 'info', sold: 'neutral', blocked: 'neutral' };

export default function PropertyProjectAdmin() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<P>(`/admin/property/projects/${id}`);
  const [rera, setRera] = useState('');
  const [bulk, setBulk] = useState('');
  const act = useMutation(async (fn: () => Promise<unknown>) => { const r = await fn(); q.reload(); return r; });
  const p = q.data;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!p) return <LoadingState />;
  const parseBulk = () => bulk.split('\n').map((l) => l.split(',').map((x) => x.trim())).filter((c) => c[0]).map(([unitNo, unitType, area, price]) => ({ unitNo, unitType: typeOf(unitType), areaSqft: Number(area) || 0, price: Math.round(Number(price) * 100) || 0 }));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <PageHeader title={p.name} breadcrumb="Real estate" description={`${PROPERTY_KIND_LABELS[p.kind]} · ${p.owner} · ${p.city} · ${p.code} · partner commission ${p.commissionBps / 100}%`}
        actions={<div className="cz-row" style={{ gap: 8 }}><span style={{ fontSize: 14 }}>Open to partners</span><button type="button" role="switch" aria-checked={p.openToPartners} aria-label="Open to partners" className="cz-switch" data-on={p.openToPartners || undefined} onClick={() => act.run(() => api.request('PATCH', `/admin/property/projects/${id}`, { openToPartners: !p.openToPartners }))}><span /></button></div>} />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      <div className="cz-ws-cols">
        <Card title={`Units (${p.units.length})`}>
          <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Units</caption>
            <thead><tr><th scope="col">Unit</th><th scope="col" style={{ textAlign: 'right' }}>Area</th><th scope="col" style={{ textAlign: 'right' }}>Price</th><th scope="col">Status</th><th scope="col">Partner / buyer</th><th scope="col"><span className="cz-sr-only">Actions</span></th></tr></thead>
            <tbody>{p.units.map((u) => (
              <tr key={u.id} data-unit={u.unitNo}><td data-label="Unit"><strong>{u.unitNo}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{UNIT_TYPE_LABELS[u.unitType]}</span></td><td data-label="Area" style={{ textAlign: 'right' }}>{u.areaSqft.toLocaleString('en-IN')} sq ft</td><td data-label="Price" style={{ textAlign: 'right' }}>{inr(u.price)}</td>
                <td data-label="Status"><StatusBadge status={u.status} tone={TONE[u.status]} label={UNIT_STATUS_LABELS[u.status]} /></td>
                <td data-label="Partner / buyer" style={{ fontSize: 13 }}>{u.partner ?? '—'}{u.buyerName ? <><br /><span className="cz-muted">Buyer: {u.buyerName}</span></> : null}{u.commission ? <><br /><span className="cz-muted">Commission {inr(u.commission)}</span></> : null}{u.agentRera ? <><br /><span className="cz-muted">Agent RERA {u.agentRera}</span></> : null}</td>
                <td data-label=""><span className="cz-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {(u.status === 'held' || u.status === 'available') && u.buyerName && <Button size="sm" onClick={() => act.run(() => api.post(`/admin/property/units/${u.id}/status`, { status: 'booked' }))}>Booked</Button>}
                  {u.status === 'booked' && <Button size="sm" onClick={() => act.run(() => api.post(`/admin/property/units/${u.id}/status`, { status: 'sold' }))}>Sold</Button>}
                  {u.status !== 'sold' && u.status !== 'available' && <Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/admin/property/units/${u.id}/status`, { status: 'available' }))}>Release</Button>}
                  {u.status === 'available' && <Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/admin/property/units/${u.id}/status`, { status: 'blocked' }))}>Not for sale</Button>}
                </span></td></tr>
            ))}</tbody>
          </table></div>
        </Card>
        <aside className="cz-ws-side">
          <Card title="RERA">
            <p style={{ marginTop: 0, fontSize: 14 }}>{p.reraNumber ? `Registered: ${p.reraNumber}` : 'No RERA number recorded.'}</p>
            <form className="cz-row" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); act.run(() => api.request('PATCH', `/admin/property/projects/${id}`, { reraNumber: rera || null })); }}>
              <div style={{ flex: 1, minWidth: 160 }}><TextInput label="RERA registration number" value={rera} onChange={(e) => setRera(e.target.value)} /></div><Button size="sm" type="submit" disabled={!rera}>Save</Button>
            </form>
          </Card>
          <Card title="Add units">
            <p className="cz-muted" style={{ marginTop: 0, fontSize: 13 }}>One unit per line: unit number, type ({UNIT_TYPES.map((t) => UNIT_TYPE_LABELS[t].toLowerCase()).join(', ')}), area in sq ft, price in ₹. Existing unit numbers are skipped.</p>
            <TextArea label="Units" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'P-13, plot, 12000, 6500000\nS-02, shed, 8000, 12000000'} />
            <Button size="sm" disabled={!parseBulk().length} onClick={() => act.run(async () => { const r = await api.post(`/admin/property/projects/${id}/units`, { units: parseBulk() }); setBulk(''); return r; })}>Add {parseBulk().length || ''} units</Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
