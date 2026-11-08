'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, EmptyState, Icon, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { when } from '@/components/Comms';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Ticket { id: string; code: string; subject: string; category: string; priority: string; status: string; requester: string; firstResponseDueAt: string; firstRespondedAt: string | null; overdue: boolean; updatedAt: string; satisfaction: number | null }
interface Detail extends Ticket { staff: boolean; canEscalate: boolean; reportedExcerpt?: string; escalationReason: string | null; messages: { id: string; body: string; author: string; fromStaff: boolean; internal: boolean; createdAt: string }[] }

const CATEGORIES = [['account', 'Account & sign-in'], ['verification', 'Verification'], ['payments', 'Payments & commission'], ['technical', 'Something isn’t working'], ['abuse', 'Report misuse'], ['other', 'Something else']];
const PRIORITY: Record<string, string> = { urgent: 'Urgent · reply within 4 h', high: 'High · within 8 h', normal: 'Normal · within 24 h', low: 'Low · within 3 days' };
const STATUS: Record<string, string> = { open: 'Open', in_progress: 'In progress', escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed' };
const human = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/** Screen 112 — Support tickets with response deadlines and escalation. Requesters see their own tickets; staff see the queue. */
export default function SupportTickets() {
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('active');
  const q = useQuery<{ staff: boolean; tickets: Ticket[] }>('/support/tickets');
  useEffect(() => { const p = new URLSearchParams(window.location.search); if (p.get('id')) setSel(p.get('id')); if (p.get('new')) setCreating(true); }, []);
  const tickets = (q.data?.tickets ?? []).filter((t) => (filter === 'active' ? !['resolved', 'closed'].includes(t.status) : ['resolved', 'closed'].includes(t.status)));
  return (
    <Screen id="112" title={q.data?.staff ? 'Support queue' : 'Support'} description={q.data?.staff ? 'All partner tickets. Overdue tickets escalate automatically.' : 'Ask COLLABIZ for help. Every ticket has a response deadline; if we miss it, it escalates to a senior team.'}
      actions={!q.data?.staff && <Button variant="accent" onClick={() => { setCreating(true); setSel(null); }}><Icon name="plus" size={16} />New request</Button>}>
      {creating && <NewTicket onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setSel(id); q.reload(); }} />}
      <div className="cz-support">
        <div>
          <div style={{ marginBottom: 12 }}><Segmented label="Tickets" value={filter} onChange={setFilter} options={[{ value: 'active', label: 'Active' }, { value: 'done', label: 'Resolved' }]} /></div>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : !tickets.length ? (
            <div className="cz-card"><EmptyState icon="help" title={filter === 'active' ? 'No open requests' : 'Nothing resolved yet'}>{filter === 'active' && !q.data.staff ? 'Need help? Open a request and we’ll reply within the time shown.' : ''}</EmptyState></div>
          ) : (
            <ul className="cz-ticket-list">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" aria-current={sel === t.id || undefined} onClick={() => { setSel(t.id); setCreating(false); }} data-ticket={t.code}>
                    <span className="cz-ticket-top"><span className="cz-mono cz-muted">{t.code}</span><StatusBadge status={t.status} label={STATUS[t.status] ?? t.status} /></span>
                    <strong>{t.subject}</strong>
                    <span className="cz-muted" style={{ fontSize: 12.5 }}>{q.data!.staff ? `${t.requester} · ` : ''}{human(t.priority)} · updated {when(t.updatedAt)}</span>
                    {t.overdue && <span className="cz-ta-flag"><Icon name="warning" size={12} />Response overdue</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>{sel ? <TicketView id={sel} onChange={() => q.reload()} /> : !creating && <div className="cz-card cz-support-empty"><EmptyState icon="messages" title="Select a request">Choose a ticket to see the conversation.</EmptyState></div>}</div>
      </div>
    </Screen>
  );
}

function NewTicket({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ category: 'technical', priority: 'normal', subject: '', body: '' });
  const m = useMutation(async () => { const t = await api.post<{ id: string }>('/support/tickets', f); onDone(t.id); return t; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="cz-card cz-compose" aria-labelledby="nt-h">
      <div className="cz-card-head"><h2 id="nt-h">New support request</h2><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></Button></div>
      {m.error && <Alert tone="danger">{m.error}{Object.keys(m.fieldErrors).length ? ` — ${Object.values(m.fieldErrors).join('; ')}` : ''}</Alert>}
      <form className="cz-sched" onSubmit={(e) => { e.preventDefault(); m.run(); }}>
        <label>Topic<select className="cz-select" value={f.category} onChange={set('category')}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>How urgent?<select className="cz-select" value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="cz-sched-wide">Subject<input className="cz-input" value={f.subject} onChange={set('subject')} placeholder="e.g. Payout not received" /></label>
        <label className="cz-sched-wide">Describe the problem<textarea className="cz-input" rows={5} value={f.body} onChange={set('body')} placeholder="What happened, what you expected, and any reference numbers (at least 10 characters)" /></label>
        <div className="cz-row cz-sched-wide" style={{ gap: 8 }}><Button type="submit" variant="accent" loading={m.pending} disabled={f.subject.trim().length < 5 || f.body.trim().length < 10}>Send request</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </section>
  );
}

function TicketView({ id, onChange }: { id: string; onChange: () => void }) {
  const q = useQuery<Detail>(`/support/tickets/${id}`);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const refresh = async () => { await q.reload(); onChange(); };
  const send = useMutation(async () => { await api.post(`/support/tickets/${id}/messages`, { body: reply, internal }); setReply(''); await refresh(); return true; });
  const status = useMutation(async (s: string) => { await api.post(`/support/tickets/${id}/status`, { status: s }); await refresh(); return true; });
  const escalate = useMutation(async () => { const reason = window.prompt('Why does this need escalating? (at least 10 characters)'); if (!reason) return false; await api.post(`/support/tickets/${id}/escalate`, { reason }); await refresh(); return true; });
  const rate = useMutation(async (n: number) => { await api.post(`/support/tickets/${id}/rating`, { satisfaction: n }); await refresh(); return true; });
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  const t = q.data;
  if (!t) return <Skeleton height={300} />;
  const due = new Date(t.firstResponseDueAt);
  const err = send.error ?? status.error ?? escalate.error ?? rate.error;
  return (
    <section className="cz-card cz-ticket" aria-labelledby="tk-h">
      <div className="cz-ticket-head">
        <div><span className="cz-mono cz-muted">{t.code} · {CATEGORIES.find(([v]) => v === t.category)?.[1]}</span><h2 id="tk-h">{t.subject}</h2></div>
        <StatusBadge status={t.status} label={STATUS[t.status] ?? t.status} />
      </div>
      <p className="cz-ticket-sla">
        <Icon name="clock" size={14} />
        {t.firstRespondedAt ? `First reply ${when(t.firstRespondedAt)}` : t.status === 'escalated' ? `Escalated to a senior team${t.escalationReason ? ` — ${t.escalationReason}` : ''}` : due < new Date() ? `Reply was due ${when(due.toISOString())}` : `Reply due by ${due.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}
      </p>
      {err && <Alert tone="danger">{err}</Alert>}
      {t.reportedExcerpt && <Alert tone="warning" title="Reported message">“{t.reportedExcerpt}”</Alert>}
      <ol className="cz-ticket-thread">
        {t.messages.map((m) => (
          <li key={m.id} data-staff={m.fromStaff || undefined} data-internal={m.internal || undefined}>
            <span className="cz-ticket-who"><strong>{m.author}</strong>{m.internal && <span className="cz-tag">Internal note</span>}<time className="cz-muted" dateTime={m.createdAt}>{when(m.createdAt)}</time></span>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      {t.status !== 'closed' && (
        <form className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); send.run(); }}>
          <textarea className="cz-input" rows={3} aria-label="Reply" placeholder={t.staff ? 'Reply to the partner' : t.status === 'resolved' ? 'Reply to re-open this request' : 'Add a reply'} value={reply} onChange={(e) => setReply(e.target.value)} />
          <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button type="submit" loading={send.pending} disabled={reply.trim().length < 2}>{internal ? 'Add note' : 'Send reply'}</Button>
            {t.staff && <label className="cz-row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note (not shown to the partner)</label>}
            <span style={{ flex: 1 }} />
            {t.canEscalate && <Button type="button" variant="secondary" onClick={() => escalate.run()}><Icon name="warning" size={14} />Escalate</Button>}
            {t.staff && ['open', 'in_progress', 'escalated'].includes(t.status) && <Button type="button" variant="secondary" onClick={() => status.run('resolved')}>Mark resolved</Button>}
            {!t.staff && t.status === 'resolved' && <Button type="button" variant="secondary" onClick={() => status.run('closed')}>Close request</Button>}
          </div>
        </form>
      )}
      {!t.staff && ['resolved', 'closed'].includes(t.status) && (
        <div className="cz-rate">
          <span>{t.satisfaction ? 'Thanks for rating this request' : 'How did we do?'}</span>
          <div role="radiogroup" aria-label="Rate this request">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={t.satisfaction === n} aria-label={`${n} of 5`} data-on={(t.satisfaction ?? 0) >= n || undefined} onClick={() => rate.run(n)}>★</button>)}</div>
        </div>
      )}
    </section>
  );
}
