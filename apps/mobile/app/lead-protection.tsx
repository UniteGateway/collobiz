import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, ErrorView, Kpi, Loading, Notice, Row, ScreenView } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 151 — Lead Protection Dashboard (native). */
export default function LeadProtection() {
  const router = useRouter();
  const q = useApi<any>('/leads/protection-summary');
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data;
  return (
    <ScreenView id="151">
      <Stack.Screen options={{ title: 'Lead protection' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}><Kpi label="Protected" value={d.protected} accent /><Kpi label="In review" value={d.inUniteReview} /></View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Kpi label="Contested" value={d.contested} /><Kpi label="Disputes" value={d.openDisputes} /></View>
      {d.openDisputes > 0 && <Notice tone="warning">You have open ownership disputes — respond on the web dispute centre (screen 153).</Notice>}
      <Card title="Expiring within 14 days">{d.expiringSoon.length ? d.expiringSoon.map((l: any) => <Row key={l.id} title={l.code} subtitle={`expires ${new Date(l.protectedUntil).toLocaleDateString()}`} onPress={() => router.push(`/leads/${l.id}/certificate`)} />) : <Row title="Nothing expiring soon" />}</Card>
      <Button title="All leads" variant="secondary" onPress={() => router.push('/leads')} />
    </ScreenView>
  );
}
