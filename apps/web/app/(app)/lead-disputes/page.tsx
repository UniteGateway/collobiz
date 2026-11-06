'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, StatusBadge, TextArea, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Screen 153 — Lead Ownership Dispute Center (evidence trail, independent panel, appeal). */
export default function Disputes() {
  const { me } = useSession();
  const list = useQuery<any[]>('/lead-disputes');
  const [sel, setSel] = useState<string | null>(null);
  const detail = useQuery<any>(sel ? `/lead-disputes/${sel}` : null);
  const [f, setF] = useState({ certificateCode: '', statement: '' });
  const [ev, setEv] = useState('');
  const open = useMutation(async () => { const d = await api.post<any>('/lead-disputes', f); setF({ certificateCode: '', statement: '' }); list.reload(); setSel(d.id); return d; });
  const add = useMutation(async () => { await api.post(`/lead-disputes/${sel}/evidence`, { body: ev }); setEv(''); detail.reload(); list.reload(); return true; });
  const appeal = useMutation(async () => { await api.post(`/lead-disputes/${sel}/appeal`, { grounds: ev }); setEv(''); detail.reload(); list.reload(); return true; });
  const d = detail.data;
  return (
    <Screen id="153" description="Disagree with a registered lead? Raise a dispute against its certificate number. An independent panel decides on evidence; either party may appeal within 14 days.">
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <div className="cz-stack">
          <Card title="My disputes">
            {list.loading ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : (
              <DataTable caption="Disputes" rows={list.data ?? []} empty={<EmptyState title="No disputes" />} columns={[
                { key: 'code', header: 'Dispute', render: (x) => <Button size="sm" variant="ghost" onClick={() => setSel(x.id)}>{x.code}</Button> },
                { key: 'role', header: 'Role', render: (x) => (x.claimantOrgId === me?.activeOrg?.id ? 'Claimant' : 'Respondent') },
                { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
                { key: 'outcome', header: 'Outcome', render: (x) => x.outcome ?? '—' },
              ]} />
            )}
          </Card>
          <Card title="Raise a dispute">
            {open.error && <Alert tone="danger">{open.error}</Alert>}
            <form noValidate onSubmit={(e) => { e.preventDefault(); open.run(); }}>
              <TextInput label="Certificate number" placeholder="CZL-2026-12345678" value={f.certificateCode} onChange={(e) => setF({ ...f, certificateCode: e.target.value.trim().toUpperCase() })} error={open.fieldErrors.certificateCode} />
              <TextArea label="Your statement and evidence" value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} error={open.fieldErrors.statement} />
              <Button type="submit" loading={open.pending}>Open dispute</Button>
            </form>
          </Card>
        </div>
        <Card title={d ? `${d.code} — ${d.claimant} vs ${d.respondent}` : 'Select a dispute'}>
          {!sel ? <p className="cz-muted">Choose a dispute to see its evidence trail.</p> : detail.loading ? <LoadingState /> : d && (
            <>
              <p>Lead <span className="cz-mono">{d.lead?.code}</span> · certificate <span className="cz-mono">{d.lead?.certificateCode}</span> · <StatusBadge status={d.status} /></p>
              {d.outcome && <Alert tone="info" title={`Ruling: ${d.outcome}.`}>{d.rulingReason}{d.appealDeadline && ` Appeal by ${new Date(d.appealDeadline).toLocaleDateString()}.`}</Alert>}
              <Timeline items={d.entries.map((e: any) => ({ id: e.id, at: e.createdAt, title: `${e.kind} · ${e.org ?? 'Panel'}`, detail: e.body }))} />
              {(add.error || appeal.error) && <Alert tone="danger">{add.error ?? appeal.error}</Alert>}
              {!['closed'].includes(d.status) && (
                <>
                  <TextArea label={d.status === 'resolved' ? 'Grounds for appeal' : 'Add evidence'} value={ev} onChange={(e) => setEv(e.target.value)} />
                  {d.status === 'resolved' ? <Button variant="secondary" onClick={() => appeal.run()} loading={appeal.pending}>Appeal ruling</Button> : <Button onClick={() => add.run()} loading={add.pending}>Submit evidence</Button>}
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </Screen>
  );
}
