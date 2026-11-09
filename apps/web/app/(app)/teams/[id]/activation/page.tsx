'use client';
import { Alert, Button, Card, LoadingState, StatusBadge, Stepper } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TeamTabs } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useTeam } from '@/lib/team';

const STEPS = ['Forming', 'NDA pending', 'Proposal', 'Approved', 'Active'];
const IDX: Record<string, number> = { forming: 0, nda_pending: 1, proposal: 2, approval_pending: 3, active: 4, dissolved: 4 };

/** Screen 064 — Collaboration Approval & Team Activation. */
export default function Activation() {
  const t = useTeam();
  const act = useMutation(async () => { await api.post(`/teams/${t.id}/activate`); t.reload(); return true; });
  if (t.loading) return <Screen id="064"><LoadingState /></Screen>;
  if (t.error) return <Screen id="064"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const d = t.data;
  const members = (d.members ?? []).filter((m: any) => ['invited', 'accepted', 'nda_signed'].includes(m.status));
  const checks = [
    { ok: members.length >= 2, label: 'At least two organizations' },
    { ok: members.length > 0 && members.every((m: any) => m.status === 'nda_signed'), label: 'Every member signed the NDA' },
    { ok: d.proposals?.[0]?.status === 'approved', label: 'Commercial sharing proposal approved by every member' },
  ];
  return (
    <Screen id="064" title={d.name}>
      <TeamTabs id={t.id} />
      <Card><Stepper steps={STEPS} current={d.status === 'active' ? 5 : IDX[d.status] ?? 0} /></Card>
      <Card title="Activation checklist" actions={<StatusBadge status={d.status} />}>
        <ul style={{ listStyle: 'none', padding: 0 }}>{checks.map((c) => <li key={c.label} style={{ padding: '6px 0' }}>{c.ok ? '✅' : '⬜️'} {c.label}</li>)}</ul>
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        {d.status === 'active' ? <Alert tone="success">Team active since {new Date(d.activatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}.</Alert> : d.isLead && <Button variant="accent" onClick={() => act.run()} loading={act.pending} disabled={!checks.every((c) => c.ok)}>Activate team</Button>}
      </Card>
    </Screen>
  );
}
