'use client';
import { useState } from 'react';
import { STORE_ORDER_STATUS_LABELS, type PricedLine } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, WorkspaceNav, inr, webUrl } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface O { id: string; code: string; customer: { name: string; phone: string; address: string; city: string; pincode: string }; lines: PricedLine[]; subtotal: number; freeValue: number; status: string; next: string[]; createdAt: string }
interface I { id: string; name: string; sector: string; owner: string; storePrice: number | null; listPrice: number | null }
interface Res { totals: { orders: number; open: number; openValue: number; freeValue: number; listed: number }; orders: O[]; items: I[] }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { new: 'info', confirmed: 'warning', fulfilled: 'success', cancelled: 'neutral' };

/** COLLABIZ online store (admin) — orders to confirm and deliver, and which Unite products are sold online at what price. */
export default function StoreAdmin() {
  const q = useQuery<Res>('/admin/store');
  const [tab, setTab] = useState('orders');
  const [price, setPrice] = useState<Record<string, string>>({});
  const act = useMutation(async (id: string, status: string) => { await api.post(`/admin/store/orders/${id}/status`, { status }); q.reload(); return true; });
  const list = useMutation(async (id: string, storePrice: number | null) => { await api.request('PATCH', `/admin/store/items/${id}`, { storePrice }); q.reload(); return true; });
  const d = q.data;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Online" accent="store" sub="Orders from the public COLLABIZ store — Unite Solar kits and energy products — with live offers applied. Unite calls each customer to confirm delivery and payment." chips={['Orders to confirm', 'Free items tracked', 'Products sold online']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <KpiRow tint="blue" items={[['package', d.totals.open, 'Open orders', inr(d.totals.openValue)], ['check', d.totals.orders, 'All orders', 'since launch'], ['award', inr(d.totals.freeValue), 'Given free by offers', 'excluding cancelled'], ['company', d.totals.listed, 'Products sold online', 'plus all solar kits']]} />
          <Card>
            <div className="cz-ws-section-head"><Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'orders', label: 'Orders' }, { value: 'products', label: 'Products online' }]} /><a className="cz-btn cz-btn-secondary cz-btn-sm" href={webUrl('/store')} target="_blank" rel="noopener noreferrer">Open the store</a></div>
            {(act.error || list.error) && <Alert tone="danger">{act.error ?? list.error}</Alert>}
            {tab === 'orders' ? (!d.orders.length ? <EmptyState icon="package" title="No orders yet" /> : (
              <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>{d.orders.map((o) => (
                <li key={o.id} className="cz-card cz-lead" data-order={o.code}>
                  <div className="cz-lead-head"><strong>{o.code} · {o.customer.name}</strong><span className="cz-muted">{o.customer.city} {o.customer.pincode} · {o.customer.phone} · {new Date(o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span><span style={{ marginLeft: 'auto' }}><StatusBadge status={o.status} tone={TONE[o.status]} label={STORE_ORDER_STATUS_LABELS[o.status]} /></span></div>
                  <span style={{ fontSize: 14 }}>{o.lines.map((l) => `${l.qty} × ${l.name}${l.freeQty ? ` (+${l.freeQty} free)` : ''}`).join(' · ')}</span>
                  <span className="cz-muted" style={{ fontSize: 13 }}>To collect {inr(o.subtotal)}{o.freeValue ? ` · free items ${inr(o.freeValue)}` : ''} · {o.customer.address}</span>
                  {o.next.length > 0 && <div className="cz-row" style={{ gap: 8 }}>{o.next.map((s) => <Button key={s} size="sm" variant={s === 'cancelled' ? 'ghost' : 'primary'} onClick={() => act.run(o.id, s)}>{s === 'confirmed' ? 'Confirm' : s === 'fulfilled' ? 'Delivered' : 'Cancel'}</Button>)}</div>}
                </li>
              ))}</ul>
            )) : (
              <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Unite products and their online store price</caption>
                <thead><tr><th scope="col">Product</th><th scope="col">Company</th><th scope="col" style={{ textAlign: 'right' }}>Online price</th><th scope="col">Set price (₹ incl. GST)</th></tr></thead>
                <tbody>{d.items.slice(0, 120).map((i) => (
                  <tr key={i.id} data-item={i.name}>
                    <td data-label="Product"><strong>{i.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{i.sector}</span></td>
                    <td data-label="Company">{i.owner}</td>
                    <td data-label="Online price" style={{ textAlign: 'right' }}>{i.storePrice != null ? inr(i.storePrice) : 'Not sold online'}</td>
                    <td data-label="Set price"><span className="cz-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <input className="cz-input" style={{ width: 110, minHeight: 34 }} inputMode="numeric" aria-label={`Online price for ${i.name} (₹)`} placeholder={i.listPrice ? String(Math.round(i.listPrice / 100)) : '₹'} value={price[i.id] ?? ''} onChange={(e) => setPrice({ ...price, [i.id]: e.target.value.replace(/\D/g, '') })} />
                      <Button size="sm" variant="secondary" disabled={!price[i.id]} onClick={async () => { await list.run(i.id, Math.round(Number(price[i.id]) * 100)); setPrice({ ...price, [i.id]: '' }); }}>Sell online</Button>
                      {i.storePrice != null && <Button size="sm" variant="ghost" onClick={() => list.run(i.id, null)}>Remove</Button>}
                    </span></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
