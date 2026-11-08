'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Icon, SearchInput, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Article { id: string; title: string; body: string }
interface Closure { canClose: boolean; blockers: string[]; pendingRequest: boolean }
const AREAS = [['overall', 'Overall'], ['marketplace', 'Opportunities'], ['leads', 'Leads'], ['projects', 'Projects'], ['payments', 'Payments'], ['mobile', 'Mobile app'], ['support', 'Support']];

/** Screen 150 — Help, feedback and account closure. */
export default function Help() {
  const { me } = useSession();
  const arts = useQuery<Article[]>('/help/articles');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = (arts.data ?? []).filter((a) => !term || `${a.title} ${a.body}`.toLowerCase().includes(term.toLowerCase()));
  return (
    <Screen id="150" title="Help & feedback" description="Answers to common questions, a way to tell us what you think, and account closure.">
      <div className="cz-help">
        <section aria-labelledby="faq-h">
          <h2 id="faq-h" className="cz-help-h">Common questions</h2>
          <SearchInput label="Search help" placeholder="Search help" value={term} onChange={(e) => setTerm(e.target.value)} />
          {arts.error ? <ApiErrorView error={arts.error} onRetry={arts.reload} /> : !arts.data ? <Skeleton height={200} /> : (
            <ul className="cz-faq">
              {list.map((a) => (
                <li key={a.id}>
                  <button type="button" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}><strong>{a.title}</strong><Icon name="next" size={16} /></button>
                  {open === a.id && <p>{a.body}</p>}
                </li>
              ))}
              {!list.length && <li className="cz-muted" style={{ padding: 16 }}>Nothing matches “{term}”. <Link href="/support/tickets?new=1">Ask support</Link>.</li>}
            </ul>
          )}
          <div className="cz-help-contact">
            <span className="cz-od-route-icon"><Icon name="messages" size={18} /></span>
            <div><strong>Still need help?</strong><p className="cz-muted">Open a support request. We reply within 4 hours for urgent issues and 24 hours otherwise.</p></div>
            <Link href="/support/tickets?new=1" className="cz-btn cz-btn-secondary">Contact support</Link>
          </div>
        </section>
        <div className="cz-stack" style={{ gap: 20 }}>
          <Feedback />
          {me && <CloseAccount email={me.email} />}
        </div>
      </div>
    </Screen>
  );
}

function Feedback() {
  const [rating, setRating] = useState(0);
  const [area, setArea] = useState('overall');
  const [comment, setComment] = useState('');
  const m = useMutation(async () => { await api.post('/feedback', { rating, area, comment: comment || undefined }); return true; });
  return (
    <section className="cz-card" aria-labelledby="fb-h">
      <h2 id="fb-h" className="cz-help-h" style={{ marginTop: 0 }}>Tell us what you think</h2>
      {m.data ? <Alert tone="success">Thank you — your feedback goes straight to the product team.</Alert> : (
        <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <div className="cz-rate" style={{ border: 0, padding: 0 }}><span>Your rating</span><div role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} data-on={rating >= n || undefined} onClick={() => setRating(n)}>★</button>)}</div></div>
          <label className="cz-sched-label">About<select className="cz-select" value={area} onChange={(e) => setArea(e.target.value)}>{AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="cz-sched-label">Comments (optional)<textarea className="cz-input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} /></label>
          <Button type="submit" loading={m.pending} disabled={!rating}>Send feedback</Button>
        </form>
      )}
    </section>
  );
}

function CloseAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const check = useQuery<Closure>(open ? '/account/closure-check' : null);
  const [f, setF] = useState({ reason: '', confirmEmail: '', confirm: false });
  const m = useMutation(async () => api.post<{ effectiveAfter: string }>('/account/closure', f));
  return (
    <section className="cz-card cz-danger-zone" aria-labelledby="close-h">
      <h2 id="close-h" className="cz-help-h" style={{ marginTop: 0 }}>Close your account</h2>
      <p className="cz-muted" style={{ fontSize: 13.5 }}>Closing takes effect after 30 days, during which you can sign in to cancel. Contracts, invoices and the commission ledger are kept for their legal retention periods.</p>
      {!open ? <Button variant="ghost" onClick={() => setOpen(true)}>Check whether I can close my account</Button>
        : m.data ? <Alert tone="success" title="Closure requested.">Your account closes on {new Date(m.data.effectiveAfter).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. We’ve emailed you a confirmation.</Alert>
        : check.error ? <ApiErrorView error={check.error} onRetry={check.reload} />
        : !check.data ? <Skeleton height={60} />
        : check.data.pendingRequest ? <Alert tone="info">A closure request is already in progress.</Alert>
        : !check.data.canClose ? (
          <Alert tone="warning" title="Not yet — a few things need handing over first.">
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{check.data.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          </Alert>
        ) : (
          <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); m.run(); }}>
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <label className="cz-sched-label">Why are you leaving?<textarea className="cz-input" rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
            <label className="cz-sched-label">Type your email ({email}) to confirm<input className="cz-input" value={f.confirmEmail} onChange={(e) => setF({ ...f, confirmEmail: e.target.value })} autoComplete="off" /></label>
            <label className="cz-row" style={{ gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.checked })} />I understand closure can’t be undone after 30 days</label>
            <Button type="submit" variant="danger" loading={m.pending} disabled={!f.confirm || f.reason.trim().length < 5 || f.confirmEmail.toLowerCase() !== email.toLowerCase()}>Request closure</Button>
          </form>
        )}
    </section>
  );
}
