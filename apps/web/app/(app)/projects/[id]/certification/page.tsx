'use client';
import { useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, LoadingState, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtTime, ProjectTabs, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Screen 083 — Invoice / Milestone Certification: evidence → owner's independent check → certified amount → invoice → payment. */
export default function Certification() {
  const p = useProject();
  const q = useQuery<any>(`/projects/${p.id}/certification`);
  const [notes, setNotes] = useState<Record<string, { note: string; amount: string; ref: string }>>({});
  const n = (id: string) => notes[id] ?? { note: '', amount: '', ref: '' };
  const setN = (id: string, k: 'note' | 'amount' | 'ref', v: string) => setNotes({ ...notes, [id]: { ...n(id), [k]: v } });
  const done = <T,>(r: T) => { q.reload(); p.reload(); return r; };
  const submit = useMutation(async (mid: string) => done(await api.post(`/projects/${p.id}/milestones/${mid}/submit`, { note: n(mid).note })));
  const certify = useMutation(async (mid: string, decision: string) => done(await api.request('POST', `/projects/${p.id}/milestones/${mid}/certify`, { decision, note: n(mid).note, certifiedAmount: toMinor(n(mid).amount) }, { idempotencyKey: newIdempotencyKey() })));
  const invoice = useMutation(async (mid: string) => done(await api.request('POST', `/projects/${p.id}/milestones/${mid}/invoice`, undefined, { idempotencyKey: newIdempotencyKey() })));
  const paid = useMutation(async (mid: string, iid: string) => done(await api.request('POST', `/projects/${p.id}/invoices/${iid}/paid`, { paymentReference: n(mid).ref }, { idempotencyKey: newIdempotencyKey() })));
  if (p.loading || q.loading) return <Screen id="083"><LoadingState /></Screen>;
  if (p.error || q.error) return <Screen id="083"><ApiErrorView error={p.error ?? q.error} onRetry={q.reload} /></Screen>;
  const d = p.data;
  const role = q.data.role;
  const err = submit.error ?? certify.error ?? invoice.error ?? paid.error;
  return (
    <Screen id="083" title={d.title} description="A milestone is certified only on evidence: files sealed at submission, the owner's own passing inspection, and no open non-conformance.">
      <ProjectTabs id={p.id} role={d.role} />
      {err && <Alert tone="danger">{err}</Alert>}
      {q.data.milestones.map((m: any) => (
        <Card key={m.id} title={`${m.seq}. ${m.title}`} actions={<StatusBadge status={m.status} />}>
          <section aria-label={`Certification — ${m.title}`}>
            <DescriptionList items={[
              ['Amount', rupees(m.amount)], ['Reported progress', `${m.progressPct}%`],
              ['Evidence', m.evidence.length ? `${m.evidence.length} file(s): ${m.evidence.map((e: any) => e.fileName).join(', ')}` : 'None yet'],
              ...(m.submittedAt ? [['Submitted', `${fmtTime(m.submittedAt)} — ${m.submissionNote ?? ''}`] as [string, React.ReactNode]] : []),
              ...(m.evidenceHash ? [['Evidence seal', <span key="h" className="cz-mono" title={m.evidenceHash}>{m.evidenceHash.slice(0, 16)}…{m.evidenceUnchanged === false ? ' (changed since submission!)' : ''}</span>] as [string, React.ReactNode]] : []),
              ...(m.certifiedAt ? [['Certified', `${rupees(m.certifiedAmount)} on ${fmtTime(m.certifiedAt)} — ${m.certificationNote ?? ''}`] as [string, React.ReactNode]] : []),
              ...(m.rejectionReason && m.status === 'rejected' ? [['Rejected', m.rejectionReason] as [string, React.ReactNode]] : []),
              ...(m.invoice ? [['Invoice', `${m.invoice.number} · ${rupees(m.invoice.amount)} · ${m.invoice.status}${m.invoice.paymentReference ? ` (ref ${m.invoice.paymentReference})` : ''}`] as [string, React.ReactNode]] : []),
            ]} />
            {m.status === 'submitted' && (
              <ul className="cz-checklist" aria-label="Certification checks">{m.checks.map((c: any) => <li key={c.key} data-ok={c.ok}>{c.ok ? '✅' : '❌'} {c.label}</li>)}</ul>
            )}
            {role === 'lead' && m.status === 'in_progress' && (
              <div className="cz-row" style={{ alignItems: 'flex-end' }}>
                <TextInput label="Submission note" value={n(m.id).note} onChange={(e) => setN(m.id, 'note', e.target.value)} />
                <Button onClick={() => submit.run(m.id)} disabled={n(m.id).note.trim().length < 5} loading={submit.pending}>Submit for certification</Button>
              </div>
            )}
            {role === 'owner' && m.status === 'submitted' && (
              <div className="cz-row" style={{ alignItems: 'flex-end' }}>
                <TextInput label="Certified amount (₹, blank = full)" inputMode="decimal" value={n(m.id).amount} onChange={(e) => setN(m.id, 'amount', e.target.value)} />
                <TextInput label="Certification note" value={n(m.id).note} onChange={(e) => setN(m.id, 'note', e.target.value)} />
                <Button onClick={() => certify.run(m.id, 'certify')} disabled={n(m.id).note.trim().length < 5 || !m.checks.every((c: any) => c.ok)} loading={certify.pending}>Certify</Button>
                <Button variant="danger" onClick={() => certify.run(m.id, 'reject')} disabled={n(m.id).note.trim().length < 5} loading={certify.pending}>Reject</Button>
              </div>
            )}
            {role === 'lead' && m.status === 'certified' && <Button onClick={() => invoice.run(m.id)} loading={invoice.pending}>Raise invoice for {rupees(m.certifiedAmount)}</Button>}
            {role === 'owner' && m.invoice?.status === 'issued' && (
              <div className="cz-row" style={{ alignItems: 'flex-end' }}>
                <TextInput label="Payment reference (UTR)" value={n(m.id).ref} onChange={(e) => setN(m.id, 'ref', e.target.value)} />
                <Button variant="accent" onClick={() => paid.run(m.id, m.invoice.id)} disabled={n(m.id).ref.trim().length < 3} loading={paid.pending}>Record payment</Button>
              </div>
            )}
          </section>
        </Card>
      ))}
    </Screen>
  );
}
