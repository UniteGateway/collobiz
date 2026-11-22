'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface T { id: string; title: string; dueOn: string; doneAt: string | null; leadId: string | null; lead: string | null }

/** My GO EB5 follow-ups (also created from consultations). */
export default function Eb5Tasks() {
  const q = useQuery<T[]>('/eb5/tasks');
  const [f, setF] = useState({ title: '', dueOn: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) });
  const add = useMutation(async () => { await api.post('/eb5/tasks', f); setF({ ...f, title: '' }); q.reload(); return true; });
  const done = useMutation(async (id: string) => { await api.post(`/eb5/tasks/${id}/done`); q.reload(); return true; });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Screen page={{ key: 'eb5-tasks', title: 'Tasks & follow-ups', access: 'authenticated' }} eyebrow="GO EB5">
      <Card title="Add a follow-up">
        {add.error && <Alert tone="danger">{add.error}</Alert>}
        <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
          <div style={{ flex: '2 1 260px' }}><TextInput label="What to do" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={add.fieldErrors.title} /></div>
          <div style={{ flex: '1 1 160px' }}><TextInput label="Due" type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></div>
          <Button type="submit" loading={add.pending}>Add</Button>
        </form>
      </Card>
      <div style={{ height: 16 }} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="My follow-ups" empty={<p className="cz-muted">No follow-ups.</p>} columns={[
          { key: 't', header: 'Follow-up', render: (t) => t.title }, { key: 'l', header: 'Lead', render: (t) => (t.leadId ? <Link href={`/eb5/leads/${t.leadId}`}>{t.lead}</Link> : '—') },
          { key: 'd', header: 'Due', render: (t) => day(t.dueOn) },
          { key: 's', header: 'Status', render: (t) => <Badge s={t.doneAt ? 'completed' : t.dueOn < today ? 'cancelled' : 'pending'} label={t.doneAt ? 'Done' : t.dueOn < today ? 'Overdue' : 'Open'} /> },
          { key: 'x', header: '', render: (t) => (t.doneAt ? null : <Button size="sm" variant="secondary" onClick={() => done.run(t.id)}>Mark done</Button>) },
        ]} />
      )}
    </Screen>
  );
}
