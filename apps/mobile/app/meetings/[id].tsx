import { Linking, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Button, ErrorView, Icon, Loading, Notice, Row, ScreenView, Section, Segmented, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

interface Room { id: string; title: string; agenda: string | null; startsAt: string; endsAt: string; status: string; cancelReason: string | null; minutes: string | null; actionItems: { text: string }[] | null; isOrganizer: boolean;
  attendees: { userId: string; name: string; org: string; rsvp: string; joinedAt: string | null }[]; video: { configured: boolean; joinable: boolean; joinUrl: string | null } }
const RSVP: Record<string, [string, 'success' | 'danger' | 'warning' | 'neutral']> = { accepted: ['Going', 'success'], declined: ['Not going', 'danger'], tentative: ['Maybe', 'warning'], pending: ['Not answered', 'neutral'] };

/** Screen 108 — Meeting room (native): join, RSVP, agenda, people and minutes. */
export default function MeetingRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const q = useApi<Room>(`/meetings/${id}`);
  const join = useAction(async () => { await api.post(`/meetings/${id}/join`); if (q.data?.video.joinUrl) await Linking.openURL(q.data.video.joinUrl); await q.reload(); });
  const rsvp = useAction(async (v: string) => { await api.post(`/meetings/${id}/rsvp`, { rsvp: v }); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const m = q.data!;
  const start = new Date(m.startsAt), end = new Date(m.endsAt);
  return (
    <ScreenView id="108" title={m.title} subtitle={`${start.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · ${start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}–${end.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
      footer={m.status === 'scheduled' && m.video.joinable ? <Button title={m.video.configured ? 'Join video call' : 'Mark me as joined'} icon="videocam" variant="accent" onPress={() => join.run()} loading={join.busy} testID="join" /> : undefined}>
      <Stack.Screen options={{ title: 'Meeting' }} />
      {m.status === 'cancelled' && <Notice tone="warning" title="Cancelled">{m.cancelReason ?? ''}</Notice>}
      {m.status === 'scheduled' && !m.video.joinable && <Notice tone="info">The room opens 15 minutes before the start time.</Notice>}
      {m.status === 'scheduled' && m.video.joinable && !m.video.configured && <Notice tone="info">Video isn’t connected in this environment. Joining records your attendance; use your usual call link for audio and video.</Notice>}
      {(join.error || rsvp.error) && <Notice tone="danger">{join.error ?? rsvp.error}</Notice>}
      {!m.isOrganizer && m.status === 'scheduled' && (
        <View style={{ marginBottom: theme.space.lg }}>
          <Text style={s.sectionTitle}>Your answer</Text>
          <Segmented label="Your answer" value={m.attendees.find((a) => a.userId === me?.id)?.rsvp ?? ''} onChange={(v) => rsvp.run(v)} options={[{ value: 'accepted', label: 'Going' }, { value: 'tentative', label: 'Maybe' }, { value: 'declined', label: 'Not going' }]} />
        </View>
      )}
      <Section title="Agenda"><View style={{ padding: 16, backgroundColor: '#fff' }}><Text style={s.p}>{m.agenda || 'No agenda was added.'}</Text></View></Section>
      <Section title={`People · ${m.attendees.length}`}>
        {m.attendees.map((a) => <Row key={a.userId} title={a.name} subtitle={`${a.org}${a.joinedAt ? ' · joined' : ''}`} right={<Badge status={a.rsvp} tone={RSVP[a.rsvp]?.[1]} label={RSVP[a.rsvp]?.[0] ?? a.rsvp} />} />)}
      </Section>
      {m.minutes ? (
        <Section title="Minutes & actions">
          <View style={{ padding: 16, backgroundColor: '#fff' }}><Text style={s.p}>{m.minutes}</Text></View>
          {(m.actionItems ?? []).map((x, i) => <Row key={i} icon="checkbox-outline" title={x.text} />)}
        </Section>
      ) : <Text style={[s.hint, { marginHorizontal: 16 }]}><Icon name="document-text-outline" size={13} color={theme.colors.grey600} /> {m.isOrganizer ? 'Record minutes from the web app after the call.' : 'The organiser hasn’t shared minutes yet.'}</Text>}
    </ScreenView>
  );
}
