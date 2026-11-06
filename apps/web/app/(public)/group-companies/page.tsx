'use client';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { EmptyState, ErrorState, LoadingState } from '@collabiz/ui';
import { PublicScreen } from '@/components/PublicScreen';
import { useQuery } from '@/lib/hooks';

interface GC { id: string; brandName: string; legalName: string; legalEntityCode: string; city: string | null; sectors: string[]; description: string | null; publishedItems: number }

/** Screen 004 — Unite Group Companies Directory. Brand and legal entity are shown separately. */
export default function GroupCompaniesPage() {
  const q = useQuery<GC[]>('/public/group-companies');
  return (
    <PublicScreen id="004" description="Unite Group companies that publish opportunities and review partner-originated leads first. Contracts are always signed by the named legal entity.">
      {q.loading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No group companies listed yet" /> : (
        <div className="cz-grid cz-grid-3">
          {q.data.map((g) => (
            <section key={g.id} className="cz-card">
              <h2>{g.brandName}</h2>
              <p className="cz-muted" style={{ fontSize: 13 }}>Legal entity: {g.legalName} · {g.legalEntityCode}</p>
              <p>{g.description}</p>
              <div className="cz-chips" style={{ marginBottom: 12 }}>{g.sectors.map((s) => <span key={s} className="cz-chip">{sectorName(s)}</span>)}</div>
              <Link href={`/catalogue?owner=${g.id}`}>View {g.publishedItems} products &amp; services →</Link>
            </section>
          ))}
        </div>
      )}
    </PublicScreen>
  );
}
