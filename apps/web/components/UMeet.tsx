'use client';
/** U meet: chat inside a meeting room (attendees only) and the "start a meeting now" form. */
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface ChatMsg { id: string; body: string; createdAt: string; name: string; mine: boolean }
interface Contact { userId: string; name: string; org: string }

export function MeetingChat({ meetingId }: { meetingId: string }) {
  const q = useQuery<{ items: ChatMsg[] }>(`/meetings/${meetingId}/messages`);
  const [text, setText] = useState('');
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === 'visible') q.reload(); }, 4000); return () => clearInterval(t); }, [q.reload]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [q.data?.items.length]);
  const send = useMutation(async () => { await api.post(`/meetings/${meetingId}/messages`, { body: text }); setText(''); q.reload(); return true; });
  const items = q.data?.items ?? [];
  return (
    <section className="cz-umeet-chat" aria-labelledby="umeet-chat-h" data-meeting-chat style={{ height: 420, marginBottom: 16 }}>
      <h2 id="umeet-chat-h">Meeting chat</h2>
      <ol aria-live="polite">
        {items.length === 0 && <li className="cz-muted" style={{ background: 'transparent', border: 0 }}>Messages here are seen by everyone invited to this meeting.</li>}
        {items.map((m) => <li key={m.id} className={m.mine ? 'is-mine' : ''}><small>{m.mine ? 'You' : m.name} · {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small>{m.body}</li>)}
        <li ref={end} aria-hidden style={{ padding: 0, border: 0, background: 'transparent' }} />
      </ol>
      {send.error && <Alert tone="danger">{send.error}</Alert>}
      <form className="cz-guide-input" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.run(); }}>
        <label htmlFor="umeet-chat-text" className="cz-sr-only">Message</label>
        <input id="umeet-chat-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone" maxLength={2000} autoComplete="off" />
        <button type="submit" disabled={send.pending || !text.trim()} aria-label="Send message"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M3 20l18-8L3 4v6l12 2-12 2z" fill="currentColor" /></svg></button>
      </form>
    </section>
  );
}

/** Start a meeting now with optional invitees (colleagues or members of verified businesses). */
export function InstantMeeting() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<Contact[]>([]);
  const contacts = useQuery<Contact[]>(find.trim().length >= 2 ? '/chat/contacts' : null, { q: find.trim() });
  const start = useMutation(async () => {
    const r = await api.post<{ room: string }>('/umeet/instant', { title: title.trim() || 'U meet', minutes: 60, attendeeUserIds: picked.map((p) => p.userId) });
    router.push(r.room); return true;
  });
  return (
    <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); start.run(); }} data-form="umeet-instant">
      {start.error && <Alert tone="danger">{start.error}</Alert>}
      <TextInput label="Meeting name" placeholder="e.g. Quick call about the Pune order" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextInput label="Invite people (optional)" placeholder="Type a name" value={find} onChange={(e) => setFind(e.target.value)} />
      {find.trim().length >= 2 && (
        <ul className="cz-umeet-pick" aria-label="People">
          {(contacts.data ?? []).filter((c) => !picked.some((p) => p.userId === c.userId)).slice(0, 6).map((c) => (
            <li key={c.userId}><button type="button" onClick={() => { setPicked([...picked, c]); setFind(''); }}><strong>{c.name}</strong> · {c.org}</button></li>
          ))}
          {contacts.data && !contacts.data.length && <li className="cz-muted">No one found. You can invite colleagues and members of verified businesses.</li>}
        </ul>
      )}
      {picked.length > 0 && <div className="cz-chips">{picked.map((p) => <button key={p.userId} type="button" className="cz-chip" onClick={() => setPicked(picked.filter((x) => x.userId !== p.userId))} aria-label={`Remove ${p.name}`}>{p.name} ×</button>)}</div>}
      <div><Button type="submit" variant="accent" size="lg" loading={start.pending}>Start meeting now</Button></div>
    </form>
  );
}
