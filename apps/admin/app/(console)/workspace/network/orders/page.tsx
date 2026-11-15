'use client';
import { useState } from 'react';
import { Alert, Button, DataTable, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE, inr } from '@/components/Network';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;

/** Orders & stock — orders raised for Unite to fulfil (dispatch, install, payment verification) and stock sales by stores. */
export default function Orders() {
  const q = useQuery<R[]>('/admin/network/orders');
  const [f, setF] = useState('unite');
  const ful = useMutation(async (o: R, status: string) => { await api.post(`/admin/network/orders/${o.id}/fulfilment`, { status }); q.reload(); });
  const pay = useMutation(async (o: R) => { const reference = window.prompt(`Payment reference for ${o.number} (${inr(o.total)})`); if (!reference) return; await api.post(`/admin/network/orders/${o.id}/payment-verified`, { reference }); q.reload(); });
  const rows = (q.data ?? []).filter((o) => (f === 'unite' ? o.fulfilment === 'unite' : f === 'stock' ? o.fulfilment === 'from_stock' : true));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 12px' }}>Orders & stock</h1>
      <NetworkTabs />
      <Segmented label="Show" value={f} onChange={setF} options={[{ value: 'unite', label: 'Unite to fulfil' }, { value: 'stock', label: 'Sold from store stock' }, { value: 'all', label: 'All' }]} />
      {(ful.error || pay.error) && <Alert tone="danger">{ful.error ?? pay.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <section className="cz-card" style={{ marginTop: 12 }}><DataTable caption="Orders" rows={rows} columns={[
          { key: 'n', header: 'Order', render: (o: R) => <><strong>{o.number}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{o.orderDate} · {o.partner} ({o.unitCode})</span></> },
          { key: 'c', header: 'Customer', render: (o: R) => `${o.customerName} · PIN ${o.pincode ?? '—'}` },
          { key: 'i', header: 'Items', render: (o: R) => o.lines.map((l: R) => `${l.qty} × ${l.item}`).join(', ') },
          { key: 'v', header: 'Total', render: (o: R) => inr(o.total) },
          { key: 'f', header: 'Fulfilment', render: (o: R) => (o.fulfilment === 'from_stock' ? 'Store stock' : <StatusBadge status={o.fulfilmentStatus} tone={TONE[o.fulfilmentStatus]} label={o.fulfilmentStatus} />) },
          { key: 'p', header: 'Payment', render: (o: R) => (o.fulfilment === 'from_stock' ? 'Collected by store' : o.paymentVerified ? <StatusBadge status="verified" tone="success" label="Verified" /> : <StatusBadge status="pending" tone="warning" label="Not verified" />) },
          { key: 'a', header: '', render: (o: R) => o.fulfilment !== 'unite' || o.status === 'cancelled' ? null : <div className="cz-row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {o.fulfilmentStatus === 'requested' && <Button size="sm" onClick={() => ful.run(o, 'dispatched')}>Mark dispatched</Button>}
            {o.fulfilmentStatus === 'dispatched' && <Button size="sm" onClick={() => ful.run(o, 'installed')}>Mark installed</Button>}
            {!o.paymentVerified && <Button size="sm" variant="secondary" onClick={() => pay.run(o)}>Verify payment</Button>}
          </div> },
        ]} /></section>
      )}
    </div>
  );
}
