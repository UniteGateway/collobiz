import { useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { Text } from 'react-native';
import { ApiError } from '@collabiz/types';
import { Button, Field, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useSession } from '@/session';

/** Screen 012 — OTP & Email Verification (native). */
export default function Verify() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ tone: 'danger', text: e instanceof ApiError ? e.message : 'Network error' }); } finally { setBusy(false); }
  };
  return (
    <ScreenView id="012" footer={me?.emailVerified ? <Button title="Continue" variant="accent" onPress={() => router.replace('/home')} /> : <Button title="Verify" onPress={() => run(async () => { await api.post('/auth/otp/verify', { channel: 'email', code }); await refresh(); setMsg({ tone: 'success', text: 'Email verified.' }); })} loading={busy} disabled={code.length !== 6} />}>
      <Stack.Screen options={{ title: 'Verify account' }} />
      <Text style={s.p}>Enter the 6-digit code sent to {me?.email}. Codes expire in 10 minutes.</Text>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!me?.emailVerified && (
        <>
          <Field label="Verification code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
          <Button title="Resend code" variant="secondary" onPress={() => run(async () => { const r = await api.post<{ devOtp?: string }>('/auth/otp/send', { channel: 'email' }); setMsg({ tone: 'success', text: `New code sent.${r.devOtp ? ` Dev code: ${r.devOtp}` : ''}` }); })} />
        </>
      )}
    </ScreenView>
  );
}
