'use client';
import { useState } from 'react';
import { MICRO_KINDS } from '@collabiz/types';
import { ButtonLink, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { DemoTag, OpsCard, dt, num, rs, type Micro } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

/** Micro-contracts — small, fixed-price work packages. */
export default function MicroOpen() {
  const [kind, setKind] = useState('');
  const q = useQuery<Micro[]>('/micro', { kind: kind || undefined });
  return (
    <Screen page={{ key: 'micro', title: 'Micro-contracts', access: 'partner' }} eyebrow="Deliver"
      description="Small, fixed-price work packages — calls, surveys, quotations, demos, designs. Every accepted and paid one becomes verified work history in your Proof passport."
      actions={<><ButtonLink href="/micro/new" variant="accent">Post work</ButtonLink><ButtonLink href="/micro/mine" variant="secondary">My micro-contracts</ButtonLink></>}>
      <div className="cz-chips" role="group" aria-label="Type of work" style={{ marginBottom: 14 }}>
        {[['', 'All'], ...MICRO_KINDS.map((k) => [k.code, k.label])].map(([v, l]) => <button key={v} type="button" className={`cz-chip${kind === v ? ' cz-chip-on' : ''}`} aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={260} /> : !q.data.length ? <EmptyState title="No open work of this type">Post a job, or check back soon.</EmptyState> : (
        <div className="cz-ops-grid">{q.data.map((m) => (
          <OpsCard key={m.id} href={`/micro/${m.id}`} testId="micro-card" eyebrow={m.kindLabel} tone="violet" badges={<><span className="cz-muted">{m.stateName}</span><DemoTag on={m.demo} /></>} title={m.title} text={m.scope}
            meta={[['Fixed price', <strong key="p" style={{ fontSize: 17 }}>{rs(m.priceRs)}</strong>], ['Quantity', `${num(m.quantity)} ${m.unit}`], ['Due', dt(m.due)], ['Posted by', m.poster ?? '—']]}
            foot={m.isPoster ? <span className="cz-muted">Your job</span> : m.applied ? <span className="cz-muted">You applied</span> : <span className="cz-link-arrow">View and apply →</span>} />
        ))}</div>
      )}
    </Screen>
  );
}
