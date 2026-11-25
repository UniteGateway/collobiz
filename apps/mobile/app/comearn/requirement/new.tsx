import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CE_CATEGORIES, type CeCategory } from '@collabiz/types';
import { Button, Card, Field, Notice, ScreenView, Segmented, s } from '@/components/ui';
import { api } from '@/api';
import { useAction } from '@/hooks';

/** Post a customer requirement (native): businesses offer commissions; the customer stays private until you select one. */
export default function ComearnNewRequirement() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', category: 'solar' as CeCategory, description: '', city: '', value: '', customerName: '', contactName: '', phone: '', email: '', consent: false });
  const closesOn = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const save = useAction(async () => {
    const r = await api.post<{ id: string }>('/comearn/requirements', { title: f.title, category: f.category, description: f.description, city: f.city, estimatedValuePaise: f.value ? Math.round(Number(f.value) * 100) : undefined, closesOn,
      customerName: f.customerName, contactName: f.contactName, phone: f.phone || undefined, email: f.email || undefined, consent: f.consent });
    router.replace(`/comearn/requirement/${r.id}` as never); return r;
  });
  const fe = save.fieldErrors;
  return (
    <ScreenView title="Post a customer requirement" subtitle="Businesses on COLLABIZ offer you a commission to serve it. Offers close in 14 days.">
      <Stack.Screen options={{ title: 'New requirement' }} />
      {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
      <Card title="What the customer needs (businesses see this)">
        <Field label="Requirement" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={fe.title} />
        <Segmented label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v as CeCategory })} options={Object.entries(CE_CATEGORIES).slice(0, 4).map(([value, label]) => ({ value, label }))} />
        <Field label="Location" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} error={fe.city} />
        <Field label="Estimated value (₹)" keyboardType="decimal-pad" value={f.value} onChangeText={(v) => setF({ ...f, value: v })} />
        <Field label="Details" multiline value={f.description} onChangeText={(v) => setF({ ...f, description: v })} error={fe.description} />
      </Card>
      <Card title="Customer (private)">
        <Text style={[s.hint, { marginBottom: 8 }]}>Shared only with the business you select.</Text>
        <Field label="Customer name" value={f.customerName} onChangeText={(v) => setF({ ...f, customerName: v })} error={fe.customerName} />
        <Field label="Contact person" value={f.contactName} onChangeText={(v) => setF({ ...f, contactName: v })} error={fe.contactName} />
        <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} error={fe.phone} />
        <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} error={fe.email} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}><Switch value={f.consent} onValueChange={(v) => setF({ ...f, consent: v })} accessibilityLabel="Customer agreed to receive offers" /><Text style={{ flex: 1 }}>The customer agreed to receive offers through me</Text></View>
        {fe.consent ? <Notice tone="danger">{fe.consent}</Notice> : null}
      </Card>
      <Button title="Post requirement" loading={save.busy} onPress={() => save.run()} />
    </ScreenView>
  );
}
