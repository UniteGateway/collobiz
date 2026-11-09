'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, humanize, Card, DescriptionList, LoadingState, Select, StatusBadge, TextArea, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 054 — Lead Follow-up & Conversion Timeline. */
export default function LeadTimeline() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}/timeline`);
  const [a, setA] = useState({ kind: 'call', body: '' });
  const log = useMutation(async () => { await api.post('/crm/activities', { subjectType: 'lead', subjectId: id, ...a }); setA({ kind: 'call', body: '' }); q.reload(); return true; });
  if (q.loading) return <Screen id="054"><LoadingState /></Screen>;
  if (q.error) return <Screen id="054"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  return (
    <Screen id="054">
      <LeadTabs id={id} />
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Conversion">
          <DescriptionList items={[['Registered', new Date(q.data.conversion.registered).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })], ['Protected from', q.data.conversion.protectedFrom ? new Date(q.data.conversion.protectedFrom).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'], ['Pipeline stage', q.data.deal ? <StatusBadge key="s" status={q.data.deal.stage} /> : '—']]} />
          <h3 style={{ marginTop: 16 }}>Log follow-up</h3>
          {log.error && <Alert tone="danger">{log.error}</Alert>}
          <Select label="Type" value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value })} options={['call', 'email', 'meeting', 'note'].map((k) => ({ value: k, label: humanize(k) }))} />
          <TextArea label="What happened?" value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} />
          <Button onClick={() => log.run()} loading={log.pending} disabled={a.body.length < 2}>Add to timeline</Button>
        </Card>
        <Card title="Timeline"><Timeline items={[...q.data.items].reverse().map((i: any) => ({ id: i.id, at: i.at, title: i.title, detail: i.detail }))} /></Card>
      </div>
    </Screen>
  );
}
