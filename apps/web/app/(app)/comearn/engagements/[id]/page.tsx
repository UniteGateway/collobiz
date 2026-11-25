'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import type { CeStage } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, Tracker, commissionLabel, rupees, toPaise, type CeCard } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Comm { id: string; description: string; basePaise: number; grossPaise: number; tdsPaise: number; netPaise: number; platformFeePaise: number; platformFeePayer: string | null; status: string; dueOn: string | null; paymentReference: string | null; receivedConfirmedAt: string | null }
interface Eng {
  id: string; code: string; stage: CeStage; status: string; side: 'earner' | 'company' | 'staff'; acceptedAt: string | null; termsHash: string | null; agreement: string | null; earner: string;
  opportunity: CeCard & { milestones: { label: string; pct: number }[]; paymentDays: number };
  stages: { key: string; label: string; by: string; done: boolean; at: string | null }[];
  lead: { certificateCode: string; customerName: string; customerCompany: string | null; city: string; contactName: string; phone: string | null; email: string | null; requirement: string; estimatedValuePaise: number | null; recordHash: string; createdAt: string } | null;
  events: { id: string; stage: string; note: string | null; amountPaise: number | null; reference: string | null; createdAt: string }[];
  commissions: Comm[]; disputes: { id: string; reason: string; status: string; ruling: string | null; createdAt: string }[];
}
const STATUS: Record<string, string> = { pending_approval: 'Awaiting company approval', approved: 'Approved — to be transferred', paid: 'Transferred', disputed: 'On hold — in dispute', cancelled: 'Cancelled' };

/** One engagement: the 8-step tracker, the protected lead, the commission ledger, and the next action for whoever owns it. */
export default function ComearnEngagement() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Eng>(`/comearn/engagements/${id}`);
  const e = q.data;
  return (
    <Screen page={{ key: 'comearn-engagement', title: 'Commission tracker', access: 'partner' }} header={false}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !e ? <Skeleton height={320} /> : (
        <>
          <CeHeader title={e.opportunity.title} lead={<>{e.code} · {e.side === 'company' ? `Member: ${e.earner}` : `Paid by ${e.opportunity.company}`} · {commissionLabel(e.opportunity)}</>} />
          <CeNav />
          {e.status === 'disputed' && <Alert tone="warning">In dispute — payment is on hold until COLLABIZ rules.</Alert>}
          <div className="ce-two">
            <Card title="My commission tracker"><Tracker stage={e.stage} stages={e.stages} /></Card>
            <div className="cz-stack" style={{ gap: 16 }}>
              {e.side === 'earner' && e.stage === 'agreement_accepted' && <LeadForm id={e.id} done={q.reload} />}
              {e.side === 'company' && e.status === 'active' && <CompanyStep e={e} done={q.reload} />}
              {e.lead && (
                <Card title="Protected lead" subtitle={`Certificate ${e.lead.certificateCode} · registered ${new Date(e.lead.createdAt).toLocaleString('en-IN')}`}>
                  <dl className="ce-dl" data-ce-lead>
                    <div><dt>Customer</dt><dd>{e.lead.customerName}{e.lead.customerCompany ? ` (${e.lead.customerCompany})` : ''}, {e.lead.city}</dd></div>
                    <div><dt>Contact</dt><dd>{e.lead.contactName}{e.lead.phone ? ` · ${e.lead.phone}` : ''}{e.lead.email ? ` · ${e.lead.email}` : ''}</dd></div>
                    <div><dt>Requirement</dt><dd>{e.lead.requirement}</dd></div>
                    {e.lead.estimatedValuePaise != null && <div><dt>Estimated value</dt><dd>{rupees(e.lead.estimatedValuePaise)}</dd></div>}
                    <div><dt>Record fingerprint</dt><dd className="ce-mono">{e.lead.recordHash.slice(0, 24)}…</dd></div>
                  </dl>
                </Card>
              )}
            </div>
          </div>
          {e.commissions.length > 0 && (
            <Card title="Commission ledger" subtitle="Calculated by COMEARN from the amount the company verified.">
              <div className="vai-scroll"><table className="vai-table" data-ce-ledger><thead><tr><th>For</th><th>Verified amount</th><th>Commission</th><th>Tax deducted</th><th>Net</th><th>Due</th><th>Status</th><th /></tr></thead>
                <tbody>{e.commissions.map((c) => <tr key={c.id}><td>{c.description}</td><td>{rupees(c.basePaise)}</td><td>{rupees(c.grossPaise)}</td><td>{rupees(c.tdsPaise)}</td><td><strong>{rupees(c.netPaise)}</strong></td><td>{c.dueOn ?? '—'}</td><td>{STATUS[c.status] ?? c.status}{c.paymentReference ? ` · ${c.paymentReference}` : ''}{c.platformFeePaise ? ` · platform fee ${rupees(c.platformFeePaise)} (${c.platformFeePayer})` : ''}</td>
                  <td>{e.side === 'earner' && c.status === 'paid' && !c.receivedConfirmedAt && <ReceivedButton id={c.id} done={q.reload} />}{c.receivedConfirmedAt && 'Receipt confirmed'}</td></tr>)}</tbody></table></div>
            </Card>
          )}
          <div className="ce-two">
            <Card title="History">
              <ol className="ce-history">{e.events.map((x) => <li key={x.id}><strong>{e.stages.find((s) => s.key === x.stage)?.label ?? x.stage}</strong><small>{new Date(x.createdAt).toLocaleString('en-IN')}{x.amountPaise ? ` · ${rupees(x.amountPaise)}` : ''}{x.reference ? ` · ref ${x.reference}` : ''}</small>{x.note && <p>{x.note}</p>}</li>)}</ol>
            </Card>
            <div className="cz-stack" style={{ gap: 16 }}>
              {e.agreement && <Card title="Commission agreement" subtitle={`Accepted ${e.acceptedAt ? new Date(e.acceptedAt).toLocaleDateString('en-IN') : ''} · fingerprint ${e.termsHash?.slice(0, 16)}…`}><pre className="ce-agreement">{e.agreement}</pre></Card>}
              <Disputes e={e} done={q.reload} />
            </div>
          </div>
          <p className="ce-muted"><Link href={e.side === 'company' ? '/comearn/offer' : '/comearn/my'}>← Back</Link></p>
        </>
      )}
    </Screen>
  );
}

function LeadForm({ id, done }: { id: string; done: () => void }) {
  const [f, setF] = useState({ customerName: '', customerCompany: '', city: '', contactName: '', phone: '', email: '', gstin: '', requirement: '', value: '' });
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation(async () => { await api.post(`/comearn/engagements/${id}/lead`, { ...f, customerCompany: f.customerCompany || undefined, phone: f.phone || undefined, email: f.email || undefined, gstin: f.gstin || undefined, estimatedValuePaise: f.value ? toPaise(f.value) : undefined, value: undefined, consent }); done(); return true; });
  const fe = save.fieldErrors;
  return (
    <Card title="Register your customer" subtitle="Registering protects your introduction: the first member to register a customer for this opportunity owns it.">
      <form className="cz-stack" style={{ gap: 8 }} data-form="ce-lead" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <div className="vai-grid">
          <TextInput label="Customer name" value={f.customerName} onChange={set('customerName')} error={fe.customerName} />
          <TextInput label="Company (optional)" value={f.customerCompany} onChange={set('customerCompany')} />
          <TextInput label="City" value={f.city} onChange={set('city')} error={fe.city} />
          <TextInput label="Contact person" value={f.contactName} onChange={set('contactName')} error={fe.contactName} />
          <TextInput label="Phone" value={f.phone} onChange={set('phone')} error={fe.phone} />
          <TextInput label="Email" value={f.email} onChange={set('email')} error={fe.email} />
          <TextInput label="GSTIN (optional)" value={f.gstin} onChange={set('gstin')} error={fe.gstin} />
          <TextInput label="Estimated value (₹)" inputMode="decimal" value={f.value} onChange={set('value')} />
        </div>
        <TextArea label="What the customer needs" value={f.requirement} onChange={set('requirement')} error={fe.requirement} rows={2} />
        <Checkbox label="The customer agreed that this company may contact them" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {fe.consent && <Alert tone="danger">{fe.consent}</Alert>}
        <div><Button type="submit" loading={save.pending}>Register and protect lead</Button></div>
      </form>
    </Card>
  );
}

function CompanyStep({ e, done }: { e: Eng; done: () => void }) {
  const [f, setF] = useState({ note: '', amount: '', reference: '', tds: '', milestoneIndex: '0' });
  const set = (k: keyof typeof f) => (x: { target: { value: string } }) => setF({ ...f, [k]: x.target.value });
  const run = useMutation(async (stage: string) => { await api.post(`/comearn/engagements/${e.id}/stage`, { stage, note: f.note || undefined, amountPaise: f.amount ? toPaise(f.amount) : undefined, reference: f.reference || undefined, tdsPaise: f.tds ? toPaise(f.tds) : undefined, milestoneIndex: e.opportunity.model === 'milestone' ? Number(f.milestoneIndex) : undefined }); setF({ note: '', amount: '', reference: '', tds: '', milestoneIndex: f.milestoneIndex }); done(); return true; });
  const pending = e.commissions.find((c) => c.status === 'pending_approval');
  const approved = e.commissions.find((c) => c.status === 'approved');
  const repeat = ['recurring', 'milestone'].includes(e.opportunity.model);
  const next: [string, string] | null = pending ? ['commission_approved', 'Approve commission'] : approved ? ['commission_paid', 'Record commission transfer']
    : e.stage === 'lead_registered' ? ['quoted', 'Meeting and quotation completed'] : e.stage === 'quoted' ? ['order_confirmed', 'Order confirmed']
    : e.stage === 'order_confirmed' || (repeat && ['payment_verified', 'commission_approved', 'commission_paid'].includes(e.stage)) ? ['payment_verified', 'Customer payment verified'] : null;
  if (!next) return null;
  const fe = run.fieldErrors;
  return (
    <Card title="Record the next step" subtitle="Only your company can record these. Every amount needs a reference you can show if asked.">
      <form className="cz-stack" style={{ gap: 8 }} data-form="ce-stage" onSubmit={(x) => { x.preventDefault(); run.run(next[0]); }}>
        {run.error && <Alert tone="danger">{run.error}</Alert>}
        {next[0] === 'order_confirmed' && <TextInput label="Order value (₹)" inputMode="decimal" value={f.amount} onChange={set('amount')} error={fe.amountPaise} />}
        {next[0] === 'payment_verified' && <>
          {e.opportunity.model === 'milestone' && <Select label="Milestone" value={f.milestoneIndex} onChange={set('milestoneIndex')} options={e.opportunity.milestones.map((m, i) => ({ value: String(i), label: `${m.label} (${m.pct}%)` }))} />}
          <TextInput label="Verified amount received (₹)" inputMode="decimal" value={f.amount} onChange={set('amount')} error={fe.amountPaise} />
          <TextInput label="Invoice or payment reference" value={f.reference} onChange={set('reference')} error={fe.reference} />
        </>}
        {next[0] === 'commission_approved' && pending && <p>Commission {rupees(pending.grossPaise)} on {rupees(pending.basePaise)} — due by {pending.dueOn}.</p>}
        {next[0] === 'commission_paid' && approved && <>
          <p>Transfer {rupees(approved.grossPaise)} less any tax you deduct at source.</p>
          <TextInput label="Tax deducted at source (₹)" inputMode="decimal" value={f.tds} onChange={set('tds')} error={fe.tdsPaise} hint="Enter 0 if none. Issue the TDS certificate to the member." />
          <TextInput label="Bank transfer reference" value={f.reference} onChange={set('reference')} error={fe.reference} />
        </>}
        <TextArea label="Note to the member (optional)" value={f.note} onChange={set('note')} rows={2} />
        <div><Button type="submit" loading={run.pending}>{next[1]}</Button></div>
      </form>
    </Card>
  );
}

function ReceivedButton({ id, done }: { id: string; done: () => void }) {
  const m = useMutation(async () => { await api.post(`/comearn/commissions/${id}/received`, {}); done(); return true; });
  return <Button size="sm" variant="secondary" onClick={() => m.run()} loading={m.pending}>Confirm received</Button>;
}

function Disputes({ e, done }: { e: Eng; done: () => void }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('');
  const m = useMutation(async () => { await api.post(`/comearn/engagements/${e.id}/dispute`, { reason }); setOpen(false); setReason(''); done(); return true; });
  if (e.side === 'staff' && !e.disputes.length) return null;
  return (
    <Card title="Disputes">
      {e.disputes.map((d) => <p key={d.id} className="ce-muted"><strong>{d.status === 'open' ? 'Open' : 'Resolved'}</strong> · {d.reason}{d.ruling ? ` — Ruling: ${d.ruling}` : ''}</p>)}
      {e.side !== 'staff' && !e.disputes.some((d) => d.status === 'open') && (open ? (
        <form className="cz-stack" style={{ gap: 8 }} onSubmit={(x) => { x.preventDefault(); m.run(); }}>
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <TextArea label="What is wrong?" value={reason} onChange={(x) => setReason(x.target.value)} rows={3} hint="At least 20 characters. Payment of disputed amounts is held until COLLABIZ rules." />
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" variant="secondary" loading={m.pending}>Raise dispute</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      ) : <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Raise a dispute</Button>)}
      {!e.disputes.length && e.side !== 'staff' && !open && <p className="ce-muted">No disputes.</p>}
    </Card>
  );
}
