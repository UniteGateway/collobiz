'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { XCHANGE_DEAL_STATUS_LABELS, XCHANGE_LEG_STATUS_LABELS } from '@collabiz/types';
import { Alert, Button, Card, Dialog, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { XchangeNav, inr } from '@/components/Xchange';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Leg { id: string; from: string; fromOrgId: string; to: string; toOrgId: string; description: string; value: number; cash: number; status: string; deliveryNote: string | null; deliveredAt: string | null; acceptedAt: string | null; disputeReason: string | null; invoice: { supplier: string; supplierGstin: string | null; recipient: string; recipientGstin: string | null; description: string; taxableValue: number; cashConsideration: number; nonCashConsideration: number } }
interface Deal { id: string; code: string; kind: string; status: string; note: string | null; proposedBy: string; legs: Leg[]; parties: { orgId: string; name: string; approved: boolean; mine: boolean; completed: number; disputed: number }[]; balances: { orgId: string; name: string; net: number }[]; balanced: boolean; taxNote: string; canApprove: boolean }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { proposed: 'info', agreed: 'warning', completed: 'success', cancelled: 'neutral', disputed: 'danger', pending: 'neutral', delivered: 'info', accepted: 'success' };
const KIND: Record<string, string> = { direct: 'Direct barter', part_cash: 'Part-cash exchange', multi: 'Multi-party exchange' };

/** Screen 183 — one exchange: terms, approvals, balance, deliveries and acceptance, invoice data. */
export default function ExchangeDeal() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const q = useQuery<Deal>(`/xchange/deals/${id}`);
  const [note, setNote] = useState<{ leg: Leg; mode: 'deliver' | 'dispute' } | null>(null);
  const act = useMutation(async (path: string, b: object = {}) => { await api.post(path, b); q.reload(); return true; });
  const d = q.data; const myOrg = me?.activeOrg?.id;
  return (
    <Screen page={{ key: 'xchange-deal', title: d ? `Exchange ${d.code}` : 'Exchange', access: 'partner' }} description={d ? `${KIND[d.kind]} · proposed by ${d.proposedBy}` : undefined}
      actions={d ? <span className="cz-row cz-no-print" style={{ gap: 8 }}><StatusBadge status={d.status} tone={TONE[d.status]} label={XCHANGE_DEAL_STATUS_LABELS[d.status]} /><Button variant="secondary" onClick={() => window.print()}>Print</Button></span> : undefined}>
      <XchangeNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-ws-cols">
          <div className="cz-stack" style={{ gap: 14 }}>
            {act.error && <Alert tone="danger">{act.error}</Alert>}
            {d.note && <Alert tone="info">{d.note}</Alert>}
            {d.legs.map((l) => (
              <Card key={l.id}>
                <div data-leg={l.description} className="cz-stack" style={{ gap: 6 }}>
                  <div className="cz-lead-head"><strong>{l.from} → {l.to}</strong><span className="cz-muted">{l.description}</span><span style={{ marginLeft: 'auto' }}><StatusBadge status={l.status} tone={TONE[l.status]} label={XCHANGE_LEG_STATUS_LABELS[l.status]} /></span></div>
                  <span style={{ fontSize: 14 }}>Value {inr(l.value)}{l.cash ? ` · ${l.to} pays ${inr(l.cash)} cash` : ''}</span>
                  {l.deliveryNote && <span className="cz-muted" style={{ fontSize: 13 }}>Delivery: {l.deliveryNote}</span>}
                  {l.disputeReason && <Alert tone="danger" title="Disputed">{l.disputeReason}</Alert>}
                  <div className="cz-row cz-no-print" style={{ gap: 8 }}>
                    {['agreed', 'disputed'].includes(d.status) && l.fromOrgId === myOrg && ['pending', 'disputed'].includes(l.status) && <Button size="sm" onClick={() => setNote({ leg: l, mode: 'deliver' })}>{l.status === 'disputed' ? 'Redeliver' : 'Mark delivered'}</Button>}
                    {l.toOrgId === myOrg && l.status === 'delivered' && <><Button size="sm" onClick={() => act.run(`/xchange/legs/${l.id}/accept`)}>Accept</Button><Button size="sm" variant="secondary" onClick={() => setNote({ leg: l, mode: 'dispute' })}>Raise a problem</Button></>}
                  </div>
                </div>
              </Card>
            ))}
            <Card title="Invoice data for your accountant">
              <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Invoice data per supply</caption>
                <thead><tr><th scope="col">Supplier</th><th scope="col">Recipient</th><th scope="col">Supply</th><th scope="col" style={{ textAlign: 'right' }}>Taxable value</th><th scope="col" style={{ textAlign: 'right' }}>Non-cash</th><th scope="col" style={{ textAlign: 'right' }}>Cash</th></tr></thead>
                <tbody>{d.legs.map((l) => <tr key={l.id}><td data-label="Supplier">{l.invoice.supplier}{l.invoice.supplierGstin ? <><br /><span className="cz-mono">{l.invoice.supplierGstin}</span></> : null}</td><td data-label="Recipient">{l.invoice.recipient}{l.invoice.recipientGstin ? <><br /><span className="cz-mono">{l.invoice.recipientGstin}</span></> : null}</td><td data-label="Supply">{l.invoice.description}</td><td data-label="Taxable value" style={{ textAlign: 'right' }}>{inr(l.invoice.taxableValue)}</td><td data-label="Non-cash" style={{ textAlign: 'right' }}>{inr(l.invoice.nonCashConsideration)}</td><td data-label="Cash" style={{ textAlign: 'right' }}>{inr(l.invoice.cashConsideration)}</td></tr>)}</tbody>
              </table></div>
              <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{d.taxNote}</p>
            </Card>
          </div>
          <aside className="cz-ws-side cz-no-print">
            <Card title="Approvals">
              <ul className="cz-ws-list">{d.parties.map((p) => <li key={p.orgId} data-party={p.name}><span><strong>{p.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12.5 }}>{p.completed} supplies delivered before{p.disputed ? ` · ${p.disputed} disputed` : ''}</span></span><StatusBadge status={p.approved ? 'approved' : 'pending'} tone={p.approved ? 'success' : 'warning'} label={p.approved ? 'Approved' : 'Waiting'} /></li>)}</ul>
              {d.canApprove && <div className="cz-row" style={{ gap: 8, marginTop: 10 }}><Button onClick={() => act.run(`/xchange/deals/${id}/approve`)}>Approve these terms</Button><Button variant="ghost" onClick={() => act.run(`/xchange/deals/${id}/cancel`)}>Decline</Button></div>}
            </Card>
            <Card title="Balance">
              <ul className="cz-ws-list">{d.balances.map((b) => <li key={b.orgId}><span>{b.name}</span><span className="cz-muted">{Math.abs(b.net) < 100_00 ? 'balanced' : `${b.net > 0 ? '+' : '−'}${inr(Math.abs(b.net))}`}</span></li>)}</ul>
              <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Values are as declared and agreed by the businesses, supported by price lists, invoices or quotations.</p>
            </Card>
          </aside>
          <Note state={note} onClose={() => setNote(null)} onSend={async (text) => { const ok = await act.run(`/xchange/legs/${note!.leg.id}/${note!.mode}`, note!.mode === 'deliver' ? { note: text } : { reason: text }); if (ok) setNote(null); }} pending={act.pending} />
        </div>
      )}
    </Screen>
  );
}

function Note({ state, onClose, onSend, pending }: { state: { leg: Leg; mode: 'deliver' | 'dispute' } | null; onClose: () => void; onSend: (t: string) => void; pending: boolean }) {
  const [t, setT] = useState('');
  return (
    <Dialog open={!!state} onClose={onClose} title={state?.mode === 'dispute' ? 'Raise a problem' : 'Mark delivered'}>
      <div className="cz-stack" style={{ gap: 10 }}>
        <TextArea label={state?.mode === 'dispute' ? 'What is wrong with the supply' : 'Delivery details (challan, LR number, completion note)'} rows={3} value={t} onChange={(e) => setT(e.target.value)} />
        <div><Button loading={pending} disabled={t.trim().length < (state?.mode === 'dispute' ? 10 : 5)} onClick={() => { onSend(t); setT(''); }}>{state?.mode === 'dispute' ? 'Raise problem' : 'Confirm delivery'}</Button></div>
      </div>
    </Dialog>
  );
}
