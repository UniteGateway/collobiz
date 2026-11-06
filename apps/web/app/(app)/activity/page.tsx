'use client';
import { ButtonLink, Card, Grid, Kpi, LoadingState, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 030 — Quick Actions & Activity Center (atlas: mobile-first). */
export default function Activity() {
  const q = useQuery<any>('/crm/activity');
  return (
    <Screen id="030">
      <Card title="Quick actions">
        <div className="cz-row">
          <ButtonLink href="/leads/new" variant="accent">Register lead</ButtonLink>
          <ButtonLink href="/marketplace" variant="secondary">Find opportunities</ButtonLink>
          <ButtonLink href="/crm/pipeline" variant="secondary">Pipeline</ButtonLink>
          <ButtonLink href="/tasks" variant="secondary">Follow-ups</ButtonLink>
          <ButtonLink href="/rfq/new" variant="secondary">Post requirement</ButtonLink>
        </div>
      </Card>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={3}><Kpi label="Overdue follow-ups" value={q.data.tasks.overdue} /><Kpi label="Due in 24 h" value={q.data.tasks.today} accent /><Kpi label="Unread alerts" value={q.data.notifications.filter((n: any) => !n.readAt).length} /></Grid>
          <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
            <Card title="Activity"><Timeline items={q.data.items.map((i: any) => ({ id: i.id, at: i.at, title: `${i.title}${i.actor ? ` · ${i.actor}` : ''}`, detail: i.detail }))} /></Card>
            <Card title="Alerts">{q.data.notifications.length ? q.data.notifications.map((n: any) => <div key={n.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--cz-grey-100)', fontWeight: n.readAt ? 400 : 600 }}>{n.link ? <a href={n.link}>{n.title}</a> : n.title}<div className="cz-muted" style={{ fontSize: 12 }}>{n.body}</div></div>) : <p className="cz-muted">No alerts.</p>}</Card>
          </div>
        </>
      )}
    </Screen>
  );
}
