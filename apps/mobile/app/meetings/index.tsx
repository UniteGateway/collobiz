import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Empty, ErrorView, Loading, Row, ScreenView, Section, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Meeting { id: string; title: string; startsAt: string; endsAt: string; status: string; organizer: string; isOrganizer: boolean; myRsvp: string }
const RSVP: Record<string, string> = { accepted: 'Going', declined: 'Not going', tentative: 'Maybe', pending: 'Reply needed' };

/** Meetings list (native) — opens the meeting room (108). Scheduling is on the web (109). */
export default function Meetings() {
  const router = useRouter();
  const q = useApi<Meeting[]>('/meetings');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const now = Date.now();
  const up = (q.data ?? []).filter((m) => m.status === 'scheduled' && new Date(m.endsAt).getTime() >= now);
  const past = (q.data ?? []).filter((m) => !up.includes(m)).reverse();
  const row = (m: Meeting) => (
    <Row key={m.id} testID={`meeting-${m.id}`} icon="calendar" title={m.title}
      subtitle={`${new Date(m.startsAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${new Date(m.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · ${m.isOrganizer ? 'You organise' : m.organizer}`}
      right={<Text style={{ fontSize: 13, fontWeight: '600', color: m.status !== 'scheduled' ? theme.colors.grey600 : m.myRsvp === 'pending' ? theme.colors.warning : theme.colors.grey600 }}>{m.status !== 'scheduled' ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : m.isOrganizer ? '' : RSVP[m.myRsvp]}</Text>}
      onPress={() => router.push(`/meetings/${m.id}`)} />
  );
  return (
    <ScreenView id="109" title="Meetings">
      {!q.data?.length ? <Empty icon="calendar-outline" title="No meetings" body="Invitations you send or receive appear here." /> : (
        <>
          <Section title="Upcoming">{up.length ? up.map(row) : <Row title="Nothing scheduled" />}</Section>
          {past.length > 0 && <Section title="Past & cancelled">{past.map(row)}</Section>}
        </>
      )}
    </ScreenView>
  );
}
