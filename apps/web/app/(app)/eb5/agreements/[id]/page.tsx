'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ButtonLink, Card, Checkbox, LoadingState, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { AgreementSheet } from '@/components/Eb5Docs';
import { Badge, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Ag { id: string; code: string; version: number; state: string; body: string; bodyHash: string; clientSignedName: string | null; clientSignedAt: string | null; counterSignedAt: string | null; history: { at: string; state: string; note?: string }[];
  lead: { id: string; code: string; fullName: string }; isClient: boolean; states: string[]; gates: { template: boolean; fees: boolean } }

/** Agreement workflow, client signature and CITRUS360 counter-signature. */
export default function Eb5Agreement() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<Ag>(`/eb5/agreements/${id}`);
  const [note, setNote] = useState(''); const [sig, setSig] = useState({ name: '', agree: false });
  const move = useMutation(async (to: string) => { const r = await api.post<Ag>(`/eb5/agreements/${id}/transition`, { to, note: note || undefined }); q.setData(r); setNote(''); return r; });
  const sign = useMutation(async () => { const r = await api.post<Ag>(`/eb5/agreements/${id}/sign`, { fullName: sig.name, agree: sig.agree || undefined, bodyHash: q.data!.bodyHash }); q.setData(r); return r; });
  const a = q.data;
  const STEPS: { to: string; label: string; roles: string[]; from: string }[] = [
    { to: 'Internal Review', label: 'Send for internal review', roles: ['citrus_admin', 'business_manager', 'super_admin'], from: 'Draft' },
    { to: 'Legal Approved', label: 'Record legal approval', roles: ['compliance', 'super_admin'], from: 'Internal Review' },
    { to: 'Sent to Client', label: 'Send to client', roles: ['citrus_admin', 'business_manager', 'super_admin'], from: 'Legal Approved' },
    { to: 'Counter-Signed', label: 'Counter-sign for CITRUS360 LLC', roles: ['citrus_admin'], from: 'Signed' },
  ];
  const next: [string, string, string[]][] = a ? STEPS.filter((s) => s.from === a.state).map((s) => [s.to, s.label, s.roles]) : [];
  return (
    <Screen page={{ key: 'eb5-agreement', title: a ? `Agreement ${a.code}` : 'Agreement', access: 'authenticated' }} eyebrow="GO EB5 · CITRUS360 LLC"
      actions={a ? <ButtonLink href={`/eb5/agreements/${id}/print`} variant="secondary">A4 / PDF</ButtonLink> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !a ? <LoadingState /> : <>
        <ol className="cz-eb5-steps" aria-label="Agreement workflow">{a.states.filter((s) => s !== 'Terminated').map((s, i) => { const cur = a.states.indexOf(a.state); return <li key={s} className={s === a.state ? 'now' : i < cur ? 'done' : ''}>{s}</li>; })}</ol>
        {(move.error || sign.error) && <Alert tone="danger">{move.error ?? sign.error}</Alert>}
        {!a.isClient && (!a.gates.template || !a.gates.fees) && <Alert tone="warning" title="Not approved by counsel yet">The template{!a.gates.fees ? ' and fees' : ''} still need U.S. counsel's approval before this agreement can be legally approved and sent.</Alert>}
        {a.isClient && ['Sent to Client', 'Viewed'].includes(a.state) && (
          <Card title="Review and sign" className="cz-mt">
            <p style={{ marginTop: 0 }}>Read the whole agreement below, ideally with your own advisor or attorney. Signing records your typed name, the time and this document's fingerprint.</p>
            <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); sign.run(); }}>
              <TextInput label={`Type your full name: ${a.lead.fullName}`} value={sig.name} onChange={(e) => setSig({ ...sig, name: e.target.value })} />
              <Checkbox label="I have read and agree to this consultancy agreement with CITRUS360 LLC." checked={sig.agree} onChange={(e) => setSig({ ...sig, agree: e.target.checked })} />
              <div><Button type="submit" loading={sign.pending} disabled={!sig.agree}>Sign agreement</Button></div>
            </form>
          </Card>
        )}
        {!a.isClient && (next.some(([, , roles]) => has(...roles)) || has('citrus_admin')) && (
          <Card title="Workflow" className="cz-mt">
            <TextInput label="Note (optional; required to terminate)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="cz-row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {next.filter(([, , roles]) => has(...roles)).map(([to, label]) => <Button key={to} size="sm" onClick={() => move.run(to)} loading={move.pending}>{label}</Button>)}
              {has('citrus_admin') && !['Terminated', 'Active'].includes(a.state) && <Button size="sm" variant="ghost" onClick={() => move.run('Terminated')}>Terminate</Button>}
            </div>
            <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>It becomes Active only when finance verifies the commencement payment. <Link href={`/eb5/leads/${a.lead.id}`}>Lead {a.lead.code}</Link></p>
          </Card>
        )}
        <p className="cz-mt">State <Badge s={a.state} /></p>
        <AgreementSheet ag={a} />
        {!a.isClient && <Card title="History" className="cz-mt"><Timeline items={[...a.history].reverse().map((h, i) => ({ id: String(i), at: h.at, title: h.state, detail: h.note }))} /></Card>}
      </>}
    </Screen>
  );
}
