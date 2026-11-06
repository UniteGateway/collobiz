'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, ButtonLink, Card, EmptyState, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PartnerCard, TEAM_ROLES } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 060 — Multi-Partner Project Team Builder: pick a team, add partners with roles in one place. */
function Inner() {
  const params = useSearchParams();
  const partnerId = params.get('partner') ?? '';
  const score = params.get('score');
  const teams = useQuery<any[]>('/teams');
  const partners = useQuery<any[]>('/partners');
  const led = (teams.data ?? []).filter((t) => t.isLead && !['active', 'dissolved'].includes(t.status));
  const [teamId, setTeamId] = useState('');
  const [sel, setSel] = useState<string[]>(partnerId ? [partnerId] : []);
  const [roles, setRoles] = useState<Record<string, { role: string; responsibilities: string }>>({});
  const [done, setDone] = useState<string[]>([]);
  const invite = useMutation(async () => {
    const tid = teamId || led[0]?.id;
    if (!tid) throw new Error('Create a team first');
    for (const p of sel) {
      const r = roles[p] ?? { role: 'execution', responsibilities: '' };
      await api.post(`/teams/${tid}/invitations`, { organizationId: p, role: r.role, responsibilities: r.responsibilities || 'To be agreed in the workspace', matchScore: p === partnerId && score ? Number(score) : undefined });
    }
    setDone(sel); setSel([]);
    return true;
  });
  if (teams.loading || partners.loading) return <Screen id="060"><LoadingState /></Screen>;
  if (teams.error) return <Screen id="060"><ApiErrorView error={teams.error} onRetry={teams.reload} /></Screen>;
  const name = (id: string) => partners.data?.find((p) => p.id === id)?.name ?? id;
  return (
    <Screen id="060" actions={<ButtonLink href="/teams/new" variant="secondary">New team</ButtonLink>}>
      {!led.length ? <EmptyState title="You don’t lead an open team" action={<ButtonLink href="/teams/new">Create a team</ButtonLink>} /> : (
        <>
          {done.length > 0 && <Alert tone="success">Invited: {done.map(name).join(', ')}.</Alert>}
          {invite.error && <Alert tone="danger">{invite.error}</Alert>}
          <Card title="1. Team">
            <Select label="Team" value={teamId || led[0].id} onChange={(e) => setTeamId(e.target.value)} options={led.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))} />
          </Card>
          <Card title={`2. Selected partners (${sel.length})`}>
            {!sel.length ? <p className="cz-muted">Add partners from the list below.</p> : sel.map((p) => (
              <div key={p} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
                <strong>{name(p)}</strong>
                <Select label={`Role for ${name(p)}`} value={roles[p]?.role ?? 'execution'} onChange={(e) => setRoles({ ...roles, [p]: { role: e.target.value, responsibilities: roles[p]?.responsibilities ?? '' } })} options={TEAM_ROLES.filter((r) => r !== 'lead').map((r) => ({ value: r, label: r }))} />
                <TextInput label="Responsibilities" value={roles[p]?.responsibilities ?? ''} onChange={(e) => setRoles({ ...roles, [p]: { role: roles[p]?.role ?? 'execution', responsibilities: e.target.value } })} />
              </div>
            ))}
            <Button onClick={() => invite.run()} loading={invite.pending} disabled={!sel.length}>Send invitations</Button>
          </Card>
          <h2>Verified partners</h2>
          <div className="cz-grid cz-grid-3">{(partners.data ?? []).filter((p) => !p.isMe).map((p) => <PartnerCard key={p.id} p={p} actions={<Button size="sm" variant={sel.includes(p.id) ? 'secondary' : 'primary'} onClick={() => setSel(sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id])}>{sel.includes(p.id) ? 'Remove' : 'Add to team'}</Button>} />)}</div>
        </>
      )}
    </Screen>
  );
}
export default function Builder() { return <Suspense><Inner /></Suspense>; }
