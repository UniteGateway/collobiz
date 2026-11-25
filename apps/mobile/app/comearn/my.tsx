import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Empty, ErrorView, Loading, Notice, Row, ScreenView, inrShort, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** My leads (native): engagements with tracker step, team invitations, my customer requirements. */
export default function ComearnMy() {
  const router = useRouter();
  const q = useApi<{ items: { id: string; step: number; stageLabel: string; status: string; customer: string | null; opportunity: { title: string; company: string } }[] }>('/comearn/my');
  const inv = useApi<{ items: { id: string; engagementId: string; status: string; roleLabel: string; sharePct: number; lead: string; title: string; potentialPaise: number | null }[] }>('/comearn/team-invitations');
  const reqs = useApi<{ items: { id: string; title: string; city: string; status: string; bids: number; engagementId: string | null }[] }>('/comearn/requirements/mine');
  const respond = useAction(async (tid: string, decision: 'accept' | 'decline') => { await api.post(`/comearn/team/${tid}/respond`, { decision }); inv.reload(); q.reload(); return true; });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView>
      <Stack.Screen options={{ title: 'My leads' }} />
      {respond.error ? <Notice tone="danger">{respond.error}</Notice> : null}
      {inv.data?.items.filter((x) => x.status === 'invited').map((x) => (
        <Card key={x.id} title={`Team invitation · ${x.roleLabel}`}>
          <Text>{x.title}</Text><Text style={s.hint}>{x.lead} · {x.sharePct}% of the commission{x.potentialPaise != null ? ` · about ${inrShort(x.potentialPaise)} (estimate)` : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Button compact title="Accept" onPress={() => respond.run(x.id, 'accept')} /><Button compact variant="secondary" title="Decline" onPress={() => respond.run(x.id, 'decline')} /></View>
        </Card>
      ))}
      <Card title="Opportunities I work on">
        {q.data?.items.length ? q.data.items.map((x) => <Row key={x.id} title={x.opportunity.title} subtitle={`Step ${x.step} of 8 · ${x.stageLabel}${x.customer ? ` · ${x.customer}` : ''}`} chevron onPress={() => router.push(`/comearn/engagement/${x.id}` as never)} />) : <Empty title="No leads yet" body="Join an opportunity from Explore." />}
      </Card>
      <Card title="My customer requirements" action={<Text onPress={() => router.push('/comearn/requirement/new' as never)} style={{ fontWeight: '600' }}>New</Text>}>
        {reqs.data?.items.length ? reqs.data.items.map((r) => <Row key={r.id} title={r.title} subtitle={`${r.city} · ${r.bids} offers · ${r.status}`} chevron onPress={() => router.push((r.engagementId ? `/comearn/engagement/${r.engagementId}` : `/comearn/requirement/${r.id}`) as never)} />) : <Empty title="No requirements posted" />}
      </Card>
    </ScreenView>
  );
}
