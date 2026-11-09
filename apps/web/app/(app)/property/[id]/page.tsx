'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { PROPERTY_KIND_LABELS, RERA_REQUIRED_KINDS, UNIT_STATUS_LABELS, UNIT_TYPE_LABELS } from '@collabiz/types';
import { Alert, Button, Checkbox, Dialog, Select, Skeleton, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { crore } from '@/components/Property';

interface Unit { id: string; unitNo: string; unitType: string; areaSqft: number; price: number; status: string; mine: boolean; heldUntil: string | null; buyerName: string | null; commission: number }
interface Project { id: string; name: string; kind: string; city: string; owner: string | null; reraNumber: string | null; description: string; commissionBps: number; units: Unit[] }

/** One property project: unit availability; hold a unit for a buyer (with consent), release it. */
export default function PropertyProject() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Project>(`/property/projects/${id}`);
  const [holding, setHolding] = useState<Unit | null>(null);
  const release = useMutation(async (u: string) => { await api.post(`/property/units/${u}/release`, {}); q.reload(); return true; });
  const p = q.data;
  return (
    <Screen page={{ key: 'property-project', title: p?.name ?? 'Project', access: 'verified-partner' }} description={p ? `${PROPERTY_KIND_LABELS[p.kind]} · ${p.owner} · ${p.city}${p.reraNumber ? ` · RERA ${p.reraNumber}` : ''} · commission ${p.commissionBps / 100}% on sale` : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <Skeleton height={300} /> : (
        <div className="cz-stack" style={{ gap: 14 }}>
          <p style={{ margin: 0 }}>{p.description}</p>
          {release.error && <Alert tone="danger">{release.error}</Alert>}
          <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Units</caption>
            <thead><tr><th scope="col">Unit</th><th scope="col">Type</th><th scope="col" style={{ textAlign: 'right' }}>Area (sq ft)</th><th scope="col" style={{ textAlign: 'right' }}>Price</th><th scope="col" style={{ textAlign: 'right' }}>Your commission</th><th scope="col">Status</th><th scope="col"><span className="cz-sr-only">Action</span></th></tr></thead>
            <tbody>{p.units.map((u) => (
              <tr key={u.id} data-unit={u.unitNo}><td data-label="Unit"><strong>{u.unitNo}</strong></td><td data-label="Type">{UNIT_TYPE_LABELS[u.unitType]}</td><td data-label="Area (sq ft)" style={{ textAlign: 'right' }}>{u.areaSqft.toLocaleString('en-IN')}</td><td data-label="Price" style={{ textAlign: 'right' }}>{crore(u.price)}</td><td data-label="Your commission" style={{ textAlign: 'right' }}>{crore(u.commission)}</td>
                <td data-label="Status"><StatusBadge status={u.status} tone={u.status === 'available' ? 'success' : u.mine ? 'info' : 'neutral'} label={u.mine && u.status === 'held' ? `Held for ${u.buyerName}` : UNIT_STATUS_LABELS[u.status]} /></td>
                <td data-label="">{u.status === 'available' ? <Button size="sm" onClick={() => setHolding(u)}>Hold for a buyer</Button> : u.mine && u.status === 'held' ? <Button size="sm" variant="ghost" onClick={() => release.run(u.id)}>Release</Button> : null}</td></tr>
            ))}</tbody>
          </table></div>
          <Hold unit={holding} rera={RERA_REQUIRED_KINDS.has(p.kind)} onClose={() => setHolding(null)} onDone={() => { setHolding(null); q.reload(); }} />
        </div>
      )}
    </Screen>
  );
}

function Hold({ unit, rera, onClose, onDone }: { unit: Unit | null; rera: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ buyerName: '', buyerCity: '', consentMethod: 'meeting_minutes', consent: false, agentRera: '' });
  const save = useMutation(async () => { const r = await api.post(`/property/units/${unit!.id}/hold`, f); setF({ ...f, buyerName: '', buyerCity: '', consent: false }); onDone(); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={!!unit} onClose={onClose} title={`Hold ${unit?.unitNo ?? ''} for a buyer`}>
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>The unit is held for your buyer for 48 hours. Unite contacts the buyer to complete the booking; if it is sold, you earn the commission shown.</p>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Buyer name" value={f.buyerName} onChange={(ev) => setF({ ...f, buyerName: ev.target.value })} error={e.buyerName} />
        <TextInput label="Buyer city" value={f.buyerCity} onChange={(ev) => setF({ ...f, buyerCity: ev.target.value })} error={e.buyerCity} />
        <Select label="How the buyer agreed to be introduced" value={f.consentMethod} onChange={(ev) => setF({ ...f, consentMethod: ev.target.value })} options={[['meeting_minutes', 'Meeting minutes'], ['written_email', 'Written email'], ['signed_letter', 'Signed letter'], ['recorded_call', 'Recorded call']].map(([v, l]) => ({ value: v, label: l }))} />
        {rera && <TextInput label="Your RERA agent registration number" value={f.agentRera} onChange={(ev) => setF({ ...f, agentRera: ev.target.value })} error={e.agentRera} hint="Required for RERA-registered projects" />}
        <Checkbox label="The buyer agreed to be introduced to Unite Group for this unit" checked={f.consent} onChange={(ev) => setF({ ...f, consent: ev.target.checked })} />
        <Button type="submit" loading={save.pending} disabled={!f.consent || !f.buyerName}>Hold unit</Button>
      </form>
    </Dialog>
  );
}
