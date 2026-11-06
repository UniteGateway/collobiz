import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { PARTNER_TYPES } from '@collabiz/types';
import { Button, Card, Chips, Notice, ScreenView, s, theme } from '@/components/ui';
import { api, tokens } from '@/api';
import { useAction, nextRoute } from '@/hooks';
import { useSession } from '@/session';

/** Screen 013 — Select Account Type (native). */
export default function AccountType() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const [kind, setKind] = useState<'individual' | 'company'>('company');
  const [types, setTypes] = useState<string[]>([]);
  const a = useAction(async () => {
    const r = await api.post<{ organizationId: string }>('/onboarding/account-type', { kind, partnerTypes: types });
    await tokens.setOrg(r.organizationId);
    await refresh();
    router.push(nextRoute('account_type'));
  });
  return (
    <ScreenView id="013" footer={<Button title="Save and continue" onPress={() => a.run()} loading={a.busy} disabled={!me?.emailVerified} testID="acct-continue" />}>
      <Stack.Screen options={{ title: 'Account type' }} />
      {!me?.emailVerified && <Notice tone="warning">Verify your email first.</Notice>}
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {(['individual', 'company'] as const).map((k) => (
        <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} onPress={() => setKind(k)}>
          <Card style={{ borderColor: kind === k ? theme.colors.green500 : theme.colors.grey100, borderWidth: 2 }}>
            <Text style={s.h2}>{k === 'individual' ? 'Individual partner' : 'Company partner'}</Text>
            <Text style={s.hint}>{k === 'individual' ? 'Consultants and independent professionals.' : 'Contractors, traders, manufacturers and firms with teams.'}</Text>
          </Card>
        </Pressable>
      ))}
      <Text style={s.label}>Business types</Text>
      <Chips value={types} onChange={setTypes} options={PARTNER_TYPES.map((p) => ({ value: p, label: p.replace('_', ' ') }))} />
      {a.fieldErrors.partnerTypes && <Text style={s.error}>{a.fieldErrors.partnerTypes}</Text>}
    </ScreenView>
  );
}
