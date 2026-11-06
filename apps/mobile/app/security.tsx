import { useState } from 'react';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { ApiError } from '@collabiz/types';
import { Badge, Button, Card, Field, Notice, ScreenView, s } from '@/components/ui';
import { api, tokens } from '@/api';
import { useSession } from '@/session';

/** Screen 145 — Account Security & MFA (native, atlas mobile-first). */
export default function Security() {
  const { me, refresh } = useSession();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Network error' }); } finally { setBusy(false); }
  };
  return (
    <ScreenView id="145">
      <Stack.Screen options={{ title: 'Security' }} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card title="Multi-factor authentication">
        <Badge status={me?.mfaEnabled ? 'active' : 'pending'} label={me?.mfaEnabled ? 'Enabled' : 'Not enabled'} />
        {!me?.mfaEnabled && !setup && <Button title="Set up authenticator app" onPress={() => run(async () => setSetup(await api.post('/auth/mfa/setup')))} loading={busy} />}
        {setup && !me?.mfaEnabled && (
          <>
            <Text style={[s.p, { marginTop: 8 }]}>Open your authenticator app, or add this key manually:</Text>
            <Text selectable style={[s.p, { fontFamily: 'Courier' }]}>{setup.secret}</Text>
            <Button title="Open authenticator app" variant="secondary" onPress={() => Linking.openURL(setup.otpauthUrl)} />
            <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <Button title="Enable MFA" onPress={() => run(async () => {
              const r = await api.post<{ accessToken: string; refreshToken: string }>('/auth/mfa/enable', { code, client: 'mobile' });
              await tokens.set(r.accessToken, r.refreshToken);
              await refresh();
              setMsg({ tone: 'success', text: 'MFA enabled.' });
            })} loading={busy} disabled={code.length !== 6} />
          </>
        )}
      </Card>
      <Card title="Account">
        <Text style={s.p}>{me?.email}</Text>
        <Text style={s.hint}>Email {me?.emailVerified ? 'verified' : 'not verified'}</Text>
      </Card>
    </ScreenView>
  );
}
