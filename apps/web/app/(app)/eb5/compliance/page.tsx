'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, ButtonLink, Card, DataTable, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, useEb5, usd } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Comp { enabled: boolean; note: string; records: { id: string; partner: string; lead: string | null; description: string; amountCents: number | null; status: string; legalReference: string | null; createdAt: string }[] }
interface P { id: string; org: string; complianceStatus: string; role: string; i956kStatus: string; agreementStatus: string; leads: number }

/** Compliance desk: partner approvals, ownership claims, partner compensation (never automatic) and legal gates. */
export default function Eb5Compliance() {
  const { has } = useEb5();
  const partners = useQuery<P[]>('/eb5/partners');
  const comp = useQuery<Comp>(has('compliance', 'super_admin') ? '/eb5/compensation' : null);
  const [f, setF] = useState({ partnerId: '', description: '', amount: '' });
  const [refs, setRefs] = useState<Record<string, string>>({});
  const add = useMutation(async () => { await api.post('/eb5/compensation', { partnerId: f.partnerId, description: f.description, amountCents: f.amount ? Math.round(Number(f.amount) * 100) : undefined }); setF({ partnerId: '', description: '', amount: '' }); comp.reload(); return true; });
  const decide = useMutation(async (id: string, decision: string) => { await api.post(`/eb5/compensation/${id}/decide`, { decision, legalReference: refs[id] ?? '' }); comp.reload(); return true; });
  const pending = (partners.data ?? []).filter((p) => p.complianceStatus === 'pending');
  return (
    <Screen page={{ key: 'eb5-compliance', title: 'GO EB5 compliance', access: 'authenticated' }} eyebrow="GO EB5"
      description="Partner approvals, lead-ownership claims, promoter registration status and partner compensation. The COLLABIZ commission engine never applies to EB-5."
      actions={<><ButtonLink href="/eb5/settings" variant="secondary">Legal approvals</ButtonLink><ButtonLink href="/eb5/audit" variant="secondary">Audit log</ButtonLink></>}>
      <div className="cz-grid cz-grid-2">
        <Card title={`Partner applications waiting (${pending.length})`}>
          {partners.error ? <ApiErrorView error={partners.error} /> : !partners.data ? <LoadingState /> : pending.length ? (
            <ul className="cz-ws-list">{pending.map((p) => <li key={p.id}><Link href={`/eb5/partners/${p.id}`}>{p.org}</Link><Badge s="pending" label="Review" /></li>)}</ul>
          ) : <p className="cz-muted" style={{ margin: 0 }}>No applications waiting.</p>}
          <p style={{ marginBottom: 0 }}><Link href="/eb5/disputes">Lead-ownership claims</Link> · <Link href="/eb5/partners">All partners</Link></p>
        </Card>
        <Card title="Promoter registration (Form I-956K)">
          <ul className="cz-ws-list">{(partners.data ?? []).filter((p) => p.complianceStatus === 'approved').map((p) => <li key={p.id}><span>{p.org} <span className="cz-muted">· {p.leads} introductions</span></span><Badge s={p.i956kStatus} /></li>)}</ul>
          <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Record counsel's assessment for every approved partner. Status here is what compliance recorded, not a USCIS confirmation.</p>
        </Card>
      </div>
      {comp.data && <Card title="Partner compensation" className="cz-mt">
        <Alert tone={comp.data.enabled ? 'success' : 'warning'} title={comp.data.enabled ? 'Compensation arrangement approved by counsel' : 'Disabled — pending legal approval'}>{comp.data.note}</Alert>
        {(add.error || decide.error) && <Alert tone="danger">{add.error ?? decide.error}</Alert>}
        <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', margin: '12px 0' }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
          <div style={{ flex: '1 1 200px' }}><Select label="Partner" value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })} options={[{ value: '', label: 'Choose' }, ...(partners.data ?? []).map((p) => ({ value: p.id, label: p.org }))]} /></div>
          <div style={{ flex: '2 1 280px' }}><TextInput label="Proposed arrangement" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={add.fieldErrors.description} /></div>
          <div style={{ flex: '1 1 140px' }}><TextInput label="Amount (USD, optional)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <Button type="submit" variant="secondary" loading={add.pending}>Record for review</Button>
        </form>
        <DataTable rows={comp.data.records} caption="Compensation records" empty={<p className="cz-muted">No compensation records.</p>} columns={[
          { key: 'p', header: 'Partner', render: (r) => r.partner }, { key: 'd', header: 'Arrangement', render: (r) => r.description }, { key: 'a', header: 'Amount', render: (r) => usd(r.amountCents) },
          { key: 's', header: 'Status', render: (r) => <Badge s={r.status} label={r.status === 'pending_legal' ? 'Pending legal approval' : r.status} /> }, { key: 'c', header: 'Recorded', render: (r) => day(r.createdAt) },
          { key: 'x', header: '', render: (r) => r.status === 'pending_legal' ? <span className="cz-row" style={{ gap: 6, alignItems: 'flex-end' }}><TextInput label="Legal reference" value={refs[r.id] ?? ''} onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })} />
            <Button size="sm" onClick={() => decide.run(r.id, 'approve')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide.run(r.id, 'reject')}>Reject</Button></span> : r.legalReference },
        ]} />
      </Card>}
    </Screen>
  );
}
