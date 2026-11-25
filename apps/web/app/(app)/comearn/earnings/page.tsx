'use client';
import Link from 'next/link';
import { Card, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, rupees } from '@/components/Comearn';
import { useQuery } from '@/lib/hooks';

interface E { comearn: { id: string; engagementId: string; opportunity: string; payer: string; grossPaise: number; tdsPaise: number; netPaise: number; status: string; dueOn: string | null; paidAt: string | null; paymentReference: string | null }[]; uniteLedger: { status: string; payablePaise: number }[] }
const STATUS: Record<string, string> = { pending_approval: 'Awaiting approval', approved: 'Approved', paid: 'Paid', disputed: 'In dispute', cancelled: 'Cancelled' };

/** Commission ledger: COMEARN commissions paid by companies, plus the existing Unite commission ledger, side by side. */
export default function ComearnEarnings() {
  const q = useQuery<E>('/comearn/earnings');
  const d = q.data;
  const sum = (s: string[]) => d?.comearn.filter((c) => s.includes(c.status)).reduce((a, c) => a + (s.includes('paid') ? c.netPaise : c.grossPaise), 0) ?? 0;
  return (
    <Screen page={{ key: 'comearn-earnings', title: 'COMEARN earnings', access: 'partner' }} header={false}>
      <CeHeader title="Earnings" lead="What you earned, what is pending and the tax deducted — from COMEARN and from Unite programmes." />
      <CeNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={260} /> : (
        <>
          <section className="ce-stats">
            <div className="ce-stat ce-stat-main"><span>Received (COMEARN)</span><strong>{rupees(sum(['paid']))}</strong><small>Net of tax deducted</small></div>
            <div className="ce-stat"><span>Pending</span><strong>{rupees(sum(['pending_approval', 'approved']))}</strong></div>
            <div className="ce-stat"><span>In dispute</span><strong>{rupees(sum(['disputed']))}</strong></div>
          </section>
          <Card title="COMEARN commissions" subtitle="Paid by the company that posted each opportunity.">
            {d.comearn.length ? <div className="vai-scroll"><table className="vai-table"><thead><tr><th>Opportunity</th><th>Paid by</th><th>Commission</th><th>Tax deducted</th><th>Net</th><th>Status</th><th>Due / paid</th></tr></thead>
              <tbody>{d.comearn.map((c) => <tr key={c.id}><td><Link href={`/comearn/engagements/${c.engagementId}`}>{c.opportunity}</Link></td><td>{c.payer}</td><td>{rupees(c.grossPaise)}</td><td>{rupees(c.tdsPaise)}</td><td><strong>{rupees(c.netPaise)}</strong></td><td>{STATUS[c.status] ?? c.status}</td><td>{c.paidAt ? `${new Date(c.paidAt).toLocaleDateString('en-IN')} · ${c.paymentReference}` : c.dueOn ?? '—'}</td></tr>)}</tbody></table></div>
              : <EmptyState icon="coins" title="No COMEARN commissions yet">They appear here when a company verifies a customer payment on your lead.</EmptyState>}
          </Card>
          <Card title="Unite programme commissions" subtitle="From direct offers, Unite Solar, product sales and projects — settled by Unite finance." actions={<Link href="/earnings">Open Earnings →</Link>}>
            {d.uniteLedger.length ? <ul className="vai-list">{d.uniteLedger.map((u) => <li key={u.status}><span>{u.status.replace(/_/g, ' ')}</span><strong>{rupees(u.payablePaise)}</strong></li>)}</ul> : <p className="ce-muted">Nothing in the Unite commission ledger yet.</p>}
          </Card>
        </>
      )}
    </Screen>
  );
}
