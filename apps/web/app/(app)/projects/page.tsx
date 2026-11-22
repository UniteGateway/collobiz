'use client';
import Link from 'next/link';
import { ButtonLink, Card, DataTable, EmptyState, Grid, Kpi, LoadingState, ProgressBar, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtDate, rupees } from '@/components/Projects';
import { useQuery } from '@/lib/hooks';
import { ChartCard, ColumnChart, DonutChart, HBarChart } from '@/components/Charts';
const short = (minor: number) => { const r = minor / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };

/** Screen 075 — Active Projects Portfolio. */
export default function Portfolio() {
  const q = useQuery<any[]>('/projects');
  const rows = q.data ?? [];
  return (
    <Screen id="075" actions={<ButtonLink href="/packages" variant="secondary">Open work packages</ButtonLink>} description="Projects your organization owns, leads or works on as a subcontractor. Projects start from an executed contract.">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={4}>
            <Kpi label="Active projects" value={rows.filter((p) => p.status === 'active').length} />
            <Kpi label="Overdue milestones" value={rows.reduce((a, p) => a + p.overdue, 0)} accent />
            <Kpi label="Completed" value={rows.filter((p) => ['completed', 'closed'].includes(p.status)).length} />
            <Kpi label="As lead or subcontractor" value={rows.filter((p) => p.role !== 'owner').length} />
          </Grid>
          {rows.length > 0 && <div className="cz-chart-row">
            <ChartCard title="Certified progress by project" subtitle="Share of milestone value certified by the client">
              <HBarChart caption="Certified progress by project" max={100} fmt={(v) => `${v}%`} data={rows.map((p) => ({ label: p.code, value: p.certifiedPct ?? 0 }))} />
            </ChartCard>
            <ChartCard title="Projects by status">
              <DonutChart caption="Projects by status" centre={{ value: String(rows.length), label: 'projects' }}
                data={Object.entries(rows.reduce((a: Record<string, number>, p) => { a[p.status] = (a[p.status] ?? 0) + 1; return a; }, {})).map(([k, v]) => ({ label: k.replace(/^\w/, (c) => c.toUpperCase()), value: v as number }))} />
            </ChartCard>
            <ChartCard title="Contract value by project">
              <ColumnChart caption="Contract value by project" fmt={short} data={rows.map((p) => ({ label: p.code.slice(-6), value: p.value ?? 0 }))} />
            </ChartCard>
          </div>}
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
