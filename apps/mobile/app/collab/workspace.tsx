import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Empty, ErrorView, Kpi, Loading, Row, ScreenView, Section, inrShort } from '@/components/ui';
import { useApi } from '@/hooks';
import { STAGES, STAGE_INDEX, type Money } from '@/collab';

interface Res { items: { applicationId: string; title: string; counterparty: string; stage: string; waitingOnYou: boolean; money: Money }[]; totals: Money & { toReceive: number; toPay: number } }

/** My collaborations (native): every offer conversation from application to earnings. */
export default function CollabWorkspace() {
  const router = useRouter();
  const q = useApi<Res>('/collab/workspace');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  return (
    <ScreenView title="My collaborations" eyebrow="COLLAB">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <Kpi label="Pipeline" value={inrShort(d.totals.pipelineValue)!} hint="Not yet agreed" />
        <Kpi label="Contract value" value={inrShort(d.totals.contractValue)!} hint="Agreed" />
        <Kpi label="Invoiced" value={inrShort(d.totals.invoiced)!} hint="Certified work" />
        <Kpi label="Collected" value={inrShort(d.totals.collected)!} accent hint="Paid" />
      </View>
      <Section title="Collaborations">
        {d.items.length ? d.items.map((x) => (
          <Row key={x.applicationId} testID={`collab-${x.applicationId}`} icon={x.waitingOnYou ? 'alert-circle' : 'people-outline'} title={x.title}
            subtitle={`With ${x.counterparty} · ${STAGES[STAGE_INDEX[x.stage] ?? 0]}${x.waitingOnYou ? ' · waiting for you' : ''}`} onPress={() => router.push(`/collab/room/${x.applicationId}`)} chevron />
        )) : <Empty icon="people-outline" title="No collaborations yet" body="Apply to an offer from Collab, or post your own." />}
      </Section>
    </ScreenView>
  );
}
