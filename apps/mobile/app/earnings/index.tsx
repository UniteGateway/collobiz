import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { COMMISSION_STATE_LABELS, type CommissionState } from '@collabiz/types';
import { Badge, Card, Empty, ErrorView, Kpi, Loading, Notice, Row, ScreenView, money, s } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 095 (native) — Partner Earnings Overview. */
export default function Earnings() {
  const router = useRouter();
  const q = useApi<any>('/earnings');
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data;
  return (
    <ScreenView id="095">
      <Stack.Screen options={{ title: 'Earnings' }} />
      <Notice tone="info">Commission is earned only when the customer pays for the milestone. Projected amounts are estimates.</Notice>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Kpi label="Projected" value={money(d.totals.projected)} />
        <Kpi label="Earned, unpaid" value={money(d.totals.earnedNotPaid)} accent />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Kpi label="Paid this FY" value={money(d.totals.paidThisFy)} />
        <Kpi label="TDS this FY" value={money(d.totals.tdsThisFy)} />
      </View>
      <Row title="Live tracker" subtitle="Screen 158 — where each line is" onPress={() => router.push('/earnings/live')} />
      <Row title="Payments" subtitle="Screen 100 — payouts and bank references" onPress={() => router.push('/payments')} />
      <Card title="Commission lines">
        {!d.lines.length ? <Empty title="No commission yet" /> : d.lines.map((l: any) => (
          <View key={l.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E6E9EF' }} testID={`line-${l.id}`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[s.p, { flex: 1 }]}>{l.description}</Text>
              <Badge status={l.status} label={COMMISSION_STATE_LABELS[l.status as CommissionState]} />
            </View>
            <Text style={s.hint}>{l.project} · net {money(l.payable)} (TDS {money(l.tds)})</Text>
          </View>
        ))}
      </Card>
    </ScreenView>
  );
}
