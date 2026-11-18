'use client';
import { ButtonLink, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PoolCard, type Pool } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

/** Demand pools — combine requirements with other buyers to reach a bulk price. */
export default function Pools() {
  const q = useQuery<Pool[]>('/pools');
  return (
    <Screen page={{ key: 'pools', title: 'Demand pools', access: 'partner' }} eyebrow="Trade"
      description="Combine your requirement with other buyers to reach a bulk price. Suppliers see the combined quantity, never who the buyers are — and every buyer signs and pays under its own contract."
      actions={<><ButtonLink href="/pools/new" variant="accent">Start a pool</ButtonLink><ButtonLink href="/pools/mine" variant="secondary">My pools & quotes</ButtonLink></>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={260} /> : !q.data.length ? <EmptyState title="No open pools">Start one for something you buy regularly.</EmptyState>
        : <div className="cz-ops-grid">{q.data.map((p) => <PoolCard key={p.id} p={p} />)}</div>}
    </Screen>
  );
}
