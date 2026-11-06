import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Card, ErrorView, Loading, Notice, ScreenView, s } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 048 — Duplicate Lead Detection (native, atlas mobile-first). Other parties are never identified. */
export default function Duplicates() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/leads/${id}`);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data.duplicates as any[];
  return (
    <ScreenView id="048">
      <Stack.Screen options={{ title: 'Duplicate check' }} />
      {!d.length ? <Notice tone="success">No similar registrations found.</Notice> : <Notice tone="warning">{d.length} similar registration(s). An independent reviewer decides on evidence.</Notice>}
      {d.map((x) => <Card key={x.id} title={`${Math.round(x.score * 100)}% similar`}><Text style={s.p}>{x.reasons.join('; ')}</Text><Badge status={x.ruling} />{x.rulingReason && <Text style={s.hint}>{x.rulingReason}</Text>}</Card>)}
    </ScreenView>
  );
}
