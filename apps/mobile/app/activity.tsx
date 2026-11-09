import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, ErrorView, Kpi, Loading, Row, ScreenView } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 030 — Quick Actions & Activity Center (native, atlas mobile-first). */
export default function Activity() {
  const router = useRouter();
  const q = useApi<any>('/crm/activity', { limit: 30 });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView id="030">
      <Stack.Screen options={{ title: 'Activity' }} />
      <Button title="Register lead" variant="accent" onPress={() => router.push('/leads/new')} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="Pipeline" variant="secondary" onPress={() => router.push('/pipeline')} /></View>
        <View style={{ flex: 1 }}><Button title="Opportunities" variant="secondary" onPress={() => router.push('/marketplace')} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}><Kpi label="Overdue" value={q.data.tasks.overdue} /><Kpi label="Due 24 h" value={q.data.tasks.today} accent /></View>
      <Card title="Recent activity">{!q.data.items.length && <Row title="Nothing yet" subtitle="Leads, deals and tasks you work on appear here" />}{q.data.items.map((i: any) => <Row key={i.id} title={i.title} subtitle={`${new Date(i.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${i.detail ? ' · ' + i.detail : ''}`} />)}</Card>
    </ScreenView>
  );
}
