'use client';
/** Stage 13 shared pieces: conversation view (106/107), time formatting and notification kinds. */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, EmptyState, Icon, Skeleton, type IconName } from '@collabiz/ui';
import { ApiErrorView } from './Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

export const KIND_META: Record<string, { label: string; icon: IconName }> = {
  message: { label: 'Messages', icon: 'messages' }, meeting: { label: 'Meetings', icon: 'calendar' }, project: { label: 'Projects', icon: 'projects' },
  tender: { label: 'Tenders', icon: 'tenders' }, contract: { label: 'Contracts', icon: 'contracts' }, commission: { label: 'Commission', icon: 'earnings' },
  trade: { label: 'Trading', icon: 'trading' }, team: { label: 'Teams', icon: 'teams' }, opportunity: { label: 'Opportunities', icon: 'opportunities' },
  lead: { label: 'Leads', icon: 'leads' }, announcement: { label: 'Announcements', icon: 'bell' }, support: { label: 'Support', icon: 'help' }, security: { label: 'Security', icon: 'lock' },
};

export function when(d: string | Date) {
  const t = new Date(d);
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const sameDay = new Date().toDateString() === t.toDateString();
  if (sameDay) return t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const days = Math.round(mins / 1440);
  if (days < 7) return t.toLocaleDateString('en-IN', { weekday: 'short' });
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export const initials = (name: string) => name.replace(/\(.*\)/, '').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

interface Msg { id: string; author: string; org: string; mine: boolean; createdAt: string; body: string | null; state: 'visible' | 'deleted' | 'purged'; canDelete: boolean }
interface Thread { id: string; kind: 'direct' | 'project'; subject: string | null; projectId: string | null; retentionDays: number; legalHold: boolean; members: { userId: string; name: string; org: string }[]; messages: Msg[] }

const dayLabel = (d: string) => {
  const t = new Date(d); const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  return t.toDateString() === today.toDateString() ? 'Today' : t.toDateString() === y.toDateString() ? 'Yesterday' : t.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** Conversation view for one thread. Polls every 8 s while open. */
export function ChatThread({ id, me }: { id: string; me?: { id: string } | null }) {
  const q = useQuery<Thread>(`/chat/threads/${id}`);
  const [text, setText] = useState('');
  const [reporting, setReporting] = useState<Msg | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(() => q.reload(), 8000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [q.data?.messages.length]);
  const send = useMutation(async () => { const body = text.trim(); if (!body) return false; await api.post(`/chat/threads/${id}/messages`, { body }); setText(''); await q.reload(); return true; });
  const unsend = useMutation(async (m: Msg) => { await api.post(`/chat/messages/${m.id}/delete`); await q.reload(); return true; });
  const report = useMutation(async () => { await api.post(`/chat/messages/${reporting!.id}/report`, { reason }); setReporting(null); setReason(''); setNotice('Reported. Only that message is shared with COLLABIZ support, who will follow up.'); return true; });
  const other = q.data?.kind === 'direct' ? q.data.members.find((m) => m.userId !== me?.id) : null;
  const block = useMutation(async () => { if (!other || !window.confirm(`Block ${other.name}? Neither of you will be able to send direct messages.`)) return false; await api.post(`/chat/blocks/${other.userId}`); setNotice(`${other.name} is blocked. You can unblock them from this conversation.`); return true; });
  const mute = useMutation(async () => { await api.post(`/chat/threads/${id}/mute`); setNotice('Notifications for this conversation are muted.'); return true; });

  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  const t = q.data;
  let lastDay = '';
  return (
    <div className="cz-chat">
      <header className="cz-chat-head">
        <Link href="/inbox" className="cz-chat-back" aria-label="Back to inbox"><Icon name="prev" size={18} /></Link>
        {t ? (
          <>
            <span className={`cz-avatar${t.kind === 'project' ? ' cz-avatar-sq' : ''}`} aria-hidden>{t.kind === 'project' ? <Icon name="projects" size={16} /> : initials(other?.name ?? '?')}</span>
            <div className="cz-chat-title">
              <h1>{t.kind === 'project' ? t.subject : other ? other.name : 'Conversation'}</h1>
              <p>{t.kind === 'project' ? `${t.members.length} people across ${new Set(t.members.map((m) => m.org)).size} companies` : other?.org}{t.subject && t.kind === 'direct' ? ` · ${t.subject}` : ''}</p>
            </div>
            <div className="cz-chat-tools">
              {t.kind === 'project' && t.projectId && <Link className="cz-btn cz-btn-ghost cz-btn-sm" href={`/projects/${t.projectId}`}><Icon name="projects" size={15} />Project</Link>}
              <Link className="cz-btn cz-btn-ghost cz-btn-sm" href="/meetings?new=1"><Icon name="calendar" size={15} />Meet</Link>
              <Button size="sm" variant="ghost" onClick={() => mute.run()} aria-label="Mute notifications"><Icon name="bell" size={15} /></Button>
              {other && <Button size="sm" variant="ghost" onClick={() => block.run()} aria-label={`Block ${other.name}`}><Icon name="cross" size={15} /></Button>}
            </div>
          </>
        ) : <Skeleton height={40} width={260} />}
      </header>
      {notice && <div className="cz-chat-notice" role="status"><Icon name="info" size={15} />{notice}</div>}
      {(send.error || unsend.error || block.error) && <Alert tone="danger">{send.error ?? unsend.error ?? block.error}</Alert>}
      <div className="cz-chat-body" aria-live="polite" aria-label="Messages">
        {!t ? [0, 1, 2].map((i) => <Skeleton key={i} height={44} width={`${50 + i * 10}%`} style={{ marginBottom: 12 }} />) : !t.messages.length ? (
          <EmptyState icon="messages" title="No messages yet">Say hello. Messages are encrypted and visible only to the people in this conversation.</EmptyState>
        ) : t.messages.map((m) => {
          const day = dayLabel(m.createdAt);
          const sep = day !== lastDay ? (lastDay = day) : null;
          return (
            <div key={m.id}>
              {sep && <div className="cz-chat-day"><span>{sep}</span></div>}
              <div className={`cz-bubble-row${m.mine ? ' cz-mine' : ''}`} data-message={m.id}>
                {!m.mine && t.kind === 'project' && <span className="cz-avatar cz-avatar-xs" aria-hidden>{initials(m.author)}</span>}
                <div className="cz-bubble-wrap">
                  {!m.mine && t.kind === 'project' && <span className="cz-bubble-author">{m.author} · {m.org}</span>}
                  <div className={`cz-bubble${m.state !== 'visible' ? ' cz-bubble-gone' : ''}`}>
                    {m.state === 'visible' ? m.body : m.state === 'deleted' ? 'Message deleted' : 'Removed under the retention policy'}
                  </div>
                  <span className="cz-bubble-meta">
                    <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time>
                    {m.canDelete && <button type="button" onClick={() => unsend.run(m)}>Unsend</button>}
                    {!m.mine && m.state === 'visible' && <button type="button" onClick={() => setReporting(m)}>Report</button>}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {reporting && (
        <div className="cz-chat-report" role="dialog" aria-label="Report message">
          <strong>Report this message to COLLABIZ support?</strong>
          <p className="cz-muted">Only this message is shared — not the rest of the conversation.</p>
          {report.error && <Alert tone="danger">{report.error}</Alert>}
          <textarea className="cz-input" rows={2} placeholder="What’s wrong with it? (at least 10 characters)" aria-label="Reason for report" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="cz-row" style={{ gap: 8 }}><Button size="sm" variant="danger" onClick={() => report.run()} loading={report.pending} disabled={reason.trim().length < 10}>Report</Button><Button size="sm" variant="ghost" onClick={() => setReporting(null)}>Cancel</Button></div>
        </div>
      )}
      <form className="cz-composer" onSubmit={(e) => { e.preventDefault(); send.run(); }}>
        <textarea aria-label="Message" placeholder={t?.kind === 'project' ? 'Message the project team' : 'Message'} rows={1} value={text} maxLength={4000}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.run(); } }} />
        <Button type="submit" variant="primary" size="sm" loading={send.pending} disabled={!text.trim()} aria-label="Send"><Icon name="arrow" size={16} /></Button>
      </form>
      {t && <p className="cz-chat-foot"><Icon name="lock" size={12} />Encrypted at rest · kept {Math.round(t.retentionDays / 365)} years{t.legalHold ? ' · on legal hold' : ''} · you can unsend within 15 minutes</p>}
    </div>
  );
}
