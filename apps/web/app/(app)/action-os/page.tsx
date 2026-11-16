'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { NoticeCard, appLabel, type Notice } from '@/components/ActionOS';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useLive } from '@/lib/live';

interface Dash { counts: Record<string, number>; items: Notice[]; latestPlan: { id: string; summary: string; generatedAt: string } | null; sources: { key: string; label: string; ok: boolean; count: number; error?: string }[] }
const VIEWS: [string, string, (n: Notice) => boolean][] = [
  ['today', 'Today', (n) => n.band === 'P0' || (!!n.dueAt && new Date(n.dueAt).getTime() < Date.now() + 86400000)],
  ['week', 'This week', (n) => !!n.dueAt && new Date(n.dueAt).getTime() < Date.now() + 7 * 86400000],
  ['top', 'Top priorities', (n) => n.band === 'P0' || n.band === 'P1'],
  ['overdue', 'Overdue', (n) => !!n.dueAt && new Date(n.dueAt).getTime() < Date.now()],
  ['decisions', 'Decisions', (n) => n.kind === 'decision' || n.kind === 'approval'],
  ['follow', 'Follow-ups', (n) => n.kind === 'follow_up'],
  ['money', 'Financial', (n) => n.kind === 'collection' || n.kind === 'payment'],
  ['opps', 'Opportunities', (n) => n.kind === 'opportunity'],
  ['all', 'All open', () => true],
];

/** My Action Board: every open item from every app the user can act on, ranked, with actions. */
export default function ActionBoard() {
  const dash = useQuery<Dash>('/action-os/dashboard');
  const [view, setView] = useState('all'); const [app, setApp] = useState(''); const [status, setStatus] = useState('open');
  const list = useQuery<Notice[]>(`/action-os/notices?status=${status}${app ? `&app=${app}` : ''}`);
  useLive((e) => { if (e.type === 'notification') { dash.reload(); list.reload(); } });
  const reload = () => { dash.reload(); list.reload(); };
  const gen = useMutation(async () => { const r = await api.post<{ id: string }>('/action-os/plans/generate', { kind: 'on_demand' }); window.location.href = `/action-os/plans/${r.id}`; return true; });
  const f = VIEWS.find((v) => v[0] === view) ?? VIEWS[VIEWS.length - 1];
  const items = (list.data ?? []).filter(status === 'open' ? f[2] : () => true);
  const apps = [...new Set((dash.data?.items ?? []).map((i) => i.sourceApp))];
  const c = dash.data?.counts;
  return (
    <Screen page={{ key: 'action-os', title: 'My action board', access: 'partner' }} eyebrow="COLLABIZ ACTION OS" description="Your business. Your priorities. Every day — what needs attention, why it matters and what to do next, from every app you use."
      actions={<Button onClick={() => gen.run()} loading={gen.pending}>Generate my plan now</Button>}>
      {gen.error && <Alert tone="danger">{gen.error}</Alert>}
      {dash.error ? <ApiErrorView error={dash.error} onRetry={dash.reload} /> : !c ? <Skeleton height={90} /> : (
        <div className="cz-aos-stats">
          {[['Open', c.open, ''], ['Urgent', c.critical, 'cz-hot'], ['High', c.high, ''], ['Overdue', c.overdue, c.overdue ? 'cz-over' : ''], ['Decisions', c.decisions, ''], ['Follow-ups', c.followUps, '']].map(([l, v, cls]) => <div key={l as string} className={cls as string}><strong>{v as number}</strong><span>{l as string}</span></div>)}
        </div>
      )}
      {dash.data?.sources.some((s) => !s.ok) && <Alert tone="warning" title="Some sources could not be read">{dash.data.sources.filter((s) => !s.ok).map((s) => s.label).join(', ')} — items from them may be out of date.</Alert>}
      <div className="cz-aos-filters" role="group" aria-label="Filter notices">
        <div className="cz-chips">{VIEWS.map(([k, l]) => <button key={k} type="button" className={`cz-chip${view === k && status === 'open' ? ' cz-chip-on' : ''}`} aria-pressed={view === k && status === 'open'} onClick={() => { setView(k); setStatus('open'); }}>{l}</button>)}</div>
        <div className="cz-row" style={{ gap: 8 }}>
          <label className="cz-mini-field">App<select aria-label="App" value={app} onChange={(e) => setApp(e.target.value)}><option value="">All apps</option>{apps.map((a) => <option key={a} value={a}>{appLabel(a)}</option>)}</select></label>
          <label className="cz-mini-field">Show<select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="snoozed">Snoozed</option><option value="done">Done</option><option value="archived">Archived / closed</option></select></label>
        </div>
      </div>
      {list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : !list.data ? <Skeleton height={200} /> : !items.length ? (
        <EmptyState title="Nothing here">{status === 'open' ? 'No open items in this view. New proposals, deadlines, collections and approvals from your apps appear automatically.' : 'No items with this status.'}</EmptyState>
      ) : <div className="cz-aos-list">{items.map((n) => <NoticeCard key={n.id} n={n} onChange={reload} />)}</div>}
      <p className="cz-muted" style={{ fontSize: 12.5 }}>Priorities come from transparent rules (deadline, money involved, contractual or compliance risk, commitments, blockers). Suggested next steps are suggestions — nothing is sent, approved or paid on your behalf. <Link href="/action-os/settings">Schedule & channels</Link></p>
    </Screen>
  );
}
