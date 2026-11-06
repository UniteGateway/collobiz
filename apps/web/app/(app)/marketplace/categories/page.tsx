'use client';
import Link from 'next/link';
import { SECTORS, sectorName } from '@collabiz/types';
import { EmptyState, LoadingState, Money } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 034 — Opportunity Category Browser. */
export default function CategoriesPage() {
  const q = useQuery<{ sector: string; count: number; value: number }[]>('/opportunities/categories');
  const counts = Object.fromEntries((q.data ?? []).map((c) => [c.sector, c]));
  return (
    <Screen id="034">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No open opportunities yet" /> : (
        <div className="cz-grid cz-grid-3">
          {SECTORS.map((s) => (
            <Link key={s.code} href={`/marketplace/search?sector=${s.code}`} className="cz-card" style={{ textDecoration: 'none', color: 'inherit', opacity: counts[s.code] ? 1 : 0.6 }}>
              <h2>{sectorName(s.code)}</h2>
              <p style={{ margin: 0 }}><strong>{counts[s.code]?.count ?? 0}</strong> open · <Money minor={counts[s.code]?.value ?? 0} /> indicative value</p>
              {s.priority && <p className="cz-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Priority sector</p>}
            </Link>
          ))}
        </div>
      )}
    </Screen>
  );
}
