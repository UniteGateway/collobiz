'use client';
import { useState } from 'react';
import { Alert, Button, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { StarInput, Stars, fmtDate } from '@/components/Growth';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Review { id: string; reviewer: string; quality: number; timeliness: number; communication: number; comment: string; status: string; response: string | null; createdAt: string }
interface Appeal { id: string; reviewId: string; reason: string; status: string; decisionReason: string | null; createdAt: string }
interface Reviewable { project_id: string; code: string; title: string; org_id: string; org: string }
const STATUS: Record<string, [string, string]> = { published: ['Counted', 'success'], under_appeal: ['Under appeal — not counted', 'warning'], removed: ['Removed after appeal', 'neutral'] };

/** Screen 164 — Verified performance & reviews: reviews received (reply or appeal) and reviews you can leave. */
export default function Reviews() {
  const q = useQuery<{ reviews: Review[]; appeals: Appeal[]; reviewable: Reviewable[] }>('/reputation/me');
  return (
    <Screen id="164" title="Reviews" description="Only companies that worked with you on a project with certified work can review you. You can reply publicly, or appeal a review you believe is wrong.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : (
        <div className="cz-help">
          <section aria-labelledby="recv-h">
            <h2 id="recv-h" className="cz-help-h">Reviews of your company</h2>
            {!q.data.reviews.length ? <div className="cz-card"><EmptyState icon="award" title="No reviews yet">Reviews appear after you deliver certified work with another company.</EmptyState></div> : (
              <ul className="cz-review-list">{q.data.reviews.map((r) => <ReviewItem key={r.id} r={r} appeal={q.data!.appeals.find((a) => a.reviewId === r.id)} onChange={q.reload} />)}</ul>
            )}
          </section>
          <section aria-labelledby="give-h">
            <h2 id="give-h" className="cz-help-h">Review a partner</h2>
            {!q.data.reviewable.length ? <div className="cz-card"><p className="cz-muted" style={{ margin: 0 }}>Nobody to review right now. You can review companies you worked with once their project has certified work.</p></div>
              : q.data.reviewable.map((x) => <WriteReview key={`${x.project_id}-${x.org_id}`} x={x} onDone={q.reload} />)}
          </section>
        </div>
      )}
    </Screen>
  );
}

function ReviewItem({ r, appeal, onChange }: { r: Review; appeal?: Appeal; onChange: () => void }) {
  const [mode, setMode] = useState<'reply' | 'appeal' | null>(null);
  const [text, setText] = useState('');
  const m = useMutation(async () => {
    if (mode === 'reply') await api.post(`/reviews/${r.id}/response`, { response: text });
    else await api.post('/reputation/appeals', { reviewId: r.id, reason: text });
    setMode(null); setText(''); onChange(); return true;
  });
  const avg = (r.quality + r.timeliness + r.communication) / 3;
  return (
    <li className="cz-card cz-review">
      <div className="cz-review-head"><div><strong>{r.reviewer}</strong><span className="cz-muted"> · {fmtDate(r.createdAt)}</span></div><StatusBadge status={r.status} tone={STATUS[r.status]?.[1] as never} label={STATUS[r.status]?.[0] ?? r.status} /></div>
      <div className="cz-review-scores"><span><Stars value={avg} label="Overall" /> {avg.toFixed(1)}</span><span className="cz-muted">Quality {r.quality} · Timeliness {r.timeliness} · Communication {r.communication}</span></div>
      <p>{r.comment}</p>
      {r.response && <blockquote className="cz-review-reply"><strong>Your reply</strong>{r.response}</blockquote>}
      {appeal && <p className="cz-muted" style={{ fontSize: 13 }}>Appeal {appeal.status === 'open' ? 'under review by compliance' : appeal.status === 'upheld' ? 'upheld — review removed' : `not upheld${appeal.decisionReason ? `: ${appeal.decisionReason}` : ''}`}</p>}
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {mode ? (
        <form className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <textarea className="cz-input" rows={3} aria-label={mode === 'reply' ? 'Your public reply' : 'Why this review is wrong'} placeholder={mode === 'reply' ? 'Shown under the review (at least 10 characters)' : 'Explain with evidence, e.g. site logs or correspondence (at least 20 characters). The review stops counting while compliance looks at it.'} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" size="sm" loading={m.pending} disabled={text.trim().length < (mode === 'reply' ? 10 : 20)}>{mode === 'reply' ? 'Post reply' : 'Submit appeal'}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>Cancel</Button></div>
        </form>
      ) : (
        <div className="cz-row" style={{ gap: 8 }}>
          {!r.response && r.status !== 'removed' && <Button size="sm" variant="secondary" onClick={() => setMode('reply')}>Reply</Button>}
          {r.status === 'published' && !appeal && <Button size="sm" variant="ghost" onClick={() => setMode('appeal')}>Appeal</Button>}
        </div>
      )}
    </li>
  );
}

function WriteReview({ x, onDone }: { x: Reviewable; onDone: () => void }) {
  const [v, setV] = useState({ quality: 0, timeliness: 0, communication: 0, comment: '' });
  const m = useMutation(async () => { await api.post('/reviews', { projectId: x.project_id, subjectOrgId: x.org_id, ...v }); onDone(); return true; });
  return (
    <form className="cz-card cz-stack" style={{ gap: 10, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} aria-label={`Review ${x.org}`}>
      <div><strong>{x.org}</strong><div className="cz-muted" style={{ fontSize: 13 }}>{x.code} · {x.title}</div></div>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <StarInput label="Quality of work" value={v.quality} onChange={(n) => setV({ ...v, quality: n })} />
      <StarInput label="Timeliness" value={v.timeliness} onChange={(n) => setV({ ...v, timeliness: n })} />
      <StarInput label="Communication" value={v.communication} onChange={(n) => setV({ ...v, communication: n })} />
      <textarea className="cz-input" rows={3} aria-label={`Comments about ${x.org}`} placeholder="What went well, and what could improve? (at least 20 characters)" value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} />
      <Button type="submit" loading={m.pending} disabled={!v.quality || !v.timeliness || !v.communication || v.comment.trim().length < 20}>Publish review</Button>
    </form>
  );
}
