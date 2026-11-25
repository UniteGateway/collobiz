import { useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CE_CATEGORIES } from '@collabiz/types';
import { Empty, ErrorView, Loading, Row, ScreenView, SearchBar, Segmented, inrShort, s } from '@/components/ui';
import { useApi } from '@/hooks';
import { rate } from './index';

/** Explore (native): live earning opportunities, or customer requirements to offer a commission on. */
export default function ComearnExplore() {
  const router = useRouter();
  const p = useLocalSearchParams<{ category?: string }>();
  const [view, setView] = useState('opps'); const [category, setCategory] = useState(p.category ?? 'all'); const [q, setQ] = useState('');
  const opps = useApi<{ items: { id: string; title: string; company: string; model: string; rateBps: number | null; fixedPaise: number | null; territory: string; featured?: boolean; potentialPaise: number | null }[] }>(view === 'opps' ? '/comearn/opportunities' : null, { category, q: q || undefined });
  const reqs = useApi<{ canBid: boolean; items: { id: string; title: string; city: string; estimatedValuePaise: number | null; bids: number; closesOn: string; myBid: { status: string } | null }[] }>(view === 'reqs' ? '/comearn/requirements' : null);
  const cur = view === 'opps' ? opps : reqs;
  return (
    <ScreenView>
      <Stack.Screen options={{ title: 'Explore' }} />
      <Segmented label="View" value={view} onChange={setView} options={[{ value: 'opps', label: 'Opportunities' }, { value: 'reqs', label: 'Requirements' }]} />
      {view === 'opps' && <>
        <SearchBar value={q} onChangeText={setQ} label="Search opportunities" />
        <Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All' }, ...Object.entries(CE_CATEGORIES).slice(0, 4).map(([value, label]) => ({ value, label }))]} />
      </>}
      {cur.loading && !cur.data ? <Loading /> : cur.error ? <ErrorView error={cur.error} onRetry={cur.reload} /> : view === 'opps' ? (
        opps.data?.items.length ? opps.data.items.map((o) => <Row key={o.id} testID={`ce-opp-${o.id}`} title={`${o.featured ? '★ ' : ''}${o.title}`} subtitle={`${o.company} · ${o.territory} · ${rate(o)}${o.potentialPaise != null ? ` · up to ${inrShort(o.potentialPaise)} (est.)` : ''}`} chevron onPress={() => router.push(`/comearn/opportunity/${o.id}` as never)} />) : <Empty title="No opportunities here yet" />
      ) : (
        <>
          <Text style={[s.hint, { marginBottom: 8 }]}>Customer needs posted by members. {reqs.data?.canBid ? 'Offer a commission to win the introduction.' : 'Only verified businesses can bid.'}</Text>
          {reqs.data?.items.length ? reqs.data.items.map((r) => <Row key={r.id} title={r.title} subtitle={`${r.city}${r.estimatedValuePaise ? ` · ${inrShort(r.estimatedValuePaise)}` : ''} · ${r.bids} offers · closes ${r.closesOn}${r.myBid ? ` · yours: ${r.myBid.status}` : ''}`} chevron onPress={() => router.push(`/comearn/requirement/${r.id}` as never)} />) : <Empty title="No open requirements" />}
        </>
      )}
    </ScreenView>
  );
}
