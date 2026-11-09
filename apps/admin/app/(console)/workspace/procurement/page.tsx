'use client';
import { useState } from 'react';
import { Card, EmptyState, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, SourceBanner, WorkspaceNav, rupees, shortDate, webUrl } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface PO { id: string; supplier: string; date: string; due: string | null; amount: number; received: number; status: string; company: string }
interface Res { source: 'erpnext' | 'sample'; data: { openOrders: number; openValue: number; lateDeliveries: number; openMaterialRequests: number; purchaseOrders: PO[] } }

/** Procurement — purchase orders and material requests from ERPNext; partner RFQs stay in the trading marketplace. */
export default function WorkspaceProcurement() {
  const q = useQuery<Res>('/admin/procurement/overview');
  const [f, setF] = useState('open');
  const d = q.data?.data;
  const today = new Date().toISOString().slice(0, 10);
  const list = (d?.purchaseOrders ?? []).filter((p) => f === 'all' || (f === 'late' ? p.received < 100 && !!p.due && p.due < today && !['Completed', 'Closed', 'Cancelled'].includes(p.status) : !['Completed', 'Closed', 'Cancelled'].includes(p.status)));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Procurement" sub="Purchase orders, deliveries and material requests across the group — raised and received in ERPNext. Quotations from partners come through the trading marketplace." chips={['Purchase orders', 'Late deliveries', 'Material requests', 'Supplier quotations']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data || !d ? <LoadingState /> : (
        <>
          <SourceBanner source={q.data.source} />
          <KpiRow tint="violet" items={[['package', d.openOrders, 'Open purchase orders', rupees(d.openValue)], ['warning', d.lateDeliveries, 'Late deliveries', 'past the expected date'], ['documents', d.openMaterialRequests, 'Material requests', 'waiting to be ordered']]} />
          <Card>
            <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}><h2>Purchase orders</h2><div className="cz-ws-scroll"><Segmented label="Show" value={f} onChange={setF} options={[{ value: 'open', label: 'Open' }, { value: 'late', label: `Late ${d.lateDeliveries}` }, { value: 'all', label: 'All' }]} /></div></div>
            {!list.length ? <EmptyState icon="check" title="No purchase orders here" /> : (
              <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Purchase orders</caption>
                <thead><tr><th scope="col">Order</th><th scope="col">Supplier</th><th scope="col" style={{ textAlign: 'right' }}>Value</th><th scope="col">Received</th><th scope="col">Expected</th><th scope="col">Status</th></tr></thead>
                <tbody>{list.map((p) => {
                  const late = p.received < 100 && !!p.due && p.due < today && !['Completed', 'Closed', 'Cancelled'].includes(p.status);
                  return <tr key={p.id}><td>{p.id}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{shortDate(p.date)} · {p.company}</span></td><td>{p.supplier}</td><td style={{ textAlign: 'right' }}>{rupees(p.amount)}</td><td>{p.received}%</td><td style={late ? { color: '#B3261E', fontWeight: 600 } : undefined}>{shortDate(p.due)}{late ? ' · late' : ''}</td><td><StatusBadge status={p.status === 'Completed' ? 'completed' : 'open'} tone={p.status === 'Completed' ? 'success' : 'info'} label={p.status} /></td></tr>;
                })}</tbody>
              </table></div>
            )}
            <p className="cz-muted" style={{ margin: '12px 0 0', fontSize: 13 }}>Need quotes from partners first? Post a requirement in the <a href={webUrl('/trading')}>trading marketplace</a>.</p>
          </Card>
        </>
      )}
    </div>
  );
}
