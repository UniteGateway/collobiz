'use client';
import { useState } from 'react';
import { sectorName } from '@collabiz/types';
import { EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { when } from '@/components/Comms';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';

interface Ann { id: string; title: string; body: string; audience: string; sector: string | null; important: boolean; createdAt: string; expiresAt: string | null; read: boolean }
const AUDIENCE: Record<string, string> = { all: 'Everyone', partners: 'All partners', verified_partners: 'Verified partners', group_companies: 'Unite Group companies' };

/** Screen 110 — Business announcements from Unite Group, filtered to your audience. Opening one marks it read. */
export default function Announcements() {
  const q = useQuery<Ann[]>('/announcements');
  const [open, setOpen] = useState<string | null>(null);
  const toggle = async (a: Ann) => {
    setOpen(open === a.id ? null : a.id);
    if (!a.read) { await api.post(`/announcements/${a.id}/read`).catch(() => {}); q.reload(); }
  };
  const unread = (q.data ?? []).filter((a) => !a.read).length;
  return (
    <Screen id="110" title="Announcements" description={unread ? `${unread} new from Unite Group` : 'News and programme updates from Unite Group.'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={180} /> : !q.data.length ? (
        <div className="cz-card"><EmptyState icon="bell" title="No announcements">Programme news, tender windows and policy updates will appear here.</EmptyState></div>
      ) : (
        <ul className="cz-ann-list">
          {q.data.map((a) => (
            <li key={a.id} data-unread={!a.read || undefined} data-important={a.important || undefined}>
              <button type="button" aria-expanded={open === a.id} onClick={() => toggle(a)}>
                {!a.read && <span className="cz-unread-dot" aria-label="New" />}
                <span className="cz-ann-main">
                  <span className="cz-ann-meta">{a.important && <span className="cz-route cz-route-unite"><Icon name="warning" size={11} />Important</span>}<span>{AUDIENCE[a.audience] ?? a.audience}</span>{a.sector && <span>{sectorName(a.sector)}</span>}<time dateTime={a.createdAt}>{when(a.createdAt)}</time></span>
                  <strong>{a.title}</strong>
                  {open !== a.id && <span className="cz-ann-snippet">{a.body.slice(0, 160)}{a.body.length > 160 ? '…' : ''}</span>}
                </span>
                <Icon name="next" size={16} className="cz-ann-chevron" />
              </button>
              {open === a.id && <div className="cz-ann-body">{a.body}{a.expiresAt && <p className="cz-muted" style={{ fontSize: 12.5, marginTop: 12 }}>Visible until {new Date(a.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</p>}</div>}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
