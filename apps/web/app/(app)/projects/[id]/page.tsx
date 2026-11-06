'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, DescriptionList, Grid, Kpi, LoadingState, ProgressBar, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CHANGE_LABELS, changeValue, fmtDate, fmtTime, ProjectTabs, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Screen 076 — Project Overview Dashboard. */
export default function ProjectOverview() {
  const p = useProject();
  const d = p.data;
  const [reason, setReason] = useState('');
  const activate = useMutation(async () => { await api.post(`/projects/${p.id}/activate`); p.reload(); return true; });
  const hold = useMutation(async (status: string) => { await api.post(`/projects/${p.id}/status`, { status, reason }); setReason(''); p.reload(); return true; });
  if (p.loading) return <Screen id="076"><LoadingState /></Screen>;
  if (p.error) return <Screen id="076"><ApiErrorView error={p.error} onRetry={p.reload} /></Screen>;
  const f = d.financials;
  return (
    <Screen id="076" title={d.title} actions={<StatusBadge status={d.status} />}>
      <ProjectTabs id={p.id} role={d.role} />
      {(activate.error || hold.error) && <Alert tone="danger">{activate.error ?? hold.error}</Alert>}
      {d.status === 'planning' && (
        <Alert tone="info" title="Baseline not yet approved">
          {d.role === 'owner' ? 'Review the milestone plan, then approve it as the baseline. After that, every change needs a reason and is logged.' : 'Plan milestones that add up to the project value; the client then approves them as the baseline.'}
          {d.role === 'owner' && <div style={{ marginTop: 8 }}><Button onClick={() => activate.run()} loading={activate.pending}>Approve baseline and start</Button></div>}
        </Alert>
      )}
      <Grid cols={4}>
        <Kpi label="Reported progress" value={`${d.progressPct}%`} />
        <Kpi label="Certified" value={`${d.certifiedPct}%`} accent />
        <Kpi label="Milestones overdue" value={d.milestones.overdue} />
        <Kpi label="Open non-conformances" value={d.openNcrs.length} />
      </Grid>
      <ProgressBar value={d.progressPct} label={`${d.progressPct}% reported progress (weighted by milestone value)`} />
      <Grid cols={2}>
        <Card title="Project">
          <DescriptionList items={[['Reference', <span key="c" className="cz-mono">{d.code}</span>], ['Owner (client)', d.owner], ['Lead partner', d.lead], ['Your role', <StatusBadge key="r" status={d.role} tone="brand" />], ['Site', d.site ?? '—'], ['Schedule', `${fmtDate(d.startDate)} → ${fmtDate(d.endDate)}`], ['Next milestone', d.nextMilestone ? `${d.nextMilestone.title} (due ${fmtDate(d.nextMilestone.dueDate)})` : '—']]} />
        </Card>
        {f ? (
          <Card title="Financials">
            <DescriptionList items={[['Contract value', rupees(f.value)], ['Planned in milestones', rupees(f.planned)], ['Certified', rupees(f.certified)], ['Invoiced', rupees(f.invoiced)], ['Paid', rupees(f.paid)]]} />
          </Card>
        ) : (
          <Card title="Your scope"><p>{d.members.find((m: any) => m.role === 'subcontractor' && m.allocatedValue !== undefined)?.scope ?? 'See milestones assigned to your organization.'}</p></Card>
        )}
      </Grid>
      <Card title="Team">
        <DataTable caption="Project team" rows={d.members.map((m: any) => ({ ...m, id: m.organizationId }))} columns={[
          { key: 'name', header: 'Organization' }, { key: 'role', header: 'Role', render: (m: any) => <StatusBadge status={m.role} tone="brand" /> }, { key: 'scope', header: 'Scope' },
          ...(f ? [{ key: 'allocatedValue', header: 'Allocation', render: (m: any) => (m.allocatedValue != null ? rupees(m.allocatedValue) : '—') }] : []),
        ]} />
      </Card>
      <Grid cols={2}>
        <Card title="Latest site updates">
          {d.recentUpdates.length ? d.recentUpdates.map((u: any) => <p key={u.id} style={{ margin: '0 0 8px' }}><strong>{u.org}</strong> · {fmtTime(u.createdAt)}{u.progressPct != null ? ` · ${u.progressPct}%` : ''}<br />{u.note}</p>) : <p className="cz-muted">No updates yet.</p>}
        </Card>
        <Card title="Change log (latest)">
          {d.recentChanges.map((c: any) => <p key={c.id} style={{ margin: '0 0 8px', fontSize: 14 }}><strong>{CHANGE_LABELS[c.field] ?? c.field}</strong> {c.entity !== 'project' ? `(${c.entity})` : ''}: {changeValue(c.field, c.before)} → {changeValue(c.field, c.after)}<br /><span className="cz-muted">{c.who} · {fmtTime(c.createdAt)}{c.reason ? ` · “${c.reason}”` : ''}</span></p>)}
        </Card>
      </Grid>
      {d.role === 'owner' && ['active', 'on_hold'].includes(d.status) && (
        <Card title={d.status === 'active' ? 'Pause the project' : 'Resume the project'}>
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label="Reason (logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant={d.status === 'active' ? 'secondary' : 'primary'} onClick={() => hold.run(d.status === 'active' ? 'on_hold' : 'active')} disabled={reason.trim().length < 5} loading={hold.pending}>{d.status === 'active' ? 'Put on hold' : 'Resume'}</Button>
          </div>
        </Card>
      )}
    </Screen>
  );
}
