'use client';
import { useState } from 'react';
import { EB5_ROLES, EB5_ROLE_LABELS } from '@collabiz/types';
import { Alert, Button, Card, DataTable, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface R { id: string; role: string; roleLabel: string; name: string; email: string; mfa: boolean; at: string }

/** Staff roles for GO EB5. Partners and clients get access from their own records, not from here. */
export default function Eb5Roles() {
  const q = useQuery<R[]>('/eb5/roles');
  const [f, setF] = useState({ email: '', role: 'business_manager' });
  const [note, setNote] = useState('');
  const add = useMutation(async () => { const r = await api.post<{ note?: string }>('/eb5/roles', f); setNote(r.note ?? 'Role granted.'); setF({ ...f, email: '' }); q.reload(); return r; });
  const del = useMutation(async (id: string) => { await api.request('DELETE', `/eb5/roles/${id}`); q.reload(); return true; });
  return (
    <Screen page={{ key: 'eb5-roles', title: 'GO EB5 staff roles', access: 'authenticated' }} eyebrow="GO EB5 · Settings" description="Staff roles need two-step sign-in. Referral partners are approved in Partners; clients are invited from their lead.">
      <Card title="Grant a role">
        {add.error && <Alert tone="danger">{add.error}</Alert>}{note && <Alert tone="success">{note}</Alert>}
        <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
          <div style={{ flex: '1 1 240px' }}><TextInput label="COLLABIZ account email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={add.fieldErrors.email} /></div>
          <div style={{ flex: '1 1 220px' }}><Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={EB5_ROLES.map((r) => ({ value: r, label: EB5_ROLE_LABELS[r] }))} /></div>
          <Button type="submit" loading={add.pending}>Grant</Button>
        </form>
      </Card>
      <div style={{ height: 16 }} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="GO EB5 staff" columns={[
          { key: 'n', header: 'Person', render: (r) => <span>{r.name}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.email}</span></span> },
          { key: 'r', header: 'Role', render: (r) => r.roleLabel },
          { key: 'm', header: 'Two-step sign-in', render: (r) => <Badge s={r.mfa ? 'active' : 'pending'} label={r.mfa ? 'On' : 'Not on — role inactive'} /> },
          { key: 'd', header: 'Since', render: (r) => day(r.at) },
          { key: 'x', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => del.run(r.id)}>Revoke</Button> },
        ]} />
      )}
    </Screen>
  );
}
