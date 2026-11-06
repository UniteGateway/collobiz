import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Button, Chips, Notice, ScreenView, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, nextRoute } from '@/hooks';

const REGIONS: [string, string][] = [['IN-MH', 'Maharashtra'], ['IN-GJ', 'Gujarat'], ['IN-KA', 'Karnataka'], ['IN-TN', 'Tamil Nadu'], ['IN-TG', 'Telangana'], ['IN-AP', 'Andhra Pradesh'], ['IN-DL', 'Delhi'], ['IN-RJ', 'Rajasthan'], ['IN-UP', 'Uttar Pradesh'], ['IN-WB', 'West Bengal'], ['IN-KL', 'Kerala'], ['IN-MP', 'Madhya Pradesh'], ['AE', 'UAE'], ['SA', 'Saudi Arabia'], ['BD', 'Bangladesh'], ['KE', 'Kenya']];

/** Screen 017 — Geographical Coverage Selection (native). */
export default function Coverage() {
  const router = useRouter();
  const [regions, setRegions] = useState<string[]>([]);
  const [travel, setTravel] = useState(false);
  const a = useAction(async () => { await api.put('/onboarding/coverage', { regions, willingToTravel: travel }); router.push(nextRoute('coverage')); });
  return (
    <ScreenView id="017" footer={<Button title="Save and continue" onPress={() => a.run()} loading={a.busy} />}>
      <Stack.Screen options={{ title: 'Coverage' }} />
      {a.error && <Notice tone="danger">{a.fieldErrors.regions ? 'Select at least one region' : a.error}</Notice>}
      <Chips value={regions} onChange={setRegions} options={REGIONS.map(([v, l]) => ({ value: v, label: l }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
        <Text style={s.p}>Willing to travel / mobilise elsewhere</Text>
        <Switch value={travel} onValueChange={setTravel} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="Willing to travel" />
      </View>
    </ScreenView>
  );
}
