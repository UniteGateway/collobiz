'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, Eb5Notice, day, useEb5, usd } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface I { id: string; number: string; ledger: string; description: string; amountCents: number; status: string; createdAt: string; lead: string; name: string; leadId: string; receiptNumber: string | null }
interface R { invoices: I[]; ledgers?: { code: string; label: string; collectable: boolean; totals: Record<string, number> }[]; note: string }
interface L { id: string; code: string; fullName: string; relation: string }

/** Consultancy invoices and the separate tracking ledgers. */
export default function Eb5Invoices() {
  const { has } = useEb5();
  const q = useQuery<R>('/eb5/invoices');
  const leads = useQuery<L[]>(has('citrus_admin', 'finance') ? '/eb5/leads' : null);
  const [f, setF] = useState({ leadId: '', kind: 'commencement', amount: '', description: 'As per the signed consultancy agreement', dueOn: '' });
  const [t, setT] = useState({ leadId: '', ledger: 'investment', amount: '', description: '', reference: '' });
  const issue = useMutation(async () => { await api.post('/eb5/invoices', { leadId: f.leadId, kind: f.kind, amountCents: f.kind === 'milestone' ? Math.round(Number(f.amount) * 100) : undefined, description: f.description, dueOn: f.dueOn || undefined }); q.reload(); return true; });
  const track = useMutation(async () => { await api.post('/eb5/ledger/track', { leadId: t.leadId, ledger: t.ledger, amountCents: Math.round(Number(t.amount) * 100), description: t.description, reference: t.reference || undefined }); setT({ ...t, amount: '', description: '', reference: '' }); q.reload(); return true; });
  const leadOpts = [{ value: '', label: 'Choose a client' }, ...(leads.data ?? []).filter((l) => l.relation === 'staff').map((l) => ({ value: l.id, label: `${l.fullName} · ${l.code}` }))];
  return (
    <Screen page={{ key: 'eb5-invoices', title: 'Invoices & payments', access: 'authenticated' }} eyebrow="GO EB5 · CITRUS360 LLC" description="Consultancy invoices are issued by CITRUS360 LLC and paid through its verified billing channel. Finance confirms cleared funds before a receipt is issued.">
      <Eb5Notice compact />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : <>
        {q.data.ledgers && <div className="cz-grid cz-grid-3 cz-mt">{q.data.ledgers.map((g) => (
          <Card key={g.code} title={g.label}>
            {Object.keys(g.totals).length ? <dl className="cz-dl">{Object.entries(g.totals).flatMap(([k, v]) => [<dt key={`${k}-t`}>{k.replace('_', ' ')}</dt>, <dd key={`${k}-d`}>{usd(v)}</dd>])}</dl> : <p className="cz-muted" style={{ margin: 0 }}>Nothing recorded.</p>}
            {!g.collectable && <p className="cz-muted" style={{ fontSize: 12, marginBottom: 0 }}>Tracking only — never collected through COLLABIZ.</p>}
          </Card>
        ))}</div>}
        {has('citrus_admin', 'finance') && <div className="cz-grid cz-grid-2 cz-mt">
          <Card title="Issue a consultancy invoice">
            {issue.error && <Alert tone="danger">{issue.error}</Alert>}
            <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); issue.run(); }}>
              <Select label="Client" value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })} options={leadOpts} />
              <Select label="Invoice" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'commencement', label: 'Commencement payment (from the agreement)' }, { value: 'milestone', label: 'Balance milestone' }]} />
              {f.kind === 'milestone' && <TextInput label="Amount (USD)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
              <TextInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              <TextInput label="Due on (optional)" type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
              <div><Button type="submit" loading={issue.pending}>Issue invoice</Button></div>
            </form>
          </Card>
          <Card title="Record a tracked amount">
            {track.error && <Alert tone="danger">{track.error}</Alert>}
            <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); track.run(); }}>
              <Select label="Client" value={t.leadId} onChange={(e) => setT({ ...t, leadId: e.target.value })} options={leadOpts} />
              <Select label="Ledger" value={t.ledger} onChange={(e) => setT({ ...t, ledger: e.target.value })} options={[{ value: 'investment', label: 'EB-5 investment capital (tracking only)' }, { value: 'legal', label: 'Third-party legal fees' }, { value: 'government', label: 'Government fees' }, { value: 'project_admin', label: 'Project administration fees' }]} />
              <TextInput label="Amount (USD)" inputMode="decimal" value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} />
              <TextInput label="Description" value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} />
              <TextInput label="External reference (optional)" value={t.reference} onChange={(e) => setT({ ...t, reference: e.target.value })} />
              <div><Button type="submit" variant="secondary" loading={track.pending}>Record</Button></div>
            </form>
          </Card>
        </div>}
        <Card title="Invoices and records" className="cz-mt">
          <DataTable rows={q.data.invoices} caption="Invoices and records" empty={<p className="cz-muted">Nothing yet.</p>} columns={[
            { key: 'n', header: 'Number', render: (i) => <span><Link href={`/eb5/invoices/${i.id}`}>{i.number}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{i.name} · {i.lead}</span></span> },
            { key: 'l', header: 'Ledger', render: (i) => i.ledger }, { key: 'd', header: 'Description', render: (i) => i.description },
            { key: 'a', header: 'Amount', render: (i) => usd(i.amountCents) }, { key: 's', header: 'Status', render: (i) => <Badge s={i.status} /> }, { key: 'c', header: 'Date', render: (i) => day(i.createdAt) },
          ]} />
        </Card>
        <p className="cz-muted" style={{ fontSize: 13 }}>{q.data.note}</p>
      </>}
    </Screen>
  );
}
