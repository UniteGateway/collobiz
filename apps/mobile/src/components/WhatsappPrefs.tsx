import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button, Field, Notice, Section, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** WhatsApp updates (native) — opt-in with recorded consent; sending starts once a WhatsApp Business account is connected. */
export function WhatsappPrefs() {
  const q = useApi<any>('/me/whatsapp');
  const [number, setNumber] = useState('');
  const [kinds, setKinds] = useState<string[]>(['payment', 'approval']);
  const [agree, setAgree] = useState(false);
  useEffect(() => { const w = q.data; if (w && Array.isArray(w.kinds)) { setNumber(w.number ?? ''); if (w.kinds.length) setKinds(w.kinds); setAgree(!!w.optIn); } }, [q.data]);
  const save = useAction(async (optIn: boolean) => { await api.put('/me/whatsapp', optIn ? { optIn, number, kinds } : { optIn }); await q.reload(); });
  const w = q.data;
  if (!w || !Array.isArray(w.templates)) return null; // never take the settings screen down with it
  return (
    <Section title="WhatsApp updates" footer={w.connected ? undefined : `Not connected yet — your choice is saved. ${w.note}`}>
      <View style={{ padding: 12 }}>
        {w.optIn && <Notice tone="success">Opted in on {new Date(w.optInAt).toLocaleDateString('en-IN')}.</Notice>}
        {save.error && <Notice tone="danger">{save.error}</Notice>}
        <Field label="WhatsApp number" value={number} onChangeText={setNumber} keyboardType="phone-pad" error={save.fieldErrors.number} testID="wa-number" />
        {w.templates.map((t: any) => (
          <View key={t.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={[s.p, { flex: 1 }]}>{t.label}</Text>
            <Switch accessibilityLabel={t.label} value={kinds.includes(t.key)} onValueChange={(v) => setKinds(v ? [...kinds, t.key] : kinds.filter((k) => k !== t.key))} trackColor={{ true: theme.colors.green700 }} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Switch accessibilityLabel="I agree to receive WhatsApp messages" value={agree} onValueChange={setAgree} testID="wa-agree" />
          <Text style={[s.hint, { flex: 1 }]}>{w.consentText}</Text>
        </View>
        <Button title={w.optIn ? 'Update' : 'Turn on WhatsApp updates'} onPress={() => save.run(true)} disabled={!agree || !kinds.length || !number} loading={save.busy} testID="wa-save" />
        {w.optIn && <Button title="Stop WhatsApp updates" variant="plain" onPress={() => save.run(false)} />}
      </View>
    </Section>
  );
}
