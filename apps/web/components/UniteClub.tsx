'use client';
/** Unite Club — chapter list, apply, propose a chapter, and the members' chapter dashboard. */
import Link from 'next/link';
import { useState } from 'react';
import { UC_EVENT_KINDS, UC_REFERRAL_STATUS, UC_ROLES, ucCategoryKey } from '@collabiz/types';
import { Alert, Button, Checkbox, EmptyState, ErrorState, LoadingState, Money, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

export interface UcPublicChapter { slug: string; name: string; city: string; state: string | null; country: string; about: string; meetingSchedule: string; meetsOnline: boolean; exclusiveCategories: boolean; members: number; categories: string[] }
const fmt = (d: string) => new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Active chapters, or a clear call to start the first one (never an empty grid). */
export function UcChapterList() {
  const q = useQuery<{ chapters: UcPublicChapter[]; stats: { chapters: number; members: number; referrals: number } }>('/public/unite-club');
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  if (!q.data.chapters.length) return (
    <div className="cz-uc-start" data-uc-empty>
      <div><h3>Be the first chapter in your city</h3><p>No chapters are open yet. Propose one for your city — the Unite team approves it and you become its first president.</p></div>
      <Link href="/my-club#start" className="cz-btn cz-btn-accent cz-btn-lg">Start a chapter</Link>
    </div>
  );
  return (
    <>
      <p className="cz-sublead">{q.data.stats.chapters} chapters · {q.data.stats.members} members · {q.data.stats.referrals} referrals passed</p>
      <div className="cz-uc-chapters">{q.data.chapters.map((c) => (
        <Link key={c.slug} href={`/unite-club/${c.slug}`} className="cz-uc-chapter" data-chapter={c.slug}>
          <span className="cz-uc-city">{c.city}{c.state ? `, ${c.state}` : ''}</span>
          <strong>{c.name}</strong>
          <span>{c.meetingSchedule}{c.meetsOnline ? ' · also online' : ''}</span>
          <span className="cz-uc-count">{c.members} member{c.members === 1 ? '' : 's'}</span>
        </Link>
      ))}</div>
    </>
  );
}

/** Apply to join a chapter (signed in, with a business account). */
export function UcApply({ slug, taken }: { slug: string; taken: string[] }) {
  const { me } = useSession();
  const [f, setF] = useState({ category: '', intro: '' });
  const [done, setDone] = useState(false);
  const m = useMutation(async () => { await api.post(`/unite-club/chapters/${slug}/apply`, f); setDone(true); return true; });
  if (!me) return <p>To apply, <Link href={`/login?next=/unite-club/${slug}`}>sign in</Link> or <Link href="/signup">create a free business account</Link>.</p>;
  if (done) return <Alert tone="success" title="Application sent">The chapter president or secretary will decide. You’ll get a notification.</Alert>;
  const clash = f.category.trim().length > 2 && taken.some((t) => ucCategoryKey(t) === ucCategoryKey(f.category));
  return (
    <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="uc-apply">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <TextInput label="Your business category" placeholder="e.g. Interior designer" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} error={m.fieldErrors.category ?? (clash ? 'This category is already taken in this chapter' : undefined)} />
      <TextArea label="Introduce your business (optional)" rows={3} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} />
      <div><Button type="submit" loading={m.pending} disabled={clash}>Apply to join</Button></div>
    </form>
  );
}

/** Propose a new chapter; the proposer becomes president once the Unite team approves. */
export function UcPropose({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', city: '', state: '', about: '', meetingSchedule: '', venue: '', meetsOnline: false, exclusiveCategories: true, category: '' });
  const m = useMutation(async () => { await api.post('/unite-club/chapters', f); onDone(); return true; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const fe = m.fieldErrors;
  return (
    <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="uc-propose">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <div className="cz-grid cz-grid-2">
        <TextInput label="Chapter name" placeholder="Unite Club Pune Central" value={f.name} onChange={set('name')} error={fe.name} />
        <TextInput label="City" value={f.city} onChange={set('city')} error={fe.city} />
        <TextInput label="State (optional)" value={f.state} onChange={set('state')} />
        <TextInput label="When it meets" placeholder="Every Tuesday, 7:30 am" value={f.meetingSchedule} onChange={set('meetingSchedule')} error={fe.meetingSchedule} />
        <TextInput label="Venue (optional)" value={f.venue} onChange={set('venue')} />
        <TextInput label="Your business category" placeholder="e.g. Chartered accountant" value={f.category} onChange={set('category')} error={fe.category} />
      </div>
      <TextArea label="What the chapter is about" rows={3} value={f.about} onChange={set('about')} error={fe.about} />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Checkbox label="Also meets online (U meet)" checked={f.meetsOnline} onChange={(e) => setF({ ...f, meetsOnline: e.target.checked })} />
        <Checkbox label="One member per business category" checked={f.exclusiveCategories} onChange={(e) => setF({ ...f, exclusiveCategories: e.target.checked })} />
      </div>
      <div><Button type="submit" variant="accent" loading={m.pending}>Propose this chapter</Button></div>
    </form>
  );
}

interface Member { id: string; userId: string; name: string; org: string; category: string; role: keyof typeof UC_ROLES; joinedAt: string | null }
interface Ev { id: string; kind: keyof typeof UC_EVENT_KINDS; title: string; details: string | null; startsAt: string; endsAt: string; venue: string | null; cancelled: boolean; room: string | null; going: number; myAnswer: string | null; serviceHours: number; myHours: number | null }
interface Ref { id: string; direction: 'given' | 'received'; from: string; to: string; contactName: string; contactPhone?: string | null; contactEmail?: string | null; need: string; status: keyof typeof UC_REFERRAL_STATUS; reportedValueMinor: number | null; createdAt: string }
export interface UcView {
  chapter: UcPublicChapter & { venue: string | null; status: string }; me: { role: string; category: string; userId: string } | null; isOfficer: boolean;
  members: Member[]; applications: { id: string; name: string; org: string; category: string; intro: string | null; appliedAt: string }[];
  events: Ev[]; referralStats: { given: number; won: number; reportedValueMinor: number }; referrals: Ref[];
}

/** The members' chapter dashboard: meetings, members, referrals, and officer tools. */
export function UcDashboard({ v, reload }: { v: UcView; reload: () => void }) {
  const [tab, setTab] = useState('events');
  const upcoming = v.events.filter((e) => new Date(e.endsAt).getTime() >= Date.now());
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <div className="cz-uc-stats">
        <div><strong>{v.members.length}</strong><span>members</span></div>
        <div><strong>{upcoming.length}</strong><span>upcoming events</span></div>
        <div><strong>{v.referralStats.given}</strong><span>referrals passed</span></div>
        <div><strong>{v.referralStats.won}</strong><span>became business</span></div>
        <div><strong><Money minor={v.referralStats.reportedValueMinor} currency="INR" /></strong><span>business reported by members</span></div>
      </div>
      <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'events', label: 'Meetings & events' }, { value: 'members', label: 'Members' }, { value: 'referrals', label: 'Referrals' }, ...(v.isOfficer ? [{ value: 'apps', label: `Applications${v.applications.length ? ` (${v.applications.length})` : ''}` }] : [])]} />
      {tab === 'events' ? <Events v={v} reload={reload} /> : tab === 'members' ? <Members v={v} reload={reload} /> : tab === 'referrals' ? <Referrals v={v} reload={reload} /> : <Applications v={v} reload={reload} />}
    </div>
  );
}

function Events({ v, reload }: { v: UcView; reload: () => void }) {
  const [adding, setAdding] = useState(false);
  const rsvp = useMutation(async (id: string, answer: string) => { await api.post(`/unite-club/events/${id}/rsvp`, { answer }); reload(); return true; });
  const hours = useMutation(async (id: string) => { const h = Number(window.prompt('Hours you gave to this project (1–24)')); if (!h) return false; await api.post(`/unite-club/events/${id}/hours`, { hours: h }); reload(); return true; });
  return (
    <>
      {v.isOfficer && (adding ? <EventForm slug={v.chapter.slug} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} /> : <div><Button variant="accent" onClick={() => setAdding(true)}>Schedule a meeting or event</Button></div>)}
      {(rsvp.error || hours.error) && <Alert tone="danger">{rsvp.error ?? hours.error}</Alert>}
      {!v.events.length ? <EmptyState title="Nothing scheduled yet">{v.isOfficer ? 'Schedule the first chapter meeting.' : 'Your chapter officers will schedule the next meeting.'}</EmptyState> : (
        <ul className="cz-uc-events">{v.events.map((e) => {
          const past = new Date(e.endsAt).getTime() < Date.now();
          return (
            <li key={e.id} data-event={e.title} className={past ? 'is-past' : ''}>
              <div className="cz-uc-date"><strong>{new Date(e.startsAt).toLocaleDateString('en-IN', { day: 'numeric' })}</strong><span>{new Date(e.startsAt).toLocaleDateString('en-IN', { month: 'short' })}</span></div>
              <div className="cz-uc-ev">
                <span className="cz-uc-kind">{UC_EVENT_KINDS[e.kind]}</span>
                <strong>{e.title}</strong>
                <span>{fmt(e.startsAt)}{e.venue ? ` · ${e.venue}` : ''} · {e.going} going{e.kind === 'service' && e.serviceHours ? ` · ${e.serviceHours} service hours` : ''}</span>
                {e.details && <p>{e.details}</p>}
              </div>
              <div className="cz-uc-actions">
                {e.room && !past && <Link href={e.room} className="cz-btn cz-btn-accent cz-btn-sm">Open U meet room</Link>}
                {!past && <>
                  <Button size="sm" variant={e.myAnswer === 'going' ? 'primary' : 'secondary'} onClick={() => rsvp.run(e.id, 'going')} aria-pressed={e.myAnswer === 'going'}>Going</Button>
                  <Button size="sm" variant="ghost" onClick={() => rsvp.run(e.id, 'not_going')} aria-pressed={e.myAnswer === 'not_going'}>Can’t make it</Button>
                </>}
                {e.kind === 'service' && new Date(e.startsAt).getTime() <= Date.now() && <Button size="sm" variant="secondary" onClick={() => hours.run(e.id)}>{e.myHours ? `My hours: ${e.myHours}` : 'Log my hours'}</Button>}
              </div>
            </li>
          );
        })}</ul>
      )}
    </>
  );
}

function EventForm({ slug, onDone, onCancel }: { slug: string; onDone: () => void; onCancel: () => void }) {
  const [f, setF] = useState({ kind: 'meeting', title: 'Weekly chapter meeting', date: '', start: '07:30', minutes: '90', venue: '', details: '', online: false });
  const m = useMutation(async () => {
    const startsAt = new Date(`${f.date}T${f.start}`);
    if (Number.isNaN(startsAt.getTime())) throw new Error('Choose a date and time');
    await api.post(`/unite-club/chapters/${slug}/events`, { kind: f.kind, title: f.title, details: f.details, venue: f.venue, online: f.online, startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + (Number(f.minutes) || 60) * 60_000).toISOString() });
    onDone(); return true;
  });
  return (
    <form className="cz-card cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="uc-event">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <div className="cz-grid cz-grid-3">
        <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={Object.entries(UC_EVENT_KINDS).map(([value, label]) => ({ value, label }))} />
        <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={m.fieldErrors.title} />
        <TextInput label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={m.fieldErrors.startsAt} />
        <TextInput label="Starts" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <TextInput label="Length (minutes)" inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />
        <TextInput label="Venue (optional)" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} />
      </div>
      <TextArea label="Agenda or details (optional)" rows={2} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
      <Checkbox label="Online — open a U meet room for every member" checked={f.online} onChange={(e) => setF({ ...f, online: e.target.checked })} />
      <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={m.pending}>Schedule</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}

function Members({ v, reload }: { v: UcView; reload: () => void }) {
  const role = useMutation(async (id: string, r: string) => { await api.post(`/unite-club/chapters/${v.chapter.slug}/members/${id}/role`, { role: r }); reload(); return true; });
  const president = v.me?.role === 'president';
  return (
    <>
      {role.error && <Alert tone="danger">{role.error}</Alert>}
      <ul className="cz-uc-members">{v.members.map((m) => (
        <li key={m.id} data-member={m.name}>
          <span className="cz-avatar" aria-hidden>{m.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('')}</span>
          <div><strong>{m.name}</strong><span>{m.category} · {m.org}</span></div>
          {m.role !== 'member' && <StatusBadge status={m.role} tone="brand" label={UC_ROLES[m.role]} />}
          {president && m.role !== 'president' && (
            <label className="cz-uc-role"><span className="cz-sr-only">Role for {m.name}</span>
              <select className="cz-select" value={m.role} onChange={(e) => role.run(m.id, e.target.value)}>{Object.entries(UC_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          )}
        </li>
      ))}</ul>
    </>
  );
}

function Referrals({ v, reload }: { v: UcView; reload: () => void }) {
  const others = v.members.filter((m) => m.userId !== v.me?.userId);
  const [f, setF] = useState({ toUserId: others[0]?.userId ?? '', contactName: '', contactPhone: '', contactEmail: '', need: '', consent: false });
  const [sent, setSent] = useState(false);
  const give = useMutation(async () => { await api.post(`/unite-club/chapters/${v.chapter.slug}/referrals`, f); setSent(true); setF({ ...f, contactName: '', contactPhone: '', contactEmail: '', need: '', consent: false }); reload(); return true; });
  const upd = useMutation(async (id: string, status: string) => {
    const body: { status: string; reportedValueMinor?: number } = { status };
    if (status === 'won') { const r = window.prompt('Value of the business (₹), optional'); if (r && Number(r) > 0) body.reportedValueMinor = Math.round(Number(r) * 100); }
    await api.post(`/unite-club/referrals/${id}`, body); reload(); return true;
  });
  return (
    <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
      <section className="cz-card">
        <h3 style={{ marginTop: 0 }}>Pass a referral</h3>
        {sent && <Alert tone="success">Referral sent. The member has been notified.</Alert>}
        {give.error && <Alert tone="danger">{give.error}</Alert>}
        {!others.length ? <p className="cz-muted">When the chapter has more members you can pass referrals here.</p> : (
          <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); setSent(false); give.run(); }} data-form="uc-referral">
            <Select label="To member" value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value })} options={others.map((m) => ({ value: m.userId, label: `${m.name} — ${m.category}` }))} error={give.fieldErrors.toUserId} />
            <TextInput label="Person who needs it" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} error={give.fieldErrors.contactName} />
            <div className="cz-grid cz-grid-2">
              <TextInput label="Their phone" type="tel" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} error={give.fieldErrors.contactPhone} />
              <TextInput label="Their email" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
            </div>
            <TextArea label="What do they need?" rows={2} value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} error={give.fieldErrors.need} />
            <Checkbox label="They agreed that I can pass their details to this member" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            {give.fieldErrors.consent && <p className="cz-error-text">{give.fieldErrors.consent}</p>}
            <div><Button type="submit" loading={give.pending}>Pass referral</Button></div>
          </form>
        )}
      </section>
      <section className="cz-card">
        <h3 style={{ marginTop: 0 }}>My referrals</h3>
        {upd.error && <Alert tone="danger">{upd.error}</Alert>}
        {!v.referrals.length ? <p className="cz-muted">Referrals you give and receive appear here. Others’ referrals stay private; the chapter sees totals.</p> : (
          <ul className="cz-umeet-list">{v.referrals.map((r) => (
            <li key={r.id} data-referral={r.contactName} style={{ alignItems: 'flex-start' }}>
              <div>
                <strong>{r.direction === 'received' ? `From ${r.from}` : `To ${r.to}`}: {r.contactName}</strong>
                <span>{r.need}</span>
                {r.direction === 'received' && <span>{[r.contactPhone, r.contactEmail].filter(Boolean).join(' · ')}</span>}
                <span>{UC_REFERRAL_STATUS[r.status]}{r.status === 'won' && r.reportedValueMinor ? <> · <Money minor={r.reportedValueMinor} currency="INR" /> (reported)</> : null}</span>
              </div>
              {r.direction === 'received' && r.status !== 'won' && r.status !== 'lost' && (
                <div className="cz-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {r.status === 'given' && <Button size="sm" variant="secondary" onClick={() => upd.run(r.id, 'contacted')}>Contacted</Button>}
                  <Button size="sm" variant="accent" onClick={() => upd.run(r.id, 'won')}>Won</Button>
                  <Button size="sm" variant="ghost" onClick={() => upd.run(r.id, 'lost')}>Didn’t go ahead</Button>
                </div>
              )}
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

function Applications({ v, reload }: { v: UcView; reload: () => void }) {
  const decide = useMutation(async (id: string, decision: string) => { await api.post(`/unite-club/chapters/${v.chapter.slug}/members/${id}/decide`, { decision }); reload(); return true; });
  if (!v.applications.length) return <EmptyState title="No applications waiting">Share the chapter page so business people in your city can apply.</EmptyState>;
  return (
    <>
      {decide.error && <Alert tone="danger">{decide.error}</Alert>}
      <ul className="cz-umeet-list">{v.applications.map((a) => (
        <li key={a.id} data-application={a.name}>
          <div><strong>{a.name} · {a.category}</strong><span>{a.org}{a.intro ? ` — ${a.intro}` : ''}</span></div>
          <div className="cz-row" style={{ gap: 6, flexWrap: 'nowrap' }}><Button size="sm" variant="accent" onClick={() => decide.run(a.id, 'approve')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide.run(a.id, 'decline')}>Decline</Button></div>
        </li>
      ))}</ul>
    </>
  );
}
