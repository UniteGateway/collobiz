'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { CE_CATEGORIES, CE_TYPES } from '@collabiz/types';
import { EmptyState, SearchInput, Segmented, Select, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, OppCard, rupees, type CeCard } from '@/components/Comearn';
import { useQuery } from '@/lib/hooks';

export default function ComearnExplore() { return <Suspense><Inner /></Suspense>; }

/** Opportunity marketplace — live commission offers from verified businesses. */
function Inner() {
  const sp = useSearchParams();
  const [category, setCategory] = useState(sp.get('category') ?? 'all');
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [view, setView] = useState(sp.get('view') ?? 'opportunities');
  const rq = useQuery<{ canBid: boolean; items: { id: string; code: string; title: string; category: keyof typeof CE_CATEGORIES; description: string; city: string; estimatedValuePaise: number | null; closesOn: string; bids: number; myBid: { status: string } | null }[] }>(view === 'requirements' ? '/comearn/requirements' : null);
  const q = useQuery<{ items: CeCard[] }>('/comearn/opportunities', { category, type: type || undefined, q: text || undefined });
  return (
    <Screen page={{ key: 'comearn-explore', title: 'Explore earning opportunities', access: 'partner' }} header={false}>
      <CeHeader title="Earn commissions" lead="Live earning opportunities from verified COLLABIZ businesses. Commission is earned only when the company verifies the business — potential amounts are estimates." />
      <CeNav />
      <Segmented label="View" value={view} onChange={setView} options={[{ value: 'opportunities', label: 'Earning opportunities' }, { value: 'requirements', label: 'Customer requirements — offer a commission' }]} />
      {view === 'requirements' ? <Requirements q={rq} /> : <>
      <Segmented label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All' }, ...Object.entries(CE_CATEGORIES).map(([value, label]) => ({ value, label }))]} />
      <div className="ce-filters">
        <SearchInput label="Search opportunities" value={text} onChange={(e) => setText(e.target.value)} />
        <Select label="Opportunity type" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: 'All types' }, ...Object.entries(CE_TYPES).map(([value, t]) => ({ value, label: t.label }))]} />
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : q.data.items.length ? (
        <div className="ce-grid">{q.data.items.map((o) => <OppCard key={o.id} o={o} />)}</div>
      ) : <EmptyState icon="search" title="No opportunities here yet">Try another category, or post a customer requirement.</EmptyState>}
      </>}
    </Screen>
  );
}

function Requirements({ q }: { q: { data?: { canBid: boolean; items: { id: string; title: string; category: keyof typeof CE_CATEGORIES; description: string; city: string; estimatedValuePaise: number | null; closesOn: string; bids: number; myBid: { status: string } | null }[] }; error?: unknown; reload: () => void } }) {
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Skeleton height={200} />;
  return (
    <>
      <p className="ce-muted">Genuine customer needs posted by members. Offer a commission to win the introduction{q.data.canBid ? '' : ' — verified businesses only'}. Customer identity is shared only with the business the member selects.</p>
      {q.data.items.length ? <div className="ce-grid">{q.data.items.map((r) => (
        <Link key={r.id} href={`/comearn/requirements/${r.id}`} className="ce-card" data-ce-req={r.title}>
          <span className="ce-card-top"><span className="ce-chip">{CE_CATEGORIES[r.category]}</span><span className="ce-type">{r.bids} offer{r.bids === 1 ? '' : 's'}{r.myBid ? ` · yours: ${r.myBid.status}` : ''}</span></span>
          <strong>{r.title}</strong><span className="ce-muted">{r.city}{r.estimatedValuePaise ? ` · ${rupees(r.estimatedValuePaise)}` : ''} · closes {r.closesOn}</span>
        </Link>))}</div> : <EmptyState icon="search" title="No open customer requirements">Members’ customer requirements appear here.</EmptyState>}
    </>
  );
}
