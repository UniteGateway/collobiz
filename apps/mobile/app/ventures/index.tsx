import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VENTURE_STAGE_LABELS, sectorName } from '@collabiz/types';
import { Badge, Empty, ErrorView, Loading, ScreenView, Segmented, Tag, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';
import { INTEREST } from '@/ventures';

interface Row { id: string; slug: string; name: string; category: string; sector: string; tagline: string; stage: string; open: boolean; myInterest: string | null; openOffers: number }

/** Unite businesses (native): every Unite Group business partners can help grow. */
export default function Ventures() {
  const router = useRouter();
  const q = useApi<Row[]>('/ventures');
  const [tab, setTab] = useState('open');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const rows = q.data ?? [];
  const list = rows.filter((v) => (tab === 'open' ? v.open : tab === 'mine' ? !!v.myInterest && v.myInterest !== 'withdrawn' : !v.open));
  return (
    <ScreenView title="Unite businesses" subtitle="Energy, property, commerce, jobs, education, mobility and more." refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      <View style={{ marginBottom: theme.space.md }}>
        <Segmented label="Businesses" value={tab} onChange={setTab} options={[{ value: 'open', label: `Open ${rows.filter((r) => r.open).length}` }, { value: 'mine', label: 'Mine' }, { value: 'soon', label: 'Coming soon' }]} />
      </View>
      {!list.length ? <Empty icon="business-outline" title={tab === 'mine' ? 'You are not promoting any business yet' : 'Nothing here'} /> : list.map((v) => (
        <Pressable key={v.id} testID={`venture-${v.slug}`} onPress={() => router.push(`/ventures/${v.slug}`)} accessibilityRole="button" accessibilityLabel={`${v.name}, ${v.tagline}`} style={({ pressed }) => [s.card, { gap: 6 }, pressed && { backgroundColor: theme.colors.grey50 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag tone="navy">{sectorName(v.sector)}</Tag><Text style={s.hint}>{VENTURE_STAGE_LABELS[v.stage]}</Text><View style={{ flex: 1 }} />
            {v.myInterest ? <Badge status={v.myInterest} tone={INTEREST[v.myInterest]?.[1]} label={INTEREST[v.myInterest]?.[0]} /> : v.openOffers > 0 ? <Badge status="open" tone="success" label={`${v.openOffers} offer(s)`} /> : null}
          </View>
          <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.navy900 }}>{v.name}</Text>
          <Text style={s.rowSub}>{v.tagline} · {v.category}</Text>
        </Pressable>
      ))}
    </ScreenView>
  );
}
