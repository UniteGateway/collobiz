'use client';
import { useState } from 'react';
import { CAPACITY_CATEGORIES, INDIA_STATES, VALUE_BASIS_LABELS, XCHANGE_CATEGORIES, XCHANGE_CATEGORY_LABELS, regionLabel } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, Dialog, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { XchangeNav, inr } from '@/components/Xchange';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Listing { id: string; code: string; side: string; category: string; categoryLabel: string; title: string; description: string; quantity: string | null; value: number; valueBasis: string; region: string; accepts: string[]; status: string; org?: string; city?: string | null; mine?: boolean; deliveries?: number }
interface Res { listings: Listing[]; mine: Listing[]; canTrade: boolean }
const ACCEPT: Record<string, string> = { barter: 'Barter', part_cash: 'Part-cash', cash: 'Cash' };

/** Screen 180 — XCHANGE marketplace: what verified businesses offer and need, for barter, part-cash or cash. */
export default function XchangeMarket() {
  const [side, setSide] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const r = useQuery<Res>(`/xchange?${new URLSearchParams({ ...(side ? { side } : {}), ...(cat ? { category: cat } : {}), ...(q ? { q } : {}) })}`);
  const [listing, setListing] = useState(false);
  const status = useMutation(async (id: string, s: string) => { await api.request('PATCH', `/xchange/listings/${id}`, { status: s }); r.reload(); return true; });
  const d = r.data;
  return (
    <Screen page={{ key: 'xchange', title: 'XCHANGE — business barter', access: 'partner' }}
      description="Exchange products, services, machinery, surplus stock and idle capacity with verified businesses — directly, with part-cash, or in exchanges between three or four companies."
      actions={d?.canTrade ? <Button onClick={() => setListing(true)}>List an offer or need</Button> : undefined}>
      <XchangeNav />
      <Alert tone="info">Barter is not tax-free: each supply is a separate taxable supply at open-market value. Every exchange shows invoice data for your accountant.</Alert>
      <div className="cz-row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <Segmented label="Show" value={side} onChange={setSide} options={[{ value: '', label: 'All' }, { value: 'offer', label: 'Offers' }, { value: 'need', label: 'Needs' }]} />
        <div style={{ minWidth: 220 }}><Select label="Category" placeholder="All categories" value={cat} onChange={(e) => setCat(e.target.value)} options={XCHANGE_CATEGORIES.map((c) => ({ value: c, label: XCHANGE_CATEGORY_LABELS[c] }))} /></div>
        <div style={{ minWidth: 220, flex: 1 }}><TextInput label="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !d ? <LoadingState /> : (
        <>
          {!d.listings.length ? <Card><EmptyState icon="trading" title="Nothing listed here yet">List what you can offer and what you need — matches appear under “Matches for you”.</EmptyState></Card> : (
            <div className="cz-product-grid">{d.listings.map((l) => (
              <article key={l.id} className="cz-product" data-listing={l.title}>
                <span className="cz-row" style={{ gap: 6 }}><span className={l.side === 'offer' ? 'cz-offer-badge' : 'cz-tag'}>{l.side === 'offer' ? 'Offers' : 'Needs'}</span><span className="cz-tag">{l.categoryLabel}</span>{CAPACITY_CATEGORIES.has(l.category) && <span className="cz-tag">Capacity</span>}</span>
                <h3>{l.title}</h3>
                <p>{l.description}</p>
                <span className="cz-muted" style={{ fontSize: 13 }}>{l.org}{l.city ? `, ${l.city}` : ''} · {regionLabel(l.region)}{l.deliveries ? ` · ${l.deliveries} exchanges delivered` : ''}</span>
                <span className="cz-price">{inr(l.value)}</span>
                <span className="cz-muted" style={{ fontSize: 12.5 }}>{VALUE_BASIS_LABELS[l.valueBasis]} · {l.accepts.map((a) => ACCEPT[a]).join(', ')}{l.quantity ? ` · ${l.quantity}` : ''}</span>
              </article>
            ))}</div>
          )}
          {d.canTrade && (
            <Card title="Your listings">
              {status.error && <Alert tone="danger">{status.error}</Alert>}
              {!d.mine.length ? <p className="cz-muted" style={{ margin: 0 }}>You have not listed anything yet.</p> : (
                <ul className="cz-ws-list">{d.mine.map((l) => (
                  <li key={l.id} data-my-listing={l.title}><span><strong>{l.side === 'offer' ? 'Offer' : 'Need'}: {l.title}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{l.categoryLabel} · {inr(l.value)} · {l.code}</span></span>
                    <StatusBadge status={l.status} tone={l.status === 'active' ? 'success' : 'neutral'} label={l.status === 'active' ? 'Listed' : l.status === 'paused' ? 'Paused' : 'Closed'} />
                    {l.status === 'active' && <Button size="sm" variant="ghost" onClick={() => status.run(l.id, 'paused')}>Pause</Button>}
                    {l.status === 'paused' && <Button size="sm" variant="ghost" onClick={() => status.run(l.id, 'active')}>Relist</Button>}</li>
                ))}</ul>
              )}
            </Card>
          )}
          <NewListing open={listing} onClose={() => setListing(false)} onDone={() => { setListing(false); r.reload(); }} />
        </>
      )}
    </Screen>
  );
}

function NewListing({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ side: 'offer', category: 'solar_equipment', title: '', description: '', quantity: '', value: '', valueBasis: 'price_list', region: 'IN-MH', accepts: ['barter', 'part_cash'] as string[] });
  const save = useMutation(async () => { const r = await api.post('/xchange/listings', { ...f, quantity: f.quantity || undefined, value: Math.round(Number(f.value) * 100) }); onDone(); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="List an offer or need">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Segmented label="I want to" value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'offer', label: 'Offer something' }, { value: 'need', label: 'Get something' }]} />
        <Select label="Category" value={f.category} onChange={(ev) => setF({ ...f, category: ev.target.value })} options={XCHANGE_CATEGORIES.map((c) => ({ value: c, label: XCHANGE_CATEGORY_LABELS[c] }))} hint={CAPACITY_CATEGORIES.has(f.category) ? 'Idle capacity: say when it is available and for how long' : undefined} />
        <TextInput label="Title" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} />
        <TextArea label="Description" rows={3} value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} error={e.description} />
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label="Open-market value (₹)" inputMode="numeric" value={f.value} onChange={(ev) => setF({ ...f, value: ev.target.value.replace(/\D/g, '') })} error={e.value} />
          <Select label="Value based on" value={f.valueBasis} onChange={(ev) => setF({ ...f, valueBasis: ev.target.value })} options={Object.entries(VALUE_BASIS_LABELS).map(([value, label]) => ({ value, label }))} />
          <TextInput label="Quantity / period (optional)" value={f.quantity} onChange={(ev) => setF({ ...f, quantity: ev.target.value })} />
          <Select label="State" value={f.region} onChange={(ev) => setF({ ...f, region: ev.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
        </div>
        <ChipSelect legend="Accept" options={[{ value: 'barter', label: 'Barter' }, { value: 'part_cash', label: 'Part-cash' }, { value: 'cash', label: 'Cash' }]} value={f.accepts} onChange={(v) => setF({ ...f, accepts: v })} />
        <div><Button type="submit" loading={save.pending} disabled={!f.title || !f.description || !f.value || !f.accepts.length}>List it</Button></div>
      </form>
    </Dialog>
  );
}
