'use client';
import { Alert, Button, Card, DataTable, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TeamTabs } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useTeam } from '@/lib/team';

/** Screen 155 — Consortium Member Roles & Sharing. */
export default function Members() {
  const t = useTeam();
  const revoke = useMutation(async (mid: string) => { const reason = window.prompt('Reason for removing this member (min 5 characters)'); if (!reason) return false; await api.post(`/teams/${t.id}/members/${mid}/revoke`, { reason }); t.reload(); return true; });
  if (t.loading) return <Screen id="155"><LoadingState /></Screen>;
  if (t.error) return <Screen id="155"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const d = t.data;
  const latest = d.proposals?.[0];
  const share = (orgId: string) => latest?.shares.find((s: any) => s.organizationId === orgId)?.sharePct;
  return (
    <Screen id="155" title={d.name}>
      <TeamTabs id={t.id} />
      {revoke.error && <Alert tone="danger">{revoke.error}</Alert>}
      {d.kind === 'consortium' && <Alert tone="info">Consortium: an agreement among the named parties below — not a separate legal entity.</Alert>}
      <Card>
        <DataTable caption="Members" rows={d.members.map((m: any, i: number) => ({ ...m, id: m.id ?? String(i) }))} columns={[
          { key: 'organization', header: 'Party' },
          { key: 'role', header: 'Role', render: (m: any) => <>{m.role}{m.responsibilities && <div className="cz-muted" style={{ fontSize: 12 }}>{m.responsibilities}</div>}</> },
          { key: 'share', header: `Share${latest ? ` (v${latest.version}, ${latest.status})` : ''}`, render: (m: any) => (share(m.organizationId) != null ? `${share(m.organizationId)}%` : '—') },
          { key: 'status', header: 'Status', render: (m: any) => (m.status ? <StatusBadge status={m.status} /> : '—') },
          { key: 'nda', header: 'NDA', render: (m: any) => (m.ndaSignedAt ? `Signed ${new Date(m.ndaSignedAt).toLocaleDateString()}` : '—') },
          { key: 'x', header: '', render: (m: any) => d.isLead && m.organizationId !== d.myMembership?.organizationId && m.status && !['revoked', 'declined'].includes(m.status) && <Button size="sm" variant="ghost" onClick={() => revoke.run(m.id)}>Remove</Button> },
        ]} />
      </Card>
    </Screen>
  );
}
