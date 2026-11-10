import { Stack, useRouter } from 'expo-router';
import { RESOLUTION_KIND_LABELS } from '@collabiz/types';
import { Badge, Empty, ErrorView, Loading, Row, ScreenView, Section } from '@/components/ui';
import { useApi } from '@/hooks';

/** Disputes (native) — every dispute your company is part of. */
export default function Disputes() {
  const router = useRouter();
  const q = useApi<any[]>('/resolution/mine');
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView title="Disputes" subtitle="Unite reviewers decide on the evidence; you can appeal a decision once.">
      <Stack.Screen options={{ title: 'Disputes' }} />
      {!q.data?.length ? <Empty title="No disputes" body="Nothing needs resolving." /> : (
        <Section>{q.data.map((d) => <Row key={`${d.kind}-${d.id}`} title={`${d.code} · ${RESOLUTION_KIND_LABELS[d.kind]}`} subtitle={d.subject} right={<Badge status={d.status} />} chevron onPress={d.kind === 'contract' ? () => router.push(`/disputes/${d.id}` as never) : undefined} testID={`dispute-${d.code}`} />)}</Section>
      )}
    </ScreenView>
  );
}
