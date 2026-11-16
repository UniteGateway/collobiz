'use client';
/**
 * COLLABIZ ACTION OS — shared web pieces: the notice card (with its actions) and the home-dashboard notice board.
 * Confirmed source facts and suggestions look different on purpose: the suggested next step is labelled as a suggestion,
 * and each card shows its verification state and where it came from.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Button, Icon, Skeleton } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useLive } from '@/lib/live';

export interface Notice {
  id: string; title: string; summary: string; kind: string; kindLabel: string; sourceApp: string; sourceModule: string; organization: string; organizationId: string; recordUrl: string;
  dueAt: string | null; valuePaise: number | null; band: 'P0' | 'P1' | 'P2' | 'P3'; score: number; why: string[]; scoreParts: { key: string; points: number; why: string }[]; rule: string | null;
  verification: string; verificationLabel: string; status: string; owner: string | null; nextStep: string; confidentiality: string; pinned: boolean; read: boolean; snoozedUntil: string | null;
  escalatedAt: string | null; doneAt: string | null; doneNote: string | null; sourceStatus: string; external: boolean; dueKnown: boolean; firstSeenAt: string; seenAt: string;
}
export const BAND: Record<string, { label: string; cls: string }> = { P0: { label: 'Urgent', cls: 'cz-band-p0' }, P1: { label: 'High', cls: 'cz-band-p1' }, P2: { label: 'Normal', cls: 'cz-band-p2' }, P3: { label: 'Low', cls: 'cz-band-p3' } };
export const APP_LABEL: Record<string, string> = { crm: 'CRM', 'business-offers': 'Business Offers', collab: 'Collab', projects: 'Projects', tenders: 'Tenders', powertek: 'Powertek', xchange: 'XCHANGE' };
export const appLabel = (a: string) => APP_LABEL[a] ?? a.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const inr = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
export function dueText(iso: string | null) {
  if (!iso) return 'No due date in the source';
  const d = new Date(iso), h = (d.getTime() - Date.now()) / 3600000;
  const when = d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  if (h < 0) return `Overdue · was due ${when}`;
  return h < 24 ? `Due today/tomorrow · ${when}` : `Due ${when}`;
}
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

/** One notice with its actions. `onChange` reloads the list after an action. */
export function NoticeCard({ n, onChange, compact }: { n: Notice; onChange: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [more, setMore] = useState(false);
  const act = async (key: string, path: string, body: unknown = {}) => { setBusy(key); setErr(''); try { await api.post(`/action-os/notices/${n.id}/${path}`, body); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const overdue = n.dueAt && new Date(n.dueAt).getTime() < Date.now();
  return (
    <article className={`cz-notice ${BAND[n.band].cls}${n.status !== 'open' ? ' cz-notice-muted' : ''}`} data-notice={n.title}>
      <div className="cz-notice-top">
        <span className={`cz-band ${BAND[n.band].cls}`}>{BAND[n.band].label}</span>
        <span className="cz-notice-src">{appLabel(n.sourceApp)} · {n.kindLabel} · {n.organization}</span>
        {n.pinned && <span className="cz-notice-pin" title="Pinned"><Icon name="bookmark" size={13} /></span>}
        <span className={`cz-verif cz-verif-${n.verification}`}>{n.verificationLabel}</span>
      </div>
      <h3>{n.title}</h3>
      {n.summary && !compact && <p className="cz-notice-sum">{n.summary}</p>}
      <div className="cz-notice-meta">
        <span className={overdue ? 'cz-due-over' : ''}><Icon name="clock" size={13} />{dueText(n.dueAt)}</span>
        {n.valuePaise != null && n.confidentiality === 'normal' && <span><Icon name="value" size={13} />{inr(n.valuePaise)}</span>}
        {n.owner && <span><Icon name="user" size={13} />{n.owner}</span>}
        {n.status === 'snoozed' && n.snoozedUntil && <span>Snoozed until {new Date(n.snoozedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
        {n.status === 'done' && <span className="cz-done-tag"><Icon name="check" size={13} />Done here{n.doneNote ? ` — ${n.doneNote}` : ''}</span>}
        {n.status === 'resolved' && <span>Closed in the source</span>}
      </div>
      {!compact && (
        <div className="cz-notice-why">
          {n.why.length > 0 && <p><strong>Why it matters:</strong> {n.why.join(' · ')}{n.rule ? ` · Rule: ${n.rule}` : ''}</p>}
          <p className="cz-suggest"><Icon name="info" size={13} /><span><strong>Suggested next step:</strong> {n.nextStep}</span></p>
        </div>
      )}
      {err && <p className="cz-field-error" role="alert">{err}</p>}
      <div className="cz-notice-actions">
        <Link className="cz-btn cz-btn-secondary cz-btn-sm" href={n.recordUrl.startsWith('/') ? n.recordUrl : n.recordUrl} {...(n.recordUrl.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>Open record</Link>
        {n.status === 'open' || n.status === 'snoozed' ? <>
          <Button size="sm" variant="ghost" loading={busy === 'done'} onClick={() => act('done', 'complete')} aria-label={`Mark done: ${n.title}`}>Done</Button>
          <Button size="sm" variant="ghost" loading={busy === 'snz'} onClick={() => act('snz', 'snooze', { until: inDays(1) })} aria-label={`Snooze one day: ${n.title}`}>Snooze 1 day</Button>
          {!compact && <Button size="sm" variant="ghost" onClick={() => setMore(!more)} aria-expanded={more}>More</Button>}
        </> : n.status === 'done' ? <Button size="sm" variant="ghost" loading={busy === 'ro'} onClick={() => act('ro', 'reopen')}>Reopen</Button> : null}
      </div>
      {more && <NoticeMore n={n} act={act} busy={busy} />}
    </article>
  );
}

function NoticeMore({ n, act, busy }: { n: Notice; act: (k: string, p: string, b?: unknown) => Promise<void>; busy: string }) {
  const d = useQuery<{ team: { id: string; name: string }[]; comments: { id: string; body: string; by: string; at: string }[] }>(`/action-os/notices/${n.id}`);
  const [note, setNote] = useState(''); const [to, setTo] = useState('');
  return (
    <div className="cz-notice-more">
      <div className="cz-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" loading={busy === 'w'} onClick={() => act('w', 'snooze', { until: inDays(7) })}>Snooze 1 week</Button>
        <Button size="sm" variant="ghost" loading={busy === 'p'} onClick={() => act('p', 'pin', { pinned: !n.pinned })}>{n.pinned ? 'Unpin' : 'Pin'}</Button>
        <Button size="sm" variant="ghost" loading={busy === 'a'} onClick={() => act('a', 'archive')}>Archive</Button>
        <Button size="sm" variant="ghost" loading={busy === 'f1'} onClick={() => act('f1', 'feedback', { kind: 'useful' })}>Useful</Button>
        <Button size="sm" variant="ghost" loading={busy === 'f2'} onClick={() => act('f2', 'feedback', { kind: 'not_relevant' })}>Not relevant</Button>
        <Button size="sm" variant="ghost" loading={busy === 'f3'} onClick={() => act('f3', 'feedback', { kind: 'incorrect_data' })}>Wrong data</Button>
      </div>
      <div className="cz-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="cz-mini-field">Assign to<select aria-label="Assign to" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose a colleague…</option>{(d.data?.team ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <Button size="sm" variant="secondary" disabled={!to} loading={busy === 'as'} onClick={() => act('as', 'assign', { userId: to })}>Assign</Button>
      </div>
      <div className="cz-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="cz-mini-field" style={{ flex: 1 }}>Note or escalation reason<input aria-label="Note or escalation reason" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is needed and from whom" /></label>
        <Button size="sm" variant="secondary" disabled={!note.trim()} loading={busy === 'c'} onClick={() => act('c', 'comments', { body: note }).then(() => setNote(''))}>Add note</Button>
        <Button size="sm" variant="ghost" disabled={note.trim().length < 5} loading={busy === 'e'} onClick={() => act('e', 'escalate', { note }).then(() => setNote(''))}>Escalate to owners</Button>
      </div>
      {!!d.data?.comments.length && <ul className="cz-notice-comments">{d.data.comments.map((c) => <li key={c.id}><strong>{c.by}</strong> {c.body}</li>)}</ul>}
      <p className="cz-muted" style={{ fontSize: 12, margin: 0 }}>Source: {appLabel(n.sourceApp)} / {n.sourceModule} · status “{n.sourceStatus || 'n/a'}” · first seen {new Date(n.firstSeenAt).toLocaleString('en-IN')} · checked {new Date(n.seenAt).toLocaleString('en-IN')}. Priority score {n.score}/100.</p>
    </div>
  );
}

interface Dash { counts: { open: number; critical: number; high: number; overdue: number; decisions: number; followUps: number; thisWeek: number }; items: Notice[]; latestPlan: { id: string; kind: string; summary: string; generatedAt: string } | null; prefs: { weeklyDay: number; weeklyTime: string; timeZone: string; weeklyEnabled: boolean } }
const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Home dashboard: My Business Notice Board. */
export function NoticeBoard() {
  const q = useQuery<Dash>('/action-os/dashboard');
  useLive((e) => { if (e.type === 'notification') q.reload(); });
  const d = q.data;
  return (
    <section className="cz-card cz-noticeboard" aria-labelledby="nb-h">
      <div className="cz-card-head">
        <div><h2 id="nb-h">My Business Notice Board</h2><p>{d?.prefs.weeklyEnabled ? `Weekly plan every ${DAYS[d.prefs.weeklyDay]} at ${d.prefs.weeklyTime} (${d.prefs.timeZone})` : 'Your priorities across every app you use'}</p></div>
        <Link href="/action-os" className="cz-link-arrow">Action board<Icon name="arrow" size={14} /></Link>
      </div>
      {!d ? <Skeleton height={160} /> : <>
        <div className="cz-nb-stats">
          <div><strong>{d.counts.thisWeek}</strong><span>This week</span></div>
          <div className={d.counts.critical + d.counts.high ? 'cz-nb-hot' : ''}><strong>{d.counts.critical + d.counts.high}</strong><span>Top priorities</span></div>
          <div><strong>{d.counts.followUps}</strong><span>Follow-ups</span></div>
          <div><strong>{d.counts.decisions}</strong><span>Decisions</span></div>
          <div className={d.counts.overdue ? 'cz-nb-over' : ''}><strong>{d.counts.overdue}</strong><span>Overdue</span></div>
        </div>
        {!d.items.length ? <p className="cz-muted" style={{ margin: '8px 0 0' }}>Nothing needs your attention right now. New proposals, deadlines, collections and approvals appear here as they happen.</p> : (
          <div className="cz-nb-list">{d.items.slice(0, 4).map((n) => <NoticeCard key={n.id} n={n} onChange={q.reload} compact />)}</div>
        )}
        {d.latestPlan && <p className="cz-muted" style={{ fontSize: 13, margin: '10px 0 0' }}><Link href={`/action-os/plans/${d.latestPlan.id}`}>Latest plan</Link> · {d.latestPlan.summary}</p>}
      </>}
    </section>
  );
}
