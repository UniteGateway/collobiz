'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { CE_CATEGORIES, CE_TYPES } from '@collabiz/types';
import { EmptyState, SearchInput, Segmented, Select, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, OppCard, type CeCard } from '@/components/Comearn';
import { useQuery } from '@/lib/hooks';

export default function ComearnExplore() { return <Suspense><Inner /></Suspense>; }

/** Opportunity marketplace — live commission offers from verified businesses. */
function Inner() {
  const sp = useSearchParams();
  const [category, setCategory] = useState(sp.get('category') ?? 'all');
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const q = useQuery<{ items: CeCard[] }>('/comearn/opportunities', { category, type: type || undefined, q: text || undefined });
  return (
    <Screen page={{ key: 'comearn-explore', title: 'Explore earning opportunities', access: 'partner' }} header={false}>
      <CeHeader title="Earn commissions" lead="Live earning opportunities from verified COLLABIZ businesses. Commission is earned only when the company verifies the business — potential amounts are estimates." />
      <CeNav />
      <Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All' }, ...Object.entries(CE_CATEGORIES).map(([value, label]) => ({ value, label }))]} />
      <div className="ce-filters">
        <SearchInput label="Search opportunities" value={text} onChange={(e) => setText(e.target.value)} />
        <Select label="Opportunity type" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: 'All types' }, ...Object.entries(CE_TYPES).map(([value, t]) => ({ value, label: t.label }))]} />
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : q.data.items.length ? (
        <div className="ce-grid">{q.data.items.map((o) => <OppCard key={o.id} o={o} />)}</div>
      ) : <EmptyState icon="search" title="No opportunities here yet">Try another category, or post a customer requirement later in COMEARN.</EmptyState>}
    </Screen>
  );
}
