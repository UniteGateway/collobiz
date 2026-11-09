'use client';
import Link from 'next/link';
import { Alert, Button, Card, EmptyState, Icon, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, SourceBanner, WorkspaceNav, rupees } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Books { company: string; receivable: number; payable: number; salesThisMonth: number; purchasesThisMonth: number; overdueInvoices: number }
interface Sync { id: string; sourceId: string; erpName: string | null; status: string; error: string | null; updatedAt: string }
interface Res { source: 'erpnext' | 'sample'; data: Books[]; commission: { waiting: number; waitingAmount: number; posted: number; recent: Sync[] } }

/** Finance & Accounting — books per company from ERPNext, and posting partner commission into them. */
export default function WorkspaceFinance() {
  const q = useQuery<Res>('/admin/finance-books/overview');
  const { me } = useSession();
  const canPost = me?.capabilities?.includes('commission.approve');
  const post = useMutation(async () => { const r = await api.post<{ posted: number; failed: number; considered: number }>('/admin/finance-books/post-commission', {}); q.reload(); return r; });
  const d = q.data;
  const total = (k: keyof Omit<Books, 'company'>) => (d?.data ?? []).reduce((a, b) => a + b[k], 0);
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Finance &" accent="Accounting" sub="Receivables, payables and sales per Unite company from ERPNext — with partner commission from COLLABIZ posted straight into the books." chips={['GST-ready books (India Compliance)', 'Receivables and payables', 'Commission posting', 'Finance access only']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <SourceBanner source={d.source} />
          <div className="cz-ws-kpis">
            {([['value', rupees(total('receivable')), 'To collect', `${total('overdueInvoices')} invoices overdue`], ['earnings', rupees(total('payable')), 'To pay', 'supplier invoices'], ['crm', rupees(total('salesThisMonth')), 'Sales this month', 'invoiced'], ['package', rupees(total('purchasesThisMonth')), 'Purchases this month', 'billed']] as const).map(([icon, v, l, sub]) => (
              <div key={l} className="cz-ws-kpi"><span className="cz-app-icon cz-tint-amber"><Icon name={icon} size={20} /></span><div><strong>{v}</strong><span>{l}</span><small>{sub}</small></div></div>
            ))}
          </div>
          <div className="cz-ws-cols">
            <Card title="By company">
              {!d.data.length ? <EmptyState icon="value" title="No invoices yet">Sales and purchase invoices appear here once they are submitted in ERPNext.</EmptyState> : (
                <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Books by company</caption>
                  <thead><tr><th scope="col">Company</th><th scope="col" style={{ textAlign: 'right' }}>To collect</th><th scope="col" style={{ textAlign: 'right' }}>To pay</th><th scope="col" style={{ textAlign: 'right' }}>Sales this month</th><th scope="col">Overdue</th></tr></thead>
                  <tbody>{d.data.map((b) => <tr key={b.company}><td><strong>{b.company}</strong></td><td style={{ textAlign: 'right' }}>{rupees(b.receivable)}</td><td style={{ textAlign: 'right' }}>{rupees(b.payable)}</td><td style={{ textAlign: 'right' }}>{rupees(b.salesThisMonth)}</td><td>{b.overdueInvoices ? <StatusBadge status="overdue" tone="warning" label={`${b.overdueInvoices} overdue`} /> : '—'}</td></tr>)}</tbody>
                </table></div>
              )}
            </Card>
            <aside className="cz-ws-side">
              <Card title="Partner commission → books">
                <p style={{ marginTop: 0 }}><strong>{d.commission.waiting}</strong> approved line{d.commission.waiting === 1 ? '' : 's'} not yet in the books ({rupees(d.commission.waitingAmount)} payable) · <strong>{d.commission.posted}</strong> posted</p>
                {post.error && <Alert tone="danger">{post.error}</Alert>}
                {post.data && <Alert tone={post.data.failed ? 'warning' : 'success'}>{post.data.posted} posted{post.data.failed ? `, ${post.data.failed} failed — see below` : ''}.</Alert>}
                {d.source !== 'erpnext' ? <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Posting starts once ERPNext is connected and your CA has chosen the accounts.</p>
                  : canPost ? <Button loading={post.pending} disabled={!d.commission.waiting} onClick={() => post.run()}>Post approved commission to ERPNext</Button>
                  : <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>A finance approver posts commission to the books.</p>}
                {d.commission.recent.length > 0 && (
                  <ul className="cz-ws-list" style={{ marginTop: 12 }}>{d.commission.recent.map((r) => <li key={r.id} style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 13 }}>{r.erpName ?? 'Not posted'}{r.error ? <><br /><span className="cz-muted">{r.error}</span></> : null}</span><StatusBadge status={r.status} tone={r.status === 'posted' ? 'success' : 'danger'} label={r.status === 'posted' ? 'Posted' : 'Failed'} /></li>)}</ul>
                )}
                <p className="cz-muted" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Approvals and payouts stay in <Link href="/finance">Settlements</Link>. Each line is posted once as a journal entry: commission expense and input GST against partner payable and TDS payable.</p>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
