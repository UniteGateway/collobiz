import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Badge, Card, Empty, ErrorView, Kpi, Loading, ScreenView, money, s } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 075 (native) — Active Projects Portfolio. */
export default function Projects() {
  const router = useRouter();
  const q = useApi<any[]>('/projects');
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const rows = q.data ?? [];
  return (
    <ScreenView id="075" tab title="Projects">
      <Stack.Screen options={{ title: 'Projects' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Kpi label="Active" value={rows.filter((p) => p.status === 'active').length} />
        <Kpi label="Overdue milestones" value={rows.reduce((a, p) => a + p.overdue, 0)} accent />
      </View>
      {!rows.length ? <Empty title="No projects yet" body="Projects appear once a contract is executed and the client starts the project." /> : rows.map((p) => (
        <Card key={p.id} title={p.title}>
          <Text style={s.hint} testID={`project-${p.code}`}>{p.code} · {p.role}{p.site ? ` · ${p.site}` : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginVertical: 6 }}>
            <Badge status={p.status} />
            <Text style={s.p}>{p.progressPct}% reported · {p.certifiedPct}% certified</Text>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.progressPct }} style={{ height: 8, borderRadius: 4, backgroundColor: '#E6E9EF', overflow: 'hidden', marginBottom: 8 }}>
            <View style={{ width: `${p.progressPct}%`, height: 8, backgroundColor: '#2E7D32' }} />
          </View>
          {p.nextMilestone && <Text style={s.p}>Next: {p.nextMilestone.title} · due {p.nextMilestone.dueDate}{p.overdue ? ` · ${p.overdue} overdue` : ''}</Text>}
          {p.value != null && <Text style={s.hint}>Value {money(p.value)}</Text>}
          <Text accessibilityRole="link" style={[s.p, { color: '#2E7D32', fontWeight: '600', marginTop: 6 }]} onPress={() => router.push(`/projects/${p.id}/progress`)}>Site progress & photos →</Text>
        </Card>
      ))}
    </ScreenView>
  );
}
