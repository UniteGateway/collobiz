'use client';
import { Alert, Button, Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, SourceBanner, WorkspaceNav, rupees, shortDate } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Row { item: string; itemName: string; warehouse: string; qty: number; projected: number; reserved: number; value: number; uom: string }
interface Res { source: 'erpnext' | 'sample'; data: { itemsInStock: number; stockValue: number; dispatchesToBill: number; warehouses: { warehouse: string; items: number; value: number }[]; reorder: Row[]; stock: Row[]; movements: { id: string; type: string; date: string; company: string; value: number; status: string }[]; dispatches: { id: string; customer: string; date: string; status: string; transporter: string | null; vehicle: string | null; lrNo: string | null; company: string; amount: number }[] } }

/** Inventory & Stores — stock, reorders, movements and dispatches from ERPNext; send the COLLABIZ catalogue to ERPNext as items. */
export default function WorkspaceInventory() {
  const q = useQuery<Res>('/admin/inventory/overview');
  const sync = useMutation(async () => api.post<{ created: number; linked: number; failed: number; considered: number }>('/admin/erp/items/sync', {}));
  const d = q.data?.data;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Inventory &" accent="Stores" sub="Stock in every warehouse, what needs reordering, stock movements and dispatches with transporter details — kept in ERPNext." chips={['Stock by warehouse', 'Reorder alerts', 'Stock movements', 'Dispatches and e-way details']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data || !d ? <LoadingState /> : (
        <>
          <SourceBanner source={q.data.source} />
          <KpiRow tint="amber" items={[['package', d.itemsInStock, 'Items in stock', `${d.warehouses.length} warehouses`], ['value', rupees(d.stockValue), 'Stock value', 'at valuation rate'], ['warning', d.reorder.length, 'To reorder', 'projected stock at or below zero'], ['map', d.dispatches.length, 'Recent dispatches', `${d.dispatchesToBill} still to bill`]]} />
          <div className="cz-ws-cols">
            <div className="cz-ws">
              <Card title="Needs reordering">
                {!d.reorder.length ? <EmptyState icon="check" title="Nothing to reorder" /> : (
                  <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Items to reorder</caption>
                    <thead><tr><th scope="col">Item</th><th scope="col">Warehouse</th><th scope="col" style={{ textAlign: 'right' }}>In stock</th><th scope="col" style={{ textAlign: 'right' }}>Reserved</th><th scope="col" style={{ textAlign: 'right' }}>Projected</th></tr></thead>
                    <tbody>{d.reorder.map((r) => <tr key={`${r.item}|${r.warehouse}`}><td><strong>{r.itemName}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.item}</span></td><td>{r.warehouse}</td><td style={{ textAlign: 'right' }}>{r.qty}</td><td style={{ textAlign: 'right' }}>{r.reserved}</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#B3261E' }}>{r.projected} {r.uom}</td></tr>)}</tbody>
                  </table></div>
                )}
              </Card>
              <Card title="Dispatches">
                {!d.dispatches.length ? <EmptyState icon="map" title="No dispatches yet" /> : (
                  <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Dispatches</caption>
                    <thead><tr><th scope="col">Delivery note</th><th scope="col">Customer</th><th scope="col">Transport</th><th scope="col" style={{ textAlign: 'right' }}>Value</th><th scope="col">Status</th></tr></thead>
                    <tbody>{d.dispatches.map((x) => <tr key={x.id}><td>{x.id}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{shortDate(x.date)} · {x.company}</span></td><td>{x.customer}</td><td>{x.transporter ? <>{x.transporter}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{[x.vehicle, x.lrNo].filter(Boolean).join(' · ')}</span></> : <span className="cz-muted">Not assigned</span>}</td><td style={{ textAlign: 'right' }}>{rupees(x.amount)}</td><td><StatusBadge status={x.status === 'Completed' ? 'completed' : 'pending'} tone={x.status === 'Completed' ? 'success' : 'warning'} label={x.status} /></td></tr>)}</tbody>
                  </table></div>
                )}
              </Card>
            </div>
            <aside className="cz-ws-side">
              <Card title="Warehouses">
                <ul className="cz-ws-list">{d.warehouses.map((w) => <li key={w.warehouse} style={{ alignItems: 'flex-start' }}><span>{w.warehouse}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{w.items} items in stock</span></span><strong style={{ color: 'var(--cz-navy-900)' }}>{rupees(w.value)}</strong></li>)}</ul>
              </Card>
              <Card title="Recent stock movements">
                {!d.movements.length ? <p className="cz-muted" style={{ margin: 0 }}>No movements yet.</p> : <ul className="cz-ws-list">{d.movements.map((m) => <li key={m.id} style={{ alignItems: 'flex-start' }}><span>{m.type}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{m.id} · {shortDate(m.date)} · {m.company}</span></span><span style={{ fontWeight: 600 }}>{rupees(m.value)}</span></li>)}</ul>}
              </Card>
              <Card title="Product list in ERPNext">
                <p className="cz-muted" style={{ marginTop: 0, fontSize: 13.5 }}>Send the published products of all Unite companies (including the 360 Powertek products) to ERPNext as items. Each product is created once; existing items are linked, never duplicated.</p>
                {sync.error && <Alert tone="danger">{sync.error}</Alert>}
                {sync.data && <Alert tone={sync.data.failed ? 'warning' : 'success'}>{sync.data.created} created, {sync.data.linked} already in ERPNext{sync.data.failed ? `, ${sync.data.failed} failed` : ''}.</Alert>}
                {q.data.source === 'erpnext' ? <Button loading={sync.pending} onClick={() => sync.run()}>Send catalogue to ERPNext</Button> : <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Available once ERPNext is connected.</p>}
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
