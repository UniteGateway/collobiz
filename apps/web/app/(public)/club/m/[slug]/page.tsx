'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadingState } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

interface Member { name: string; verified: boolean; sectorName: string; city: string | null; about: string | null; products: { name: string; category: string; brand: string; powerFree: boolean; powerOffer: string | null; description: string }[];
  powertrade: { industry: string; interests: string[]; contributions: { kind: string; title: string; capacity: string | null; locations: string | null; exportCapable: boolean }[]; energy: { sources: string[]; size: string; rtc: boolean } | null } | null }

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
          {d.powertrade && (
            <section className="cz-card" style={{ marginTop: 32 }} data-member-powertrade aria-labelledby="pt-h">
              <p className="pt-brand">COLLABIZ POWERTRADE</p>
              <h2 id="pt-h" style={{ marginTop: 0 }}>Collaborate with {d.name}</h2>
              <p className="cz-muted">{d.powertrade.industry} · looking to {d.powertrade.interests.join(', ').toLowerCase()}</p>
              {d.powertrade.contributions.length > 0 && <ul className="cz-umeet-list">{d.powertrade.contributions.map((c) => <li key={c.title}><div><strong>{c.title}</strong><span>{c.kind}{c.capacity ? ` · ${c.capacity}` : ''}{c.locations ? ` · ${c.locations}` : ''}{c.exportCapable ? ' · exports' : ''}</span></div></li>)}</ul>}
              {d.powertrade.energy && <p className="pt-note" style={{ marginTop: 12 }}>Power interest: {d.powertrade.energy.sources.join(', ')} · {d.powertrade.energy.size}{d.powertrade.energy.rtc ? ' · round-the-clock' : ''}</p>}
              <div className="cz-row" style={{ gap: 8, marginTop: 12 }}><Link href="/powertrade/collaborations" className="cz-btn cz-btn-accent cz-btn-sm">Request partnership</Link><Link href="/trading/enquiry" className="cz-btn cz-btn-secondary cz-btn-sm">Request quotation</Link></div>
            </section>
          )}
          <p style={{ marginTop: 24 }}><Link href="/club">About the Unite Industry Club</Link> · <Link href="/powertek">Buy through Unite Powertek</Link></p>
        </>
      )}
    </div>
  );
}
