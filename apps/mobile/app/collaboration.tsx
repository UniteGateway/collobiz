import { useState } from 'react';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { TEAM_ROLE_LABELS } from '@collabiz/types';
import { Badge, Button, Card, Empty, ErrorView, Field, Loading, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

/** Screen 059 — Incoming Collaboration Requests (native, atlas mobile-first): accept/decline and sign the team NDA. */
export default function Requests() {
  const { me } = useSession();
  const q = useApi<any[]>('/collaboration/requests');
  const [names, setNames] = useState<Record<string, string>>({});
  const respond = useAction(async (teamId: string, decision: string) => { await api.post(`/teams/${teamId}/respond`, { decision }); await q.reload(); });
  const sign = useAction(async (teamId: string) => { await api.post(`/teams/${teamId}/nda/sign`, { typedName: names[teamId] ?? '' }); await q.reload(); });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView id="059">
      <Stack.Screen options={{ title: 'Collaboration requests' }} />
      {(respond.error || sign.error) && <Notice tone="danger">{respond.error ?? sign.error}</Notice>}
      {!q.data?.length ? <Empty title="No collaboration requests" /> : q.data.map((r) => (
        <Card key={r.memberId} title={`${r.team} — ${r.lead}`}>
          <Badge status={r.status} />
          <Text style={[s.p, { marginTop: 8 }]}>{r.purpose}</Text>
          <Text style={s.hint}>Your role: {TEAM_ROLE_LABELS[r.role] ?? r.role}{r.responsibilities ? ` — ${r.responsibilities}` : ''}</Text>
          {r.status === 'invited' && <><Button title="Accept" onPress={() => respond.run(r.teamId, 'accept')} loading={respond.busy} /><Button title="Decline" variant="secondary" onPress={() => respond.run(r.teamId, 'decline')} /></>}
          {r.status === 'accepted' && (
            <>
              <Notice tone="info">Sign the team NDA to unlock the workspace.</Notice>
              <Field label={`Type "${me?.fullName}" to sign`} value={names[r.teamId]} onChangeText={(v) => setNames({ ...names, [r.teamId]: v })} error={sign.fieldErrors.typedName} />
              <Button title="Sign NDA" variant="accent" onPress={() => sign.run(r.teamId)} loading={sign.busy} />
            </>
          )}
        </Card>
      ))}
    </ScreenView>
  );
}
