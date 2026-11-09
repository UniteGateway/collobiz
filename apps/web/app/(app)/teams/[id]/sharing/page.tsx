'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, DataTable, LoadingState, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TeamTabs, teamRoleLabel } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useTeam } from '@/lib/team';

/** Screen 063 — Commercial Sharing Proposal (versioned; every member approves). */
export default function Sharing() {
  const t = useTeam();
  const d = t.data;
  const active = (d?.members ?? []).filter((m: any) => ['invited', 'accepted', 'nda_signed'].includes(m.status));
  const [shares, setShares] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState('');
  const [comment, setComment] = useState('');
  useEffect(() => { if (d?.members) setShares(Object.fromEntries(active.map((m: any) => [m.organizationId, ''])) ); }, [d?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0);
  const propose = useMutation(async () => { await api.post(`/teams/${t.id}/proposals`, { shares: Object.entries(shares).map(([organizationId, v]) => ({ organizationId, sharePct: Number(v) || 0 })), terms }); t.reload(); return true; });
  const decide = useMutation(async (pid: string, decision: string) => { await api.post(`/teams/${t.id}/proposals/${pid}/decision`, { decision, comment: comment || undefined }); setComment(''); t.reload(); return true; });
  if (t.loading) return <Screen id="063"><LoadingState /></Screen>;
  if (t.error) return <Screen id="063"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  if (d.access !== 'full') return <Screen id="063"><TeamTabs id={t.id} /><Alert tone="warning">Sign the team NDA to see commercial terms.</Alert></Screen>;
  const p = d.proposals?.[0];
  const mine = p?.approvals.find((a: any) => a.organizationId === d.myMembership?.organizationId);
  return (
    <Screen id="063" title={d.name}>
      <TeamTabs id={t.id} />
      {(propose.error || decide.error) && <Alert tone="danger">{propose.error ?? decide.error}</Alert>}
      {p && (
        <Card title={`Proposal v${p.version}`} actions={<StatusBadge status={p.status} />}>
          <DataTable caption="Shares" rows={p.shares.map((s: any) => ({ ...s, id: s.organizationId }))} columns={[
            { key: 'organization', header: 'Party' }, { key: 'role', header: 'Role', render: (s: any) => teamRoleLabel(s.role) }, { key: 'sharePct', header: 'Share', render: (s: any) => `${s.sharePct}%` },
            { key: 'approval', header: 'Decision', render: (s: any) => { const a = p.approvals.find((x: any) => x.organizationId === s.organizationId); return a ? <StatusBadge status={a.decision === 'approve' ? 'approved' : 'rejected'} /> : <StatusBadge status="pending" />; } },
          ]} />
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{p.terms}</p>
          {p.status === 'submitted' && !mine && (
            <div className="cz-row" style={{ alignItems: 'flex-end' }}>
              <TextInput label="Comment (required to reject)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button onClick={() => decide.run(p.id, 'approve')}>Approve</Button>
              <Button variant="danger" onClick={() => decide.run(p.id, 'reject')}>Reject</Button>
            </div>
          )}
        </Card>
      )}
      {d.isLead && d.status !== 'active' && (
        <Card title={p ? 'Propose a revision' : 'Propose commercial sharing'}>
          {active.map((m: any) => (
            <TextInput key={m.organizationId} label={`${m.organization} (${teamRoleLabel(m.role)}) — share %`} inputMode="decimal" value={shares[m.organizationId] ?? ''} onChange={(e) => setShares({ ...shares, [m.organizationId]: e.target.value })} />
          ))}
          <p style={{ color: Math.abs(total - 100) < 0.001 ? 'var(--cz-green-800)' : 'var(--cz-danger)' }}>Total: {total}%</p>
          <TextArea label="Terms (fee method, milestones, invoicing, taxes)" value={terms} onChange={(e) => setTerms(e.target.value)} error={propose.fieldErrors.terms} />
          <Button onClick={() => propose.run()} loading={propose.pending} disabled={Math.abs(total - 100) > 0.001}>Submit for approval</Button>
        </Card>
      )}
    </Screen>
  );
}
