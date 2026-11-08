'use client';
import { useState } from 'react';
import { Alert, Button, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Appeal { id: string; subject: string; reason: string; status: string; decisionReason: string | null; createdAt: string; review: { quality: number; timeliness: number; communication: number; comment: string } }

/** Reputation appeals (supports 164): compliance decides; a member of the reviewed company never can. */
export default function ReputationAppeals() {
  const q = useQuery<Appeal[]>('/admin/reputation/appeals');
  return (
    <Screen id="131" title="Reputation appeals" description="While an appeal is open the review does not count towards the partner’s score. Upholding removes the review; rejecting restores it.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !q.data.length ? <div className="cz-card"><EmptyState icon="verify" title="No appeals">Appeals from partners appear here.</EmptyState></div> : (
        <ul className="cz-review-list">{q.data.map((a) => <AppealItem key={a.id} a={a} onDone={q.reload} />)}</ul>
      )}
    </Screen>
  );
}

function AppealItem({ a, onDone }: { a: Appeal; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const m = useMutation(async (decision: 'upheld' | 'rejected') => { await api.post(`/admin/reputation/appeals/${a.id}/decision`, { decision, reason }); onDone(); return decision; });
  return (
    <li className="cz-card cz-review" data-appeal={a.id}>
      <div className="cz-review-head"><strong>{a.subject}</strong><StatusBadge status={a.status} tone={a.status === 'open' ? 'warning' : a.status === 'upheld' ? 'success' : 'neutral'} label={a.status === 'open' ? 'Open' : a.status === 'upheld' ? 'Upheld — review removed' : 'Rejected — review restored'} /></div>
      <div><span className="cz-muted" style={{ fontSize: 12.5 }}>Review (quality {a.review.quality}, timeliness {a.review.timeliness}, communication {a.review.communication})</span><p>“{a.review.comment}”</p></div>
      <div><span className="cz-muted" style={{ fontSize: 12.5 }}>Partner’s appeal</span><p>{a.reason}</p></div>
      {a.decisionReason && <p className="cz-muted">Decision: {a.decisionReason}</p>}
      {a.status === 'open' && (
        <div className="cz-stack" style={{ gap: 8 }}>
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <textarea className="cz-input" rows={2} aria-label="Decision reason" placeholder="Reason shared with the partner (at least 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="cz-row" style={{ gap: 8 }}><Button size="sm" onClick={() => m.run('upheld')} disabled={reason.trim().length < 10} loading={m.pending}>Uphold — remove review</Button><Button size="sm" variant="secondary" onClick={() => m.run('rejected')} disabled={reason.trim().length < 10}>Reject — restore review</Button></div>
        </div>
      )}
    </li>
  );
}
