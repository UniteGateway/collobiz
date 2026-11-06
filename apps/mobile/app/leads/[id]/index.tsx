import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Card, ErrorView, Kpi, Loading, Notice, Row, ScreenView, s } from '@/components/ui';
import { useApi } from '@/hooks';

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

/** Screen 050 — Unite First-Review Status (native, atlas mobile-first) with links to 048/051. */
export default function LeadStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<any>(`/leads/${id}`);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const { claim, opportunity: o, routing: r } = q.data;
  return (
    <ScreenView id="050" title={o.code}>
      <Stack.Screen options={{ title: 'Lead status' }} />
      <Card title={o.title}><View style={{ flexDirection: 'row', gap: 8 }}><Badge status={claim.status} /><Badge status={o.status} /></View></Card>
      {r ? (
        <>
          {r.breached && <Notice tone="warning">Review window passed — escalated to the category owner.</Notice>}
          {r.decision && <Notice tone={r.decision === 'reject' ? 'danger' : 'success'}>Decision: {r.decision} — {r.reason}</Notice>}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Kpi label="Window" value={hm(r.slaMinutes)} />
            <Kpi label={r.decision ? 'Decided' : 'Remaining'} value={r.decision ? '✓' : hm(r.remainingMinutes)} accent />
          </View>
          <Text style={s.hint}>Due {new Date(r.dueAt).toLocaleString('en-IN', { timeZone: r.timezone })} ({r.timezone}){r.paused ? ` · paused: ${r.pauseReason}` : ''}</Text>
        </>
      ) : <Notice tone="info">First review starts once the lead is verified.</Notice>}
      <Card>
        <Row title="Duplicate check" subtitle="Screen 048" onPress={() => router.push(`/leads/${id}/duplicates`)} />
        <Row title="Protection certificate" subtitle={claim.certificateCode} onPress={() => router.push(`/leads/${id}/certificate`)} />
      </Card>
    </ScreenView>
  );
}
