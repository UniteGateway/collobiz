import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Empty, ErrorView, Field, Loading, Notice, ScreenView, Segmented, inrShort, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Rep { engagements: number; conversionPct: number; paid: number; onTimePct: number | null }
interface Bid { id: string; company: string; model: string; rateBps: number | null; fixedPaise: number | null; proposal: string; status: string; commissionPaise: number | null; reputation: { asCompany: Rep | null; verified: boolean } }
interface R { id: string; title: string; city: string; description: string; estimatedValuePaise: number | null; closesOn: string; status: string; owner: boolean; engagementId?: string | null; bids?: Bid[]; note?: string; myBid?: { id: string; status: string; rateBps: number | null; fixedPaise: number | null; proposal: string } | null; canBid?: boolean }
const rate = (b: { model: string; rateBps: number | null; fixedPaise: number | null }) => (b.model === 'fixed' ? inrShort(b.fixedPaise) : `${(b.rateBps ?? 0) / 100}%`);

/** Requirement (native): the member compares sealed offers and selects one; a company submits its own offer. */
export default function ComearnRequirement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<R>(`/comearn/requirements/${id}`);
  const [pick, setPick] = useState<string | null>(null); const [ok, setOk] = useState(false);
  const [b, setB] = useState({ model: 'percent', pct: '', fixed: '', proposal: '' });
  const select = useAction(async () => { const r = await api.post<{ engagementId: string }>(`/comearn/requirements/${id}/select`, { bidId: pick, confirm: ok }); router.replace(`/comearn/engagement/${r.engagementId}` as never); return r; });
  const bid = useAction(async () => { await api.post(`/comearn/requirements/${id}/bids`, { model: b.model, rateBps: b.model === 'percent' && b.pct ? Math.round(Number(b.pct) * 100) : undefined, fixedPaise: b.model === 'fixed' && b.fixed ? Math.round(Number(b.fixed) * 100) : undefined, trigger: 'customer_payment', paymentDays: 30, proposal: b.proposal }); q.reload(); return true; });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const r = q.data!;
  return (
    <ScreenView title={r.title} subtitle={`${r.city}${r.estimatedValuePaise ? ` · ${inrShort(r.estimatedValuePaise)}` : ''} · closes ${r.closesOn}`}>
      <Stack.Screen options={{ title: 'Requirement' }} />
      <Card><Text>{r.description}</Text></Card>
      {r.owner ? (r.status === 'awarded' ? <Button title="Open the commission tracker" onPress={() => router.push(`/comearn/engagement/${r.engagementId}` as never)} /> : (
        <Card title={`Commission offers (${r.bids?.length ?? 0})`}>
          {r.note ? <Text style={[s.hint, { marginBottom: 8 }]}>{r.note}</Text> : null}
          {!r.bids?.length ? <Empty title="No offers yet" /> : r.bids.map((x) => (
            <Pressable key={x.id} accessibilityRole="radio" accessibilityState={{ selected: pick === x.id }} onPress={() => setPick(x.id)} style={[s.card, { borderWidth: 2, borderColor: pick === x.id ? theme.colors.green700 : 'transparent' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontWeight: '700' }}>{x.company}</Text><Text style={{ fontWeight: '800', color: theme.colors.green700 }}>{rate(x)}</Text></View>
              <Text style={s.hint}>{x.reputation.verified ? 'Verified · ' : ''}{x.reputation.asCompany ? `${x.reputation.asCompany.paid} paid · ${x.reputation.asCompany.onTimePct ?? '—'}% on time` : 'New on COMEARN'}{x.commissionPaise != null ? ` · ${inrShort(x.commissionPaise)} on the estimate` : ''}</Text>
              <Text style={{ marginTop: 4 }}>{x.proposal}</Text>
            </Pressable>
          ))}
          {pick ? <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 }}><Switch value={ok} onValueChange={setOk} accessibilityLabel="Accept terms and share customer details" /><Text style={{ flex: 1 }}>I accept this company’s terms and agree to share the customer’s details with them</Text></View>
            {select.error ? <Notice tone="danger">{select.error}</Notice> : null}
            <Button title="Select this offer" disabled={!ok} loading={select.busy} onPress={() => select.run()} />
          </> : null}
        </Card>
      )) : !r.canBid ? <Notice tone="info">Only verified businesses can offer commissions.</Notice> : (
        <Card title={r.myBid ? `Your offer (${r.myBid.status})` : 'Offer a commission'}>
          <Text style={[s.hint, { marginBottom: 8 }]}>Offers are sealed — other businesses cannot see yours.</Text>
          <Segmented label="Commission type" value={b.model} onChange={(v) => setB({ ...b, model: v })} options={[{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed' }]} />
          {b.model === 'percent' ? <Field label="Commission %" keyboardType="decimal-pad" value={b.pct} onChangeText={(v) => setB({ ...b, pct: v })} error={bid.fieldErrors.rateBps} /> : <Field label="Commission (₹)" keyboardType="decimal-pad" value={b.fixed} onChangeText={(v) => setB({ ...b, fixed: v })} error={bid.fieldErrors.fixedPaise} />}
          <Field label="Your proposal for the customer" multiline value={b.proposal} onChangeText={(v) => setB({ ...b, proposal: v })} error={bid.fieldErrors.proposal} />
          {bid.error ? <Notice tone="danger">{bid.error}</Notice> : null}
          <Button title={r.myBid ? 'Update offer' : 'Submit offer'} loading={bid.busy} onPress={() => bid.run()} />
        </Card>
      )}
    </ScreenView>
  );
}
