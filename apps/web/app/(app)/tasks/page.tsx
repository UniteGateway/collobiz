'use client';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const time = (d: Date | string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

/** Screen 028 — Tasks & Follow-up Calendar (overdue warning, next 14 days, week view). */
export default function Tasks() {
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const end = useMemo(() => new Date(week.getTime() + 7 * 86400_000), [week]);
  const q = useQuery<any[]>('/crm/tasks', { from: week.toISOString(), to: end.toISOString() });
  const [now] = useState(() => new Date());
  const overdue = useQuery<any[]>('/crm/tasks', { to: now.toISOString(), status: 'open' });
  const upcoming = useQuery<any[]>('/crm/tasks', { from: now.toISOString(), to: new Date(now.getTime() + 14 * 86400_000).toISOString(), status: 'open' });
  const [f, setF] = useState({ title: '', dueAt: '' });
  const add = useMutation(async () => { await api.post('/crm/tasks', { title: f.title, dueAt: new Date(f.dueAt).toISOString() }); setF({ title: '', dueAt: '' }); q.reload(); overdue.reload(); upcoming.reload(); return true; });
  const done = useMutation(async (id: string) => { await api.patch(`/crm/tasks/${id}`, { status: 'done' }); q.reload(); overdue.reload(); upcoming.reload(); return true; });
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * 86400_000));
  return (
    <Screen id="028">
      {(overdue.data?.length ?? 0) > 0 && <Alert tone="warning">{overdue.data!.length === 1 ? '1 follow-up is overdue' : `${overdue.data!.length} follow-ups are overdue`}: {overdue.data!.map((t) => t.title).join('; ')}</Alert>}
      <Card title="Add follow-up">
        {add.error && <Alert tone="danger">{add.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); add.run(); }} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
          <TextInput label="Task" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <TextInput label="Due" type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
          <Button type="submit" loading={add.pending} disabled={!f.title || !f.dueAt}>Add</Button>
        </form>
      </Card>
      <Card title="Next 14 days" subtitle="Open follow-ups, soonest first">
        {upcoming.loading ? <LoadingState /> : upcoming.error ? <ApiErrorView error={upcoming.error} onRetry={upcoming.reload} /> : (upcoming.data ?? []).length === 0 ? <p className="cz-muted" style={{ margin: 0 }}>Nothing due in the next two weeks.</p> : (
          <ul className="cz-task-list" aria-label="Upcoming follow-ups">
            {[...upcoming.data!].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)).map((t) => (
              <li key={t.id}>
                <div className="cz-task-when"><strong>{shortDate(t.dueAt)}</strong><span>{time(t.dueAt)}</span></div>
                <div className="cz-task-what"><strong>{t.title}</strong><span className="cz-muted">{t.assignee}{t.customer ? ` · ${t.customer}` : ''}</span></div>
                <Button size="sm" variant="ghost" onClick={() => done.run(t.id)}>Mark done</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Week of ${week.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`} actions={<div className="cz-row"><Button size="sm" variant="secondary" onClick={() => setWeek(new Date(week.getTime() - 7 * 86400_000))}>← Previous</Button><Button size="sm" variant="secondary" onClick={() => setWeek(startOfWeek(new Date()))}>This week</Button><Button size="sm" variant="secondary" onClick={() => setWeek(new Date(week.getTime() + 7 * 86400_000))}>Next →</Button></div>}>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <div className="cz-week" role="list" aria-label="Week calendar">
            {days.map((d) => {
              const items = (q.data ?? []).filter((t) => new Date(t.dueAt).toDateString() === d.toDateString());
              return (
                <section key={d.toISOString()} className="cz-week-day" role="listitem" aria-label={d.toDateString()} data-today={d.toDateString() === now.toDateString() || undefined} data-empty={items.length === 0 || undefined}>
                  <h3><span>{d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</span><span>{items.length}</span></h3>
                  {items.map((t) => (
                    <div key={t.id} className="cz-kanban-card" style={{ opacity: t.status === 'done' ? 0.6 : 1 }}>
                      <strong style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</strong>
                      <div className="cz-muted" style={{ fontSize: 12 }}>{time(t.dueAt)} · {t.assignee}{t.customer ? ` · ${t.customer}` : ''}</div>
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
