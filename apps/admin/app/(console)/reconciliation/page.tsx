'use client';
import Link from 'next/link';
import { PAYMENT_STATE_LABELS } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, PageHeader, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
interface Inv { id: string; number: string; project: string; projectId: string; issuer: string; payer: string; amount: number; received: number; outstanding: number; dueDate: string | null; overdueDays: number; status: string; awaitingConfirmation: number; reported: { id: string; amount: number; reference: string; receivedAt: string }[] }
interface R { canConfirm: boolean; totals: { invoiced: number; received: number; outstanding: number; overdue: number; overdueCount: number; awaitingConfirmation: number }; invoices: Inv[]; remindersSent: number }

/** Payment reconciliation (extends 138 Settlements): project invoices against receipts recorded by the paying side, with overdue follow-up. */
export default function Reconciliation() {
  const q = useQuery<R>('/finance/reconciliation');
  const d = q.data;
  const confirm = useMutation(async (rid: string) => { await api.post(`/payment-receipts/${rid}/confirm`, {}); q.reload(); return true; });
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Payment reconciliation" breadcrumb="Finance" description="Project invoices against the payments recorded for them. Money moves between the parties’ own bank accounts — COLLABIZ does not hold funds." />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            <div className="cz-figure"><span>Invoiced</span><strong>{rupees(d.totals.invoiced)}</strong></div>
            <div className="cz-figure"><span>Received</span><strong className="cz-good">{rupees(d.totals.received)}</strong>{d.totals.awaitingConfirmation > 0 && <small>+ {rupees(d.totals.awaitingConfirmation)} reported, awaiting confirmation</small>}</div>
            <div className="cz-figure"><span>Outstanding</span><strong>{rupees(d.totals.outstanding)}</strong></div>
            <div className="cz-figure"><span>Overdue</span><strong style={{ color: d.totals.overdue ? 'var(--cz-danger)' : undefined }}>{rupees(d.totals.overdue)}</strong><small>{d.totals.overdueCount} {d.totals.overdueCount === 1 ? 'invoice' : 'invoices'}</small></div>
          </div>
          {confirm.error && <Alert tone="danger">{confirm.error}</Alert>}
          {d.remindersSent > 0 && <Alert tone="info">{d.remindersSent} overdue reminder{d.remindersSent > 1 ? 's' : ''} sent to payers just now (at most one a week per invoice).</Alert>}
          <Card>{!d.invoices.length ? <EmptyState icon="earnings" title="No project invoices" /> : (
            <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Project invoices and receipts</caption>
              <thead><tr><th scope="col">Invoice</th><th scope="col">Project</th><th scope="col">From → payer</th><th scope="col" style={{ textAlign: 'right' }}>Amount</th><th scope="col" style={{ textAlign: 'right' }}>Received</th><th scope="col" style={{ textAlign: 'right' }}>Outstanding</th><th scope="col">Due</th><th scope="col">State</th></tr></thead>
              <tbody>{d.invoices.map((i) => (
                <tr key={i.id} data-invoice={i.number}><td data-label="Invoice"><strong>{i.number}</strong></td><td data-label="Project">{i.project}</td><td data-label="Parties">{i.issuer} → {i.payer}</td>
                  <td data-label="Amount" style={{ textAlign: 'right' }}>{rupees(i.amount)}</td><td data-label="Received" style={{ textAlign: 'right' }}>{rupees(i.received)}{i.reported.map((x) => <span key={x.id} data-reported={x.reference} style={{ display: 'block', marginTop: 4 }}><small className="cz-muted">+{rupees(x.amount)} reported ({x.reference})</small>{d.canConfirm && <><br /><Button size="sm" variant="secondary" onClick={() => confirm.run(x.id)}>Confirm received</Button></>}</span>)}</td><td data-label="Outstanding" style={{ textAlign: 'right' }}>{rupees(i.outstanding)}</td>
                  <td data-label="Due">{i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-IN') : '—'}{i.overdueDays > 0 && <><br /><strong style={{ color: 'var(--cz-danger)' }}>{i.overdueDays} days overdue</strong></>}</td>
                  <td data-label="State"><StatusBadge status={i.status} tone={i.status === 'paid' ? 'success' : i.overdueDays ? 'danger' : 'warning'} label={PAYMENT_STATE_LABELS[i.status]} /></td></tr>
              ))}</tbody>
            </table></div>
          )}</Card>
          <p className="cz-muted" style={{ fontSize: 12.5 }}>Receipts are recorded by the paying side (or Unite finance) with a bank / UTR reference. Import a statement under <Link href="/bank-statements">Bank statements</Link>. See <Link href="/finance">Settlements</Link> for commission payouts.</p>
        </>
      )}
    </div>
  );
}
