'use client';
import Link from 'next/link';
import { ButtonLink, Card, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ListingCard, type EnergyListing } from '@/components/Energy';
import { useQuery } from '@/lib/hooks';

interface M { listings: EnergyListing[]; introductions: { id: string; listingId: string; code: string; title: string; direction: string; from: string | null; status: string; stage: number; stageLabel: string; createdAt: string }[] }

/** My energy listings and introductions. */
export default function Mine() {
  const q = useQuery<M>('/energy/mine');
  return (
    <Screen page={{ key: 'energy-mine', title: 'My energy listings & deals', access: 'partner' }} eyebrow="Unite Green Park" actions={<ButtonLink href="/energy/register" variant="accent">Register</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : <>
        <Card title={`Introductions and deals (${q.data.introductions.length})`}>
          {!q.data.introductions.length ? <p className="cz-muted" style={{ margin: 0 }}>None yet. Request an introduction from any listing.</p> : (
            <ul className="cz-ws-list">{q.data.introductions.map((i) => <li key={i.id}><span><Link href={`/energy/listings/${i.listingId}`}>{i.title}</Link> <span className="cz-muted">· {i.code} · {i.direction === 'sent' ? 'you asked' : `from ${i.from}`}</span></span>
              <StatusBadge status={i.status} label={i.status === 'accepted' ? `Stage ${i.stage + 1}: ${i.stageLabel}` : i.status} /></li>)}</ul>
          )}
        </Card>
        <h2 style={{ fontSize: 18, margin: '20px 0 10px' }}>My listings</h2>
        {!q.data.listings.length ? <EmptyState title="No listings yet">Register a plant or a power requirement.</EmptyState> : <div className="cz-ugp-grid">{q.data.listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
      </>}
    </Screen>
  );
}
