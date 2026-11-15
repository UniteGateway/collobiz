'use client';
import { useState } from 'react';
import { INDIA_STATES } from '@collabiz/types';
import { Alert, Button, ButtonLink, Checkbox, Dialog, EmptyState, Pagination, SearchInput, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Item { id: string; sku: string | null; name: string; kind: string; description: string; productLine: string | null; category: string | null; hasImage: boolean; productPage: string | null; specs: Record<string, string>; commissionBps: number | null }
interface Cat { brand: string; total: number; page: number; pageSize: number; lines: { line: string; count: number; categories: { category: string; count: number }[] }[]; items: Item[]; note: string }
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
const title = (s: string) => s.replace(/^POWERTEK /, '').toLowerCase().replace(/(^|\s|&)\S/g, (m) => m.toUpperCase());

/** Powertek products — every Unite Powertek product, sellable by anyone: register a customer enquiry and earn on the order. */
export default function PowertekCatalogue() {
  const [q, setQ] = useState(''); const [line, setLine] = useState(''); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const c = useQuery<Cat>('/product-sales/powertek/catalogue', { q: q || undefined, line: line || undefined, category: category || undefined, page: String(page) });
  const [basket, setBasket] = useState<{ item: Item; qty: string }[]>([]);
  const [open, setOpen] = useState(false);
  const add = (item: Item) => setBasket((b) => (b.some((x) => x.item.id === item.id) ? b : [...b, { item, qty: '1' }]));
  const cats = c.data?.lines.find((l) => l.line === line)?.categories ?? [];
  return (
    <Screen page={{ key: 'powertek', title: 'Powertek products', access: 'partner' }}
      description="Sell any Unite Powertek product — franchises, stores, partners and agents alike. Register your customer’s enquiry; Powertek’s sales team quotes and delivers, and you earn commission on the order once the customer pays."
      actions={<Button onClick={() => setOpen(true)} disabled={!basket.length}>Enquiry basket ({basket.length})</Button>}>
      {c.error ? <ApiErrorView error={c.error} onRetry={c.reload} /> : (
        <div className="cz-stack" style={{ gap: 14 }}>
          <div className="cz-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 220 }}><SearchInput label="Search products" placeholder="Name, SKU or keyword" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
            <div style={{ flex: 1, minWidth: 180 }}><Select label="Product line" value={line} placeholder="All product lines" onChange={(e) => { setLine(e.target.value); setCategory(''); setPage(1); }} options={(c.data?.lines ?? []).map((l) => ({ value: l.line, label: `${title(l.line)} (${l.count})` }))} /></div>
            {line && <div style={{ flex: 1, minWidth: 180 }}><Select label="Category" value={category} placeholder="All categories" onChange={(e) => { setCategory(e.target.value); setPage(1); }} options={cats.map((x) => ({ value: x.category, label: `${x.category} (${x.count})` }))} /></div>}
          </div>
          {!c.data ? <Skeleton height={400} /> : !c.data.items.length ? <div className="cz-card"><EmptyState title="No products match" /></div> : (
            <>
              <p className="cz-muted" style={{ margin: 0 }}>{c.data.total} products · {c.data.note}</p>
              <div className="cz-us-products">
                {c.data.items.map((it) => (
                  <article key={it.id} className="cz-card cz-pt-item" aria-label={it.name} data-sku={it.sku ?? undefined}>
                    {it.hasImage ? <img src={`/api/v1/catalog/${it.id}/image`} alt="" loading="lazy" className="cz-pt-img" /> : <div className="cz-pt-img cz-pt-noimg" aria-hidden>⚡</div>}
                    <span className="cz-muted" style={{ fontSize: 12 }}>{it.productLine ? title(it.productLine) : ''}{it.category ? ` · ${it.category}` : ''}</span>
                    <h2 style={{ margin: '2px 0', fontSize: 15.5 }}>{it.name}</h2>
                    <p style={{ fontSize: 13, margin: 0 }} className="cz-pt-desc">{it.description}</p>
                    <div className="cz-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', gap: 6 }}>
                      <span style={{ fontSize: 12.5 }} className="cz-muted">{it.commissionBps != null ? `Earn ${pct(it.commissionBps)} of order` : 'Commission rate to be confirmed'}</span>
                      <Button size="sm" variant={basket.some((x) => x.item.id === it.id) ? 'secondary' : 'primary'} onClick={() => add(it)}>{basket.some((x) => x.item.id === it.id) ? 'Added' : 'Add'}</Button>
                    </div>
                    {it.productPage && <a href={it.productPage} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>Product page on unitepowertek.com</a>}
                  </article>
                ))}
              </div>
              <Pagination page={c.data.page} pageSize={c.data.pageSize} total={c.data.total} onPage={setPage} noun="products" />
            </>
          )}
        </div>
      )}
      <EnquiryDialog open={open} basket={basket} setBasket={setBasket} onClose={() => setOpen(false)} />
    </Screen>
  );
}

function EnquiryDialog({ open, basket, setBasket, onClose }: { open: boolean; basket: { item: Item; qty: string }[]; setBasket: (b: { item: Item; qty: string }[]) => void; onClose: () => void }) {
  const [f, setF] = useState({ customerName: '', customerPhone: '', customerEmail: '', city: '', state: '', pincode: '', requirement: '', consent: false });
  const [done, setDone] = useState<string | null>(null);
  const save = useMutation(async () => {
    const r = await api.post<{ code: string }>('/product-sales/powertek/enquiries', { ...f, customerPhone: f.customerPhone || undefined, customerEmail: f.customerEmail || undefined, lines: basket.map((b) => ({ catalogItemId: b.item.id, qty: Number(b.qty) || 1 })) }, true);
    setDone(r.code); setBasket([]); return r;
  });
  return (
    <Dialog open={open} onClose={() => { setDone(null); onClose(); }} title="Register a customer enquiry">
      {done ? <div className="cz-stack" style={{ gap: 10 }}><Alert tone="success" title={`Enquiry ${done} sent to Powertek`}>The customer is registered to you for 90 days. Powertek’s sales team will contact them and you can follow progress under My enquiries.</Alert><ButtonLink href="/powertek/enquiries">My enquiries</ButtonLink></div> : (
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }} noValidate>
          {basket.map((b, i) => (
            <div key={b.item.id} className="cz-row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, fontSize: 14 }}>{b.item.name}</div>
              <div style={{ width: 90 }}><TextInput label="Qty" inputMode="numeric" value={b.qty} onChange={(e) => setBasket(basket.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} /></div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setBasket(basket.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <TextInput label="Customer (company or person)" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} error={save.fieldErrors.customerName} />
          <div className="cz-grid cz-grid-2">
            <TextInput label="Mobile (optional)" inputMode="tel" value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} error={save.fieldErrors.customerPhone} />
            <TextInput label="Email (optional)" type="email" value={f.customerEmail} onChange={(e) => setF({ ...f, customerEmail: e.target.value })} error={save.fieldErrors.customerEmail} />
            <TextInput label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} error={save.fieldErrors.city} />
            <Select label="State" value={f.state} placeholder="Choose" onChange={(e) => setF({ ...f, state: e.target.value })} options={INDIA_STATES.map(([, n]) => ({ value: n, label: n }))} />
            <TextInput label="PIN code" inputMode="numeric" value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} error={save.fieldErrors.pincode} />
          </div>
          <TextArea label="Customer requirement" rows={3} value={f.requirement} onChange={(e) => setF({ ...f, requirement: e.target.value })} error={save.fieldErrors.requirement} hint="Site, capacity, timeline, budget — whatever helps Powertek quote." />
          <Checkbox label="The customer agreed to be contacted by Unite Powertek about this enquiry" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <Button type="submit" loading={save.pending} disabled={!basket.length || !f.consent}>Send enquiry to Powertek</Button>
        </form>
      )}
    </Dialog>
  );
}
