'use client';
import { Card, EmptyState, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { useState } from 'react';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, SourceBanner, WorkspaceNav, shortDate } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface WO { id: string; item: string; itemName: string; qty: number; produced: number; status: string; start: string | null; due: string | null; company: string }
interface Res { source: 'erpnext' | 'sample'; data: { boms: number; inProcess: number; notStarted: number; completed: number; overdue: number; unitsPlanned: number; unitsProduced: number; workOrders: WO[] } }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { Completed: 'success', 'In Process': 'info', 'Not Started': 'warning' };

/** Manufacturing — Powertek work orders, progress and bills of materials from ERPNext. */
export default function WorkspaceManufacturing() {
  const q = useQuery<Res>('/admin/manufacturing/overview');
  const [f, setF] = useState('open');
  const d = q.data?.data;
  const today = new Date().toISOString().slice(0, 10);
  const list = (d?.workOrders ?? []).filter((w) => (f === 'open' ? !['Completed', 'Stopped', 'Closed', 'Cancelled'].includes(w.status) : f === 'late' ? w.status !== 'Completed' && !!w.due && w.due < today : true));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Manufacturing" sub="Work orders, production progress and bills of materials for Unite Powertek's transformers, panels, switchgear and storage — planned and recorded in ERPNext." chips={['Work orders', 'Production progress', 'Bills of materials', 'Late-order alerts']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data || !d ? <LoadingState /> : (
        <>
          <SourceBanner source={q.data.source} />
          <KpiRow tint="red" items={[['sector', d.inProcess, 'In production', `${d.notStarted} not started`], ['check', d.completed, 'Completed', 'work orders'], ['warning', d.overdue, 'Running late', 'past due date'], ['package', `${d.unitsProduced} / ${d.unitsPlanned}`, 'Units produced', 'on open work orders'], ['documents', d.boms, 'Bills of materials', 'active']]} />
          <Card>
            <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}><h2>Work orders</h2><div className="cz-ws-scroll"><Segmented label="Show" value={f} onChange={setF} options={[{ value: 'open', label: 'Open' }, { value: 'late', label: `Late ${d.overdue}` }, { value: 'all', label: 'All' }]} /></div></div>
            {!list.length ? <EmptyState icon="check" title="No work orders here" /> : (
              <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Work orders</caption>
                <thead><tr><th scope="col">Work order</th><th scope="col">Product</th><th scope="col">Progress</th><th scope="col">Due</th><th scope="col">Status</th></tr></thead>
                <tbody>{list.map((w) => {
                  const pct = w.qty ? Math.round((w.produced / w.qty) * 100) : 0;
                  const late = w.status !== 'Completed' && !!w.due && w.due < today;
                  return (
                    <tr key={w.id}><td>{w.id}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{w.company} · from {shortDate(w.start)}</span></td><td><strong>{w.itemName}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{w.item}</span></td>
                      <td style={{ minWidth: 150 }}><div className="cz-progress-row"><span className="cz-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${w.itemName} progress`}><i style={{ width: `${pct}%` }} /></span><span>{w.produced}/{w.qty}</span></div></td>
                      <td style={late ? { color: '#B3261E', fontWeight: 600 } : undefined}>{shortDate(w.due)}{late ? ' · late' : ''}</td><td><StatusBadge status={w.status.toLowerCase().replace(/ /g, '_')} tone={TONE[w.status] ?? 'neutral'} label={w.status} /></td></tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
