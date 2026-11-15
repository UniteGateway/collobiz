import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, ErrorView, Field, Loading, Notice, Row, ScreenView, s, money, inrShort, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import type { UnitSummary } from '@/uniteSolar';

interface Pkg { code: string; name: string; price: number; exclusive: boolean; territoryLevel: string | null; leadDnaIncluded: boolean; leadDnaAddonPrice: number | null }
interface Territory { id: string; name: string; district: string; pincodes: string[] }

/** Become a partner (native): plan → location / territory → business → server price → submit. */
export default function Apply() {
  const router = useRouter();
  const params = useLocalSearchParams<{ package?: string }>();
  const pk = useApi<Pkg[]>('/network/packages');
  const mine = useApi<{ verified: boolean }>('/network/mine');
  const [f, setF] = useState({ packageCode: params.package ?? '', leadDnaAddon: false, state: '', district: '', city: '', pincode: '', territoryId: '', message: '' });
  const [draft, setDraft] = useState<UnitSummary | null>(null);
  const p = pk.data?.find((x) => x.code === f.packageCode);
  const terr = useApi<Territory[]>(p?.exclusive && f.state.trim().length > 2 ? '/network/territories' : null, { state: f.state.trim(), level: p?.territoryLevel ?? '' });
  const save = useAction(async () => {
    const b = { ...f, territoryId: p?.exclusive ? f.territoryId || undefined : undefined, leadDnaAddon: f.leadDnaAddon && !p?.leadDnaIncluded };
    const r = draft ? await api.post<UnitSummary>(`/network/applications/${draft.id}`, b) : await api.post<UnitSummary>('/network/applications', b);
    setDraft(r); return r;
  });
  const submit = useAction(async () => { await api.post(`/network/applications/${draft!.id}/submit`); router.replace('/unite-solar' as never); });
  if ((pk.loading && !pk.data) || (mine.loading && !mine.data)) return <Loading />;
  if (pk.error) return <ErrorView error={pk.error} onRetry={pk.reload} />;
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <ScreenView title="Become a partner" eyebrow="Unite Solar" subtitle="Saved as a draft until you submit. Prices are calculated by Unite’s system.">
      {!mine.data?.verified ? <Notice tone="warning" title="Business verification needed">You can save a draft now; submitting needs your KYC / KYB documents verified.</Notice> : null}
      <Card title="Plan">
        {(pk.data ?? []).map((x) => <Row key={x.code} title={x.name} subtitle={`${inrShort(x.price)} + GST`} right={f.packageCode === x.code ? <Text style={{ color: theme.colors.green700, fontWeight: '700' }}>✓</Text> : undefined} onPress={() => setF({ ...f, packageCode: x.code, territoryId: '' })} testID={`pick-${x.code}`} />)}
        {p && !p.leadDnaIncluded && p.leadDnaAddonPrice ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <Switch value={f.leadDnaAddon} onValueChange={(v) => setF({ ...f, leadDnaAddon: v })} accessibilityLabel="Add LeadDNA software" />
            <Text style={s.rowSub}>Add LeadDNA ({inrShort(p.leadDnaAddonPrice)} + GST)</Text>
          </View>
        ) : null}
      </Card>
      <Card title="Location">
        <Field label="State" value={f.state} onChangeText={(v) => setF({ ...f, state: v, territoryId: '' })} placeholder="e.g. Telangana" />
        <Field label="District" value={f.district} onChangeText={set('district')} />
        <Field label="City / town" value={f.city} onChangeText={set('city')} />
        <Field label="PIN code" value={f.pincode} keyboardType="number-pad" maxLength={6} onChangeText={(v) => set('pincode')(v.replace(/\D/g, ''))} error={save.fieldErrors.pincode} />
        {p?.exclusive ? (terr.data?.length ? terr.data.map((t) => (
          <Row key={t.id} title={t.name} subtitle={`${t.district}${t.pincodes.length ? ` · PIN ${t.pincodes.join(', ')}` : ''}`} right={f.territoryId === t.id ? <Text style={{ color: theme.colors.green700, fontWeight: '700' }}>✓</Text> : undefined} onPress={() => setF({ ...f, territoryId: t.id, district: t.district })} />
        )) : <Text style={s.hint}>{f.state ? `No open ${p.territoryLevel} territory found in ${f.state}.` : `Enter the state to see open ${p.territoryLevel} territories.`}</Text>) : p ? <Text style={s.hint}>Store partners serve a catchment around their PIN code — not an exclusive territory.</Text> : null}
      </Card>
      <Field label="About your business" multiline value={f.message} onChangeText={set('message')} error={save.fieldErrors.message} />
      {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
      <Button title={draft ? 'Update draft and price' : 'Save draft and see price'} onPress={() => save.run()} loading={save.busy} disabled={!p || f.message.trim().length < 10 || (p.exclusive && !f.territoryId)} testID="us-save" />
      {draft ? (
        <Card title="Your price">
          <Text style={s.rowSub}>Plan {money(draft.pricing.package)}{draft.pricing.leadDnaAddon ? ` + LeadDNA ${money(draft.pricing.leadDnaAddon)}` : ''} + GST {money(draft.pricing.gst)}</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', marginVertical: 6 }}>{money(draft.pricing.total)}</Text>
          <Text style={s.hint}>Nothing is payable now. After approval you sign the agreement and pay; rights start after finance verifies the payment.</Text>
          {submit.error ? <Notice tone="danger">{submit.error}</Notice> : null}
          <Button title="Submit application" onPress={() => submit.run()} loading={submit.busy} disabled={!mine.data?.verified} testID="us-submit" />
        </Card>
      ) : null}
    </ScreenView>
  );
}
