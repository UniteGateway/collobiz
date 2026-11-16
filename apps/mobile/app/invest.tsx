import { useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorView, Field, Loading, Notice, ScreenView, inrShort, money, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

interface Offer { id: string; title: string; location: string; sponsor: string; summary: string; unitLabel: string; totalUnits: number; unitPrice: number; minUnits: number; projectedMonthlyRent: number; rentPerUnitMonth: number; grossYieldPct: number; lockInMonths: number; status: string; regulatoryStatus: string; availableUnits: number; subscribedPct: number; mine: { units: number; monthlyRentShare: number; amount: number } | null; notice: string }

/** Invest together (native): group-investment offers with a pro-rata rent calculator. Interest only. */
export default function Invest() {
  const q = useApi<Offer[]>('/invest/offers');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView title="Invest together" subtitle="Own a share of an income-producing asset; rent is shared in proportion to your share." refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      <Notice tone="warning" title="Interest only">COLLABIZ records non-binding interest. It does not take money or allot units. Pooled investments are regulated (SEBI); Unite contacts you once an offer is cleared. Rent is a projection, not a promise.</Notice>
      {!q.data?.length ? <Empty icon="business-outline" title="No offers yet" /> : q.data.map((o) => <OfferCard key={o.id} o={o} onChange={q.reload} />)}
    </ScreenView>
  );
}

function OfferCard({ o, onChange }: { o: Offer; onChange: () => void }) {
  const { me } = useSession();
  const [units, setUnits] = useState(String(o.mine?.units ?? o.minUnits * 5));
  const n = Number(units) || 0;
  const share = Math.floor((o.projectedMonthlyRent * n) / o.totalUnits);
  const save = useAction(async () => { await api.post(`/invest/offers/${o.id}/interest`, { units: n }); onChange(); });
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  return (
    <Card title={o.title}>
      <View testID={`offer-${o.id}`}>
        <Text style={s.hint}>{o.location} · by {o.sponsor}</Text>
        <View style={{ flexDirection: 'row', marginVertical: 8 }}><Badge status={o.regulatoryStatus} tone={o.regulatoryStatus === 'cleared' ? 'success' : 'warning'} label={o.regulatoryStatus === 'cleared' ? 'Clearance recorded' : 'Awaiting regulatory clearance'} /></View>
        <Text style={s.rowSub}>{o.summary}</Text>
        <Text style={[s.rowSub, { marginTop: 8 }]}>{money(o.unitPrice)} / {o.unitLabel} · projected rent {money(o.rentPerUnitMonth)} / {o.unitLabel} / month · {o.grossYieldPct}% a year · minimum {o.minUnits} {o.unitLabel}</Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: '#e9e5ff', marginVertical: 10 }}><View style={{ height: 6, borderRadius: 3, width: `${o.subscribedPct}%`, backgroundColor: '#7c3aed' }} /></View>
        {o.status === 'interest_open' ? (
          <>
            <Field label={`How many ${o.unitLabel}?`} keyboardType="number-pad" value={units} onChangeText={(v) => setUnits(v.replace(/\D/g, ''))} error={save.fieldErrors.units} />
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: '#f5f3ff' }}><Text style={s.hint}>You would invest</Text><Text style={{ fontSize: 17, fontWeight: '700', color: '#4c1d95' }}>{inrShort(n * o.unitPrice)}</Text></View>
              <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: '#f5f3ff' }}><Text style={s.hint}>Rent share / month</Text><Text style={{ fontSize: 17, fontWeight: '700', color: '#4c1d95' }}>{money(share)}</Text></View>
            </View>
            {save.error ? <Notice tone="danger">{save.error}</Notice> : null}
            {!verified ? <Notice>Complete your verification (KYC) to register interest.</Notice> : null}
            <Button title={o.mine ? 'Update my interest' : 'Register interest'} onPress={() => save.run()} loading={save.busy} disabled={!verified || n < o.minUnits} testID={`interest-${o.id}`} />
            {o.mine ? <Text style={[s.hint, { marginTop: 8, color: theme.colors.navy900 }]}>Your interest: {o.mine.units} {o.unitLabel} · {inrShort(o.mine.amount)} · {money(o.mine.monthlyRentShare)} / month projected</Text> : null}
          </>
        ) : <Text style={s.hint}>This offer is closed.</Text>}
      </View>
    </Card>
  );
}
