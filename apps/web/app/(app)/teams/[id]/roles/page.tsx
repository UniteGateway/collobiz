'use client';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TEAM_ROLES, TeamTabs, teamRoleLabel } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useTeam } from '@/lib/team';

/** Screen 061 — Roles & Responsibilities Allocation (lead only edits). */
export default function Roles() {
  const t = useTeam();
  const [edits, setEdits] = useState<Record<string, { role: string; responsibilities: string }>>({});
  const save = useMutation(async (mid: string) => { await api.patch(`/teams/${t.id}/members/${mid}`, edits[mid]); t.reload(); return true; });
  if (t.loading) return <Screen id="061"><LoadingState /></Screen>;
  if (t.error) return <Screen id="061"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const d = t.data;
  const members = (d.members ?? []).filter((m: any) => !m.status || !['revoked', 'declined'].includes(m.status));
  return (
    <Screen id="061" title={d.name}>
      <TeamTabs id={t.id} />
      {save.error && <Alert tone="danger">{save.error}</Alert>}
      {!d.isLead && <Alert tone="info">Only the lead organization can change roles.</Alert>}
      {members.map((m: any) => {
        const e = edits[m.id] ?? { role: m.role, responsibilities: m.responsibilities ?? '' };
        return (
          <Card key={m.id ?? m.organization} title={m.organization}>
            <div className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
              <Select label="Role" value={e.role} disabled={!d.isLead} onChange={(ev) => setEdits({ ...edits, [m.id]: { ...e, role: ev.target.value } })} options={TEAM_ROLES.map((r) => ({ value: r, label: teamRoleLabel(r) }))} />
              <TextInput label="Responsibilities" value={e.responsibilities} disabled={!d.isLead} onChange={(ev) => setEdits({ ...edits, [m.id]: { ...e, responsibilities: ev.target.value } })} />
              {d.isLead && m.id && <Button onClick={() => save.run(m.id)} disabled={!edits[m.id]}>Save</Button>}
            </div>
          </Card>
        );
      })}
    </Screen>
  );
}
