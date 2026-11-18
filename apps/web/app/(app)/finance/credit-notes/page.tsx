'use client';
import { useState } from 'react';
import { CREDIT_NOTE_REASONS } from '@collabiz/types';
import { Alert, Button, ButtonLink, DataTable, Dialog, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { dt } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Inv { id: string; number: string; amount: number; status: string; issued_at: string; project: string; client: string; credited: number; received: number; room: number }
interface CN { id: string; number: string; invoice: string; counterparty: string; reasonLabel: string; amount: number; note: string; refundDue: boolean; refundPaidAt: string | null; refundReference: string | null; issuedAt: string }
const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Invoices & credit notes. Credit notes reduce an invoice you issued; on a paid invoice the credit is a refund you record when paid. */
export default function CreditNotes() {
  const [tab, setTab] = useState('issued');
  const inv = useQuery<Inv[]>(tab === 'invoices' ? '/books/invoices' : null);
  const cns = useQuery<CN[]>(tab !== 'invoices' ? '/books/credit-notes' : null, { dir: tab === 'received' ? 'received' : 'issued' });
  const [pick, setPick] = useState<Inv | null>(null);
  const [f, setF] = useState({ reason: 'rate_difference', amount: '', note: '' });
  const [refund, setRefund] = useState<CN | null>(null); const [rf, setRf] = useState({ reference: '', paidOn: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState('');
  const issue = useMutation(async () => { const r = await api.post<{ number: string; refundDue: boolean }>('/books/credit-notes', { invoiceId: pick!.id, reason: f.reason, amount: Math.round(Number(f.amount || 0) * 100), note: f.note }); setMsg(`Credit note ${r.number} issued${r.refundDue ? ' — the invoice was paid, so record the refund when you pay it' : ''}.`); setPick(null); inv.reload(); return r; });
  const pay = useMutation(async () => { await api.post(`/books/credit-notes/${refund!.id}/refund`, rf); setRefund(null); cns.reload(); return true; });
  return (
    <Screen page={{ key: 'finance-credit-notes', title: 'Invoices & credit notes', access: 'partner' }} eyebrow="Invoices & P&L"
      description="Credit notes reduce a tax invoice you issued — for a rate difference, deficiency, discount, return or cancellation. They are never more than what is left on the invoice; on a paid invoice the credit is a refund you record when paid."
      actions={<ButtonLink href="/finance/pnl" variant="secondary">Profit report</ButtonLink>}>
      <Segmented label="Show" value={tab} onChange={(v) => { setTab(v); setMsg(''); }} options={[{ value: 'issued', label: 'Credit notes I issued' }, { value: 'received', label: 'Credit notes I received' }, { value: 'invoices', label: 'My invoices' }]} />
      {msg && <Alert tone="success">{msg}</Alert>}
      <div style={{ marginTop: 14 }}>
        {tab === 'invoices' ? (inv.error ? <ApiErrorView error={inv.error} onRetry={inv.reload} /> : !inv.data ? <LoadingState /> : (
          <DataTable rows={inv.data} caption="My invoices" empty={<p className="cz-muted">No invoices issued yet. Invoices are raised from certified project milestones.</p>} columns={[
            { key: 'n', header: 'Invoice', render: (i) => <span>{i.number}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{i.project} · {dt(i.issued_at)}</span></span> },
            { key: 'c', header: 'Client', render: (i) => i.client }, { key: 'a', header: 'Amount', render: (i) => rupees(i.amount) },
            { key: 'k', header: 'Credited', render: (i) => (i.credited ? rupees(i.credited) : '—') }, { key: 's', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
            { key: 'x', header: '', render: (i) => (i.room > 0 ? <Button size="sm" variant="secondary" onClick={() => { setPick(i); setF({ reason: 'rate_difference', amount: '', note: '' }); }}>Issue credit note</Button> : <span className="cz-muted">Fully credited</span>) },
          ]} />
        )) : (cns.error ? <ApiErrorView error={cns.error} onRetry={cns.reload} /> : !cns.data ? <LoadingState /> : (
          <DataTable rows={cns.data} caption={tab === 'issued' ? 'Credit notes I issued' : 'Credit notes I received'} empty={<p className="cz-muted">{tab === 'issued' ? 'No credit notes issued. Issue one from “My invoices”.' : 'No credit notes received.'}</p>} columns={[
            { key: 'n', header: 'Credit note', render: (c) => <span>{c.number}<br /><span className="cz-muted" style={{ fontSize: 12 }}>against {c.invoice} · {dt(c.issuedAt)}</span></span> },
            { key: 'p', header: tab === 'issued' ? 'Client' : 'From', render: (c) => c.counterparty }, { key: 'r', header: 'Reason', render: (c) => <span>{c.reasonLabel}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{c.note}</span></span> },
            { key: 'a', header: 'Amount', render: (c) => rupees(c.amount) },
            { key: 'f', header: 'Refund', render: (c) => (!c.refundDue ? 'Reduces the invoice' : c.refundPaidAt ? `Paid ${dt(c.refundPaidAt)} · ${c.refundReference}` : tab === 'issued' ? <Button size="sm" onClick={() => setRefund(c)}>Record refund paid</Button> : 'Refund due') },
          ]} />
        ))}
      </div>
      <Dialog open={!!pick} onClose={() => setPick(null)} title={pick ? `Credit note against ${pick.number}` : 'Credit note'}>
        {pick && <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); issue.run(); }}>
          <p className="cz-muted" style={{ margin: 0 }}>{pick.client} · invoice {rupees(pick.amount)} · left to credit {rupees(pick.room)}{pick.status === 'paid' ? ' · paid, so this credit is a refund' : ''}</p>
          {issue.error && <Alert tone="danger">{issue.error}</Alert>}
          <Select label="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} options={CREDIT_NOTE_REASONS.map((r) => ({ value: r.code, label: r.label }))} />
          <TextInput label="Credit amount (₹)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={issue.fieldErrors.amount} />
          <TextArea label="Explanation" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={issue.fieldErrors.note} />
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={issue.pending}>Issue credit note</Button><Button type="button" variant="ghost" onClick={() => setPick(null)}>Cancel</Button></div>
        </form>}
      </Dialog>
      <Dialog open={!!refund} onClose={() => setRefund(null)} title={refund ? `Refund for ${refund.number}` : 'Refund'}>
        {refund && <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); pay.run(); }}>
          {pay.error && <Alert tone="danger">{pay.error}</Alert>}
          <TextInput label="UTR / payment reference" value={rf.reference} onChange={(e) => setRf({ ...rf, reference: e.target.value })} error={pay.fieldErrors.reference} />
          <TextInput label="Paid on" type="date" value={rf.paidOn} onChange={(e) => setRf({ ...rf, paidOn: e.target.value })} />
          <div><Button type="submit" loading={pay.pending}>Record refund</Button></div>
        </form>}
      </Dialog>
    </Screen>
  );
}
