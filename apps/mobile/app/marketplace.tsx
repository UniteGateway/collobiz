import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SECTORS, sectorName } from '@collabiz/types';
import { Badge, Chips, Empty, ErrorView, Field, Loading, money, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 031 — All Opportunities Marketplace (native). */
export default function Marketplace() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState<string[]>([]);
  const list = useApi<any[]>('/opportunities', { q, sector: sector[0] });
  return (
    <View style={[s.safe, { padding: theme.space.lg }]} testID="screen-031">
      <Stack.Screen options={{ title: 'Opportunities' }} />
      <Field label="Search" value={q} onChangeText={setQ} placeholder="Keyword or OPP code" returnKeyType="search" />
      <Chips value={sector} onChange={(v) => setSector(v.slice(-1))} options={SECTORS.slice(0, 8).map((x) => ({ value: x.code, label: x.name.split(' ')[0] }))} />
      {list.loading && !list.data ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.reload} /> : (
        <FlatList data={list.data} keyExtractor={(o) => o.id} refreshControl={<RefreshControl refreshing={list.loading} onRefresh={list.reload} />}
          ListEmptyComponent={<Empty title="No opportunities match" />}
          renderItem={({ item: o }) => (
            <View style={s.card}>
              <Text style={s.crumb} onPress={() => router.push(`/opportunities/${o.id}`)}>{o.code} · {sectorName(o.sector)}</Text>
              <Text style={s.h2} onPress={() => router.push(`/opportunities/${o.id}`)} accessibilityRole="link">{o.title}</Text>
              <Text style={s.hint}>{[o.city, o.publisher].filter(Boolean).join(' · ')}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={[s.p, { fontWeight: '700', marginBottom: 0 }]}>{money(o.estimatedValue)}</Text>
                <Badge status={o.route} tone={o.route === 'unite_owned' ? 'brand' : 'info'} label={o.route === 'unite_owned' ? 'Unite Group' : 'Partner exchange'} />
              </View>
            </View>
          )} />
      )}
    </View>
  );
}
