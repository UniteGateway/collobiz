'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, DataTable, DescriptionList, Grid, Kpi, LoadingState, Money, Select, StatusBadge, TextArea, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 052 — Customer CRM Profile (consent-scoped relationship record). */
export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/crm/customers/${id}`);
  const [act, setAct] = useState({ kind: 'note', body: '' });
  const [task, setTask] = useState({ title: '', dueAt: '' });
  const log = useMutation(async () => { await api.post('/crm/activities', { subjectType: 'customer', subjectId: id, ...act }); setAct({ kind: 'note', body: '' }); q.reload(); return true; });
  const addTask = useMutation(async () => { await api.post('/crm/tasks', { title: task.title, dueAt: new Date(task.dueAt).toISOString(), customerId: id }); setTask({ title: '', dueAt: '' }); q.reload(); return true; });
  const done = useMutation(async (tid: string) => { await api.patch(`/crm/tasks/${tid}`, { status: 'done' }); q.reload(); return true; });
  if (q.loading) return <Screen id="052"><LoadingState /></Screen>;
  if (q.error) return <Screen id="052"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const { customer: c, deals, leads, activities, tasks, metrics } = q.data;
  return (
    <Screen id="052" title={c.legalName}>
      {c.restrictedContacts && <Alert tone="info">Contact details are restricted by the buyer’s consent scope and are never shared outside your organization.</Alert>}
      <Grid cols={3}><Kpi label="Open deals" value={metrics.openDeals} /><Kpi label="Open pipeline" value={<Money minor={metrics.pipelineValue} />} accent /><Kpi label="Won value" value={<Money minor={metrics.wonValue} />} /></Grid>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="cz-stack">
          <Card title="Details"><DescriptionList items={[['Contact', c.contactName], ['Email', c.contactEmail], ['Phone', c.contactPhone], ['City', c.city], ['Tax ID', c.taxId], ['Consent', c.consentProvenance ? `${c.consentProvenance.method} · ${c.consentProvenance.disclosureScope}` : '—']]} /></Card>
          <Card title="Deals">
            <DataTable caption="Deals" rows={deals} columns={[{ key: 'title', header: 'Deal' }, { key: 'value', header: 'Value', render: (d: any) => <Money minor={d.value} /> }, { key: 'stage', header: 'Stage', render: (d: any) => <StatusBadge status={d.stage} /> }]} />
          </Card>
          <Card title="Protected leads">
            {leads.length ? leads.map((l: any) => <div key={l.id}><Link href={`/leads/${l.id}/timeline`}>{l.code}</Link> {l.title} <StatusBadge status={l.status} /></div>) : <p className="cz-muted">No leads registered for this customer.</p>}
          </Card>
          <Card title="Follow-ups">
            {addTask.error && <Alert tone="danger">{addTask.error}</Alert>}
            {tasks.map((t: any) => <div key={t.id} className="cz-row" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>{t.status === 'done' ? '✅' : '⏰'} {t.title} · {new Date(t.dueAt).toLocaleString()}</span>{t.status === 'open' && <Button size="sm" variant="ghost" onClick={() => done.run(t.id)}>Done</Button>}</div>)}
            <form noValidate onSubmit={(e) => { e.preventDefault(); addTask.run(); }} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
              <TextInput label="Follow-up" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
              <TextInput label="Due" type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} />
              <Button type="submit" loading={addTask.pending} disabled={!task.title || !task.dueAt}>Add</Button>
            </form>
          </Card>
        </div>
        <Card title="Activity history">
          {log.error && <Alert tone="danger">{log.error}</Alert>}
          <form noValidate onSubmit={(e) => { e.preventDefault(); log.run(); }}>
            <Select label="Type" value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value })} options={['note', 'call', 'email', 'meeting'].map((k) => ({ value: k, label: k }))} />
            <TextArea label="Details" value={act.body} onChange={(e) => setAct({ ...act, body: e.target.value })} />
            <Button type="submit" loading={log.pending} disabled={act.body.length < 2}>Log activity</Button>
          </form>
          <div style={{ marginTop: 16 }}><Timeline items={activities.map((a: any) => ({ id: a.id, at: a.at, title: `${a.kind.replace('_', ' ')} · ${a.subjectType}${a.actor ? ` · ${a.actor}` : ''}`, detail: a.body }))} /></div>
        </Card>
      </div>
    </Screen>
  );
}
