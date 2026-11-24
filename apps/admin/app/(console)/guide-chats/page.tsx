'use client';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadingState, Segmented, StatusBadge, TextArea } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Conv { id: string; status: string; name: string | null; email: string | null; organization: string | null; page: string | null; lastMessageAt: string; member: boolean }
interface Msg { id: string; sender: string; body: string; createdAt: string; staff: string | null }
const LABEL: Record<string, string> = { waiting: 'Waiting for us', answered: 'Answered', open: 'With the guide', closed: 'Closed' };
const TONE: Record<string, string> = { waiting: 'warning', answered: 'success', open: 'neutral', closed: 'neutral' };

/** Guide chats: conversations where a visitor or member asked for a person. Replies appear in their chat window. */
export default function GuideChats() {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery<{ items: Conv[] }>('/admin/guide/conversations', status ? { status } : undefined);
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Guide chats" description="People on the website and in the app ask the COLLABIZ guide for help. When they ask for a person, the chat comes here — your reply appears in their chat window (and as a notification for members)." />
      <Segmented label="Show" value={status} onChange={(v) => { setStatus(v); setOpen(null); }} options={[{ value: '', label: 'Needs a reply' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length ? <Card><EmptyState icon="messages" title="No chats waiting">When someone asks for a person, their chat appears here.</EmptyState></Card> : (
        <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <ul className="cz-umeet-list" style={{ marginTop: 0 }}>{q.data.items.map((c) => (
              <li key={c.id} data-conv={c.id} style={{ outline: open === c.id ? '2px solid #2E7D32' : undefined }}>
                <div><strong>{c.name ?? 'Visitor'}{c.organization ? ` · ${c.organization}` : ''}</strong><span>{c.email ?? (c.member ? 'Member' : 'No email')} · {c.page ?? '—'} · {new Date(c.lastMessageAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>
                <div className="cz-row" style={{ gap: 8, flexWrap: 'nowrap' }}><StatusBadge status={c.status} tone={TONE[c.status] as never} label={LABEL[c.status] ?? c.status} /><Button size="sm" variant="secondary" onClick={() => setOpen(c.id)}>Open</Button></div>
              </li>
            ))}</ul>
          </Card>
          {open && <Thread id={open} onChange={q.reload} />}
        </div>
      )}
    </div>
  );
}

function Thread({ id, onChange }: { id: string; onChange: () => void }) {
  const q = useQuery<{ id: string; status: string; name: string | null; email: string | null; page: string | null; messages: Msg[] }>(`/admin/guide/conversations/${id}`);
  const [text, setText] = useState('');
  const reply = useMutation(async () => { await api.post(`/admin/guide/conversations/${id}/reply`, { body: text }); setText(''); q.reload(); onChange(); return true; });
  const close = useMutation(async () => { await api.post(`/admin/guide/conversations/${id}/close`); q.reload(); onChange(); return true; });
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <LoadingState />;
  const c = q.data;
  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>{c.name ?? 'Visitor'}</h2>
      <p className="cz-muted" style={{ marginTop: 0, fontSize: 13 }}>{c.email ?? 'No email given'} · started on {c.page ?? '—'}</p>
      <div className="cz-guide-msgs" style={{ maxHeight: 380, borderRadius: 14 }}>
        {c.messages.map((m) => <div key={m.id} className={`cz-guide-msg is-${m.sender === 'visitor' ? 'guide' : 'visitor'}`}>{m.sender !== 'visitor' && <small style={{ color: 'inherit', opacity: .75 }}>{m.sender === 'staff' ? m.staff ?? 'Unite team' : 'Guide (automatic)'}</small>}<p>{m.body}</p></div>)}
      </div>
      {c.status !== 'closed' ? (
        <form className="cz-stack" style={{ gap: 10, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) reply.run(); }}>
          {reply.error && <Alert tone="danger">{reply.error}</Alert>}
          <TextArea label="Your reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={reply.pending} disabled={!text.trim()}>Send reply</Button><Button type="button" variant="ghost" onClick={() => close.run()} loading={close.pending}>Close chat</Button></div>
        </form>
      ) : <p className="cz-muted">This chat is closed.</p>}
    </Card>
  );
}
