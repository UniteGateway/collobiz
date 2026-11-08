import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Empty, ErrorView, Loading, ScreenView, inrShort, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 026 — My leads (native tab). */
export default function MyLeads() {
  const router = useRouter();
  const q = useApi<any[]>('/leads');
  return (
    <ScreenView id="026" tab title="Leads" scroll={false} right={<Button title="New" icon="add" variant="accent" compact onPress={() => router.push('/leads/new')} testID="new-lead" />}>
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.reload} /> : (
        <FlatList data={q.data} keyExtractor={(l) => l.id} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={<Empty icon="shield-checkmark-outline" title="No leads yet" body="Register a customer you’ve introduced. Your introduction is time-stamped and protected once verified." />}
          renderItem={({ item: l }) => (
            <Pressable onPress={() => router.push(`/leads/${l.id}`)} accessibilityRole="button" accessibilityLabel={`${l.title}, ${l.customer}`} style={({ pressed }) => [s.card, { marginBottom: 0, gap: 6 }, pressed && { backgroundColor: theme.colors.grey50 }]}>
              <Text style={[s.hint, { marginTop: 0 }]}>{l.code}</Text>
              <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.navy900 }}>{l.title}</Text>
              <Text style={s.rowSub}>{l.customer}{l.estimatedValue ? ` · ${inrShort(l.estimatedValue)}` : ''}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}><Badge status={l.claimStatus} /><Badge status={l.opportunityStatus} /></View>
            </Pressable>
          )} />
      )}
    </ScreenView>
  );
}
