import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Badge, Button, Card, ErrorView, Field, Loading, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

/** Screen 021 — Agreement Acceptance & e-Sign (native; typed-name evidence). */
export default function Agreements() {
  const router = useRouter();
  const { me } = useSession();
  const ags = useApi<any[]>('/onboarding/agreements');
  const [names, setNames] = useState<Record<string, string>>({});
  const a = useAction(async (code: string, version: number) => { await api.post('/onboarding/agreements/accept', { templateCode: code, version, typedName: names[code] ?? '' }); ags.reload(); });
  const all = !!ags.data?.length && ags.data.every((x) => x.accepted);
  return (
    <ScreenView id="021" footer={<Button title="Continue to review" onPress={() => router.push('/onboarding/status')} disabled={!all} />}>
      <Stack.Screen options={{ title: 'Agreements' }} />
      <Notice tone="warning">Draft templates pending legal review.</Notice>
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {ags.loading ? <Loading /> : ags.error ? <ErrorView error={ags.error} onRetry={ags.reload} /> : ags.data!.map((g) => (
        <Card key={g.code} title={`${g.title} v${g.version}`}>
          <Badge status={g.accepted ? 'signed' : 'pending'} label={g.accepted ? 'Signed' : 'Not signed'} />
          <Text style={[s.p, { marginTop: 8 }]}>{g.body}</Text>
          {!g.accepted && (
            <>
              <Field label={`Type "${me?.fullName}" to sign`} value={names[g.code]} onChangeText={(v) => setNames({ ...names, [g.code]: v })} error={a.fieldErrors.typedName} />
              <Button title="Sign" onPress={() => a.run(g.code, g.version)} loading={a.busy} />
            </>
          )}
        </Card>
      ))}
    </ScreenView>
  );
}
