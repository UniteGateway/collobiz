'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, Grid, LoadingState, ProgressBar, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtDate, ProjectTabs, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { fromMinor, toMinor } from '@/lib/regions';

const INSPECTIONS = [{ value: 'quality', label: 'Quality inspection' }, { value: 'safety', label: 'Safety inspection' }, { value: 'both', label: 'Quality and safety' }, { value: 'none', label: 'No inspection' }];
const EMPTY = { title: '', dueDate: '', amount: '', assignedOrgId: '', requiresInspection: 'quality', reason: '' };

/** Screen 077 — Milestone & Schedule Planner. After the baseline is approved, every change needs a reason and is logged. */
export default function Milestones() {
  const p = useProject();
  const q = useQuery<any>(`/projects/${p.id}/milestones`);
  const members = useQuery<any>(`/projects/${p.id}/members`);
  const [f, setF] = useState(EMPTY);
  const [edit, setEdit] = useState<any>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const reload = () => { q.reload(); p.reload(); };
  const add = useMutation(async () => { await api.post(`/projects/${p.id}/milestones`, { title: f.title, dueDate: f.dueDate, amount: toMinor(f.amount), assignedOrgId: f.assignedOrgId || undefined, requiresInspection: f.requiresInspection, reason: f.reason || undefined }); setF(EMPTY); reload(); return true; });
  const save = useMutation(async () => { await api.patch(`/projects/${p.id}/milestones/${edit.id}`, { dueDate: edit.dueDate, amount: toMinor(edit.amount), title: edit.title, reason: edit.reason || undefined }); setEdit(null); reload(); return true; });
  const start = useMutation(async (mid: string) => { await api.post(`/projects/${p.id}/milestones/${mid}/start`); reload(); return true; });
  if (p.loading || q.loading) return <Screen id="077"><LoadingState /></Screen>;
  if (p.error || q.error) return <Screen id="077"><ApiErrorView error={p.error ?? q.error} onRetry={reload} /></Screen>;
  const d = p.data;
  const lead = d.role === 'lead';
  const baseline = d.status !== 'planning';
  const ms = q.data.milestones;
  const planned = ms.reduce((a: number, m: any) => a + (m.amount ?? 0), 0);
  const assignable = (members.data?.members ?? []).filter((m: any) => m.status === 'active' && m.role !== 'owner').map((m: any) => ({ value: m.organizationId, label: `${m.name} (${m.role})` }));
  const err = add.error ?? save.error ?? start.error;
  return (
    <Screen id="077" title={d.title}>
      <ProjectTabs id={p.id} role={d.role} />
      {err && <Alert tone="danger">{err}</Alert>}
      {q.data.project.value != null && <ProgressBar value={Math.round((planned / q.data.project.value) * 100)} label={`${rupees(planned)} of ${rupees(q.data.project.value)} planned in milestones`} />}
      <Card title="Schedule">
        <DataTable caption="Milestones" rows={ms} columns={[
          { key: 'seq', header: '#' },
          { key: 'title', header: 'Milestone', render: (m: any) => <>{m.title}<div className="cz-muted" style={{ fontSize: 12 }}>{m.assignedOrg ?? 'Lead'} · inspection: {m.requiresInspection}</div></> },
          { key: 'dueDate', header: 'Due', render: (m: any) => fmtDate(m.dueDate) },
          { key: 'amount', header: 'Amount', render: (m: any) => (m.amount != null ? rupees(m.amount) : '—') },
          { key: 'progressPct', header: 'Progress', render: (m: any) => `${m.progressPct}%` },
          { key: 'status', header: 'Status', render: (m: any) => <StatusBadge status={m.status} /> },
          { key: 'actions', header: 'Actions', render: (m: any) => (
            <div className="cz-row">
              {lead && ['planned', 'in_progress', 'rejected'].includes(m.status) && <Button size="sm" variant="ghost" onClick={() => setEdit({ id: m.id, title: m.title, dueDate: m.dueDate, amount: fromMinor(m.amount), reason: '' })} aria-label={`Re-plan ${m.title}`}>Re-plan</Button>}
              {d.status === 'active' && ['planned', 'rejected'].includes(m.status) && (lead || d.role === 'subcontractor') && <Button size="sm" variant="secondary" onClick={() => start.run(m.id)} aria-label={`Start ${m.title}`}>{m.status === 'rejected' ? 'Reopen' : 'Start'}</Button>}
            </div>
          ) },
        ]} />
      </Card>
      {edit && (
        <Card title={`Re-plan: ${edit.title}`}>
          <Grid cols={2}>
            <TextInput label="Title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <TextInput label="Due date" type="date" value={edit.dueDate} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
            <TextInput label="Amount (₹)" inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} error={save.fieldErrors.amount} />
            <TextInput label={baseline ? 'Reason for change (required, logged)' : 'Reason for change (optional)'} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} error={save.fieldErrors.reason} />
          </Grid>
          <div className="cz-row"><Button onClick={() => save.run()} loading={save.pending}>Save change</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        </Card>
      )}
      {lead && ['planning', 'active', 'on_hold'].includes(d.status) && (
        <Card title="Add milestone">
          <Grid cols={2}>
            <TextInput label="Milestone title" value={f.title} onChange={set('title')} error={add.fieldErrors.title} />
            <TextInput label="Due date" type="date" value={f.dueDate} onChange={set('dueDate')} error={add.fieldErrors.dueDate} />
            <TextInput label="Amount (₹)" inputMode="decimal" value={f.amount} onChange={set('amount')} error={add.fieldErrors.amount} />
            <Select label="Assigned to" value={f.assignedOrgId} onChange={set('assignedOrgId')} placeholder="Lead (your organization)" options={assignable.filter((a: any) => a.value !== undefined)} />
            <Select label="Inspection before certification" value={f.requiresInspection} onChange={set('requiresInspection')} options={INSPECTIONS} />
            {baseline && <TextInput label="Reason (required after baseline)" value={f.reason} onChange={set('reason')} error={add.fieldErrors.reason} />}
          </Grid>
          <Button onClick={() => add.run()} loading={add.pending}>Add milestone</Button>
        </Card>
      )}
    </Screen>
  );
}
