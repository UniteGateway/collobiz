'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { POST_TOPICS, POST_TOPIC_LABELS, sectorName } from '@collabiz/types';
import { Alert, Button, Dialog, EmptyState, Icon, Segmented, Select, Skeleton, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/live';

interface Member { userId: string; name: string; org: string; city: string | null; verified: boolean; sectors: string[]; unite: boolean }
interface Post { id: string; body: string; topic: string; topicLabel: string; likes: number; comments: number; liked: boolean; author: string; authorUserId: string; org: string; mine: boolean; createdAt: string }
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const ago = (d: string) => { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

/** Community — who is online now, a wall to share thoughts and opportunities, and private messages through Chat. */
export default function Community() {
  const { me } = useSession();
  const online = useQuery<{ visible: boolean; members: Member[] }>('/community/online');
  const [topic, setTopic] = useState('');
  const wall = useQuery<Post[]>('/community/posts', { topic: topic || undefined });
  const [draft, setDraft] = useState({ body: '', topic: 'general' });
  useLive((e) => { if (e.type === 'presence') online.reload(); if (e.type === 'notification' && e.data.link === '/community') wall.reload(); });
  const [to, setTo] = useState<Member | null>(null);
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  const share = useMutation(async () => { await api.post('/community/posts', draft); setDraft({ body: '', topic: draft.topic }); wall.reload(); });
  const like = useMutation(async (p: Post) => { await api.post(`/community/posts/${p.id}/like`); wall.reload(); });
  const hide = useMutation(async () => { await api.post('/community/presence', { visible: !online.data?.visible }); online.reload(); });
  return (
    <Screen page={{ key: 'community', title: 'Community', access: 'partner' }} description="Meet the members who are online, share thoughts and opportunities, and message each other privately.">
      <div className="cz-comm">
        <aside className="cz-card cz-comm-online" aria-labelledby="online-h">
          <div className="cz-card-head"><h2 id="online-h"><span className="cz-live-dot" aria-hidden /> Online now</h2><span className="cz-muted" style={{ fontSize: 13 }}>{online.data?.members.length ?? 0}</span></div>
          {online.error ? <ApiErrorView error={online.error} onRetry={online.reload} /> : !online.data ? <Skeleton height={200} /> : !online.data.members.length ? <p className="cz-muted" style={{ fontSize: 13.5 }}>No other members are online right now.</p> : (
            <ul className="cz-people">{online.data.members.map((m) => (
              <li key={m.userId}>
                <span className="cz-person-av" aria-hidden>{initials(m.name)}<i /></span>
                <span className="cz-person-txt"><strong>{m.name}{m.unite ? ' · Unite' : ''}</strong><span className="cz-muted">{m.org}{m.city ? `, ${m.city}` : ''}</span>{m.sectors.length > 0 && <span className="cz-muted" style={{ fontSize: 12 }}>{m.sectors.map(sectorName).join(' · ')}</span>}</span>
                <Button size="sm" variant="secondary" onClick={() => setTo(m)} disabled={!verified} aria-label={`Message ${m.name}`}>Message</Button>
              </li>
            ))}</ul>
          )}
          <button type="button" className="cz-link-btn" onClick={() => hide.run()}>{online.data?.visible === false ? 'Show me as online' : 'Hide that I’m online'}</button>
        </aside>
        <div className="cz-stack" style={{ gap: 14 }}>
          <section className="cz-card" aria-label="Share with the community">
            {verified ? (
              <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); share.run(); }}>
                <TextArea label="Share a thought, question or opportunity" rows={3} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} error={share.fieldErrors.body} />
                <div className="cz-row" style={{ gap: 10, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 200 }}><Select label="Topic" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} options={POST_TOPICS.map((t) => ({ value: t, label: POST_TOPIC_LABELS[t] }))} /></div>
                  <Button type="submit" loading={share.pending} disabled={draft.body.trim().length < 3}>Post</Button>
                </div>
                {share.error && <Alert tone="danger">{share.error}</Alert>}
              </form>
            ) : <Alert tone="info">Posting opens once your organisation is verified. You can read and like posts now.</Alert>}
          </section>
          <div className="cz-scroll-x"><Segmented label="Filter posts by topic" value={topic} onChange={setTopic} options={[{ value: '', label: 'Everything' }, ...POST_TOPICS.map((t) => ({ value: t, label: POST_TOPIC_LABELS[t] }))]} /></div>
          {wall.error ? <ApiErrorView error={wall.error} onRetry={wall.reload} /> : !wall.data ? <Skeleton height={300} /> : !wall.data.length ? <div className="cz-card"><EmptyState icon="messages" title="No posts yet">Be the first to share something with the network.</EmptyState></div>
            : wall.data.map((p) => <PostCard key={p.id} p={p} onLike={() => like.run(p)} onChange={wall.reload} />)}
        </div>
      </div>
      <MessageDialog to={to} onClose={() => setTo(null)} />
    </Screen>
  );
}

function PostCard({ p, onLike, onChange }: { p: Post; onLike: () => void; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const c = useQuery<{ id: string; body: string; author: string; createdAt: string }[]>(open ? `/community/posts/${p.id}/comments` : null);
  const send = useMutation(async () => { await api.post(`/community/posts/${p.id}/comments`, { body: text }); setText(''); c.reload(); onChange(); });
  const report = useMutation(async () => { const reason = window.prompt('Why are you reporting this post?'); if (reason) { await api.post(`/community/posts/${p.id}/report`, { reason }); window.alert('Thanks — a moderator will review it.'); } });
  const remove = useMutation(async () => { if (window.confirm('Remove your post?')) { await api.post(`/community/posts/${p.id}/remove`, { reason: 'Removed by the author' }); onChange(); } });
  return (
    <article className="cz-card cz-post" aria-label={`Post by ${p.author}`}>
      <header><span className="cz-person-av" aria-hidden>{initials(p.author)}</span><span><strong>{p.author}</strong><span className="cz-muted"> · {p.org} · {ago(p.createdAt)}</span><br /><span className="cz-tag">{p.topicLabel}</span></span></header>
      <p className="cz-post-body">{p.body}</p>
      <footer>
        <button type="button" className="cz-post-act" aria-pressed={p.liked} onClick={onLike}><Icon name="award" size={16} />{p.likes} {p.likes === 1 ? 'like' : 'likes'}</button>
        <button type="button" className="cz-post-act" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="messages" size={16} />{p.comments} {p.comments === 1 ? 'comment' : 'comments'}</button>
        <span style={{ flex: 1 }} />
        {p.mine ? <button type="button" className="cz-post-act" onClick={() => remove.run()}>Remove</button> : <button type="button" className="cz-post-act" onClick={() => report.run()}>Report</button>}
      </footer>
      {open && (
        <div className="cz-comments">
          {(c.data ?? []).map((x) => <p key={x.id}><strong>{x.author}</strong> {x.body} <span className="cz-muted">· {ago(x.createdAt)}</span></p>)}
          <form className="cz-row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); send.run(); }}>
            <input className="cz-input" style={{ flex: 1 }} aria-label="Write a comment" placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" size="sm" disabled={!text.trim()} loading={send.pending}>Reply</Button>
          </form>
        </div>
      )}
    </article>
  );
}

function MessageDialog({ to, onClose }: { to: Member | null; onClose: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const send = useMutation(async () => { const r = await api.post<{ threadId: string }>('/chat/direct', { recipientUserId: to!.userId, body }); setBody(''); onClose(); router.push(`/chat/${r.threadId}`); });
  return (
    <Dialog open={!!to} onClose={onClose} title={to ? `Message ${to.name}` : 'Message'}>
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); send.run(); }}>
        <TextArea label="Your message" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>Messages are private between you and {to?.name.split(' ')[0]}, and encrypted at rest.</p>
        {send.error && <Alert tone="danger">{send.error}</Alert>}
        <Button type="submit" loading={send.pending} disabled={!body.trim()}>Send and open chat</Button>
      </form>
    </Dialog>
  );
}
