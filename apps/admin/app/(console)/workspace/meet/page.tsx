'use client';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, ChipSelect, Dialog, EmptyState, Icon, LoadingState, SearchInput, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav, webUrl } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Meeting { id: string; title: string; startsAt: string; endsAt: string; status: string; organizer: string; isOrganizer: boolean; myRsvp: string; hasMinutes: boolean; actionItems: number }
interface Contact { userId: string; name: string; org: string }
const time = (d: string) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayLabel = (d: string) => { const x = new Date(d); const t = new Date(); const tm = new Date(Date.now() + 86400_000); return x.toDateString() === t.toDateString() ? 'Today' : x.toDateString() === tm.toDateString() ? 'Tomorrow' : x.toLocaleDateString('en-IN', { weekday: 'short' }); };

/** Meet — meetings across the group: schedule, join, and keep minutes and action items. */
export default function WorkspaceMeet() {
  const q = useQuery<Meeting[]>('/meetings');
  const [scheduling, setScheduling] = useState(false);
  const [code, setCode] = useState('');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const all = q.data ?? [];
  const now = Date.now();
  const upcoming = all.filter((m) => m.status === 'scheduled' && new Date(m.endsAt).getTime() >= now);
  const past = all.filter((m) => !upcoming.includes(m) && m.status !== 'cancelled').reverse().slice(0, 6);
  const days = useMemo(() => new Set(all.filter((m) => m.status !== 'cancelled').map((m) => new Date(m.startsAt).toDateString())), [all]);
  const joinByCode = () => { const id = code.trim().match(/[0-9a-f-]{36}/i)?.[0]; if (id) window.location.href = webUrl(`/meetings/${id}`); };
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="COLLABIZ" accent="Meet" sub="Meetings with colleagues and partners — agenda, attendance, minutes and action items in one place." chips={['Schedule and invite', 'Agenda and minutes', 'Action items', 'Partners and colleagues']} />
      <Alert tone="info">Scheduling, invitations, minutes and action items work now. Live video, screen sharing and recordings start once a video provider is connected (Apps → Integrations).</Alert>
      <div className="cz-ws-actions">
        <button type="button" className="cz-ws-action" onClick={() => setScheduling(true)}><span className="cz-app-icon cz-tint-green"><Icon name="plus" size={20} /></span><span><strong>New meeting</strong><span>Plan it and invite people</span></span></button>
        <a className="cz-ws-action" href={webUrl('/meetings')}><span className="cz-app-icon cz-tint-blue"><Icon name="calendar" size={20} /></span><span><strong>My calendar</strong><span>All your meetings and replies</span></span></a>
        <form className="cz-ws-action" style={{ cursor: 'default' }} onSubmit={(e) => { e.preventDefault(); joinByCode(); }}>
          <span className="cz-app-icon cz-tint-violet"><Icon name="arrow" size={20} /></span>
          <span style={{ flex: 1, minWidth: 0 }}><strong>Join a meeting</strong><span className="cz-row" style={{ gap: 6, marginTop: 4, flexWrap: 'nowrap' }}><input aria-label="Meeting link or code" placeholder="Paste the meeting link" value={code} onChange={(e) => setCode(e.target.value)} className="cz-input" style={{ padding: '6px 10px', fontSize: 13 }} /><Button size="sm" type="submit" disabled={!/[0-9a-f-]{36}/i.test(code)}>Join</Button></span></span>
        </form>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <div className="cz-ws-cols">
          <div className="cz-ws">
            <Card title="Upcoming meetings">
              {!upcoming.length ? <EmptyState icon="calendar" title="No upcoming meetings" action={<Button onClick={() => setScheduling(true)}>Schedule a meeting</Button>} /> : upcoming.map((m) => (
                <div key={m.id} className="cz-ws-meeting" data-meeting={m.title}>
                  <span className="cz-ws-date">{dayLabel(m.startsAt)}<strong>{new Date(m.startsAt).getDate()}</strong></span>
                  <div style={{ minWidth: 0, flex: 1 }}><strong style={{ color: 'var(--cz-navy-900)' }}>{m.title}</strong><div className="cz-muted" style={{ fontSize: 13 }}>{time(m.startsAt)} – {time(m.endsAt)} · {m.isOrganizer ? 'You organise' : `By ${m.organizer}`}</div></div>
                  <a className="cz-btn cz-btn-primary cz-btn-sm" href={webUrl(`/meetings/${m.id}`)}>Open</a>
                </div>
              ))}
            </Card>
            <Card title="Minutes and action items">
              {!past.length ? <p className="cz-muted" style={{ margin: 0 }}>Minutes appear here after your meetings.</p> : (
                <ul className="cz-ws-list">{past.map((m) => (
                  <li key={m.id}><a href={webUrl(`/meetings/${m.id}`)}>{m.title}</a><span className="cz-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{new Date(m.startsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {m.hasMinutes ? `Minutes · ${m.actionItems} action${m.actionItems === 1 ? '' : 's'}` : 'No minutes yet'}</span></li>
                ))}</ul>
              )}
            </Card>
            <Card title="Recordings"><EmptyState icon="calendar" title="No recordings yet">Recordings and AI meeting notes start once a video provider is connected.</EmptyState></Card>
          </div>
          <aside className="cz-ws-side">
            <Card title={month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} actions={<span className="cz-row" style={{ gap: 4 }}><Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="prev" size={16} /></Button><Button size="sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="next" size={16} /></Button></span>}>
              <MonthGrid month={month} days={days} />
              <p className="cz-muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Days with a green ring have meetings.</p>
            </Card>
          </aside>
        </div>
      )}
      <Schedule open={scheduling} onClose={() => setScheduling(false)} onDone={() => { setScheduling(false); q.reload(); }} />
    </div>
  );
}

function MonthGrid({ month, days }: { month: Date; days: Set<string> }) {
  const first = (month.getDay() + 6) % 7; // Monday first
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date().toDateString();
  return (
    <table className="cz-cal">
      <thead><tr>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <th key={d} scope="col">{d}</th>)}</tr></thead>
      <tbody>{Array.from({ length: cells.length / 7 }, (_, w) => (
        <tr key={w}>{cells.slice(w * 7, w * 7 + 7).map((n, i) => {
          const ds = n ? new Date(month.getFullYear(), month.getMonth(), n).toDateString() : '';
          return <td key={i} data-today={ds === today || undefined} data-has={(n && days.has(ds)) || undefined}>{n ? <span>{n}</span> : null}</td>;
        })}</tr>
      ))}</tbody>
    </table>
  );
}

function Schedule({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [term, setTerm] = useState('');
  const contacts = useQuery<Contact[]>(open ? `/chat/contacts${term ? `?q=${encodeURIComponent(term)}` : ''}` : null);
  const [picked, setPicked] = useState<Contact[]>([]);
  const [f, setF] = useState({ title: '', agenda: '', date: '', start: '10:00', end: '10:30' });
  const save = useMutation(async () => {
    const at = (t: string) => new Date(`${f.date}T${t}:00`).toISOString();
    const r = await api.post('/meetings', { title: f.title, agenda: f.agenda || undefined, startsAt: at(f.start), endsAt: at(f.end), attendeeUserIds: picked.map((p) => p.userId) });
    setF({ title: '', agenda: '', date: '', start: '10:00', end: '10:30' }); setPicked([]); onDone(); return r;
  });
  const options = [...picked, ...(contacts.data ?? []).filter((c) => !picked.some((p) => p.userId === c.userId))].slice(0, 30);
  return (
    <Dialog open={open} onClose={onClose} title="New meeting">
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={save.fieldErrors.title} />
        <div className="cz-growth-kpis">
          <TextInput label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={save.fieldErrors.startsAt} />
          <TextInput label="Starts" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <TextInput label="Ends" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} error={save.fieldErrors.endsAt} />
        </div>
        <TextArea label="Agenda (optional)" rows={3} value={f.agenda} onChange={(e) => setF({ ...f, agenda: e.target.value })} />
        <SearchInput label="Find people" placeholder="Name or company" value={term} onChange={(e) => setTerm(e.target.value)} />
        <ChipSelect legend="Invite" value={picked.map((p) => p.userId)} onChange={(ids) => setPicked(options.filter((o) => ids.includes(o.userId)))} max={50} options={options.map((c) => ({ value: c.userId, label: `${c.name} · ${c.org}` }))} />
        {save.fieldErrors.attendeeUserIds && <span className="cz-error-text">{save.fieldErrors.attendeeUserIds}</span>}
        <Button type="submit" loading={save.pending} disabled={!f.title || !f.date || !picked.length}>Schedule and send invites</Button>
      </form>
    </Dialog>
  );
}
