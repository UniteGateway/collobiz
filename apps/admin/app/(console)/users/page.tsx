'use client';
import { useState } from 'react';
import { humanize, Alert, Button, Card, DataTable, Dialog, Select, StatusBadge, TextInput, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface M { id: string; role: string; orgName: string; orgType: string; organizationId: string; status: string }
interface U { id: string; email: string; fullName: string; status: string; mfaEnabled: boolean; emailVerified: boolean; lastLoginAt: string | null; memberships: M[] }
interface Org { id: string; displayName: string; type: string }
const PLATFORM = ['super_admin', 'unite_admin', 'compliance', 'finance', 'routing_owner', 'moderator'];

/** Screen 129 — Admin Users & Permissions. */
export default function UsersPage() {
  const { me } = useSession();
  const [q, setQ] = useState('');
  const users = useQuery<U[]>('/admin/users', { q });
  const orgs = useQuery<Org[]>('/admin/organizations');
  const [grant, setGrant] = useState<U | null>(null);
  const [g, setG] = useState({ organizationId: '', role: 'compliance', reason: '' });
  const [suspend, setSuspend] = useState<U | null>(null);
  const [reason, setReason] = useState('');
  const doGrant = useMutation(async () => { await api.post('/admin/role-assignments', { userId: grant!.id, ...g }); setGrant(null); users.reload(); return true; });
  const doRevoke = useMutation(async (id: string) => { const r = window.prompt('Reason for revoking this role (min 5 chars)'); if (!r) return false; await api.delete(`/admin/role-assignments/${id}?reason=${encodeURIComponent(r)}`); users.reload(); return true; });
  const doStatus = useMutation(async () => { await api.post(`/admin/users/${suspend!.id}/status`, { status: suspend!.status === 'active' ? 'suspended' : 'active', reason }); setSuspend(null); setReason(''); users.reload(); return true; });
  const unite = (orgs.data ?? []).filter((o) => o.type === 'platform' || o.type === 'group_company');
  return (
    <Screen id="129" description="Grant and revoke Unite Group roles, suspend accounts and review MFA coverage. You cannot change your own privileges; every change requires a reason and is audited.">
      {(doRevoke.error) && <Alert tone="danger">{doRevoke.error}</Alert>}
      <Card>
        <TextInput label="Search users" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        {(users.data?.length ?? 0) >= 50 && <p className="cz-muted" style={{ fontSize: 13 }}>Showing the 50 most recent users — refine your search to find others.</p>}
        {users.loading ? <LoadingState /> : users.error ? <ApiErrorView error={users.error} onRetry={users.reload} /> : (
          <DataTable caption="Users" rows={users.data ?? []} columns={[
            { key: 'fullName', header: 'User', render: (u) => <><strong>{u.fullName}</strong><div className="cz-muted" style={{ fontSize: 13 }}>{u.email}</div></> },
            { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
            { key: 'mfa', header: 'MFA', render: (u) => (u.mfaEnabled ? '✅' : '—') },
            { key: 'memberships', header: 'Roles', render: (u) => (
              <div className="cz-stack" style={{ gap: 4 }}>{u.memberships.map((m) => (
                <span key={m.id} style={{ fontSize: 13 }}>{humanize(m.role)} · {m.orgName}{PLATFORM.includes(m.role) && u.id !== me?.id && <Button size="sm" variant="ghost" onClick={() => doRevoke.run(m.id)}>Revoke</Button>}</span>
              ))}</div>
            ) },
            { key: 'a', header: '', render: (u) => u.id !== me?.id && (
              <div className="cz-row" style={{ gap: 4 }}>
                <Button size="sm" variant="secondary" onClick={() => { setGrant(u); setG({ organizationId: unite[0]?.id ?? '', role: 'compliance', reason: '' }); }}>Grant role</Button>
                <Button size="sm" variant={u.status === 'active' ? 'danger' : 'secondary'} onClick={() => setSuspend(u)}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>
              </div>
            ) },
          ]} />
        )}
      </Card>
      <Dialog open={!!grant} onClose={() => setGrant(null)} title={`Grant role to ${grant?.fullName ?? ''}`}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); doGrant.run(); }}>
          {doGrant.error && <Alert tone="danger">{doGrant.error}</Alert>}
          <Select label="Unite Group organization" value={g.organizationId} onChange={(e) => setG({ ...g, organizationId: e.target.value })} options={unite.map((o) => ({ value: o.id, label: o.displayName }))} />
          <Select label="Role" value={g.role} onChange={(e) => setG({ ...g, role: e.target.value })} options={PLATFORM.map((r) => ({ value: r, label: humanize(r) }))} />
          <TextInput label="Reason" value={g.reason} onChange={(e) => setG({ ...g, reason: e.target.value })} error={doGrant.fieldErrors.reason} />
          <div className="cz-row"><Button type="submit" loading={doGrant.pending}>Grant</Button><Button type="button" variant="secondary" onClick={() => setGrant(null)}>Cancel</Button></div>
        </form>
      </Dialog>
      <Dialog open={!!suspend} onClose={() => setSuspend(null)} title={suspend?.status === 'active' ? 'Suspend account' : 'Reactivate account'}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); doStatus.run(); }}>
          {doStatus.error && <Alert tone="danger">{doStatus.error}</Alert>}
          <TextInput label="Reason (recorded in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} error={doStatus.fieldErrors.reason} />
          <div className="cz-row"><Button type="submit" variant={suspend?.status === 'active' ? 'danger' : 'primary'} loading={doStatus.pending}>Confirm</Button><Button type="button" variant="secondary" onClick={() => setSuspend(null)}>Cancel</Button></div>
        </form>
      </Dialog>
    </Screen>
  );
}
