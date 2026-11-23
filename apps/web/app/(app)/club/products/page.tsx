'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CLUB_BRAND_OPTIONS, SECTORS } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Dialog, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { id: string; code: string; name: string; category: string; sectorName: string; brandLabel: string; powerFree: boolean; powerOffer: string | null; status: string; statusLabel: string; reviewNote: string | null; mrp: number | null }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { approved: 'success', submitted: 'info', draft: 'neutral', rejected: 'warning', withdrawn: 'neutral' };

/** Unite Industry Club — my products for the Unite Powertek brand. */
export default function ClubProducts() {
  const q = useQuery<{ items: P[]; canEdit: boolean; verified: boolean }>('/club/products');
  const [open, setOpen] = useState(false);
  const act = useMutation(async (id: string, a: 'submit' | 'withdraw') => { await api.post(`/club/products/${id}/${a}`, {}); q.reload(); return true; });
  const d = q.data;
  return (
    <Screen page={{ key: 'club-products', title: 'My club products', access: 'partner' }} eyebrow="UNITE INDUSTRY CLUB"
      description="Sell your products under the Unite Powertek brand, with an optional free-power offer. Approved products are listed in the Unite Powertek catalogue for every partner to sell."
      actions={d?.canEdit ? <Button onClick={() => setOpen(true)}>Add a product</Button> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          {!d.verified && <Alert tone="info">You can prepare products now. Complete your business verification (KYB) to submit them for the Unite brand. <Link href="/onboarding/status">Check verification</Link></Alert>}
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          {!d.items.length ? <Card><EmptyState icon="package" title="No products yet">Add your first product to sell it under the Unite Powertek brand.</EmptyState></Card> : d.items.map((p) => (
            <Card key={p.id}>
              <div data-my-club-product={p.code} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{p.name}</h2>
                  <p className="cz-muted" style={{ margin: '4px 0 0' }}>{p.code} · {p.category} · {p.brandLabel}</p>
                  {p.powerFree && <p className="cz-club-power" style={{ margin: '6px 0 0' }}>Free power: {p.powerOffer}</p>}
                  {p.reviewNote && p.status === 'rejected' && <p style={{ margin: '6px 0 0' }}>Unite’s note: {p.reviewNote}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <StatusBadge status={p.status} label={p.statusLabel} tone={TONE[p.status]} />
                  {d.canEdit && ['draft', 'rejected'].includes(p.status) && <Button size="sm" disabled={!d.verified || act.pending} onClick={() => act.run(p.id, 'submit')}>Submit for Unite review</Button>}
                  {d.canEdit && ['submitted', 'approved'].includes(p.status) && <Button size="sm" variant="ghost" disabled={act.pending} onClick={() => act.run(p.id, 'withdraw')}>Withdraw</Button>}
                  {p.status === 'approved' && <Link className="cz-btn cz-btn-secondary cz-btn-sm" href="/powertek">See in catalogue</Link>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a product"><NewProduct onDone={() => { setOpen(false); q.reload(); }} /></Dialog>
    </Screen>
  );
}

function NewProduct({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', category: '', sector: 'manufacturing', description: '', brandOption: 'unite_powertek', powerFree: false, powerOffer: '', certifications: '', monthlyCapacity: '', unit: '', mrp: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation(async () => {
    await api.post('/club/products', {
      name: f.name, category: f.category, sector: f.sector, description: f.description, brandOption: f.brandOption, powerFree: f.powerFree, powerOffer: f.powerFree ? f.powerOffer : undefined,
      certifications: f.certifications.split(',').map((s) => s.trim()).filter(Boolean), monthlyCapacity: f.monthlyCapacity ? Number(f.monthlyCapacity) : undefined, unit: f.unit || undefined,
      mrp: f.mrp ? Math.round(Number(f.mrp) * 100) : undefined,
    });
    onDone(); return true;
  });
  const fe = m.fieldErrors;
  return (
    <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }}>
      <TextInput label="Product name" value={f.name} onChange={set('name')} error={fe.name} required />
      <TextInput label="Category" hint="For example: cold storage, pumps, lighting, EV charging" value={f.category} onChange={set('category')} error={fe.category} required />
      <Select label="Industry" value={f.sector} onChange={set('sector')} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
      <TextArea label="Description" value={f.description} onChange={set('description')} error={fe.description} rows={3} required />
      <fieldset className="cz-fieldset"><legend>How it is branded</legend>
        {CLUB_BRAND_OPTIONS.map((o) => (
          <label key={o.code} className="cz-radio"><input type="radio" name="brand" checked={f.brandOption === o.code} onChange={() => setF((x) => ({ ...x, brandOption: o.code }))} /> <span><strong>{o.label}</strong> — {o.text}</span></label>
        ))}
      </fieldset>
      <Checkbox label="Offer free power with this product (a solar system bundled with it)" checked={f.powerFree} onChange={(e) => setF((x) => ({ ...x, powerFree: e.target.checked }))} />
      {f.powerFree && <TextArea label="Free-power offer" hint="For example: 5 kW rooftop solar with every cold room" value={f.powerOffer} onChange={set('powerOffer')} error={fe.powerOffer} rows={2} />}
      <TextInput label="Certifications (comma separated, optional)" value={f.certifications} onChange={set('certifications')} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <TextInput label="Monthly capacity (optional)" inputMode="numeric" value={f.monthlyCapacity} onChange={set('monthlyCapacity')} error={fe.monthlyCapacity} />
        <TextInput label="Unit (optional)" value={f.unit} onChange={set('unit')} />
        <TextInput label="MRP in ₹ (optional)" inputMode="decimal" value={f.mrp} onChange={set('mrp')} error={fe.mrp} />
      </div>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <Button type="submit" disabled={m.pending}>{m.pending ? 'Saving…' : 'Save as draft'}</Button>
    </form>
  );
}
