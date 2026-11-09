'use client';
import { Card, EmptyState, LoadingState } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, SourceBanner, WorkspaceNav, rupees, shortDate } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Res { source: 'erpnext' | 'sample'; data: { todayBills: number; todayAmount: number; monthBills: number; monthAmount: number; stores: { store: string; bills: number; amount: number; today: number }[]; recent: { id: string; date: string; customer: string; store: string; amount: number }[] } }

/** Retail POS — store and franchise counter sales from ERPNext POS. */
export default function WorkspacePos() {
  const q = useQuery<Res>('/admin/pos/overview');
  const d = q.data?.data;
  const max = Math.max(1, ...(d?.stores.map((s) => s.amount) ?? [1]));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Retail" accent="POS" sub="Counter sales at Unite experience centres and franchise stores — billed in ERPNext POS, seen here store by store." chips={['Today and this month', 'Sales by store', 'Recent bills', 'GST invoices in ERPNext']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data || !d ? <LoadingState /> : (
        <>
          <SourceBanner source={q.data.source} />
          <KpiRow tint="slate" items={[['value', rupees(d.todayAmount), 'Sales today', `${d.todayBills} bills`], ['crm', rupees(d.monthAmount), 'Sales this month', `${d.monthBills} bills`], ['location', d.stores.length, 'Stores selling', 'this month']]} />
          <div className="cz-ws-cols">
            <Card title="By store — this month">
              {!d.stores.length ? <EmptyState icon="location" title="No store sales this month" /> : (
                <div className="cz-stack" style={{ gap: 10 }}>{d.stores.map((s) => (
                  <div key={s.store} className="cz-pilot-bar" style={{ gridTemplateColumns: 'minmax(140px, 240px) 1fr auto' }}>
                    <span><strong style={{ color: 'var(--cz-navy-900)' }}>{s.store}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{s.bills} bills · today {rupees(s.today)}</span></span>
                    <span><i style={{ width: `${(s.amount / max) * 100}%` }} /></span><span style={{ fontWeight: 600 }}>{rupees(s.amount)}</span>
                  </div>
                ))}</div>
              )}
            </Card>
            <aside className="cz-ws-side">
              <Card title="Recent bills">
                {!d.recent.length ? <p className="cz-muted" style={{ margin: 0 }}>No bills yet.</p> : <ul className="cz-ws-list">{d.recent.map((r) => <li key={r.id} style={{ alignItems: 'flex-start' }}><span>{r.store}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.id} · {shortDate(r.date)} · {r.customer}</span></span><strong style={{ color: 'var(--cz-navy-900)' }}>{rupees(r.amount)}</strong></li>)}</ul>}
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
