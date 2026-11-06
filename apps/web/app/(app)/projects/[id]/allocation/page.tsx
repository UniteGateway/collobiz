'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, Grid, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ProjectTabs, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Screen 078 — Work Allocation & Subcontractors (lead allocates scope and value; every change is logged). */
export default function Allocation() {
  const p = useProject();
  const q = useQuery<any>(`/projects/${p.id}/members`);
  const partners = useQuery<any[]>(p.data?.role === 'lead' ? '/partners' : null);
  const [f, setF] = useState({ organizationId: '', scope: '', allocatedValue: '', reason: '' });
  const [rm, setRm] = useState('');
  const add = useMutation(async () => { await api.post(`/projects/${p.id}/members`, { organizationId: f.organizationId, scope: f.scope, allocatedValue: toMinor(f.allocatedValue), reason: f.reason || undefined }); setF({ organizationId: '', scope: '', allocatedValue: '', reason: '' }); q.reload(); return true; });
  const remove = useMutation(async (mid: string) => { await api.request('DELETE', `/projects/${p.id}/members/${mid}`, { reason: rm || undefined }); setRm(''); q.reload(); return true; });
  if (p.loading || q.loading) return <Screen id="078"><LoadingState /></Screen>;
  if (p.error || q.error) return <Screen id="078"><ApiErrorView error={p.error ?? q.error} onRetry={q.reload} /></Screen>;
  const d = p.data;
  const lead = d.role === 'lead';
  const baseline = d.status !== 'planning';
  const taken = new Set(q.data.members.filter((m: any) => m.status === 'active').map((m: any) => m.organizationId));
  return (
    <Screen id="078" title={d.title}>
      <ProjectTabs id={p.id} role={d.role} />
      {(add.error || remove.error) && <Alert tone="danger">{add.error ?? remove.error}</Alert>}
      {q.data.value != null && <p>Subcontracted: <strong>{rupees(q.data.subcontracted)}</strong> of {rupees(q.data.value)}</p>}
      <Card title="Work allocation">
        <DataTable caption="Allocation" rows={q.data.members} columns={[
          { key: 'name', header: 'Organization' }, { key: 'role', header: 'Role', render: (m: any) => <StatusBadge status={m.role} tone="brand" /> },
          { key: 'scope', header: 'Scope' }, { key: 'allocatedValue', header: 'Allocated', render: (m: any) => (m.allocatedValue !== undefined ? rupees(m.allocatedValue) : 'Confidential') },
          { key: 'status', header: 'Status', render: (m: any) => <StatusBadge status={m.status} /> },
          ...(lead ? [{ key: 'rm', header: 'Remove', render: (m: any) => (m.role === 'subcontractor' && m.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => remove.run(m.id)} aria-label={`Remove ${m.name}`}>Remove</Button> : null) }] : []),
        ]} />
        {lead && baseline && <TextInput label="Reason for removal (required after baseline)" value={rm} onChange={(e) => setRm(e.target.value)} />}
      </Card>
      {lead && (
        <Card title="Add subcontractor">
          <Grid cols={2}>
            <Select label="Partner" value={f.organizationId} onChange={(e) => setF({ ...f, organizationId: e.target.value })} placeholder="Choose a verified partner" error={add.fieldErrors.organizationId} options={(partners.data ?? []).filter((x: any) => !taken.has(x.id) && !x.isMe).map((x: any) => ({ value: x.id, label: `${x.name} · ${x.level}` }))} />
            <TextInput label="Allocated value (₹)" inputMode="decimal" value={f.allocatedValue} onChange={(e) => setF({ ...f, allocatedValue: e.target.value })} error={add.fieldErrors.allocatedValue} />
          </Grid>
          <TextArea label="Scope of work" rows={2} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} error={add.fieldErrors.scope} />
          {baseline && <TextInput label="Reason (required after baseline)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={add.fieldErrors.reason} />}
          <Button onClick={() => add.run()} disabled={!f.organizationId} loading={add.pending}>Allocate work</Button>
        </Card>
      )}
    </Screen>
  );
}
