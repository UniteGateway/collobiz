'use client';
import Link from 'next/link';
import { ButtonLink, DataTable, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { dt } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

interface Plan { id: string; code: string; modelTitle: string; stage: number; stageLabel: string; applications: number; createdAt: string }

export default function LaunchPlans() {
  const q = useQuery<Plan[]>('/launch/plans');
  return (
    <Screen page={{ key: 'launch-plans', title: 'My launch plans', access: 'partner' }} eyebrow="Launch"
      description="Each plan tracks real progress — applications, agreements, signatures, execution and first payment — from records on COLLABIZ." actions={<ButtonLink href="/launch" variant="accent">Start a new plan</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : (
        <DataTable rows={q.data} caption="Launch plans" empty={<EmptyState title="No launch plans yet">Tell us what you have and pick a business model.</EmptyState>} columns={[
          { key: 'm', header: 'Business model', render: (p) => <Link href={`/launch/plans/${p.id}`}>{p.modelTitle}</Link> },
          { key: 'c', header: 'Plan', render: (p) => p.code },
          { key: 's', header: 'Stage', render: (p) => <StatusBadge status={p.stage >= 5 ? 'completed' : p.stage ? 'in_progress' : 'draft'} label={p.stageLabel} /> },
          { key: 'a', header: 'Applications', render: (p) => p.applications },
          { key: 'd', header: 'Started', render: (p) => dt(p.createdAt) },
        ]} />
      )}
    </Screen>
  );
}
