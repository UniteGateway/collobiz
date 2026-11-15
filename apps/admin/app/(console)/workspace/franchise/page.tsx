'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FRANCHISE_FORMAT_LABELS, FRANCHISE_STATUS_LABELS, STATEMENT_STATUS_LABELS } from '@collabiz/types';
import { Alert, Card, EmptyState, Kpi, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav } from '@/components/Workspace';
import { Bars, STATEMENT_TONE, UNIT_TONE, monthShort, rupees } from '@/components/Franchise';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const PIPE = ['applied', 'approved', 'agreement_signed', 'setup'];

/** Franchisor dashboard — network sales, royalty billed and collected, pipeline, renewals and actions waiting for Unite. */
export default function FranchiseNetwork() {
  const q = useQuery<R>('/admin/franchise/dashboard');
  const brands = useQuery<{ brands: { id: string; name: string; open: boolean }[] }>('/admin/franchise');
  const [f, setF] = useState('all');
  const toggle = useMutation(async (b: { id: string; open: boolean }) => { await api.request('PATCH', `/admin/franchise/brands/${b.id}`, { open: !b.open }); brands.reload(); return true; });
  const d = q.data, t = d?.totals;
  const list = (d?.units ?? []).filter((u: R) => (f === 'pipeline' ? PIPE.includes(u.status) : f === 'live' ? ['live', 'suspended'].includes(u.status) : f === 'attention' ? u.flags.length > 0 || u.openPurchaseOrders > 0 : true));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Franchise" accent="network" sub="Every Unite brand franchise in one place — pipeline, agreements, sales against target, orders, and royalty from billing to collection." chips={['Pipeline', 'Agreements', 'Sales & orders', 'Royalty', 'Renewals']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-fr-kpis">
            <Kpi label="Live franchises" value={t.live} hint={`${t.cities} cities · ${t.pipeline} in the pipeline`} accent />
            <Kpi label="Network sales last month" value={rupees(t.salesLastMonth)} hint="net of GST" />
            <Kpi label="Sales this financial year" value={rupees(t.salesYtd)} hint={`${t.ordersMtd} customer orders this month`} />
            <Kpi label="Royalty billed this FY" value={rupees(t.royaltyBilledYtd)} hint={`collected ${rupees(t.royaltyCollectedYtd)}`} />
            <Kpi label="Royalty to invoice" value={rupees(t.royaltyToInvoice)} hint={t.royaltyOverdue ? `${rupees(t.royaltyOverdue)} overdue` : 'nothing overdue'} />
            <Kpi label="Stock sold to franchisees" value={rupees(t.purchaseValueYtd)} hint={`${t.purchaseOrdersToConfirm} purchase orders to confirm`} />
            <Kpi label="Disputes" value={t.disputes} hint="royalty statements" />
            <Kpi label="Renewals" value={t.renewalsDue} hint="due within 90 days or expired" />
          </div>
          <div className="cz-ws-cols">
            <div className="cz-ws">
              <Card title="Network sales by month" subtitle="Net of GST, all franchises">
                <Bars label="Network sales" data={d.series.map((s: R) => ({ key: s.month, label: monthShort(s.month), value: s.sales }))} />
              </Card>
              <Card>
                <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}><h2>Franchises</h2><div className="cz-ws-scroll"><Segmented label="Show" value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'live', label: `Live ${t.live}` }, { value: 'pipeline', label: `Pipeline ${t.pipeline}` }, { value: 'attention', label: 'Needs attention' }]} /></div></div>
                {!list.length ? <EmptyState icon="location" title="No franchises here" /> : (
                  <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Franchises</caption>
                    <thead><tr><th scope="col">Franchise</th><th scope="col">Status</th><th scope="col" style={{ textAlign: 'right' }}>Last month</th><th scope="col" style={{ textAlign: 'right' }}>vs target</th><th scope="col" style={{ textAlign: 'right' }}>This FY</th><th scope="col" style={{ textAlign: 'right' }}>Royalty outstanding</th><th scope="col">Attention</th></tr></thead>
                    <tbody>{list.map((u: R) => (
                      <tr key={u.id} data-unit={u.city}>
                        <td><Link href={`/workspace/franchise/${u.id}`}><strong>{u.brand} — {u.city}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{u.franchisee} · {FRANCHISE_FORMAT_LABELS[u.format]} · {u.code}</span></td>
                        <td><StatusBadge status={u.status} tone={UNIT_TONE[u.status]} label={FRANCHISE_STATUS_LABELS[u.status]} /></td>
                        <td style={{ textAlign: 'right' }}>{rupees(u.lastMonthSales)}</td><td style={{ textAlign: 'right' }}>{u.targetPct == null ? '—' : `${Math.round(u.targetPct * 100)}%`}</td><td style={{ textAlign: 'right' }}>{rupees(u.salesYtd)}</td><td style={{ textAlign: 'right' }}>{rupees(u.royaltyOutstanding)}</td>
                        <td style={{ fontSize: 12.5 }}>{[...u.flags.map((x: R) => x.label), ...(u.openPurchaseOrders ? [`${u.openPurchaseOrders} PO to confirm`] : [])].join(' · ') || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </Card>
            </div>
            <aside className="cz-ws-side">
              <Card title="Royalty to act on">
                {!d.statementsToAct.length ? <p className="cz-muted" style={{ margin: 0 }}>Nothing waiting.</p> : <ul className="cz-ws-list">{d.statementsToAct.map((s: R) => <li key={s.id}><Link href={`/workspace/franchise/${s.unitId}`}>{s.city} · {monthShort(s.month)}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{rupees(s.total)}</span></Link><StatusBadge status={s.status} tone={STATEMENT_TONE[s.status]} label={STATEMENT_STATUS_LABELS[s.status]} /></li>)}</ul>}
              </Card>
              <Card title="Purchase orders">
                {!d.purchaseOrders.length ? <p className="cz-muted" style={{ margin: 0 }}>No open purchase orders.</p> : <ul className="cz-ws-list">{d.purchaseOrders.map((o: R) => <li key={o.id}><Link href={`/workspace/franchise/${o.unitId}`}>{o.number}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{o.city} · {rupees(o.total)}</span></Link><StatusBadge status={o.status} label={o.status === 'placed' ? 'To confirm' : 'To dispatch'} tone="warning" /></li>)}</ul>}
              </Card>
              <Card title="Brands open to franchising">
                {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
                <ul className="cz-ws-list">{(brands.data?.brands ?? []).map((b) => <li key={b.id}><span>{b.name}</span><button type="button" role="switch" aria-checked={b.open} aria-label={`${b.name} takes franchise applications`} className="cz-switch" data-on={b.open || undefined} onClick={() => toggle.run(b)}><span /></button></li>)}</ul>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
