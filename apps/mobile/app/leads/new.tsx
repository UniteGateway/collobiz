import { useMemo, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { newIdempotencyKey, SECTORS } from '@collabiz/types';
import { Button, Card, Chips, Field, Notice, ScreenView, s, theme } from '@/components/ui';
import { api } from '@/api';
import { toMinor, useAction } from '@/hooks';

const METHODS = [['written_email', 'Email'], ['signed_letter', 'Signed letter'], ['meeting_minutes', 'Minutes'], ['recorded_call', 'Recorded call']];
const SCOPES = [['unite_and_approved_partners', 'Unite + approved partners'], ['unite_only', 'Unite only'], ['restricted', 'Restricted']];

/** Screens 043–046 — Register New Business Lead (native: one scrolling form, same server validation). */
export default function NewLead() {
  const router = useRouter();
  const key = useMemo(newIdempotencyKey, []);
  const [method, setMethod] = useState('written_email');
  const [scope, setScope] = useState('unite_and_approved_partners');
  const params = useLocalSearchParams<Record<string, string>>();
  const [sector, setSector] = useState<string[]>([params.sector || 'solar']);
  const [urgent, setUrgent] = useState(false);
  // Fields can arrive prefilled from the voice screen; the person still checks each one and gives consent here.
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(['legalName', 'city', 'product', 'value', 'requirements'].filter((k) => params[k]).map((k) => [k, String(params[k])])));
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const a = useAction(async () => {
    const r = await api.request<any>('POST', '/leads', {
      customer: { legalName: f.legalName, taxId: f.taxId || undefined, contactName: f.contactName, contactEmail: f.contactEmail || undefined, city: f.city, country: 'IN' },
      sector: sector[0], productOrProject: f.product, estimatedValue: toMinor(f.value ?? '') ?? 0, requirements: f.requirements,
      consent: { method, obtainedAt: new Date().toISOString(), disclosureScope: scope }, evidenceSummary: f.evidence, urgent,
    }, { idempotencyKey: key });
    router.replace(`/leads/${r.claim.id}`);
  });
  const e = a.fieldErrors;
  const Pick = ({ opts, value, onChange }: { opts: string[][]; value: string; onChange: (v: string) => void }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.space.md }}>
      {opts.map(([v, l]) => <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: value === v }} onPress={() => onChange(v)} style={[s.chip, value === v && { backgroundColor: theme.colors.navy700 }]}><Text style={{ color: value === v ? '#fff' : theme.colors.navy900 }}>{l}</Text></Pressable>)}
    </View>
  );
  return (
    <ScreenView id="043" footer={<Button title="Register protected lead" variant="accent" onPress={() => a.run()} loading={a.busy} testID="lead-submit" />}>
      <Stack.Screen options={{ title: 'Register lead' }} />
      {!params.legalName && <Text accessibilityRole="link" style={[s.p, { color: '#2E7D32', fontWeight: '600' }]} onPress={() => router.push('/leads/voice')}>Describe it by voice instead →</Text>}
      <Notice tone="info">Register only buyers who agreed to the introduction. Consent is recorded as of now.</Notice>
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      <Card title="Consent & evidence">
        <Text style={s.label}>How was consent given?</Text>
        <Pick opts={METHODS} value={method} onChange={setMethod} />
        <Text style={s.label}>Buyer allows sharing with</Text>
        <Pick opts={SCOPES} value={scope} onChange={setScope} />
        <Field label="Evidence of introduction" value={f.evidence} onChangeText={set('evidence')} multiline error={e.evidenceSummary} />
      </Card>
      <Card title="Customer">
        <Field label="Customer legal name" value={f.legalName} onChangeText={set('legalName')} error={e['customer.legalName']} />
        <Field label="GSTIN (recommended)" value={f.taxId} onChangeText={(v) => setF({ ...f, taxId: v.toUpperCase() })} autoCapitalize="characters" />
        <Field label="Contact person" value={f.contactName} onChangeText={set('contactName')} error={e['customer.contactName']} />
        <Field label="Contact email" value={f.contactEmail} onChangeText={set('contactEmail')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="City" value={f.city} onChangeText={set('city')} error={e['customer.city']} />
      </Card>
      <Card title="Scope & value">
        <Chips value={sector} onChange={(v) => setSector(v.slice(-1))} options={SECTORS.map((x) => ({ value: x.code, label: x.name }))} />
        <Field label="Product, service or project" value={f.product} onChangeText={set('product')} error={e.productOrProject} />
        <Field label="Estimated value ₹" value={f.value} onChangeText={set('value')} keyboardType="decimal-pad" />
        <Field label="Buyer requirements" value={f.requirements} onChangeText={set('requirements')} multiline error={e.requirements} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
          <Switch value={urgent} onValueChange={setUrgent} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="Urgent tender" />
          <Text style={s.p}>Urgent tender / deadline</Text>
        </View>
      </Card>
    </ScreenView>
  );
}
