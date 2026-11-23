'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadingState } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

interface Member { name: string; verified: boolean; sectorName: string; city: string | null; about: string | null; products: { name: string; category: string; brand: string; powerFree: boolean; powerOffer: string | null; description: string }[] }

/** A club member's own page — public only when the member switched it on. */
export default function MemberPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<Member>(`/public/club/members/${encodeURIComponent(slug)}`);
  const d = q.data;
  return (
    <div className="cz-container cz-section" data-screen="club-member">
      {q.error ? (
        <><h1>Business page not available</h1><p className="cz-muted">This business has not made its page public. <Link href="/club">About the Unite Industry Club</Link></p></>
      ) : !d ? <LoadingState /> : (
        <>
          <p className="cz-hx-eyebrow">Unite Industry Club member{d.verified ? ' · Verified business' : ''}</p>
          <h1>{d.name}</h1>
          <p className="cz-muted">{d.sectorName}{d.city ? ` · ${d.city}` : ''}</p>
          {d.about && <p style={{ maxWidth: 760 }}>{d.about}</p>}
          <h2 style={{ marginTop: 32 }}>Products</h2>
          {d.products.length ? (
            <div className="cz-board-grid">
              {d.products.map((p) => (
                <article key={p.name} className="cz-card cz-board-card">
                  <span className="cz-club-brand">{p.brand}</span>
                  <h3>{p.name}</h3><p className="cz-muted">{p.category}</p><p>{p.description}</p>
                  {p.powerFree && <p className="cz-club-power">Free power: {p.powerOffer}</p>}
                </article>
              ))}
            </div>
          ) : <p className="cz-muted">No approved products yet.</p>}
          <p style={{ marginTop: 24 }}><Link href="/club">About the Unite Industry Club</Link> · <Link href="/powertek">Buy through Unite Powertek</Link></p>
        </>
      )}
    </div>
  );
}
