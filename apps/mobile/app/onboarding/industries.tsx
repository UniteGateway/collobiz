import { useState } from 'react';
import { Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SECTORS } from '@collabiz/types';
import { Button, Chips, Field, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, nextRoute, toMinor } from '@/hooks';

const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

/** Screen 016 — Partner Industry & Skills Selection (native). */
export default function Industries() {
  const router = useRouter();
  const [sectors, setSectors] = useState<string[]>([]);
  const [skills, setSkills] = useState('');
  const [certs, setCerts] = useState('');
  const [cap, setCap] = useState('');
  const a = useAction(async () => { await api.put('/onboarding/industries', { sectors, skills: list(skills), certifications: list(certs), capacityMax: toMinor(cap) }); router.push(nextRoute('industries')); });
  return (
    <ScreenView id="016" footer={<Button title="Save and continue" onPress={() => a.run()} loading={a.busy} />}>
      <Stack.Screen options={{ title: 'Industries & skills' }} />
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <Text style={s.label}>Sectors</Text>
      <Chips value={sectors} onChange={setSectors} options={SECTORS.map((x) => ({ value: x.code, label: x.name }))} />
      <Field label="Skills (comma-separated)" value={skills} onChangeText={setSkills} />
      <Field label="Certifications (comma-separated)" value={certs} onChangeText={setCerts} />
      <Field label="Max project value ₹ (optional)" value={cap} onChangeText={setCap} keyboardType="decimal-pad" />
    </ScreenView>
  );
}
