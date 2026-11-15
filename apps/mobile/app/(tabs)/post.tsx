import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OFFER_CATEGORIES, SECTORS, isRegulatedCategory } from '@collabiz/types';
import { Button, Chips, Field, Loading, Notice, ScreenView, Segmented, s, theme } from '@/components/ui';
import { useAction, useApi } from '@/hooks';
import { send } from '@/collab';

const inTwoMonths = () => new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
const COMMON = ['idle_capacity', 'bpo_contract', 'franchise', 'distribution', 'manufacturing', 'marketing_work', 'construction', 'land_property', 'joint_venture', 'wholesale'];

/** Post (native tab): publish a business offer from the phone. Publishing needs KYB; COLLABIZ checks it before it goes live. */
export default function PostTab() {
  const router = useRouter();
  const p = useApi<{ verified: boolean; canEdit: boolean }>('/collab/profile');
  const [f, setF] = useState({ side: 'offering', category: 'idle_capacity', sector: 'technology', title: '', summary: '', city: '', region: '', value: '', upfront: false, upfrontAmount: '', expiresOn: inTwoMonths(), more: false });
  const save = useAction(async (submit: boolean) => {
    const o = await send<{ id: string }>('/business-offers', { category: f.category, side: f.side, title: f.title, summary: f.summary, sector: f.sector, city: f.city || undefined, region: f.region || undefined,
      estimatedValue: f.value ? Math.round(Number(f.value) * 100) : undefined, upfrontRequired: f.upfront, upfrontAmount: f.upfront && f.upfrontAmount ? Math.round(Number(f.upfrontAmount) * 100) : undefined, expiresOn: f.expiresOn, submit });
    router.push(`/business-offers/${o.id}`);
  });
  if (p.loading && !p.data) return <Loading />;
  const can = !!p.data?.canEdit;
  const cats = f.more ? OFFER_CATEGORIES.map((c) => c.code) : COMMON;
  return (
    <ScreenView id="post" tab eyebrow="BUSINESS OFFERS" title="Post an offer" subtitle="Offer what you have, or say what partner you are seeking. COLLABIZ checks it before it goes live."
      footer={<Button title="Submit for checks" onPress={() => save.run(true)} loading={save.busy} disabled={!can || !p.data?.verified || !f.title || f.summary.length < 30} testID="submit-offer" />}>
      {!can && <Notice tone="warning">Only your business owner or an admin can publish offers.</Notice>}
      {can && !p.data?.verified && <Notice tone="info" title="Verification needed">You can save a draft now; publishing needs your business verification.</Notice>}
      {save.error && <Notice tone="danger">{save.error}</Notice>}
      <Segmented label="I am" value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'offering', label: 'Offering' }, { value: 'seeking', label: 'Seeking a partner' }]} />
      <Text style={s.label}>Category</Text>
      <Chips value={[f.category]} onChange={(v) => setF({ ...f, category: v[v.length - 1] ?? f.category })} options={cats.map((c) => ({ value: c, label: OFFER_CATEGORIES.find((x) => x.code === c)!.label }))} />
      {!f.more && <Button title="More categories" variant="plain" compact onPress={() => setF({ ...f, more: true })} />}
      {isRegulatedCategory(f.category) && <Notice tone="warning">Discovery only. COLLABIZ does not arrange business sales or investments.</Notice>}
      <Text style={s.label}>Sector</Text>
      <Chips value={[f.sector]} onChange={(v) => setF({ ...f, sector: v[v.length - 1] ?? f.sector })} options={SECTORS.filter((x) => x.priority || ['technology', 'logistics', 'local_commerce'].includes(x.code)).map((x) => ({ value: x.code, label: x.name }))} />
      <Field label="Title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={save.fieldErrors.title} />
      <Field label="Describe the offer" value={f.summary} onChangeText={(v) => setF({ ...f, summary: v })} multiline hint="At least 30 characters" error={save.fieldErrors.summary} />
      <Field label="City" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
      <Field label="State / region" value={f.region} onChangeText={(v) => setF({ ...f, region: v })} />
      <Field label="Indicative value (₹, optional)" value={f.value} keyboardType="number-pad" onChangeText={(v) => setF({ ...f, value: v.replace(/\D/g, '') })} />
      <Field label="Expires on (YYYY-MM-DD)" value={f.expiresOn} onChangeText={(v) => setF({ ...f, expiresOn: v })} error={save.fieldErrors.expiresOn} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Switch value={f.upfront} onValueChange={(v) => setF({ ...f, upfront: v })} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="A partner must pay an upfront fee or bring capital" />
        <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>A partner must pay an upfront fee or bring capital</Text>
      </View>
      {f.upfront && <Field label="Upfront amount (₹)" value={f.upfrontAmount} keyboardType="number-pad" onChangeText={(v) => setF({ ...f, upfrontAmount: v.replace(/\D/g, '') })} error={save.fieldErrors.upfrontAmount} />}
      <Button title="Save draft" variant="secondary" onPress={() => save.run(false)} disabled={!can || !f.title || f.summary.length < 30} testID="save-draft" />
    </ScreenView>
  );
}
