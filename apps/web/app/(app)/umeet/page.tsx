'use client';
import Link from 'next/link';
import { EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { InstantMeeting } from '@/components/UMeet';
import { useQuery } from '@/lib/hooks';

interface Meeting { id: string; title: string; startsAt: string; endsAt: string; status: string; organizer: string }

/** U meet — video meetings with chat inside COLLABIZ: start now, schedule, and join from one page. */
export default function UMeetPage() {
  const cfg = useQuery<{ provider: string; embed: boolean }>('/umeet/config');
  const q = useQuery<Meeting[]>('/meetings');
  const now = Date.now();
  const upcoming = (q.data ?? []).filter((m) => m.status === 'scheduled' && new Date(m.endsAt).getTime() >= now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 6);
  return (
    <Screen title="U meet" header={false}>
      <div className="cz-umeet-hero" data-screen="umeet">
        <div>
          <p className="cz-ph-eyebrow" style={{ color: '#E0B8FF' }}>U meet</p>
          <h1>Video meetings and chat, right inside COLLABIZ.</h1>
          <p style={{ fontSize: 17, opacity: .9, margin: 0 }}>Start a call now or schedule one, invite colleagues and verified partners, chat during the call and keep the minutes with the meeting.</p>
        </div>
        <img src="/photos/team-boardroom.webp" alt="A team on a video meeting in a boardroom" />
      </div>
      {cfg.data && !cfg.data.embed && <p className="cz-alert cz-alert-info" style={{ marginTop: 16 }}>Video isn’t connected in this environment yet — meetings, chat, attendance and minutes all work; your administrator connects the video service.</p>}
      <div className="cz-grid cz-grid-2" style={{ marginTop: 20, alignItems: 'start' }}>
        <section className="cz-card"><h2 style={{ marginTop: 0 }}>Start a meeting now</h2><InstantMeeting /></section>
        <section className="cz-card">
          <div className="cz-row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Coming up</h2><Link href="/meetings?new=1" className="cz-btn cz-btn-secondary cz-btn-sm">Schedule a meeting</Link></div>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : !upcoming.length ? <EmptyState title="No meetings scheduled">Start one now or schedule one for later.</EmptyState> : (
            <ul className="cz-umeet-list">{upcoming.map((m) => (
              <li key={m.id}><div><strong>{m.title}</strong><span>{new Date(m.startsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {m.organizer}</span></div><Link href={`/meetings/${m.id}/room`} className="cz-btn cz-btn-accent cz-btn-sm">Open room</Link></li>
            ))}</ul>
          )}
        </section>
      </div>
    </Screen>
  );
}
