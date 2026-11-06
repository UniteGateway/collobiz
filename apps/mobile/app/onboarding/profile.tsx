import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Button, Field, Notice, ScreenView, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, nextRoute } from '@/hooks';

/** Screen 018 — Business Profile Builder (native). */
export default function ProfileBuilder() {
  const router = useRouter();
  const [f, setF] = useState({ headline: '', about: '', services: '' });
  const [consent, setConsent] = useState(true);
  const a = useAction(async () => { await api.put('/onboarding/profile', { headline: f.headline, about: f.about, services: f.services.split(',').map((x) => x.trim()).filter(Boolean), pastProjects: [], consentToMatch: consent }); router.push(nextRoute('profile')); });
  return (
    <ScreenView id="018" footer={<Button title="Save and continue" onPress={() => a.run()} loading={a.busy} />}>
      <Stack.Screen options={{ title: 'Business profile' }} />
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <Field label="Headline" value={f.headline} onChangeText={(v) => setF({ ...f, headline: v })} error={a.fieldErrors.headline} maxLength={160} />
      <Field label="About your business" value={f.about} onChangeText={(v) => setF({ ...f, about: v })} error={a.fieldErrors.about} multiline />
      <Field label="Services (comma-separated)" value={f.services} onChangeText={(v) => setF({ ...f, services: v })} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Switch value={consent} onValueChange={setConsent} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="Consent to explainable matching" />
        <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>I consent to explainable, human-reviewed AI matching</Text>
      </View>
    </ScreenView>
  );
}
