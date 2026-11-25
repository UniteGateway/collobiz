import { Image, Pressable, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { CE_CATEGORIES } from '@collabiz/types';
import { Card, Empty, ErrorView, Kpi, Loading, Row, ScreenView, inrShort, money, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Opp { id: string; title: string; company: string; category: keyof typeof CE_CATEGORIES; model: string; rateBps: number | null; fixedPaise: number | null; potentialPaise: number | null; why?: string }
interface Home { earnedPaise: number; pendingPaise: number; potentialPaise: number; activeOpportunities: number; categories: Record<string, number>; recommended: Opp[]; tracker: { id: string; title: string; stageLabel: string; step: number }[]; company: { toAct: number } }
export const rate = (o: { model: string; rateBps: number | null; fixedPaise: number | null }) => (o.model === 'fixed' ? inrShort(o.fixedPaise) : `${(o.rateBps ?? 0) / 100}%`);

/** COMEARN (native) — Opportunities to Earn. Real figures only; ₹0 until something is earned. */
export default function ComearnHome() {
  const router = useRouter();
  const q = useApi<Home>('/comearn/home');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  return (
    <ScreenView>
      <Stack.Screen options={{ title: 'COMEARN' }} />
      <Image source={require('../../assets/comearn.png')} style={{ width: '82%', height: 84, alignSelf: 'center', marginBottom: 12 }} resizeMode="contain" accessibilityLabel="comearn — Opportunities to Earn. Powered by COLLABIZ" />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Kpi label="Your commission earnings" value={money(d.earnedPaise)} accent />
        <Kpi label="Pending" value={money(d.pendingPaise)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Kpi label="Potential (estimate)" value={money(d.potentialPaise)} />
        <Kpi label="Active opportunities" value={d.activeOpportunities} onPress={() => router.push('/comearn/explore' as never)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Pressable accessibilityRole="button" testID="ce-earn" onPress={() => router.push('/comearn/explore' as never)} style={{ flex: 1, backgroundColor: theme.colors.green700, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>Earn Commissions</Text><Text style={{ color: '#fff', opacity: 0.85 }}>Find opportunities</Text>
        </Pressable>
        <Pressable accessibilityRole="button" testID="ce-req" onPress={() => router.push('/comearn/requirement/new' as never)} style={{ flex: 1, backgroundColor: theme.colors.navy900, borderRadius: 16, padding: 16 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>Post a requirement</Text><Text style={{ color: '#fff', opacity: 0.85 }}>Businesses bid commissions</Text>
        </Pressable>
      </View>
      <Card title="Your earning assistant">
        <Text style={[s.hint, { marginBottom: 6 }]}>Rules-based: categories you already earn in, then the newest. AI suggestions switch on when the AI key is connected.</Text>
        {d.recommended.length ? d.recommended.map((o) => <Row key={o.id} title={o.title} subtitle={`${o.company} · ${rate(o)}${o.why ? ` · ${o.why}` : ''}`} chevron onPress={() => router.push(`/comearn/opportunity/${o.id}` as never)} />) : <Empty title="No live opportunities yet" />}
      </Card>
      <Card title="Categories">
        {Object.entries(CE_CATEGORIES).map(([k, l]) => <Row key={k} title={l} right={<Text style={s.hint}>{d.categories[k] ?? 0}</Text>} onPress={() => router.push({ pathname: '/comearn/explore', params: { category: k } } as never)} />)}
      </Card>
      <Card title="My commission tracker" action={<Text style={{ color: theme.colors.navy700 }} onPress={() => router.push('/comearn/my' as never)}>All</Text>}>
        {d.tracker.length ? d.tracker.map((t) => <Row key={t.id} title={t.title} subtitle={`Step ${t.step} of 8 · ${t.stageLabel}`} chevron onPress={() => router.push(`/comearn/engagement/${t.id}` as never)} />) : <Empty title="Nothing tracked yet" body="Join an opportunity to start." />}
      </Card>
      <Row title="Earnings" icon="wallet-outline" chevron onPress={() => router.push('/comearn/earnings' as never)} />
      <Row title="Offer commissions (company)" subtitle={d.company.toAct ? `${d.company.toAct} to act on — open on the web` : 'Post opportunities on the web'} icon="trending-up-outline" />
    </ScreenView>
  );
}
