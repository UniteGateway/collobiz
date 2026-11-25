import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Card, Empty, ErrorView, Kpi, Loading, Row, ScreenView, inrShort, money } from '@/components/ui';
import { useApi } from '@/hooks';

/** COMEARN earnings (native): commissions paid by companies, team shares, and a link to Unite programme earnings. */
export default function ComearnEarnings() {
  const router = useRouter();
  const q = useApi<{ comearn: { id: string; engagementId: string; opportunity: string; payer: string; grossPaise: number; netPaise: number; status: string }[] }>('/comearn/earnings');
  const team = useApi<{ items: { id: string; title: string; amountPaise: number; status: string; engagementId: string }[] }>('/comearn/team-earnings');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const c = q.data!.comearn;
  const paid = c.filter((x) => x.status === 'paid').reduce((a, x) => a + x.netPaise, 0);
  const pending = c.filter((x) => ['pending_approval', 'approved'].includes(x.status)).reduce((a, x) => a + x.grossPaise, 0);
  return (
    <ScreenView>
      <Stack.Screen options={{ title: 'Earnings' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Kpi label="Received (net)" value={money(paid)} accent /><Kpi label="Pending" value={money(pending)} /></View>
      <Card title="COMEARN commissions">{c.length ? c.map((x) => <Row key={x.id} title={x.opportunity} subtitle={`${x.payer} · ${inrShort(x.grossPaise)} · ${x.status.replace(/_/g, ' ')}`} chevron onPress={() => router.push(`/comearn/engagement/${x.engagementId}` as never)} />) : <Empty title="No commissions yet" />}</Card>
      <Card title="Team shares">{team.data?.items.length ? team.data.items.map((a) => <Row key={a.id} title={a.title} subtitle={`${inrShort(a.amountPaise)} · ${a.status}`} chevron onPress={() => router.push(`/comearn/engagement/${a.engagementId}` as never)} />) : <Empty title="No team shares yet" />}</Card>
      <Row title="Unite programme earnings" icon="wallet-outline" chevron onPress={() => router.push('/earnings' as never)} />
    </ScreenView>
  );
}
