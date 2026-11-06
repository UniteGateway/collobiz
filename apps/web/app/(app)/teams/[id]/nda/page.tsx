'use client';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TeamTabs } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useTeam } from '@/lib/team';

/** Screen 062 — Confidentiality / NDA Workspace. */
export default function Nda() {
  const t = useTeam();
  const { me } = useSession();
  const [name, setName] = useState('');
  const respond = useMutation(async (decision: string) => { await api.post(`/teams/${t.id}/respond`, { decision }); t.reload(); return true; });
  const sign = useMutation(async () => { await api.post(`/teams/${t.id}/nda/sign`, { typedName: name }); t.reload(); return true; });
  if (t.loading) return <Screen id="062"><LoadingState /></Screen>;
  if (t.error) return <Screen id="062"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const d = t.data;
  const st = d.myMembership?.status;
  return (
    <Screen id="062" title={d.name}>
      <TeamTabs id={t.id} />
      <Card title="Team NDA">
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: 'var(--cz-navy-50)', padding: 12, borderRadius: 8 }}>{d.ndaText}</pre>
        <p className="cz-muted cz-mono" style={{ fontSize: 11 }}>Fingerprint (SHA-256): {d.ndaHash}</p>
        {(respond.error || sign.error) && <Alert tone="danger">{respond.error ?? sign.error}</Alert>}
        {st === 'invited' && <div className="cz-row"><Button onClick={() => respond.run('accept')}>Accept invitation</Button><Button variant="secondary" onClick={() => respond.run('decline')}>Decline</Button></div>}
        {st === 'accepted' && (
          <form noValidate onSubmit={(e) => { e.preventDefault(); sign.run(); }} className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label={`Type your full name (${me?.fullName}) to sign`} value={name} onChange={(e) => setName(e.target.value)} error={sign.fieldErrors.typedName} />
            <Button type="submit" loading={sign.pending}>Sign NDA</Button>
          </form>
        )}
        {st === 'nda_signed' && <Alert tone="success">Your organization signed this NDA{d.myMembership?.ndaSignedAt ? ` on ${new Date(d.myMembership.ndaSignedAt).toLocaleDateString()}` : ''}.</Alert>}
      </Card>
    </Screen>
  );
}
