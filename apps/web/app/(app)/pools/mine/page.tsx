'use client';
import Link from 'next/link';
import { ButtonLink, Card, DataTable, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PoolCard, dt, num, rs, type Pool } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

interface Q { pool: Pool; quote: { id: string; unitPriceRs: number; minQty: number; validUntil: string; status: string } }
export default function MyPools() {
  const q = useQuery<{ pools: Pool[]; quotes: Q[] }>('/pools/mine');
  return (
    <Screen page={{ key: 'pools-mine', title: 'My pools & quotes', access: 'partner' }} eyebrow="Demand pools" actions={<ButtonLink href="/pools/new" variant="accent">Start a pool</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : <>
        <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Pools I buy in ({q.data.pools.length})</h2>
        {q.data.pools.length ? <div className="cz-ops-grid">{q.data.pools.map((p) => <PoolCard key={p.id} p={p} />)}</div> : <p className="cz-muted">You have not joined a pool yet.</p>}
        <Card title={`Quotes I gave as a supplier (${q.data.quotes.length})`} className="cz-mt">
          <DataTable rows={q.data.quotes.map((x) => ({ ...x, id: x.quote.id }))} caption="My quotes" empty={<p className="cz-muted">No quotes yet.</p>} columns={[
            { key: 'p', header: 'Pool', render: (x) => <Link href={`/pools/${x.pool.id}`}>{x.pool.title}</Link> },
            { key: 'c', header: 'Committed', render: (x) => `${num(x.pool.committed)} ${x.pool.unit}` },
            { key: 'r', header: 'My price', render: (x) => `${rs(x.quote.unitPriceRs)} / ${x.pool.unit}` },
            { key: 'm', header: 'From', render: (x) => `${num(x.quote.minQty)} ${x.pool.unit}` },
            { key: 'v', header: 'Valid until', render: (x) => dt(x.quote.validUntil) },
          ]} />
        </Card>
      </>}
    </Screen>
  );
}
