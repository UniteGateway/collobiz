import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COUNTRIES, SECTORS } from '@collabiz/types';
import { Badge, Button, Empty, ErrorView, Field, Loading, Notice, ScreenView, Section, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface App { id: string; countryName: string; status: string; decisionReason: string | null; createdAt: string }
const STATUS: Record<string, [string, 'info' | 'success' | 'warning' | 'neutral']> = { submitted: ['Under review', 'info'], approved: ['Approved', 'success'], rejected: ['Not approved', 'warning'], withdrawn: ['Withdrawn', 'neutral'] };

/** Screen 120 — Country partner registration (native). Unite Group reviews every application. */
export default function CountryPartner() {
  const q = useApi<{ applications: App[] }>('/global/country-partner/applications');
  const [f, setF] = useState({ country: 'AE', sectors: [] as string[], localEntity: '', localRegistration: '', teamSize: '3', plan: '' });
  const [sent, setSent] = useState(false);
  const a = useAction(async () => { await api.post('/global/country-partner/applications', { ...f, teamSize: Number(f.teamSize) || 1 }); setSent(true); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const chip = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? theme.colors.navy700 : theme.colors.grey200, backgroundColor: on ? theme.colors.navy700 : '#fff' });
  return (
    <ScreenView id="120" title="Country partner" subtitle="Represent the network in a market outside India. Unite Group reviews every application."
      footer={<Button title="Submit application" variant="accent" onPress={() => a.run()} loading={a.busy} disabled={!f.sectors.length || f.plan.trim().length < 50 || !f.localEntity || !f.localRegistration} testID="apply" />}>
      {sent && <Notice tone="success" title="Application sent">Unite Group will review it and reply by notification.</Notice>}
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {(q.data?.applications ?? []).length > 0 && (
        <Section title="Your applications">{q.data!.applications.map((x) => (
          <View key={x.id} style={{ padding: 14, backgroundColor: '#fff', gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[s.rowTitle, { fontWeight: '600' }]}>{x.countryName}</Text><Badge status={x.status} tone={STATUS[x.status]?.[1]} label={STATUS[x.status]?.[0]} /></View>
            {x.decisionReason ? <Text style={s.rowSub}>{x.decisionReason}</Text> : null}
          </View>
        ))}</Section>
      )}
      <Text style={s.sectionTitle}>Country</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.space.lg }}>
        {COUNTRIES.filter(([c]) => c !== 'IN').map(([c, n]) => <Pressable key={c} onPress={() => setF({ ...f, country: c })} accessibilityRole="radio" accessibilityState={{ checked: f.country === c }} style={chip(f.country === c)}><Text style={{ color: f.country === c ? '#fff' : theme.colors.navy900, fontSize: 14 }}>{n}</Text></Pressable>)}
      </View>
      <Text style={s.sectionTitle}>Sectors (up to 5)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.space.lg }}>
        {SECTORS.map((x) => { const on = f.sectors.includes(x.code); return <Pressable key={x.code} onPress={() => setF({ ...f, sectors: on ? f.sectors.filter((y) => y !== x.code) : [...f.sectors, x.code].slice(0, 5) })} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={chip(on)} testID={`sector-${x.code}`}><Text style={{ color: on ? '#fff' : theme.colors.navy900, fontSize: 14 }}>{x.name}</Text></Pressable>; })}
      </View>
      <Field label="Local company" value={f.localEntity} onChangeText={(v) => setF({ ...f, localEntity: v })} error={a.fieldErrors.localEntity} />
      <Field label="Registration number" value={f.localRegistration} onChangeText={(v) => setF({ ...f, localRegistration: v })} error={a.fieldErrors.localRegistration} />
      <Field label="Team size" value={f.teamSize} onChangeText={(v) => setF({ ...f, teamSize: v.replace(/\D/g, '') })} keyboardType="number-pad" />
      <Field label="First-year plan" value={f.plan} onChangeText={(v) => setF({ ...f, plan: v })} multiline hint="Who you will serve and what you expect to deliver (at least 50 characters)" error={a.fieldErrors.plan} />
      {!q.data?.applications.length && !sent && <Empty icon="globe-outline" title="No applications yet" />}
    </ScreenView>
  );
}
