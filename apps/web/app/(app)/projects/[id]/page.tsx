'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, DataTable, DescriptionList, Grid, Kpi, LoadingState, ProgressBar, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CHANGE_LABELS, changeValue, fmtDate, fmtTime, ProjectTabs, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 076 — Project Overview Dashboard. */
export default function ProjectOverview() {
  const p = useProject();
  const d = p.data;
  const [reason, setReason] = useState('');
  const activate = useMutation(async () => { await api.post(`/projects/${p.id}/activate`); p.reload(); return true; });
  const ags = useQuery<any[]>(p.data?.role === 'owner' ? '/commissions/agreements' : null);
  const pols = useQuery<any[]>(p.data?.role === 'owner' ? '/commissions/policies' : null);
  const partners = useQuery<any[]>(p.data?.role === 'owner' ? '/partners' : null);
  const [ca, setCa] = useState({ beneficiaryOrgId: '', policyId: '', share: '100' });
  const createAg = useMutation(async () => { const a = await api.post<any>('/commissions/agreements', { projectId: p.id, beneficiaryOrgId: ca.beneficiaryOrgId, policyId: ca.policyId, shareBps: Math.round(Number(ca.share) * 100) }); ags.reload(); return a; });
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
      {d.role === 'owner' && (
        <Card title="Introducer commission">
          {createAg.error && <Alert tone="danger">{createAg.error}</Alert>}
          <DataTable caption="Commission agreements" rows={(ags.data ?? []).filter((a) => a.projectId === p.id)} empty={<p className="cz-muted">No introducer commission on this project.</p>} columns={[
            { key: 'code', header: 'Agreement', render: (a: any) => <Link href={`/commissions/agreements/${a.id}`} className="cz-mono">{a.code}</Link> },
            { key: 'terms', header: 'Terms', render: (a: any) => `${a.terms.policy.name} · share ${a.shareBps / 100}%` },
          ]} />
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <Select label="Introducer (beneficiary)" value={ca.beneficiaryOrgId} onChange={(e) => setCa({ ...ca, beneficiaryOrgId: e.target.value })} placeholder="Choose a verified partner" options={(partners.data ?? []).map((x: any) => ({ value: x.id, label: x.name }))} error={createAg.fieldErrors.beneficiaryOrgId} />
            <Select label="Commission policy" value={ca.policyId} onChange={(e) => setCa({ ...ca, policyId: e.target.value })} placeholder="Choose an active policy" options={(pols.data ?? []).filter((x) => x.status === 'active').map((x) => ({ value: x.id, label: `${x.name} (v${x.version})` }))} />
            <TextInput label="Share (%)" inputMode="decimal" value={ca.share} onChange={(e) => setCa({ ...ca, share: e.target.value })} />
            <Button onClick={() => createAg.run()} disabled={!ca.beneficiaryOrgId || !ca.policyId} loading={createAg.pending}>Create agreement</Button>
          </div>
          <p className="cz-muted" style={{ fontSize: 13 }}>Commission is earned only when you record the customer payment for each certified milestone.</p>
        </Card>
      )}
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
