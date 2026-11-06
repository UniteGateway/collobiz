'use client';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Screen 028 — Tasks & Follow-up Calendar (week view + overdue list). */
export default function Tasks() {
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const end = useMemo(() => new Date(week.getTime() + 7 * 86400_000), [week]);
  const q = useQuery<any[]>('/crm/tasks', { from: week.toISOString(), to: end.toISOString() });
  const overdue = useQuery<any[]>('/crm/tasks', { to: new Date().toISOString(), status: 'open' });
  const [f, setF] = useState({ title: '', dueAt: '' });
  const add = useMutation(async () => { await api.post('/crm/tasks', { title: f.title, dueAt: new Date(f.dueAt).toISOString() }); setF({ title: '', dueAt: '' }); q.reload(); overdue.reload(); return true; });
  const done = useMutation(async (id: string) => { await api.patch(`/crm/tasks/${id}`, { status: 'done' }); q.reload(); overdue.reload(); return true; });
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * 86400_000));
  return (
    <Screen id="028">
      {(overdue.data?.length ?? 0) > 0 && <Alert tone="warning">{overdue.data!.length} overdue follow-up(s): {overdue.data!.map((t) => t.title).join('; ')}</Alert>}
      <Card title="Add follow-up">
        {add.error && <Alert tone="danger">{add.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); add.run(); }} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
          <TextInput label="Task" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <TextInput label="Due" type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
          <Button type="submit" loading={add.pending} disabled={!f.title || !f.dueAt}>Add</Button>
        </form>
      </Card>
      <Card title={`Week of ${week.toLocaleDateString()}`} actions={<div className="cz-row"><Button size="sm" variant="secondary" onClick={() => setWeek(new Date(week.getTime() - 7 * 86400_000))}>← Previous</Button><Button size="sm" variant="secondary" onClick={() => setWeek(startOfWeek(new Date()))}>This week</Button><Button size="sm" variant="secondary" onClick={() => setWeek(new Date(week.getTime() + 7 * 86400_000))}>Next →</Button></div>}>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <div className="cz-kanban" role="list" aria-label="Week calendar">
            {days.map((d) => {
              const items = (q.data ?? []).filter((t) => new Date(t.dueAt).toDateString() === d.toDateString());
              return (
                <section key={d.toISOString()} className="cz-kanban-col" role="listitem" aria-label={d.toDateString()} style={{ minHeight: 140 }}>
                  <h3><span>{d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span><span>{items.length}</span></h3>
                  {items.map((t) => (
                    <div key={t.id} className="cz-kanban-card" style={{ opacity: t.status === 'done' ? 0.6 : 1 }}>
                      <strong style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</strong>
                      <div className="cz-muted" style={{ fontSize: 12 }}>{new Date(t.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.assignee}{t.customer ? ` · ${t.customer}` : ''}</div>
                      {t.status === 'open' && <Button size="sm" variant="ghost" onClick={() => done.run(t.id)}>Mark done</Button>}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </Card>
    </Screen>
  );
}
