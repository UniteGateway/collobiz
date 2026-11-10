'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PAYMENT_STATE_LABELS } from '@collabiz/types';
import { Alert, Button, Card, Dialog, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ProjectTabs, fmtDate, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Inv { id: string; number: string; amount: number; issuedAt: string; dueDate: string | null; status: string; received: number; outstanding: number; overdueDays: number; receipts: { amount: number; reference: string; receivedAt: string; source?: string }[]; reported?: { id: string; amount: number; reference: string; receivedAt: string }[] }
interface Row { id: string; seq: number; title: string; amount: number; state: string; invoice: Inv | null }
interface Res { parties: { id: string; name: string }[]; project: { code: string; title: string; contracted: boolean }; canRecord: boolean; canConfirm: boolean; totals: Record<string, number>; milestones: Row[]; note: string }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { projected: 'neutral', contracted: 'neutral', earned: 'info', approved: 'info', invoiced: 'warning', partially_paid: 'warning', paid: 'success', disputed: 'danger' };

/** Payments — milestone by milestone: projected, contracted, earned, approved, invoiced, part-paid, paid or disputed. */
export default function ProjectPayments() {
  const pr = useProject();
  const router = useRouter();
  const q = useQuery<Res>(`/projects/${pr.id}/payments`);
  const [pay, setPay] = useState<Inv | null>(null);
  const [disputing, setDisputing] = useState(false);
  const confirm = useMutation(async (rid: string) => { await api.post(`/payment-receipts/${rid}/confirm`, {}); q.reload(); return true; });
  const d = q.data;
  return (
    <Screen page={{ key: 'project-payments', title: 'Payments', access: 'partner' }} description={d ? `${d.project.code} — ${d.project.title}` : undefined}
      actions={d?.parties.length ? <Button variant="secondary" onClick={() => setDisputing(true)}>Raise a dispute</Button> : undefined}>
      <ProjectTabs id={pr.id} role={pr.data?.role} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            {([['projected', 'Projected'], ['contracted', 'Contracted'], ['approved', 'Approved'], ['invoiced', 'Invoiced'], ['received', 'Received'], ['outstanding', 'Outstanding']] as const).map(([k, l]) => (
              <div key={k} className="cz-figure"><span>{l}</span><strong className={k === 'received' ? 'cz-good' : undefined}>{rupees(d.totals[k])}</strong>{k === 'outstanding' && d.totals.overdue > 0 && <small style={{ color: 'var(--cz-danger)' }}>{rupees(d.totals.overdue)} overdue</small>}</div>
            ))}
          </div>
          {confirm.error && <Alert tone="danger">{confirm.error}</Alert>}
          <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>Each figure is kept separate — projected value is not money received. {d.note}</p>
          <Card>
            <ul className="cz-ws-list">{d.milestones.map((m) => (
              <li key={m.id} data-milestone={m.title} style={{ alignItems: 'flex-start' }}>
                <span><strong>{m.seq}. {m.title}</strong> · {rupees(m.amount)}<br />
                  {m.invoice?.reported?.map((r) => (
                    <span key={r.id} data-reported={r.reference} style={{ display: 'block', fontSize: 13, marginTop: 4 }}>
                      Supplier reports {rupees(r.amount)} received on {fmtDate(r.receivedAt)} (ref {r.reference}) — not counted until the client confirms
                      {d.canConfirm && <Button size="sm" variant="secondary" style={{ marginLeft: 8 }} loading={confirm.pending} onClick={() => confirm.run(r.id)}>Confirm it left our account</Button>}
                    </span>
                  ))}
                  {m.invoice ? <span className="cz-muted" style={{ fontSize: 13 }}>Invoice {m.invoice.number} · due {fmtDate(m.invoice.dueDate)} · received {rupees(m.invoice.received)} of {rupees(m.invoice.amount)}{m.invoice.overdueDays ? <strong style={{ color: 'var(--cz-danger)' }}> · {m.invoice.overdueDays} days overdue</strong> : ''}{m.invoice.receipts.length ? ` · ${m.invoice.receipts.map((r) => `${rupees(r.amount)} (${r.reference})`).join(', ')}` : ''}</span> : <span className="cz-muted" style={{ fontSize: 13 }}>Not invoiced yet</span>}</span>
                <span className="cz-row" style={{ gap: 8 }}><StatusBadge status={m.state} tone={TONE[m.state]} label={PAYMENT_STATE_LABELS[m.state]} />
                  {d.canRecord && m.invoice && m.invoice.outstanding > 0 && <Button size="sm" onClick={() => setPay(m.invoice)}>Record payment</Button>}</span>
              </li>
            ))}</ul>
          </Card>
          <Receipt projectId={pr.id} inv={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); q.reload(); }} />
          <Dispute projectId={pr.id} parties={d.parties} open={disputing} onClose={() => setDisputing(false)} onDone={(id) => router.push(`/resolution/${id}`)} />
        </>
      )}
    </Screen>
  );
}

function Receipt({ projectId, inv, onClose, onDone }: { projectId: string; inv: Inv | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ amount: '', reference: '', receivedAt: new Date().toISOString().slice(0, 10) });
  const save = useMutation(async () => { const r = await api.post(`/projects/${projectId}/invoices/${inv!.id}/receipts`, { amount: Math.round(Number(f.amount) * 100), reference: f.reference, receivedAt: f.receivedAt }); setF({ ...f, amount: '', reference: '' }); onDone(); return r; });
  return (
    <Dialog open={!!inv} onClose={onClose} title={inv ? `Payment against ${inv.number}` : 'Payment'}>
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Amount received (₹)" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} error={save.fieldErrors.amount} hint={inv ? `${rupees(inv.outstanding)} still due — part payments are fine` : undefined} />
        <TextInput label="Bank / UTR reference" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} error={save.fieldErrors.reference} />
        <TextInput label="Received on" type="date" value={f.receivedAt} onChange={(e) => setF({ ...f, receivedAt: e.target.value })} />
        <div><Button type="submit" loading={save.pending} disabled={!f.amount || f.reference.length < 3}>Record payment</Button></div>
      </form>
    </Dialog>
  );
}

function Dispute({ projectId, parties, open, onClose, onDone }: { projectId: string; parties: { id: string; name: string }[]; open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ againstOrgId: '', subject: '', statement: '', amount: '' });
  const save = useMutation(async () => { const r = await api.post<{ id: string }>(`/projects/${projectId}/disputes`, { againstOrgId: f.againstOrgId, subject: f.subject, statement: f.statement, amount: f.amount ? Math.round(Number(f.amount) * 100) : undefined }); onDone(r.id); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Raise a contract dispute">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="With" placeholder="Choose the other party" value={f.againstOrgId} onChange={(ev) => setF({ ...f, againstOrgId: ev.target.value })} options={parties.map((p) => ({ value: p.id, label: p.name }))} />
        <TextInput label="Subject" value={f.subject} onChange={(ev) => setF({ ...f, subject: ev.target.value })} error={e.subject} />
        <TextArea label="What happened" rows={4} value={f.statement} onChange={(ev) => setF({ ...f, statement: ev.target.value })} error={e.statement} />
        <TextInput label="Amount in question (₹, optional)" inputMode="numeric" value={f.amount} onChange={(ev) => setF({ ...f, amount: ev.target.value.replace(/\D/g, '') })} />
        <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>A Unite reviewer who is not part of either company looks at the evidence and decides. Either side can appeal once within 14 days.</p>
        <div><Button type="submit" loading={save.pending} disabled={!f.againstOrgId}>Raise dispute</Button></div>
      </form>
    </Dialog>
  );
}
