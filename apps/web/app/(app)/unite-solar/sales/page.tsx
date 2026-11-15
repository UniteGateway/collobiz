'use client';
import { useState } from 'react';
import { Alert, Button, DataTable, Dialog, EmptyState, Segmented, Select, Skeleton, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { PartnerGate, STATUS_TONE, inr, usePartner, type Product, type UnitSummary } from '@/components/UniteSolar';

interface Order { id: string; number: string; customerName: string; pincode: string; orderDate: string; subtotal: number; gst: number; total: number; status: string; fulfilment: string; fulfilmentStatus: string | null; paymentVerified: boolean; lines: { item: string; qty: number; unitPrice: number; earning: { kind: string; amount: number; bps: number } }[]; commissions: { id: string; amount: number; status: string; statusLabel: string }[] }
const FUL: Record<string, string> = { requested: 'Requested from Unite', dispatched: 'Dispatched', installed: 'Installed', accepted: 'Accepted by customer' };

/** Sales & orders — record a sale from own stock or raise it for Unite to fulfil; track delivery, acceptance and earnings. */
export default function Sales() {
  const p = usePartner();
  return (
    <Screen page={{ key: 'unite-solar-sales', title: 'Sales & orders', access: 'partner' }}>
      <PartnerGate p={p} need={(u) => (u.status === 'live' ? null : 'Sales open once your partnership is active.')}>{(u) => <Orders key={u.id} unit={u} />}</PartnerGate>
    </Screen>
  );
}

function Orders({ unit }: { unit: UnitSummary }) {
  const q = useQuery<Order[]>(`/network/units/${unit.id}/sales`);
  const [open, setOpen] = useState(false);
  const accept = useMutation(async (o: Order, by: string) => { await api.post(`/network/orders/${o.id}/accept`, { acceptedBy: by }); q.reload(); });
  const cancel = useMutation(async (o: Order) => { const reason = window.prompt('Why is this order cancelled?'); if (!reason) return; await api.post(`/network/orders/${o.id}/cancel`, { reason }); q.reload(); });
  const stock = unit.packageCode === 'store_with_stock';
  return (
    <div className="cz-stack" style={{ gap: 14 }}>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><p className="cz-muted" style={{ margin: 0 }}>{stock ? 'Sell from your stock, or raise an order for Unite to fulfil.' : 'Your orders are fulfilled by Unite Solar or an authorised partner — you hold no stock.'}</p><Button onClick={() => setOpen(true)}>New sale</Button></div>
      {(accept.error || cancel.error) && <Alert tone="danger">{accept.error ?? cancel.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : (
        <div className="cz-card"><DataTable caption="Orders" rows={q.data} empty={<EmptyState title="No sales yet" />} columns={[
          { key: 'n', header: 'Order', render: (o) => <><strong>{o.number}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{o.orderDate} · {o.customerName} · PIN {o.pincode}</span></> },
          { key: 'i', header: 'Items', render: (o) => o.lines.map((l) => `${l.qty} × ${l.item}`).join(', ') },
          { key: 'v', header: 'Value', render: (o) => <>{inr(o.subtotal)}<br /><span className="cz-muted" style={{ fontSize: 12 }}>+ GST {inr(o.gst)}</span></> },
          { key: 'f', header: 'Fulfilment', render: (o) => o.fulfilment === 'from_stock' ? 'From your stock' : <StatusBadge status={o.fulfilmentStatus ?? ''} tone={STATUS_TONE[o.fulfilmentStatus ?? '']} label={FUL[o.fulfilmentStatus ?? ''] ?? '—'} /> },
          { key: 'e', header: 'Your earning', render: (o) => o.fulfilment === 'from_stock' ? <>Margin {inr(o.lines.reduce((a, l) => a + (l.earning?.amount ?? 0), 0))}</> : o.commissions.length ? o.commissions.map((c) => <div key={c.id}>{inr(c.amount)} <StatusBadge status={c.status} tone={STATUS_TONE[c.status]} label={c.statusLabel} /></div>) : '—' },
          { key: 's', header: 'Status', render: (o) => <StatusBadge status={o.status} tone={STATUS_TONE[o.status]} label={o.status} /> },
          { key: 'a', header: '', render: (o) => o.status === 'cancelled' ? null : <div className="cz-row" style={{ gap: 6 }}>
            {o.fulfilment === 'unite' && ['dispatched', 'installed'].includes(o.fulfilmentStatus ?? '') && <Button size="sm" onClick={() => { const by = window.prompt('Customer name confirming acceptance', o.customerName); if (by) accept.run(o, by); }}>Record acceptance</Button>}
            {!o.commissions.some((c) => ['payable', 'paid'].includes(c.status)) && <Button size="sm" variant="ghost" onClick={() => cancel.run(o)}>Cancel</Button>}
          </div> },
        ]} /></div>
      )}
      <NewSale open={open} unit={unit} stock={stock} onClose={() => setOpen(false)} onDone={() => { setOpen(false); q.reload(); }} />
    </div>
  );
}

function NewSale({ open, unit, stock, onClose, onDone }: { open: boolean; unit: UnitSummary; stock: boolean; onClose: () => void; onDone: () => void }) {
  const cat = useQuery<{ products: Product[] }>(open ? '/network/products' : null);
  const [f, setF] = useState({ customerName: '', customerPhone: '', pincode: unit.pincode, fulfilment: stock ? 'from_stock' : 'unite' });
  const [lines, setLines] = useState([{ productId: '', qty: '1' }]);
  const products = cat.data?.products ?? [];
  const value = lines.reduce((a, l) => a + (products.find((p) => p.id === l.productId)?.customerPrice ?? 0) * Number(l.qty || 0), 0);
  const save = useMutation(async () => {
    await api.post(`/network/units/${unit.id}/sales`, { ...f, customerPhone: f.customerPhone || undefined, lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: Number(l.qty) })) }, true);
    setLines([{ productId: '', qty: '1' }]); onDone();
  });
  return (
    <Dialog open={open} onClose={onClose} title="New sale">
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }} noValidate>
        {stock && <Segmented label="Fulfilment" value={f.fulfilment} onChange={(v) => setF({ ...f, fulfilment: v })} options={[{ value: 'from_stock', label: 'From my stock' }, { value: 'unite', label: 'Unite fulfils' }]} />}
        <TextInput label="Customer name" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} error={save.fieldErrors.customerName} />
        <div className="cz-grid cz-grid-2"><TextInput label="Mobile (optional)" inputMode="tel" value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value.replace(/\D/g, '').slice(0, 10) })} error={save.fieldErrors.customerPhone} /><TextInput label="Installation PIN" inputMode="numeric" value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} error={save.fieldErrors.pincode} /></div>
        {lines.map((l, i) => (
          <div key={i} className="cz-row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><Select label={`Product ${i + 1}`} value={l.productId} placeholder="Choose" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))} options={products.map((p) => ({ value: p.id, label: `${p.name} — ${inr(p.customerPrice)}` }))} /></div>
            <div style={{ width: 90 }}><TextInput label="Qty" inputMode="numeric" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} /></div>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { productId: '', qty: '1' }])}>Add another product</Button>
        <p style={{ margin: 0 }}>Order value: <strong>{inr(value)}</strong> + GST <span className="cz-muted" style={{ fontSize: 12.5 }}>(catalogue prices; confirmed by the server)</span></p>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Button type="submit" loading={save.pending} disabled={!f.customerName || !lines.some((l) => l.productId)}>{f.fulfilment === 'from_stock' ? 'Record sale from stock' : 'Send to Unite for fulfilment'}</Button>
      </form>
    </Dialog>
  );
}
