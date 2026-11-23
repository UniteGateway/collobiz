'use client';
/** UNITE INDUSTRY CLUB — shared pieces: benefits grid, approved products showcase. */
import Link from 'next/link';
import { CLUB_BENEFITS } from '@collabiz/types';
import { LoadingState } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

export function ClubBenefits() {
  return (
    <div className="cz-club-benefits">
      {CLUB_BENEFITS.map((b, i) => (
        <article key={b.code} className="cz-club-benefit" data-benefit={b.code}>
          <span className="cz-club-num">{String(i + 1).padStart(2, '0')}</span>
          <h3>{b.title}</h3>
          <p>{b.text}</p>
        </article>
      ))}
    </div>
  );
}

interface Pub { id: string; code: string; name: string; category: string; brand: string; powerFree: boolean; powerOffer: string | null }
export function ClubShowcase() {
  const q = useQuery<{ items: Pub[] }>('/public/club/products');
  if (!q.data) return q.error ? null : <LoadingState />;
  if (!q.data.items.length) return <p className="cz-muted">The first club products will appear here once Unite approves them.</p>;
  return (
    <div className="cz-board-grid">
      {q.data.items.map((p) => (
        <article key={p.code} className="cz-card cz-board-card" data-club-showcase={p.code}>
          <span className="cz-club-brand">{p.brand}</span>
          <h3>{p.name}</h3>
          <p className="cz-muted">{p.category}</p>
          {p.powerFree && <p className="cz-club-power">Free power: {p.powerOffer}</p>}
          <div className="cz-board-links"><Link className="cz-btn cz-btn-secondary cz-btn-sm" href="/powertek">Sell or buy through Powertek</Link></div>
        </article>
      ))}
    </div>
  );
}
