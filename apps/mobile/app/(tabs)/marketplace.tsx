import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SECTORS, sectorName } from '@collabiz/types';
import { Empty, ErrorView, Icon, SearchBar, Segmented, Tag, inrShort, s, theme } from '@/components/ui';
import { api } from '@/api';

interface Opp { id: string; code: string; title: string; sector: string; kind: string; route: string; city: string | null; estimatedValue: number | null; deadline: string | null; publisher: string }
interface Page { items: Opp[]; total: number; counts: { all: number; unite: number; exchange: number } }

const PAGE = 15;
const SORTS = [{ value: 'newest', label: 'Newest' }, { value: 'closing', label: 'Closing soon' }, { value: 'value', label: 'Highest value' }];
const closes = (d: string | null) => {
  if (!d) return { text: 'Rolling', urgent: false };
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000);
  if (days < 0) return { text: 'Closed', urgent: false };
  if (days <= 7) return { text: days === 0 ? 'Closes today' : `${days}d left`, urgent: true };
  return { text: `Closes ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, urgent: false };
};

/** Screen 031 — Opportunities (native): search, source, sector and sort over the same paged API as web; infinite scroll. */
export default function Marketplace() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('all');
  const [sector, setSector] = useState('');
  const [sort, setSort] = useState('newest');
  const [items, setItems] = useState<Opp[]>([]);
  const [meta, setMeta] = useState<Omit<Page, 'items'> | null>(null);
  const [state, setState] = useState<{ loading: boolean; more: boolean; error: unknown }>({ loading: true, more: false, error: null });

  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  const load = useCallback(async (offset: number) => {
    setState((x) => ({ ...x, loading: offset === 0, more: offset > 0, error: null }));
    try {
      const p = await api.get<Page>('/opportunities', { paged: 'true', limit: String(PAGE), offset: String(offset), q, scope, sector, sort });
      setItems((prev) => (offset === 0 ? p.items : [...prev, ...p.items]));
      setMeta({ total: p.total, counts: p.counts });
      setState({ loading: false, more: false, error: null });
    } catch (e) { setState({ loading: false, more: false, error: e }); }
  }, [q, scope, sector, sort]);
  useEffect(() => { load(0); }, [load]);

  const header = (
    <View>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={s.h1} accessibilityRole="header">Opportunities</Text>
          <Pressable onPress={() => router.push('/ai-matches')} accessibilityRole="button" accessibilityLabel="AI matches" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 }} testID="ai-matches">
            <Icon name="sparkles" size={16} color={theme.colors.green700} /><Text style={{ color: theme.colors.green700, fontWeight: '600' }}>AI matches</Text>
          </Pressable>
        </View>
      </View>
      <SearchBar value={text} onChangeText={setText} placeholder="Keyword, city or OPP code" label="Search opportunities" />
      <Segmented label="Source" value={scope} onChange={setScope} options={[
        { value: 'all', label: `All${meta ? ` ${meta.counts.all}` : ''}` }, { value: 'unite', label: `Unite${meta ? ` ${meta.counts.unite}` : ''}` }, { value: 'exchange', label: `Exchange${meta ? ` ${meta.counts.exchange}` : ''}` },
      ]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} accessibilityLabel="Sector">
        {[{ code: '', name: 'All sectors' }, ...SECTORS].map((x) => {
          const on = sector === x.code;
          return (
            <Pressable key={x.code || 'all'} onPress={() => setSector(x.code)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={x.name}
              style={[s.chip, on && { backgroundColor: theme.colors.navy700, borderColor: theme.colors.navy700 }]}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: on ? '#fff' : theme.colors.navy900 }}>{x.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={s.hint} accessibilityLiveRegion="polite" testID="result-count">{meta ? `${meta.total} ${meta.total === 1 ? 'opportunity' : 'opportunities'}` : 'Searching…'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Sort: ${SORTS.find((x) => x.value === sort)!.label}. Double tap to change.`} onPress={() => setSort(SORTS[(SORTS.findIndex((x) => x.value === sort) + 1) % SORTS.length].value)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 4 }}>
          <Icon name="swap-vertical" size={15} color={theme.colors.navy700} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.navy700 }}>{SORTS.find((x) => x.value === sort)!.label}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']} testID="screen-031">
      <FlatList
        data={state.error ? [] : items}
        keyExtractor={(o) => o.id}
        contentContainerStyle={s.body}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={state.loading && items.length > 0} onRefresh={() => load(0)} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!state.loading && !state.more && meta && items.length < meta.total) load(items.length); }}
        ListEmptyComponent={state.error ? <ErrorView error={state.error} onRetry={() => load(0)} /> : state.loading ? <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.navy700} /> : <Empty icon="search" title="No opportunities match" body="Try another sector or a wider search." />}
        ListFooterComponent={state.more ? <ActivityIndicator style={{ marginVertical: 16 }} color={theme.colors.navy700} /> : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item: o }) => {
          const c = closes(o.deadline);
          return (
            <Pressable testID={`opp-${o.code}`} onPress={() => router.push(`/opportunities/${o.id}`)} accessibilityRole="button"
              accessibilityLabel={`${o.title}. ${sectorName(o.sector)}${o.city ? `, ${o.city}` : ''}. ${inrShort(o.estimatedValue) ?? 'Value on request'}. ${c.text}.`}
              style={({ pressed }) => [s.card, { marginBottom: 0, gap: 6 }, pressed && { backgroundColor: theme.colors.grey50 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tag tone={o.route === 'unite_owned' ? 'navy' : 'green'}>{o.route === 'unite_owned' ? 'Unite Group' : 'Partner exchange'}</Tag>
                <Text style={[s.hint, { marginTop: 0 }]}>{o.code}</Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.navy900, lineHeight: 22 }} numberOfLines={2}>{o.title}</Text>
              <Text style={s.rowSub} numberOfLines={1}>{sectorName(o.sector)}{o.city ? ` · ${o.city}` : ''} · {o.publisher}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.navy900 }}>{inrShort(o.estimatedValue) ?? <Text style={s.hint}>Value on request</Text>}</Text>
                <Text style={{ fontSize: 13, fontWeight: c.urgent ? '700' : '500', color: c.urgent ? theme.colors.danger : theme.colors.grey600 }}>{c.text}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
