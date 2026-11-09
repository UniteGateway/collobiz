import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OFFER_KIND_LABELS, regionLabel, sectorName } from '@collabiz/types';
import { Badge, Empty, ErrorView, Loading, ScreenView, Segmented, Tag, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';
import { MY_STATUS, dueText, termsLine } from '@/offers';

interface Row { id: string; code: string; title: string; issuer: string; kind: string; sector: string; regions: string[]; pricing: string; unitePrice: number | null; priceUnit: string | null; uniteReward: { text: string } | null; rewardModels: string[]; exclusive: boolean; deadline: string; open: boolean; myStatus: string }

/** Offers for you (native): work, products and markets Unite Group sent straight to your company. */
export default function Offers() {
  const router = useRouter();
  const q = useApi<Row[]>('/offers');
  const [tab, setTab] = useState('open');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const rows = q.data ?? [];
  const toAnswer = (o: Row) => o.open && ['sent', 'viewed'].includes(o.myStatus);
  const list = rows.filter((o) => (tab === 'open' ? toAnswer(o) : tab === 'answered' ? ['responded', 'selected'].includes(o.myStatus) : !toAnswer(o) && !['responded', 'selected'].includes(o.myStatus)));
  return (
    <ScreenView title="Offers for you" subtitle="Accept Unite Group's terms or propose your own." refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      <View style={{ marginBottom: theme.space.md }}>
        <Segmented label="Offers" value={tab} onChange={setTab} options={[{ value: 'open', label: `To answer ${rows.filter(toAnswer).length}` }, { value: 'answered', label: 'Answered' }, { value: 'closed', label: 'Closed' }]} />
      </View>
      {!list.length ? <Empty icon="briefcase-outline" title={tab === 'open' ? 'Nothing waiting for you' : 'Nothing here yet'} body="Keep your capacity up to date — Unite Group uses it to choose who receives offers." /> : list.map((o) => {
        const [label, tone] = MY_STATUS[o.myStatus] ?? [o.myStatus, 'neutral'];
        return (
          <Pressable key={o.id} testID={`offer-${o.code}`} onPress={() => router.push(`/offers/${o.id}`)} accessibilityRole="button" accessibilityLabel={`${o.title}, from ${o.issuer}, ${label}`}
            style={({ pressed }) => [s.card, { gap: 6 }, pressed && { backgroundColor: theme.colors.grey50 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Tag tone="navy">{OFFER_KIND_LABELS[o.kind]}</Tag>{o.exclusive && <Tag>Exclusive</Tag>}<View style={{ flex: 1 }} /><Badge status={o.myStatus} tone={tone} label={label} />
            </View>
            <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.navy900 }}>{o.title}</Text>
            <Text style={s.rowSub}>{o.issuer} · {sectorName(o.sector)} · {o.regions.length ? o.regions.map(regionLabel).join(', ') : 'Anywhere'}</Text>
            <Text style={{ color: theme.colors.green800, fontWeight: '600', fontSize: 14 }}>{termsLine(o)}</Text>
            <Text style={s.hint}>{o.code} · {o.open ? dueText(o.deadline) : 'Closed'}</Text>
          </Pressable>
        );
      })}
    </ScreenView>
  );
}
