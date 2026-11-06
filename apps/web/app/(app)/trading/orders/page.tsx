'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, DescriptionList, EmptyState, LoadingState, StatusBadge, Tabs, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inr, TradingTabs, when } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

export default function OrdersPage() {
  return <Suspense fallback={<LoadingState />}><Orders /></Suspense>;
}

/** Screen 091 — Order Fulfillment Dashboard (buyer and supplier views, append-only order history). */
function Orders() {
  const params = useSearchParams();
  const [side, setSide] = useState('all');
  const [sel, setSel] = useState<string | null>(params.get('id'));
  const list = useQuery<any[]>('/trading/purchase-orders', side === 'all' ? undefined : { side });
  const po = useQuery<any>(sel ? `/trading/purchase-orders/${sel}` : null);
  const [reason, setReason] = useState('');
  const done = <T,>(r: T) => { po.reload(); list.reload(); setReason(''); return r; };
  const act = useMutation(async (a: string) => done(a === 'issue' ? await api.request('POST', `/trading/purchase-orders/${sel}/issue`, undefined, { idempotencyKey: newIdempotencyKey() }) : await api.post(`/trading/purchase-orders/${sel}/${a}`, a === 'cancel' ? { reason } : {})));
  const o = po.data;
  return (
    <Screen id="091">
      <TradingTabs />
      <Tabs value={side} onChange={setSide} tabs={[{ value: 'all', label: 'All orders' }, { value: 'buyer', label: 'Purchases' }, { value: 'supplier', label: 'Sales' }]} />
      <Card>
        {list.loading ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : (
          <DataTable caption="Purchase orders" rows={list.data ?? []} empty={<EmptyState title="No orders yet" />} columns={[
            { key: 'number', header: 'Order', render: (x: any) => <Button size="sm" variant="ghost" onClick={() => setSel(x.id)} aria-label={`Open ${x.number}`}>{x.number}</Button> },
            { key: 'side', header: 'Side', render: (x: any) => <StatusBadge status={x.side === 'buyer' ? 'purchase' : 'sale'} tone="brand" /> },
            { key: 'party', header: 'With', render: (x: any) => (x.side === 'buyer' ? x.supplier : x.buyer) },
            { key: 'total', header: 'Total', render: (x: any) => inr(x.total) },
            { key: 'deliveryBy', header: 'Deliver by', render: (x: any) => <>{when(x.deliveryBy)}{x.late && <> <StatusBadge status="late" tone="danger" label="Late" /></>}</> },
            { key: 'status', header: 'Status', render: (x: any) => <>{<StatusBadge status={x.status} />}{x.openClaims > 0 && <> <StatusBadge status="claims" tone="warning" label={`${x.openClaims} open claim(s)`} /></>}</> },
          ]} />
        )}
      </Card>
      {sel && (po.loading ? <LoadingState /> : po.error ? <ApiErrorView error={po.error} onRetry={po.reload} /> : o && (
        <Card title={`Order ${o.number}`} actions={<StatusBadge status={o.status} />}>
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          <DescriptionList items={[['Buyer', o.buyer], ['Supplier', o.supplier], ['Deliver to', o.deliveryAddress], ['Deliver by', when(o.deliveryBy)], ['Payment terms', o.paymentTerms], ['Subtotal', inr(o.subtotal)], [`Tax (${o.taxPct}%)`, inr(o.total - o.subtotal)], ['Total', inr(o.total)], ...(o.cancelReason ? [['Cancellation', o.cancelReason] as [string, React.ReactNode]] : [])]} />
          <DataTable caption="Order lines" rows={o.lines.map((l: any, i: number) => ({ ...l, id: String(i) }))} columns={[{ key: 'item', header: 'Item' }, { key: 'quantity', header: 'Qty', render: (l: any) => `${l.quantity} ${l.unit}` }, { key: 'unitPrice', header: 'Unit price', render: (l: any) => inr(l.unitPrice) }, { key: 'amount', header: 'Amount', render: (l: any) => inr(Math.round(l.quantity * l.unitPrice)) }]} />
          <div className="cz-row" style={{ alignItems: 'flex-end', margin: '12px 0' }}>
            {o.side === 'buyer' && o.status === 'draft' && <Button onClick={() => act.run('issue')} loading={act.pending}>Issue order</Button>}
            {o.side === 'supplier' && o.status === 'issued' && <Button onClick={() => act.run('accept')} loading={act.pending}>Accept order</Button>}
            {o.side === 'supplier' && o.status === 'accepted' && <Button onClick={() => act.run('start')} loading={act.pending}>Start fulfilment</Button>}
            {['in_fulfilment', 'shipped', 'delivered'].includes(o.status) && <Link href={`/trading/orders/${o.id}/shipping`}>Shipping & receipt →</Link>}
            {o.side === 'buyer' && o.status === 'delivered' && <Button variant="secondary" onClick={() => act.run('close')} loading={act.pending}>Close order</Button>}
            {((o.side === 'buyer' && ['draft', 'issued', 'accepted'].includes(o.status)) || (o.side === 'supplier' && o.status === 'issued')) && (
              <>
                <TextInput label={o.side === 'buyer' ? 'Cancellation reason' : 'Reason for declining'} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button variant="danger" onClick={() => act.run('cancel')} disabled={reason.trim().length < 5} loading={act.pending}>{o.side === 'buyer' ? 'Cancel order' : 'Decline order'}</Button>
              </>
            )}
          </div>
          <h3>Order history</h3>
          <Timeline items={o.history.map((h: any) => ({ id: h.id, at: h.createdAt, title: `${h.action.replace(/^po\./, '').replace(/_/g, ' ')} — ${h.org}`, detail: [h.note, h.who].filter(Boolean).join(' · ') }))} />
        </Card>
      ))}
    </Screen>
  );
}
