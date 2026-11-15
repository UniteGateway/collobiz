import { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Button, Card, ErrorView, Field, Loading, Notice, Row, ScreenView, Section, inrShort, s } from '@/components/ui';
import { useAction, useApi } from '@/hooks';
import { send, type OfferView } from '@/collab';

interface Detail extends OfferView {
  notice: string | null; myApplication: { id: string; status: string } | null;
  applyCheck: { eligible: boolean; checks: { key: string; label: string; result: string; detail: string }[] } | null;
  applications: { id: string; orgName: string; message: string; status: string; verificationStatus: string }[];
}
const APP: Record<string, string> = { submitted: 'New', shortlisted: 'Shortlisted', accepted: 'Accepted', rejected: 'Declined' };

/** Business offer (native): details and checks; apply; the publisher shortlists and opens the proposal room. */
export default function BusinessOffer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<Detail>(`/business-offers/${id}`);
  const [msg, setMsg] = useState('');
  const apply = useAction(async () => { await send(`/opportunities/${id}/apply`, { message: msg }); await q.reload(); });
  const decide = useAction(async (appId: string, status: string) => { await send(`/opportunities/${id}/applications/${appId}/decision`, { status, reason: status === 'rejected' ? 'Not the right fit for this offer' : 'Good fit — let us discuss terms' }); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  return (
    <ScreenView title={d.title} eyebrow={`${d.code} · ${d.categoryLabel}`} right={<Badge status={d.status} label={d.statusLabel} tone={d.status === 'active' ? 'success' : 'neutral'} />}>
      {d.notice && <Notice tone="warning">{d.notice}</Notice>}
      {d.isOwner && d.status === 'pending_verification' && <Notice tone="info">COLLABIZ is checking this offer. It becomes visible once approved.</Notice>}
      <Card><Text style={s.p}>{d.summary}</Text></Card>
      <Section title="Details">
        <Row title="Published by" subtitle={d.publisher} />
        <Row title="Where" subtitle={[d.city, d.region].filter(Boolean).join(', ') || '—'} />
        <Row title="Indicative value" subtitle={d.estimatedValue != null ? inrShort(d.estimatedValue)! : 'On request'} />
        <Row title="Upfront fee or capital" subtitle={d.upfrontRequired ? inrShort(d.upfrontAmount)! : 'None required (not risk-free)'} />
      </Section>
      <Section title="Checks done by COLLABIZ" footer="Not a guarantee of the offer, its value or the publisher’s performance.">
        {d.checks.length ? d.checks.map((c) => <Row key={c} icon="checkmark-circle" title={c} />) : <Row title="Not checked yet" />}
      </Section>
      {d.isOwner ? (
        <Section title={`Applications (${d.applications.length})`}>
          {decide.error && <Notice tone="danger">{decide.error}</Notice>}
          {d.applications.map((a) => (
            <Card key={a.id} title={a.orgName}>
              <Text style={s.p}>{a.message}</Text>
              <Badge status={a.status} label={APP[a.status]} />
              {a.status === 'submitted' && <Button title="Shortlist" compact onPress={() => decide.run(a.id, 'shortlisted')} testID={`shortlist-${a.id}`} />}
              {['shortlisted', 'accepted'].includes(a.status) && <Button title="Open proposal room" compact onPress={() => router.push(`/collab/room/${a.id}`)} testID={`room-${a.id}`} />}
            </Card>
          ))}
          {!d.applications.length && <Row title="No applications yet" />}
        </Section>
      ) : d.myApplication ? (
        <Card title="Your application">
          <Badge status={d.myApplication.status} label={APP[d.myApplication.status]} />
          {['shortlisted', 'accepted'].includes(d.myApplication.status) ? <Button title="Open proposal room" onPress={() => router.push(`/collab/room/${d.myApplication!.id}`)} testID="open-room" /> : <Text style={s.hint}>The publisher will shortlist applications before discussing terms.</Text>}
        </Card>
      ) : !d.regulated && (
        <Card title="Interested?">
          {apply.error && <Notice tone="danger">{apply.error}</Notice>}
          {d.applyCheck && !d.applyCheck.eligible && <Notice tone="warning" title="Before you can apply">{d.applyCheck.checks.filter((c) => c.result === 'fail').map((c) => `${c.label}: ${c.detail}`).join('\n')}</Notice>}
          <Field label="Why you are a good fit" value={msg} onChangeText={setMsg} multiline hint="At least 20 characters" error={apply.fieldErrors.message} />
          <Button title="Apply" onPress={() => apply.run()} loading={apply.busy} disabled={msg.trim().length < 20 || (!!d.applyCheck && !d.applyCheck.eligible)} testID="apply" />
        </Card>
      )}
    </ScreenView>
  );
}
