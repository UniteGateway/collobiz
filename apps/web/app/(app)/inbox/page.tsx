'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, Icon, SearchInput, Segmented, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { initials, when } from '@/components/Comms';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Row { id: string; kind: 'direct' | 'project'; title: string; lastMessageAt: string | null; unread: number; preview: { author: string; text: string; at: string } | null }
interface Contact { userId: string; name: string; org: string }

/** Screen 105 — Unified business inbox: direct conversations and project group chats in one place. */
export default function Inbox() {
  const router = useRouter();
  const q = useQuery<Row[]>('/inbox');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  useEffect(() => { const t = setInterval(() => q.reload(), 15000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (q.data ?? []).filter((r) => (filter === 'all' || (filter === 'unread' ? r.unread > 0 : r.kind === filter)) && (!search || `${r.title} ${r.preview?.text ?? ''}`.toLowerCase().includes(search.toLowerCase()))), [q.data, filter, search]);
  const unread = (q.data ?? []).reduce((s, r) => s + r.unread, 0);
  return (
    <Screen id="105" title="Inbox" description="Direct conversations with partners and your project team chats. Messages are encrypted and visible only to the people in each conversation."
      actions={<Button variant="accent" onClick={() => setComposing(true)}><Icon name="plus" size={16} />New message</Button>}>
      {composing && <Compose onClose={() => setComposing(false)} onSent={(id) => router.push(`/chat/${id}`)} />}
      <div className="cz-inbox-tools">
        <div style={{ flex: '1 1 280px' }}><SearchInput label="Search conversations" placeholder="Search people, companies or messages" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: `Unread${unread ? ` ${unread}` : ''}` }, { value: 'direct', label: 'Direct' }, { value: 'project', label: 'Projects' }]} />
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? (
        <ul className="cz-convo-list" aria-busy>{[0, 1, 2, 3].map((i) => <li key={i} style={{ padding: 18 }}><Skeleton height={16} width="40%" /><Skeleton height={13} width="70%" style={{ marginTop: 8 }} /></li>)}</ul>
      ) : !rows.length ? (
        <div className="cz-card"><EmptyState icon="messages" title={q.data.length ? 'No conversations match' : 'No conversations yet'} action={!q.data.length ? <Button variant="accent" onClick={() => setComposing(true)}>Start a conversation</Button> : undefined}>
          {q.data.length ? 'Try another filter or search.' : 'Message a verified partner, or open a project to chat with its team.'}
        </EmptyState></div>
      ) : (
        <ul className="cz-convo-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.kind === 'project' ? `/chat/groups/${r.id}` : `/chat/${r.id}`} className="cz-convo" data-unread={r.unread > 0 || undefined} data-thread={r.id}>
                <span className={`cz-avatar${r.kind === 'project' ? ' cz-avatar-sq' : ''}`} aria-hidden>{r.kind === 'project' ? <Icon name="projects" size={16} /> : initials(r.title)}</span>
                <span className="cz-convo-main">
                  <span className="cz-convo-top"><strong>{r.title}</strong>{r.lastMessageAt && <time dateTime={r.lastMessageAt}>{when(r.lastMessageAt)}</time>}</span>
                  <span className="cz-convo-preview">{r.preview ? <>{r.kind === 'project' && <b>{r.preview.author.split(' ')[0]}: </b>}{r.preview.text}</> : <span className="cz-muted">No messages yet</span>}</span>
                </span>
                {r.unread > 0 && <span className="cz-count" aria-label={`${r.unread} unread`}>{r.unread}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

function Compose({ onClose, onSent }: { onClose: () => void; onSent: (threadId: string) => void }) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [to, setTo] = useState<Contact | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim()), 250); return () => clearTimeout(t); }, [term]);
  const contacts = useQuery<Contact[]>(to ? null : '/chat/contacts', debounced ? { q: debounced } : undefined);
  const send = useMutation(async () => { const r = await api.post<{ threadId: string }>('/chat/direct', { recipientUserId: to!.userId, subject: subject || undefined, body }); onSent(r.threadId); return r; });
  return (
    <section className="cz-card cz-compose" aria-labelledby="compose-h">
      <div className="cz-card-head"><h2 id="compose-h">New message</h2><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></Button></div>
      {send.error && <Alert tone="danger">{send.error}</Alert>}
      {!to ? (
        <>
          <SearchInput label="To" placeholder="Search people or companies" value={term} onChange={(e) => setTerm(e.target.value)} autoFocus />
          <p className="cz-muted" style={{ fontSize: 12.5, margin: '6px 0 10px' }}>You can message members of verified partner companies.</p>
          <ul className="cz-contact-list">
            {!contacts.data ? <li><Skeleton height={36} /></li> : !contacts.data.length ? <li className="cz-muted" style={{ padding: 10 }}>No one matches “{debounced}”.</li> : contacts.data.slice(0, 8).map((c) => (
              <li key={c.userId}><button type="button" onClick={() => setTo(c)}><span className="cz-avatar cz-avatar-xs" aria-hidden>{initials(c.name)}</span><span><strong>{c.name}</strong><span className="cz-muted">{c.org}</span></span></button></li>
            ))}
          </ul>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.run(); }} className="cz-stack" style={{ gap: 10 }}>
          <div className="cz-to-chip"><span className="cz-avatar cz-avatar-xs" aria-hidden>{initials(to.name)}</span>{to.name} · <span className="cz-muted">{to.org}</span><button type="button" onClick={() => setTo(null)} aria-label="Change recipient"><Icon name="close" size={13} /></button></div>
          <input className="cz-input" placeholder="Subject (optional)" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          <textarea className="cz-input" rows={4} placeholder="Write your message" aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" variant="accent" loading={send.pending} disabled={!body.trim()}>Send</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
        </form>
      )}
    </section>
  );
}
