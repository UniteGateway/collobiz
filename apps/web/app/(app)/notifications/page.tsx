'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { KIND_META, when } from '@/components/Comms';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface N { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string; readAt: string | null }
interface Centre { items: N[]; unreadByKind: Record<string, number>; unread: number }

/** Screen 111 — Notifications & alerts centre: everything that happened, filterable by area, with read state. */
export default function Notifications() {
  const [kind, setKind] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useQuery<Centre>('/notifications', { kind: kind || undefined, unread: unreadOnly ? 'true' : undefined });
  const all = useQuery<Centre>('/notifications', { unread: 'true' });
  const markAll = useMutation(async () => { await api.post('/notifications/read', { all: true }); await Promise.all([q.reload(), all.reload()]); return true; });
  const markOne = async (n: N) => { if (!n.readAt) { await api.post('/notifications/read', { ids: [n.id] }).catch(() => {}); } };
  const kinds = Object.entries(all.data?.unreadByKind ?? {}).sort((a, b) => b[1] - a[1]);
  const today = new Date().toDateString();
  const groups: [string, N[]][] = [['Today', (q.data?.items ?? []).filter((n) => new Date(n.createdAt).toDateString() === today)], ['Earlier', (q.data?.items ?? []).filter((n) => new Date(n.createdAt).toDateString() !== today)]];
  return (
    <Screen id="111" title="Notifications" description={all.data ? (all.data.unread ? `${all.data.unread} unread` : 'You’re all caught up') : undefined}
      actions={<><Link href="/settings/notifications" className="cz-btn cz-btn-secondary"><Icon name="settings" size={16} />Preferences</Link><Button onClick={() => markAll.run()} loading={markAll.pending} disabled={!all.data?.unread}>Mark all read</Button></>}>
      <div className="cz-mkt-filters" style={{ marginBottom: 16 }}>
        <button type="button" className="cz-chip-btn" aria-pressed={!kind} data-on={!kind || undefined} onClick={() => setKind('')}>All</button>
        {kinds.map(([k, n]) => <button key={k} type="button" className="cz-chip-btn" aria-pressed={kind === k} data-on={kind === k || undefined} onClick={() => setKind(kind === k ? '' : k)}><Icon name={KIND_META[k]?.icon ?? 'bell'} size={14} />{KIND_META[k]?.label ?? k}<span className="cz-count">{n}</span></button>)}
        <span className="cz-mkt-spacer" />
        <label className="cz-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Unread only</label>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !q.data.items.length ? (
        <div className="cz-card"><EmptyState icon="success" title={unreadOnly || kind ? 'Nothing here' : 'No notifications yet'}>Invitations, signatures, messages and payouts will appear here.</EmptyState></div>
      ) : groups.filter(([, items]) => items.length).map(([label, items]) => (
        <section key={label} style={{ marginBottom: 20 }} aria-label={label}>
          <h2 className="cz-group-label">{label}</h2>
          <ul className="cz-notif-list">
            {items.map((n) => {
              const inner = (
                <>
                  <span className="cz-action-icon" data-kind={n.kind}><Icon name={KIND_META[n.kind]?.icon ?? 'bell'} size={17} /></span>
                  <span className="cz-action-text"><strong>{n.title}</strong>{n.body && <span>{n.body}</span>}</span>
                  <time className="cz-muted" dateTime={n.createdAt}>{when(n.createdAt)}</time>
                  {!n.readAt && <span className="cz-unread-dot" aria-label="Unread" />}
                </>
              );
              return <li key={n.id} data-unread={!n.readAt || undefined}>{n.link ? <Link href={n.link} onClick={() => markOne(n)}>{inner}</Link> : <div>{inner}</div>}</li>;
            })}
          </ul>
        </section>
      ))}
    </Screen>
  );
}
