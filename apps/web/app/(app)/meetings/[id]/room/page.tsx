'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { initials } from '@/components/Comms';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Room {
  id: string; title: string; agenda: string | null; startsAt: string; endsAt: string; status: string; cancelReason: string | null; minutes: string | null; actionItems: { text: string; due?: string }[] | null;
  isOrganizer: boolean; attendees: { userId: string; name: string; org: string; rsvp: string; joinedAt: string | null }[];
  video: { provider: string; configured: boolean; joinable: boolean; joinUrl: string | null };
}
const RSVP: Record<string, [string, string]> = { accepted: ['Going', 'success'], declined: ['Not going', 'danger'], tentative: ['Maybe', 'warning'], pending: ['Not answered', 'neutral'] };

/** Screen 108 — Meeting room: join, agenda, attendance and minutes. Video comes from the configured provider. */
export default function MeetingRoom() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Room>(`/meetings/${id}`);
  const [minutes, setMinutes] = useState<string | null>(null);
  const [items, setItems] = useState<string>('');
  const join = useMutation(async () => { await api.post(`/meetings/${id}/join`); if (q.data?.video.joinUrl) window.open(q.data.video.joinUrl, '_blank', 'noopener'); await q.reload(); return true; });
  const save = useMutation(async () => {
    await api.put(`/meetings/${id}/minutes`, { minutes, actionItems: items.split('\n').map((x) => x.trim()).filter((x) => x.length >= 3).map((text) => ({ text })) });
    setMinutes(null); await q.reload(); return true;
  });
  const cancel = useMutation(async () => { const reason = window.prompt('Reason for cancelling (shared with attendees)'); if (!reason) return false; await api.post(`/meetings/${id}/cancel`, { reason }); await q.reload(); return true; });
  if (q.error) return <Screen id="108" title="Meeting"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const m = q.data;
  const start = m && new Date(m.startsAt), end = m && new Date(m.endsAt);
  return (
    <Screen id="108" title={m?.title ?? 'Meeting'} header={false}>
      <div className="cz-room">
        <Link href="/meetings" className="cz-od-back"><Icon name="prev" size={16} />Meetings</Link>
        {!m ? <Skeleton height={200} /> : (
          <>
            <header className="cz-room-hero">
              <div>
                <h1 className="cz-od-title" style={{ fontSize: 30 }}>{m.title}</h1>
                <p className="cz-od-sub"><span><Icon name="calendar" size={15} />{start!.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span><Icon name="clock" size={15} />{start!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} – {end!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span></p>
              </div>
              {m.status !== 'scheduled' && <StatusBadge status={m.status} />}
            </header>
            {m.status === 'cancelled' && <Alert tone="warning" title="This meeting was cancelled.">{m.cancelReason}</Alert>}

            <div className="cz-od-grid">
              <div className="cz-od-main">
                <section className="cz-room-stage" aria-label="Video">
                  <span className="cz-room-stage-icon"><Icon name="users" size={28} /></span>
                  {m.status !== 'scheduled' ? <p>This meeting has ended.</p>
                    : !m.video.joinable ? <p>The room opens 15 minutes before the start time.</p>
                    : !m.video.configured ? <><p><strong>Video isn’t connected in this environment.</strong></p><p className="cz-muted">Join to record your attendance; use your usual call link for audio and video. Your administrator can connect a video provider.</p></>
                    : <p>The room is open.</p>}
                  {m.status === 'scheduled' && m.video.joinable && <Button variant="accent" size="lg" onClick={() => join.run()} loading={join.pending}><Icon name="external" size={17} />{m.video.configured ? 'Join video call' : 'Mark me as joined'}</Button>}
                  {join.error && <Alert tone="danger">{join.error}</Alert>}
                </section>

                <section className="cz-od-section" aria-labelledby="agenda-h">
                  <h3 id="agenda-h">Agenda</h3>
                  <p className="cz-od-body">{m.agenda || 'No agenda was added.'}</p>
                </section>

                <section className="cz-od-section" aria-labelledby="min-h">
                  <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 id="min-h" style={{ margin: 0 }}>Minutes & actions</h3>{m.isOrganizer && m.status !== 'cancelled' && minutes === null && <Button size="sm" variant="secondary" onClick={() => { setMinutes(m.minutes ?? ''); setItems((m.actionItems ?? []).map((a) => a.text).join('\n')); }}><Icon name="edit" size={14} />{m.minutes ? 'Edit' : 'Record minutes'}</Button>}</div>
                  {minutes !== null ? (
                    <form className="cz-stack" style={{ gap: 10, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
                      {save.error && <Alert tone="danger">{save.error}</Alert>}
                      <label className="cz-sched-label">Minutes<textarea className="cz-input" rows={6} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Decisions and discussion (at least 10 characters)" /></label>
                      <label className="cz-sched-label">Action items — one per line<textarea className="cz-input" rows={3} value={items} onChange={(e) => setItems(e.target.value)} placeholder="Send revised quote" /></label>
                      <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending} disabled={(minutes ?? '').trim().length < 10}>Save and share</Button><Button type="button" variant="ghost" onClick={() => setMinutes(null)}>Cancel</Button></div>
                    </form>
                  ) : m.minutes ? (
                    <>
                      <p className="cz-od-body" style={{ marginTop: 10 }}>{m.minutes}</p>
                      {(m.actionItems ?? []).length > 0 && <ul className="cz-od-checks" style={{ marginTop: 10 }}>{m.actionItems!.map((a, i) => <li key={i} data-result="warn"><Icon name="check" size={16} /><span><strong>{a.text}</strong>{a.due && <span>Due {a.due}</span>}</span></li>)}</ul>}
                    </>
                  ) : <p className="cz-muted" style={{ marginTop: 10 }}>{m.isOrganizer ? 'Record what was decided so everyone has the same record.' : 'The organiser hasn’t shared minutes yet.'}</p>}
                </section>
              </div>

              <aside className="cz-od-panel" aria-label="Attendees">
                <div className="cz-od-card">
                  <h3>People</h3>
                  <ul className="cz-room-people">
                    {m.attendees.map((a) => (
                      <li key={a.userId}>
                        <span className="cz-avatar" aria-hidden>{initials(a.name)}</span>
                        <span className="cz-room-person"><strong>{a.name}</strong><span className="cz-muted">{a.org}{a.joinedAt ? ' · joined' : ''}</span></span>
                        <StatusBadge status={a.rsvp} tone={RSVP[a.rsvp]?.[1] as never} label={RSVP[a.rsvp]?.[0] ?? a.rsvp} />
                      </li>
                    ))}
                  </ul>
                  {m.isOrganizer && m.status === 'scheduled' && <Button variant="ghost" size="sm" onClick={() => cancel.run()}>Cancel meeting</Button>}
                  {cancel.error && <Alert tone="danger">{cancel.error}</Alert>}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}
