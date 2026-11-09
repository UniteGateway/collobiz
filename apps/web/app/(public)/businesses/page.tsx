'use client';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { ButtonLink, EmptyState, ErrorState, LoadingState } from '@collabiz/ui';
import { VentureMark, stageLabel, type Venture } from '@/components/Ventures';
import { useQuery } from '@/lib/hooks';

/** Public directory of Unite Group businesses that are open to partners. */
export default function BusinessesPage() {
  const q = useQuery<Venture[]>('/public/ventures');
  return (
    <div className="cz-container cz-section" data-screen="businesses">
      <h1>Unite Group businesses</h1>
      <p className="cz-muted" style={{ maxWidth: 780 }}>Unite Group builds businesses across energy, property, commerce, jobs, education, mobility and more. Verified COLLABIZ partners help grow them — by referring customers, bringing merchants and members, selling products or delivering services — and are rewarded on agreed terms.</p>
      <div className="cz-row" style={{ margin: '12px 0 20px' }}><ButtonLink href="/onboarding/account-type" variant="accent">Become a partner</ButtonLink><Link href="/group-companies">Unite Group companies →</Link></div>
      {q.loading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No businesses listed yet" /> : (
        <ul className="cz-venture-grid">
          {q.data.map((v) => (
            <li key={v.id}>
              <section className="cz-card cz-venture" aria-label={v.name}>
                <div className="cz-venture-head"><VentureMark name={v.name} sector={v.sector} /><div><h2 style={{ margin: 0, fontSize: 16 }}>{v.name}</h2><span className="cz-muted">{v.category}</span></div></div>
                <span className="cz-venture-tag">{v.tagline}</span>
                <p className="cz-venture-sum">{v.summary}</p>
                <div className="cz-venture-foot"><span className="cz-tag">{sectorName(v.sector)}</span><span className="cz-muted">{stageLabel(v.stage)}{v.company ? ` · ${v.company}` : ''}</span></div>
              </section>
            </li>
          ))}
        </ul>
      )}
      <p className="cz-muted" style={{ marginTop: 20, fontSize: 13 }}>Businesses marked Pilot or In development are at an early stage and may be available only in some areas. Nothing here is an offer of investment, credit or financial products.</p>
    </div>
  );
}
