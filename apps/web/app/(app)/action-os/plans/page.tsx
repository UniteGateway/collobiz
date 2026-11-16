'use client';
import Link from 'next/link';
import { EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface P { id: string; kind: string; periodKey: string; summary: string; counts: { open: number; critical: number; overdue: number }; trigger: string; generatedAt: string }
const KIND: Record<string, string> = { weekly: 'Weekly plan', daily: 'Daily brief', on_demand: 'On-demand plan' };

/** Action plan history. */
export default function Plans() {
  const q = useQuery<P[]>('/action-os/plans');
  return (
    <Screen page={{ key: 'action-os-plans', title: 'Action plans', access: 'partner' }} eyebrow="COLLABIZ ACTION OS" description="Every plan prepared for you, with what was in it at the time.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !q.data.length ? <EmptyState title="No plans yet">{"Your first weekly plan arrives at your scheduled time, or generate one from the action board."}</EmptyState> : (
        <ul className="cz-aos-plans">{q.data.map((p) => (
          <li key={p.id}><Link href={`/action-os/plans/${p.id}`}>
            <span className="cz-aos-plan-kind">{KIND[p.kind] ?? p.kind} · {p.periodKey.startsWith('manual-') ? new Date(p.generatedAt).toLocaleDateString('en-IN') : p.periodKey}</span>
            <strong>{p.summary}</strong>
            <span className="cz-muted">{new Date(p.generatedAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {p.trigger === 'schedule' ? 'Scheduled' : 'Requested'}</span>
          </Link></li>
        ))}</ul>
      )}
    </Screen>
  );
}
