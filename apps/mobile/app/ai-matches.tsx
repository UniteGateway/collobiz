import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { sectorName } from '@collabiz/types';
import { Empty, ErrorView, Icon, Loading, ScreenView, inrShort, s, theme, type IconName } from '@/components/ui';
import { api } from '@/api';
import { useApi } from '@/hooks';

interface Item { opportunity: { id: string; code: string; title: string; sector: string; city: string | null; estimatedValue: number | null; publisher: string }; match: { score: number; factors: { factor: string; score: number; detail: string }[]; uncertainty?: string[] } }

/** Screen 160 — AI opportunity matching (native): every match explains itself; “Not relevant” hides it. */
export default function AiMatches() {
  const router = useRouter();
  const q = useApi<{ consent: boolean; items: Item[]; promptVersion: string }>('/ai/matching');
  const [hidden, setHidden] = useState<string[]>([]);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const items = (q.data?.items ?? []).filter((i) => !hidden.includes(i.opportunity.id));
  const icon = (sc: number): [IconName, string] => (sc >= 0.7 ? ['checkmark-circle', theme.colors.green700] : sc > 0 ? ['alert-circle', theme.colors.warning] : ['close-circle', theme.colors.danger]);
  return (
    <ScreenView id="160" title="AI matches" subtitle="Ranked against your profile and verified reputation. Nothing is applied for on your behalf.">
      {!q.data?.consent ? <Empty icon="sparkles-outline" title="Matching is off" body="Turn on “Allow matching” in your partner profile to receive recommendations." /> : !items.length ? <Empty icon="search" title="No strong matches right now" /> : items.map(({ opportunity: o, match: m }) => (
        <View key={o.id} style={[s.card, { gap: 8 }]} testID={`match-${o.code}`}>
          <Pressable onPress={() => router.push(`/opportunities/${o.id}`)} accessibilityRole="button" accessibilityLabel={`${o.title}, ${m.score} match`} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: theme.colors.green100, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.green800 }}>{m.score}</Text><Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.green800 }}>MATCH</Text></View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.navy900 }}>{o.title}</Text><Text style={s.rowSub}>{sectorName(o.sector)}{o.city ? ` · ${o.city}` : ''}{o.estimatedValue ? ` · ${inrShort(o.estimatedValue)}` : ''}</Text></View>
          </Pressable>
          {m.factors.map((f) => { const [n, c] = icon(f.score); return <View key={f.factor} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}><Icon name={n} size={15} color={c} /><Text style={{ flex: 1, fontSize: 13.5, color: theme.colors.grey700 }}><Text style={{ fontWeight: '600' }}>{f.factor}</Text> {f.detail}</Text></View>; })}
          <Pressable onPress={() => { setHidden([...hidden, o.id]); api.post(`/ai/matching/${o.id}/feedback`, { useful: false, reason: 'Not relevant' }).catch(() => {}); }} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 8 }} testID={`dismiss-${o.code}`}><Text style={{ color: theme.colors.navy700, fontWeight: '600' }}>Not relevant</Text></Pressable>
        </View>
      ))}
      {q.data?.consent && <Text style={[s.hint, { marginHorizontal: 8 }]}>COLLABIZ rules engine · version {q.data.promptVersion}</Text>}
    </ScreenView>
  );
}
