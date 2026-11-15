import { RefreshControl, Text, View } from 'react-native';
import { Badge, Card, ErrorView, Loading, Notice, ScreenView, s, money } from '@/components/ui';
import { useApi } from '@/hooks';
import { DISCLAIMER, TONE, pct } from '@/uniteSolar';

interface Earn { streams: { stream: string; label: string; totals: Record<'earned' | 'pending' | 'approved' | 'paid' | 'reversed', number>; entries: { id: string; reference: string; description: string; base: number; rateBps: number; amount: number; status: string; statusLabel: string }[] }[]; resaleMargin: number; settlements: { id: string; number: string; amount: number; status: string; paymentReference: string | null }[] }

/** Earnings (native): five streams with reference, base, rate, earned, pending, approved, paid and reversed. */
export default function Earnings() {
  const q = useApi<Earn>('/network/earnings');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  return (
    <ScreenView title="Earnings" eyebrow="Unite Solar" subtitle={DISCLAIMER} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      {d.streams.map((st) => (
        <Card key={st.stream} title={st.label}>
          <View testID={`stream-${st.stream}`}>
            <Text style={s.rowSub}>Earned {money(st.totals.earned)} · pending {money(st.totals.pending)} · approved {money(st.totals.approved)} · paid {money(st.totals.paid)}{st.totals.reversed ? ` · reversed ${money(st.totals.reversed)}` : ''}</Text>
            {st.entries.slice(0, 5).map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{money(e.amount)}</Text><Text style={s.hint}>{e.reference} · {money(e.base)} × {pct(e.rateBps)}</Text></View>
                <Badge status={e.status} tone={TONE[e.status]} label={e.statusLabel} />
              </View>
            ))}
          </View>
        </Card>
      ))}
      <Card title="Resale margin on own stock"><Text style={s.rowSub}>{money(d.resaleMargin)} — earned by selling stock bought at partner price; not a commission.</Text></Card>
      <Card title="Settlements">{d.settlements.length ? d.settlements.map((x) => <Text key={x.id} style={s.rowSub}>{x.number}: {money(x.amount)} — {x.status === 'paid' ? `paid (${x.paymentReference})` : 'being paid'}</Text>) : <Text style={s.hint}>No settlements yet.</Text>}</Card>
      <Notice>TDS and GST on commissions follow Unite finance’s statement for each settlement.</Notice>
    </ScreenView>
  );
}
