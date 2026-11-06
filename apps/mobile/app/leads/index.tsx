import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Badge, Button, Empty, ErrorView, Loading, money, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 026 — My Leads & Pipeline (native). */
export default function MyLeads() {
  const router = useRouter();
  const q = useApi<any[]>('/leads');
  return (
    <View style={[s.safe, { padding: theme.space.lg }]} testID="screen-026">
      <Stack.Screen options={{ title: 'My leads' }} />
      <Button title="Register a lead" variant="accent" onPress={() => router.push('/leads/new')} />
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.reload} /> : (
        <FlatList data={q.data} keyExtractor={(l) => l.id} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />} ListEmptyComponent={<Empty title="No leads yet" body="Registered leads are time-stamped and protected once verified." />}
          renderItem={({ item: l }) => (
            <View style={s.card}>
              <Text style={s.crumb}>{l.code}</Text>
              <Text style={s.h2} onPress={() => router.push(`/leads/${l.id}`)} accessibilityRole="link">{l.title}</Text>
              <Text style={s.hint}>{l.customer} · {money(l.estimatedValue)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Badge status={l.claimStatus} /><Badge status={l.opportunityStatus} /></View>
            </View>
          )} />
      )}
    </View>
  );
}
