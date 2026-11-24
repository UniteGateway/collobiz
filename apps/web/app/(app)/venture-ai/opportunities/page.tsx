'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { VAI_OPP_TYPES } from '@collabiz/types';
import { Card, EmptyState, Segmented, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { OppList, VaiHeader, VaiNav, type VaiDash } from '@/components/VentureAi';
import { useQuery } from '@/lib/hooks';

/** Opportunity marketplace: approved opportunities plus my own proposals, filtered by product type. */
export default function VaiOpportunities() { return <Suspense><Inner /></Suspense>; }
function Inner() {
  const sp = useSearchParams();
  const q = useQuery<VaiDash>('/venture-ai/dashboard');
  const [type, setType] = useState('all');
  const [who, setWho] = useState(sp.get('mine') ? 'mine' : 'all');
  const rows = (q.data?.opportunities ?? []).filter((o) => (type === 'all' || o.type === type) && (who === 'all' || o.mine));
  return (
    <Screen page={{ key: 'venture-ai-opportunities', title: 'Venture AI opportunities', access: 'partner' }} header={false}>
      <VaiHeader title="Opportunities" lead="Approved business opportunities looking for members, and your own proposals. Sample items are Unite demonstrations, not live demand." />
      <VaiNav />
      <div className="cz-row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <Segmented label="Product type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...Object.entries(VAI_OPP_TYPES).map(([value, label]) => ({ value, label }))]} />
        <Segmented label="Whose" value={who} onChange={setWho} options={[{ value: 'all', label: 'All' }, { value: 'mine', label: 'My proposals' }]} />
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : (
        <Card>{rows.length ? <OppList rows={rows} /> : <EmptyState icon="target" title="Nothing here yet">Try another filter, or propose a product.</EmptyState>}</Card>
      )}
    </Screen>
  );
}
