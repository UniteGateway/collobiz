'use client';
import Link from 'next/link';
import { Card, DataTable, EmptyState, Grid, Kpi, LoadingState, ProgressBar, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtDate, rupees } from '@/components/Projects';
import { useQuery } from '@/lib/hooks';

/** Screen 075 — Active Projects Portfolio. */
export default function Portfolio() {
  const q = useQuery<any[]>('/projects');
  const rows = q.data ?? [];
  return (
    <Screen id="075" description="Projects your organization owns, leads or works on as a subcontractor. Projects start from an executed contract.">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={4}>
            <Kpi label="Active projects" value={rows.filter((p) => p.status === 'active').length} />
            <Kpi label="Overdue milestones" value={rows.reduce((a, p) => a + p.overdue, 0)} accent />
            <Kpi label="Completed" value={rows.filter((p) => ['completed', 'closed'].includes(p.status)).length} />
            <Kpi label="As lead or subcontractor" value={rows.filter((p) => p.role !== 'owner').length} />
          </Grid>
          <Card>
            <DataTable caption="Projects" rows={rows} empty={<EmptyState title="No projects yet">Projects appear here once a contract is executed and the client starts the project.</EmptyState>} columns={[
              { key: 'title', header: 'Project', render: (p: any) => <><Link href={`/projects/${p.id}`}>{p.title}</Link><div className="cz-mono cz-muted">{p.code}{p.site ? ` · ${p.site}` : ''}</div></> },
              { key: 'role', header: 'Our role', render: (p: any) => <StatusBadge status={p.role} tone="brand" /> },
              { key: 'status', header: 'Status', render: (p: any) => <StatusBadge status={p.status} /> },
              { key: 'progressPct', header: 'Progress', render: (p: any) => <ProgressBar value={p.progressPct} label={`${p.progressPct}% reported · ${p.certifiedPct}% certified`} /> },
              { key: 'next', header: 'Next milestone', render: (p: any) => (p.nextMilestone ? <>{p.nextMilestone.title}<div className="cz-muted" style={{ fontSize: 12 }}>due {fmtDate(p.nextMilestone.dueDate)}{p.overdue ? ` · ${p.overdue} overdue` : ''}</div></> : '—') },
              { key: 'value', header: 'Value', render: (p: any) => (p.value != null ? rupees(p.value) : '—') },
            ]} />
          </Card>
        </>
      )}
    </Screen>
  );
}
