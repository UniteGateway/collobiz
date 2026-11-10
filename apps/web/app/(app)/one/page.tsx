'use client';
import Link from 'next/link';
import { Card, EmptyState, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

const rupees = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);

/** Screen 179 — COLLABIZ ONE: every opportunity you are turning into a business, and the step each one is at. */
export default function OneList() {
  const q = useQuery<{ id: string; code: string; title: string; value: number | null; done: number; current: string }[]>('/one');
  return (
    <Screen page={{ key: 'one', title: 'COLLABIZ ONE', access: 'partner' }} description="One opportunity. One team. One business. Bring an opportunity, and COLLABIZ helps you assemble the team that can win and deliver it — with Unite Group’s first review, agreed terms and verified payments.">
      <section className="cz-ws-hero" style={{ marginBottom: 4 }} aria-hidden="true">
        <div className="cz-ws-hero-text"><p className="cz-ws-eyebrow">COLLABIZ ONE</p><h2 style={{ color: '#fff', margin: '6px 0' }}>Bring → Analyse → Unite review → Assemble → Agree → Deliver</h2><p>Your “virtual company” is a shared workspace among named partners. Forming a legal JV or company is a separate legal step.</p></div>
      </section>
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="opportunities" title="No opportunities in progress">Register a lead or post an opportunity, then build its team here.</EmptyState> : (
        <ul className="cz-ws-list">{q.data.map((o) => (
          <li key={o.id} data-one={o.code}><span><Link href={`/one/${o.id}`}><strong>{o.code} — {o.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{rupees(o.value)} · next: {o.current}</span></span>
            <span className="cz-auth-meter" data-score={Math.min(4, Math.ceil((o.done / 6) * 4))} style={{ width: 120, margin: 0 }} role="img" aria-label={`${o.done} of 6 steps done`}><span /><span /><span /><span /></span></li>
        ))}</ul>
      )}</Card>
    </Screen>
  );
}
