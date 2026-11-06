import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Button, Card, Field, Notice, ScreenView, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi, nextRoute } from '@/hooks';

/** Screen 020 — Bank & Tax Profile (native). Sensitive values are masked on return. */
export default function BankTax() {
  const router = useRouter();
  const cur = useApi<any>('/onboarding/bank-tax');
  const [f, setF] = useState<Record<string, string>>({ tdsSection: '194H' });
  const [gst, setGst] = useState(false);
  const set = (k: string, upper = false) => (v: string) => setF({ ...f, [k]: upper ? v.toUpperCase() : v });
  const a = useAction(async () => { await api.put('/onboarding/bank-tax', { ...f, gstRegistered: gst, gstin: gst ? f.gstin : undefined }); router.push(nextRoute('bank_tax')); });
  const e = a.fieldErrors;
  return (
    <ScreenView id="020" footer={<Button title="Save and continue" onPress={() => a.run()} loading={a.busy} />}>
      <Stack.Screen options={{ title: 'Bank & tax' }} />
      {cur.data && <Card title="On file"><Text style={s.p}>{cur.data.bankName} {cur.data.accountMasked} · PAN {cur.data.panMasked}</Text></Card>}
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <Field label="Account holder" value={f.accountHolder} onChangeText={set('accountHolder')} error={e.accountHolder} />
      <Field label="Account number" value={f.accountNumber} onChangeText={set('accountNumber')} keyboardType="number-pad" error={e.accountNumber} secureTextEntry />
      <Field label="IFSC" value={f.ifsc} onChangeText={set('ifsc', true)} autoCapitalize="characters" error={e.ifsc} />
      <Field label="Bank name" value={f.bankName} onChangeText={set('bankName')} error={e.bankName} />
      <Field label="PAN" value={f.pan} onChangeText={set('pan', true)} autoCapitalize="characters" error={e.pan} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Switch value={gst} onValueChange={setGst} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="GST registered" />
        <Text style={s.p}>GST registered</Text>
      </View>
      {gst && <Field label="GSTIN" value={f.gstin} onChangeText={set('gstin', true)} autoCapitalize="characters" error={e.gstin} />}
    </ScreenView>
  );
}
