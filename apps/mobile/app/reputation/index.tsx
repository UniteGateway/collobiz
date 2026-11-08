import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, ErrorView, Loading, Row, ScreenView, Section, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Mine { score: { score: number | null; tier: string; outcomes: number; onTimeOutcomes: number; publishedReviews: number; excludedReviews: number; components: { onTimeRate: number | null; reviews: number | null } }; outcomes: { id: string; title: string; projectCode: string; certifiedAt: string; onTime: boolean }[]; tips: string[] }
const TIER: Record<string, [string, 'neutral' | 'info' | 'success']> = { unrated: ['Not yet rated', 'neutral'], emerging: ['Emerging', 'info'], trusted: ['Trusted', 'success'], excellent: ['Excellent', 'success'] };

/** Screen 163 (native) — your reputation as partners see it, with the verified evidence behind it. */
export default function Reputation() {
  const router = useRouter();
  const q = useApi<Mine>('/reputation/me');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!; const sc = d.score;
  return (
    <ScreenView id="163" title="Reputation" subtitle="Calculated only from certified milestones and reviews by companies you worked with.">
      <View style={[s.card, { alignItems: 'center', gap: 6, paddingVertical: 24 }]} accessible accessibilityLabel={sc.score == null ? 'Not yet rated' : `Reputation ${sc.score} out of 100`}>
        <Text style={{ fontSize: 56, fontWeight: '700', color: theme.colors.navy900, letterSpacing: -1 }}>{sc.score ?? '—'}</Text>
        <Text style={s.hint}>{sc.score == null ? 'Starts with your first certified milestone' : 'out of 100'}</Text>
        <Badge status={sc.tier} tone={TIER[sc.tier]?.[1]} label={TIER[sc.tier]?.[0]} />
      </View>
      <Section title="Verified record">
        <Row title="Certified milestones" right={<Text style={s.rowTitle}>{sc.outcomes}</Text>} />
        <Row title="On time" right={<Text style={s.rowTitle}>{sc.outcomes ? `${sc.onTimeOutcomes} of ${sc.outcomes}` : '—'}</Text>} />
        <Row title="Published reviews" right={<Text style={s.rowTitle}>{sc.publishedReviews}</Text>} onPress={() => router.push('/reputation/reviews')} />
        <Row title="Next membership level" icon="trending-up" onPress={() => router.push('/reputation/excellence')} />
      </Section>
      {d.outcomes.length > 0 && <Section title="Recent outcomes">{d.outcomes.slice(0, 6).map((o) => <Row key={o.id} title={o.title} subtitle={`${o.projectCode} · certified ${new Date(o.certifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`} right={<Badge status={o.onTime ? 'on_time' : 'late'} tone={o.onTime ? 'success' : 'warning'} label={o.onTime ? 'On time' : 'Late'} />} />)}</Section>}
      {d.tips.length > 0 && <Section title="How to improve">{d.tips.map((t) => <Row key={t} icon="bulb-outline" iconTint={theme.colors.info} title={t} />)}</Section>}
    </ScreenView>
  );
}
