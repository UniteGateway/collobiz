import { useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { VENTURE_ROLE_LABELS, VENTURE_STAGE_LABELS, sectorName } from '@collabiz/types';
import { Badge, Button, Card, Chips, ErrorView, Field, Loading, Notice, Row, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { INTEREST } from '@/ventures';

interface Detail { slug: string; name: string; category: string; sector: string; tagline: string; summary: string; stage: string; roles: string[]; open: boolean; availability: string; company: string | null; rewardNote: string | null; promoters: number; myInterest: { status: string; roles: string[]; message: string; decisionNote: string | null } | null; offers: { id: string; code: string; title: string }[] }

/** One Unite business (native): what it is, how partners help, and the request to promote it. */
export default function Venture() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const q = useApi<Detail>(`/ventures/${slug}`);
  const [roles, setRoles] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const ask = useAction(async () => { await api.post(`/ventures/${slug}/interest`, { roles, message }); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const v = q.data!;
  const mine = v.myInterest && v.myInterest.status !== 'withdrawn' ? v.myInterest : null;
  return (
    <ScreenView eyebrow={v.category} title={v.name} subtitle={v.tagline} right={<Badge status={v.open ? 'open' : 'pending'} tone={v.open ? 'success' : 'neutral'} label={v.open ? 'Open' : 'Coming soon'} />}>
      <Stack.Screen options={{ title: v.name }} />
      <Card><Text style={[s.p, { marginBottom: 0 }]}>{v.summary}</Text></Card>
      <Card>
        <Row title="Sector" subtitle={sectorName(v.sector)} />
        <Row title="Stage" subtitle={VENTURE_STAGE_LABELS[v.stage]} />
        <Row title="Run by" subtitle={v.company ?? 'Unite Group'} />
        <Row title="How partners help" subtitle={v.roles.map((r) => VENTURE_ROLE_LABELS[r]).join(' · ')} />
        {v.rewardNote ? <Row title="Rewards" subtitle={v.rewardNote} /> : null}
      </Card>
      {mine && (
        <Notice tone={mine.status === 'approved' ? 'success' : mine.status === 'declined' ? 'warning' : 'info'} title={INTEREST[mine.status]?.[0]}>
          {mine.status === 'approved' ? `Offers from ${v.name} reach you directly.` : mine.status === 'pending' ? `${v.company ?? 'Unite Group'} will reply by notification.` : mine.decisionNote ?? 'You can ask again later.'}
        </Notice>
      )}
      {(!mine || mine.status === 'declined') && (v.open ? (
        <Card title={`Promote ${v.name}`}>
          {ask.error && <Notice tone="danger">{ask.error}</Notice>}
          <Text style={s.label}>How you will help</Text>
          <Chips value={roles} onChange={setRoles} options={v.roles.map((r) => ({ value: r, label: VENTURE_ROLE_LABELS[r] }))} />
          <Field label="Your network and plan" value={message} onChangeText={setMessage} multiline error={ask.fieldErrors.message} hint="Who you can reach and how (at least 20 characters)" />
          <Button title={`Ask to promote ${v.name}`} variant="accent" onPress={() => ask.run()} loading={ask.busy} disabled={!roles.length || message.trim().length < 20} testID="ask-promote" />
        </Card>
      ) : <Notice tone="info">{v.name} is not open to partners yet.</Notice>)}
      {v.offers.length > 0 && <Card title={`Offers from ${v.name}`}>{v.offers.map((o) => <Row key={o.id} title={o.title} subtitle={o.code} onPress={() => router.push(`/offers/${o.id}`)} />)}</Card>}
    </ScreenView>
  );
}
