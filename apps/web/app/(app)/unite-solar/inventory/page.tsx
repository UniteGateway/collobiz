'use client';
import { useState } from 'react';
import { Alert, Button, DataTable, Kpi, Select, Skeleton, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { PartnerGate, STATUS_TONE, inr, usePartner } from '@/components/UniteSolar';

interface Inv {
  enabled: boolean; message?: string; stockEntitlement: number; allocated: number; remainingAllocation: number;
  items: { productId: string; sku: string; name: string; qty: number; value: number; partnerPrice: number; customerPrice: number; reorderLevel: number; low: boolean }[];
  allocations: { id: string; number: string; invoiceNumber: string; value: number; gst: number; status: string; createdAt: string; receivedAt: string | null; lines: { sku: string; name: string; qty: number; unitCost: number; serials: string[] }[] }[];
  movements: { id: string; kind: string; qty: number; unitCost: number; reference: string; name: string; sku: string; note: string | null; createdAt: string }[];
  valuation: { onHand: number; received: number; sold: number; damaged: number; returnedToUnite: number; customerReturns: number };
  reconciliation: { ok: boolean; rows: { sku: string; name: string; onHand: number; journal: number; ok: boolean }[] };
}
const KIND: Record<string, string> = { allocation_received: 'Received (GRN)', sale: 'Sale', customer_return: 'Customer return', damage: 'Damaged', return_to_unite: 'Returned to Unite', transfer_in: 'Transfer in', transfer_out: 'Transfer out', adjustment: 'Adjustment' };

/** Inventory — opening stock allocation and GRN, on-hand stock and valuation, reorder alerts, movements and reconciliation. */
export default function Inventory() {
  const p = usePartner();
  return (
    <Screen page={{ key: 'unite-solar-inventory', title: 'Inventory', access: 'partner' }}>
      <PartnerGate p={p} need={(u) => (u.packageCode === 'store_with_stock' ? null : 'Your plan holds no stock — sales are fulfilled by Unite Solar, so there is no inventory to manage.')}>{(u) => <Stock key={u.id} id={u.id} />}</PartnerGate>
    </Screen>
  );
}

function Stock({ id }: { id: string }) {
  const q = useQuery<Inv>(`/network/units/${id}/inventory`);
  const receive = useMutation(async (aid: string) => { await api.post(`/network/units/${id}/allocations/${aid}/receive`, {}, true); q.reload(); });
  const [m, setM] = useState({ productId: '', kind: 'damage', qty: '1', note: '' });
  const move = useMutation(async () => { await api.post(`/network/units/${id}/inventory/movements`, { ...m, qty: Number(m.qty) }, true); setM({ ...m, qty: '1', note: '' }); q.reload(); });
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Skeleton height={360} />;
  const d = q.data;
  const pending = d.allocations.filter((a) => a.status === 'dispatched');
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <div className="cz-grid cz-grid-4">
        <Kpi label="Stock on hand (partner price)" value={inr(d.valuation.onHand)} />
        <Kpi label="Opening-stock entitlement" value={inr(d.stockEntitlement)} hint={`${inr(d.allocated)} allocated · ${inr(d.remainingAllocation)} remaining`} />
        <Kpi label="Sold (at cost)" value={inr(d.valuation.sold)} />
        <Kpi label="Low-stock items" value={d.items.filter((i) => i.low).length} />
      </div>
      {pending.map((a) => (
        <Alert key={a.id} tone="warning" title={`Stock dispatched — ${a.number}`}>
          Invoice {a.invoiceNumber}: {a.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')} — {inr(a.value)} + GST {inr(a.gst)}. Check the goods and serial numbers, then confirm receipt.
          <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => receive.run(a.id)} loading={receive.pending}>Confirm goods received</Button></div>
        </Alert>
      ))}
      {receive.error && <Alert tone="danger">{receive.error}</Alert>}
      <Alert tone={d.reconciliation.ok ? 'success' : 'danger'} title={d.reconciliation.ok ? 'Stock reconciles' : 'Stock does not reconcile'}>{d.reconciliation.ok ? 'Every product’s movements add up to what is on hand.' : `Check: ${d.reconciliation.rows.filter((r) => !r.ok).map((r) => r.name).join(', ')}`}</Alert>
      <section className="cz-card" aria-label="Stock on hand"><DataTable caption="Stock on hand" rows={d.items.map((i) => ({ ...i, id: i.productId }))} columns={[
        { key: 'n', header: 'Product', render: (i) => <><strong>{i.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{i.sku}</span></> },
        { key: 'q', header: 'On hand', render: (i) => <>{i.qty} {i.low && <StatusBadge status="low" tone="warning" label={`Reorder (≤ ${i.reorderLevel})`} />}</> },
        { key: 'v', header: 'Value', render: (i) => inr(i.value) }, { key: 'p', header: 'Partner / customer price', render: (i) => `${inr(i.partnerPrice)} / ${inr(i.customerPrice)}` },
      ]} /></section>
      <section className="cz-card" aria-label="Record damage or return">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Damage, returns and warranty</h2>
        <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); move.run(); }} noValidate>
          <Select label="Product" value={m.productId} placeholder="Choose" onChange={(e) => setM({ ...m, productId: e.target.value })} options={d.items.map((i) => ({ value: i.productId, label: `${i.name} (${i.qty})` }))} />
          <Select label="What happened" value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value })} options={[{ value: 'damage', label: 'Damaged' }, { value: 'customer_return', label: 'Customer returned it' }, { value: 'return_to_unite', label: 'Returning to Unite (warranty)' }]} />
          <TextInput label="Qty" inputMode="numeric" value={m.qty} onChange={(e) => setM({ ...m, qty: e.target.value.replace(/\D/g, '') })} />
          <TextInput label="Note" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} error={move.fieldErrors.note} />
          <Button type="submit" loading={move.pending} disabled={!m.productId || !m.note}>Record</Button>
        </form>
        {move.error && <Alert tone="danger">{move.error}</Alert>}
      </section>
      <section className="cz-card" aria-label="Stock allocations"><DataTable caption="Stock allocations and invoices" rows={d.allocations} columns={[
        { key: 'n', header: 'Allocation', render: (a) => <><strong>{a.number}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>Invoice {a.invoiceNumber}</span></> },
        { key: 'v', header: 'Value', render: (a) => `${inr(a.value)} + GST ${inr(a.gst)}` }, { key: 'l', header: 'Items', render: (a) => a.lines.map((l) => `${l.qty} × ${l.sku}`).join(', ') },
        { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.status} tone={STATUS_TONE[a.status]} label={a.status === 'received' ? `Received ${a.receivedAt?.slice(0, 10)}` : a.status} /> },
      ]} /></section>
      <section className="cz-card" aria-label="Stock movements"><DataTable caption="Stock movements" rows={d.movements} columns={[
        { key: 'd', header: 'Date', render: (x) => x.createdAt.slice(0, 10) }, { key: 'k', header: 'Movement', render: (x) => KIND[x.kind] ?? x.kind },
        { key: 'p', header: 'Product', render: (x) => x.name }, { key: 'q', header: 'Qty', render: (x) => (x.qty > 0 ? `+${x.qty}` : x.qty) }, { key: 'r', header: 'Reference', render: (x) => <>{x.reference}{x.note ? <><br /><span className="cz-muted" style={{ fontSize: 12 }}>{x.note}</span></> : null}</> },
      ]} /></section>
    </div>
  );
}
