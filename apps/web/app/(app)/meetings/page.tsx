'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, Icon, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { initials } from '@/components/Comms';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Meeting { id: string; title: string; startsAt: string; endsAt: string; status: string; organizer: string; isOrganizer: boolean; myRsvp: string; projectId: string | null }
interface Contact { userId: string; name: string; org: string }

const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const RSVP: Record<string, string> = { accepted: 'Going', declined: 'Not going', tentative: 'Maybe', pending: 'Not answered' };

/** Screen 109 — Meeting scheduling: upcoming and past meetings, RSVP and new invitations. */
export default function Meetings() {
  const q = useQuery<Meeting[]>('/meetings');
  const [tab, setTab] = useState('upcoming');
  const [creating, setCreating] = useState(false);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setCreating(true); }, []);
  const rsvp = useMutation(async (id: string, value: string) => { await api.post(`/meetings/${id}/rsvp`, { rsvp: value }); await q.reload(); return true; });
  const now = Date.now();
  const list = useMemo(() => (q.data ?? []).filter((m) => (tab === 'upcoming' ? new Date(m.endsAt).getTime() >= now && m.status === 'scheduled' : new Date(m.endsAt).getTime() < now || m.status !== 'scheduled')).sort((a, b) => (tab === 'upcoming' ? 1 : -1) * (new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())), [q.data, tab, now]);
  return (
    <Screen id="109" title="Meetings" description="Schedule calls with partners and project teams. Invitees must belong to your company or a verified partner."
      actions={<Button variant="accent" onClick={() => setCreating(true)}><Icon name="plus" size={16} />Schedule meeting</Button>}>
      {creating && <Schedule onClose={() => setCreating(false)} onDone={() => { setCreating(false); q.reload(); }} />}
      <div style={{ marginBottom: 14 }}><Segmented label="Meetings" value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past & cancelled' }]} /></div>
      {rsvp.error && <Alert tone="danger">{rsvp.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : !list.length ? (
        <div className="cz-card"><EmptyState icon="calendar" title={tab === 'upcoming' ? 'Nothing scheduled' : 'No past meetings'} action={tab === 'upcoming' ? <Button variant="accent" onClick={() => setCreating(true)}>Schedule a meeting</Button> : undefined}>Invitations you send or receive appear here.</EmptyState></div>
      ) : (
        <ul className="cz-meeting-list">
          {list.map((m) => {
            const live = m.status === 'scheduled' && now >= new Date(m.startsAt).getTime() - 15 * 60_000 && now <= new Date(m.endsAt).getTime();
            return (
              <li key={m.id} data-meeting={m.id}>
                <div className="cz-meeting-date" aria-hidden><span>{new Date(m.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{new Date(m.startsAt).getDate()}</strong></div>
                <div className="cz-meeting-main">
                  <Link href={`/meetings/${m.id}/room`}><strong>{m.title}</strong></Link>
                  <span className="cz-muted">{fmtDay(m.startsAt)} · {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)} · {m.isOrganizer ? 'You organise' : `From ${m.organizer}`}</span>
                </div>
                <div className="cz-meeting-side">
                  {m.status !== 'scheduled' ? <StatusBadge status={m.status} /> : live ? <Link className="cz-btn cz-btn-accent cz-btn-sm" href={`/meetings/${m.id}/room`}><Icon name="external" size={14} />Join now</Link>
                    : m.isOrganizer ? <span className="cz-muted" style={{ fontSize: 13 }}>Organiser</span> : (
                      <div className="cz-segment" role="group" aria-label={`Your answer for ${m.title}`}>
                        {['accepted', 'tentative', 'declined'].map((v) => <button key={v} type="button" aria-pressed={m.myRsvp === v} onClick={() => rsvp.run(m.id, v)}>{RSVP[v]}</button>)}
                      </div>
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}

function Schedule({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const tomorrow = new Date(Date.now() + 86400_000);
  const [f, setF] = useState({ title: '', agenda: '', date: tomorrow.toISOString().slice(0, 10), time: '11:00', duration: '30' });
  const [people, setPeople] = useState<Contact[]>([]);
  const [term, setTerm] = useState('');
  const contacts = useQuery<Contact[]>('/chat/contacts', term.trim() ? { q: term.trim() } : undefined);
  const save = useMutation(async () => {
    const start = new Date(`${f.date}T${f.time}`);
    const end = new Date(start.getTime() + Number(f.duration) * 60_000);
    await api.post('/meetings', { title: f.title, agenda: f.agenda || undefined, startsAt: start.toISOString(), endsAt: end.toISOString(), attendeeUserIds: people.map((p) => p.userId) });
    onDone(); return true;
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="cz-card cz-compose" aria-labelledby="sched-h">
      <div className="cz-card-head"><h2 id="sched-h">Schedule a meeting</h2><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></Button></div>
      {save.error && <Alert tone="danger">{save.error}{Object.values(save.fieldErrors).length ? ` — ${Object.values(save.fieldErrors).join('; ')}` : ''}</Alert>}
      <form onSubmit={(e) => { e.preventDefault(); save.run(); }} className="cz-sched">
        <label className="cz-sched-wide">Title<input className="cz-input" value={f.title} onChange={set('title')} placeholder="e.g. Cable scope call" required minLength={3} /></label>
        <label>Date<input className="cz-input" type="date" value={f.date} onChange={set('date')} required /></label>
        <label>Start time<input className="cz-input" type="time" value={f.time} onChange={set('time')} required /></label>
        <label>Duration<select className="cz-select" value={f.duration} onChange={set('duration')}>{[['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1½ hours']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div className="cz-sched-wide">
          <span className="cz-sched-label">Invite</span>
          {people.length > 0 && <div className="cz-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{people.map((p) => <span key={p.userId} className="cz-to-chip">{p.name}<button type="button" onClick={() => setPeople(people.filter((x) => x.userId !== p.userId))} aria-label={`Remove ${p.name}`}><Icon name="close" size={12} /></button></span>)}</div>}
          <input className="cz-input" placeholder="Search people or companies" aria-label="Search people to invite" value={term} onChange={(e) => setTerm(e.target.value)} />
          <ul className="cz-contact-list" style={{ maxHeight: 180 }}>
            {(contacts.data ?? []).filter((c) => !people.some((p) => p.userId === c.userId)).slice(0, 6).map((c) => (
              <li key={c.userId}><button type="button" onClick={() => { setPeople([...people, c]); setTerm(''); }}><span className="cz-avatar cz-avatar-xs" aria-hidden>{initials(c.name)}</span><span><strong>{c.name}</strong><span className="cz-muted">{c.org}</span></span><Icon name="plus" size={14} /></button></li>
            ))}
          </ul>
        </div>
        <label className="cz-sched-wide">Agenda<textarea className="cz-input" rows={3} value={f.agenda} onChange={set('agenda')} placeholder="What do you want to decide?" /></label>
        <div className="cz-row cz-sched-wide" style={{ gap: 8 }}><Button type="submit" variant="accent" loading={save.pending} disabled={!f.title.trim() || !people.length}>Send invitations</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </section>
  );
}
