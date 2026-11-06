import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ApiError } from '@collabiz/types';
import { Button, Field, Notice, ScreenView, s, theme } from '@/components/ui';
import { api, tokens } from '@/api';
import { useSession } from '@/session';

/** Screen 011 — Login / Create Account (native, atlas mobile-first). */
export default function Login() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const router = useRouter();
  const { signIn, refresh } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>(params.mode === 'register' ? 'register' : 'login');
  const [f, setF] = useState({ email: '', password: '', fullName: '', phone: '', mfaCode: '', accept: false });
  const [needMfa, setNeedMfa] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null); setFe({});
    try {
      if (mode === 'login') {
        await signIn(f.email.trim(), f.password, needMfa ? f.mfaCode : undefined);
        router.replace('/home');
      } else {
        const r = await api.post<{ accessToken: string; refreshToken: string }>('/auth/register', { email: f.email.trim(), password: f.password, fullName: f.fullName, phone: f.phone || undefined, acceptTerms: f.accept, client: 'mobile' });
        await tokens.set(r.accessToken, r.refreshToken);
        await refresh();
        router.replace('/verify');
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if ((e.body as { mfaRequired?: boolean })?.mfaRequired && !needMfa) { setNeedMfa(true); return; }
        setErr(e.message); setFe(e.fieldErrors());
      } else setErr('Network error — check your connection.');
    } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <ScreenView id="011" footer={<Button title={mode === 'login' ? (needMfa ? 'Verify and sign in' : 'Sign in') : 'Create account'} onPress={submit} loading={busy} testID="login-submit" />}>
      <Stack.Screen options={{ title: mode === 'login' ? 'Sign in' : 'Create account' }} />
      <View style={{ flexDirection: 'row', marginBottom: theme.space.lg, gap: 8 }}>
        {(['login', 'register'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => { setMode(m); setNeedMfa(false); }} style={[s.chip, mode === m && { backgroundColor: theme.colors.navy700 }]}>
            <Text style={{ color: mode === m ? '#fff' : theme.colors.navy900, fontWeight: '600' }}>{m === 'login' ? 'Sign in' : 'Create account'}</Text>
          </Pressable>
        ))}
      </View>
      {err && <Notice tone="danger">{err}</Notice>}
      {mode === 'register' && <Field label="Full name" value={f.fullName} onChangeText={set('fullName')} error={fe.fullName} autoComplete="name" />}
      <Field label="Email" value={f.email} onChangeText={set('email')} error={fe.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" testID="login-email" />
      {mode === 'register' && <Field label="Mobile number (optional)" value={f.phone} onChangeText={set('phone')} error={fe.phone} keyboardType="phone-pad" />}
      <Field label="Password" value={f.password} onChangeText={set('password')} error={fe.password} secureTextEntry autoComplete="password" testID="login-password" hint={mode === 'register' ? 'At least 10 characters with a letter and a number' : undefined} />
      {needMfa && <Field label="Authentication code" value={f.mfaCode} onChangeText={set('mfaCode')} keyboardType="number-pad" maxLength={6} autoFocus />}
      {mode === 'register' && (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.accept }} onPress={() => setF({ ...f, accept: !f.accept })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }}>
          <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: theme.colors.green500, backgroundColor: f.accept ? theme.colors.green500 : 'transparent' }} />
          <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>I accept the partner terms and privacy notice</Text>
        </Pressable>
      )}
      {fe.acceptTerms && <Text style={s.error}>{fe.acceptTerms}</Text>}
    </ScreenView>
  );
}
