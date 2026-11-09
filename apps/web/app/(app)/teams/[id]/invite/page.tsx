'use client';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TEAM_ROLES, TeamTabs, teamRoleLabel } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useTeam } from '@/lib/team';

/** Screen 058 — Invite Partner to Collaborate (verified partners only). */
export default function Invite() {
  const t = useTeam();
  const partners = useQuery<any[]>('/partners');
  const [f, setF] = useState({ organizationId: '', role: 'execution', responsibilities: '', message: '' });
  const [ok, setOk] = useState<string | null>(null);
  const m = useMutation(async () => { await api.post(`/teams/${t.id}/invitations`, { ...f, message: f.message || undefined }); setOk('Invitation sent.'); setF({ ...f, organizationId: '', responsibilities: '', message: '' }); t.reload(); return true; });
  if (t.loading) return <Screen id="058"><LoadingState /></Screen>;
  if (t.error) return <Screen id="058"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const taken = new Set((t.data.members ?? []).filter((x: any) => !['revoked', 'declined'].includes(x.status)).map((x: any) => x.organizationId));
  return (
    <Screen id="058" title={t.data.name}>
      <TeamTabs id={t.id} />
      {!t.data.isLead ? <Alert tone="info">Only the lead organization can invite partners.</Alert> : (
        <Card>
          {ok && <Alert tone="success">{ok}</Alert>}
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <form noValidate onSubmit={(e) => { e.preventDefault(); setOk(null); m.run(); }}>
            <Select label="Partner" value={f.organizationId} onChange={(e) => setF({ ...f, organizationId: e.target.value })} placeholder="Choose a verified partner" options={(partners.data ?? []).filter((p) => !p.isMe && !taken.has(p.id)).map((p) => ({ value: p.id, label: `${p.name} · ${p.level}` }))} />
            <div className="cz-grid cz-grid-2">
              <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={TEAM_ROLES.filter((r) => r !== 'lead').map((r) => ({ value: r, label: teamRoleLabel(r) }))} />
              <TextInput label="Responsibilities" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} error={m.fieldErrors.responsibilities} />
            </div>
            <TextArea label="Message (optional — no confidential buyer details before NDA)" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
            <Button type="submit" loading={m.pending} disabled={!f.organizationId}>Send invitation</Button>
          </form>
        </Card>
      )}
    </Screen>
  );
}
