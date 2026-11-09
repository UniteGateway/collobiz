'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, Select, StatusBadge, TextInput, LoadingState, EmptyState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Member { membershipId: string; userId: string; fullName: string; email: string; role: string; status: string; joinedAt: string; lastLoginAt: string | null }
const ROLE_LABEL: Record<string, string> = { org_owner: 'Owner', org_admin: 'Admin', org_member: 'Member' };

/** Screen 144 — Company Team & Sub-Accounts. */
export default function TeamPage() {
  const { me } = useSession();
  const members = useQuery<Member[]>('/orgs/current/members');
  const [f, setF] = useState({ email: '', fullName: '', role: 'org_member' });
  const [ok, setOk] = useState<string | null>(null);
  const invite = useMutation(async () => {
    await api.post('/orgs/current/members', f);
    setOk(`Invitation sent to ${f.email}.`);
    setF({ email: '', fullName: '', role: 'org_member' });
    members.reload();
    return true;
  });
  const setRole = useMutation(async (id: string, role: string) => {
    await api.patch(`/orgs/current/members/${id}`, { role });
    members.reload();
    return true;
  });
  const remove = useMutation(async (id: string) => {
    if (!window.confirm('Remove this person from your organization?')) return false;
    await api.delete(`/orgs/current/members/${id}`);
    members.reload();
    return true;
  });
  const isOwner = me?.orgRoles.includes('org_owner');
  const err = setRole.error ?? remove.error;
  return (
    <Screen id="144" description="Invite colleagues, assign roles and manage sub-accounts. Owners and admins manage the team; every change is audited.">
      {err && <Alert tone="danger">{err}</Alert>}
      <Card title={`Team — ${me?.activeOrg?.name ?? ''}`}>
        {members.loading ? <LoadingState /> : members.error ? <ApiErrorView error={members.error} onRetry={members.reload} /> : (
          <DataTable caption="Team members" rows={(members.data ?? []).map((m) => ({ ...m, id: m.membershipId }))} empty={<EmptyState title="No team members yet" />} columns={[
            { key: 'fullName', header: 'Name', render: (m) => <><strong>{m.fullName}</strong><div className="cz-muted" style={{ fontSize: 13 }}>{m.email}</div></> },
            { key: 'role', header: 'Role', render: (m) => m.userId === me?.id ? ROLE_LABEL[m.role] : (
              <label><span className="cz-sr-only">Role for {m.fullName}</span>
                <select className="cz-select" style={{ minHeight: 34, padding: '4px 8px' }} value={m.role} onChange={(e) => setRole.run(m.membershipId, e.target.value)}>
                  {(isOwner ? ['org_owner', 'org_admin', 'org_member'] : ['org_admin', 'org_member']).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select></label>
            ) },
            { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
            { key: 'lastLoginAt', header: 'Last sign-in', render: (m) => (m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—') },
            { key: 'x', header: '', render: (m) => m.userId !== me?.id && <Button size="sm" variant="ghost" onClick={() => remove.run(m.membershipId)}>Remove</Button> },
          ]} />
        )}
      </Card>
      <Card title="Invite a colleague">
        {ok && <Alert tone="success">{ok}</Alert>}
        {invite.error && <Alert tone="danger">{invite.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); setOk(null); invite.run(); }} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
          <TextInput label="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={invite.fieldErrors.fullName} />
          <TextInput label="Work email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={invite.fieldErrors.email} />
          <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: 'org_member', label: 'Member' }, { value: 'org_admin', label: 'Admin' }]} />
          <Button type="submit" loading={invite.pending}>Send invitation</Button>
        </form>
      </Card>
    </Screen>
  );
}
