'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ButtonLink, EmptyState, ErrorState, LoadingState } from '@collabiz/ui';
import { PRODUCT_GROUP_ORDER, ProductTile, groupName, type Product } from '@/components/Products';
import { venturePhoto } from '@/lib/photos';
import { PageHero, PhotoMosaic } from '@/components/PageHero';
import { useQuery } from '@/lib/hooks';

const FEATURED = ['sunite', 'unite-powertek', 'wakin'];

/** Unite products — every Unite Group business, grouped by what it is for. */
export default function BusinessesPage() {
  const q = useQuery<Product[]>('/public/products');
  const [term, setTerm] = useState('');
  const [group, setGroup] = useState('');
  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? []).filter((p) => (!group || p.sector === group) && (!t || `${p.name} ${p.tagline} ${p.category} ${p.summary}`.toLowerCase().includes(t)));
  }, [q.data, term, group]);
  const groups = useMemo(() => {
    const present = new Set((q.data ?? []).map((p) => p.sector));
    return [...PRODUCT_GROUP_ORDER.filter((g) => present.has(g)), ...[...present].filter((g) => !PRODUCT_GROUP_ORDER.includes(g))];
  }, [q.data]);
  const featured = (q.data ?? []).filter((p) => FEATURED.includes(p.slug));
  const filtering = !!term.trim() || !!group;
  return (
    <div className="cz-gp" data-screen="businesses">
      <PageHero layout="cover" tone="graphite" image="energy-wind-solar" eyebrow="Unite Group" title="Products for homes, businesses and communities"
        lead="Energy, property, commerce, jobs, learning, media and more — every Unite business in one place, connected through COLLABIZ.">
        <div className="cz-gp-search cz-ph-search" role="search">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <label htmlFor="gp-q" className="cz-sr-only">Search Unite products</label>
          <input id="gp-q" type="search" placeholder="Search products" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
      </PageHero>

      <nav className="cz-gp-chips" aria-label="Product categories">
        <button type="button" className={!group ? 'is-on' : ''} aria-pressed={!group} onClick={() => setGroup('')}>All products</button>
        {groups.map((g) => <button key={g} type="button" className={group === g ? 'is-on' : ''} aria-pressed={group === g} onClick={() => setGroup(group === g ? '' : g)}>{groupName(g)}</button>)}
      </nav>

      <div className="cz-gp-body">
        {q.loading ? <LoadingState /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
          <>
            {!filtering && <section aria-labelledby="gp-feat" className="cz-gp-section">
              <h2 id="gp-feat" className="cz-sr-only">Featured</h2>
              <ul className="cz-gp-featured">
                <li><Link href="/go-eb5/apply" className="cz-gp-feature" data-product="go-eb5">
                  <img src="/photos/global-skyline.webp" alt="" loading="lazy" /><div><span className="cz-gp-feature-logo"><img src="/brands/goeb5-mark.png" alt="" /></span><strong>GO EB5</strong><span>U.S. investor visa consultancy — apply online</span></div>
                </Link></li>
                {featured.map((p) => <li key={p.slug}><Link href={`/businesses/${p.slug}`} className="cz-gp-feature">
                  <img src={venturePhoto(p.slug, p.sector)} alt="" loading="lazy" /><div><strong>{p.name}</strong><span>{p.tagline}</span></div>
                </Link></li>)}
              </ul>
            </section>}

            {filtering ? (
              list.length ? <ul className="cz-gp-grid" aria-label="Matching products">{list.map((p) => <li key={p.slug}><ProductTile p={p} /></li>)}</ul>
                : <EmptyState title="No products match">Try another word or category.</EmptyState>
            ) : groups.map((g) => (
              <section key={g} className="cz-gp-section" aria-labelledby={`gp-${g}`}>
                <h2 id={`gp-${g}`}>{groupName(g)}</h2>
                <ul className="cz-gp-grid">{list.filter((p) => p.sector === g).map((p) => <li key={p.slug}><ProductTile p={p} /></li>)}</ul>
              </section>
            ))}

            {!filtering && <section className="cz-gp-section" aria-label="Unite Group at work"><PhotoMosaic photos={[['energy-rooftop-install', 'Rooftop solar installation'], ['property-modern-house', 'A modern home'], ['unieco-tableware', 'UNIECO eco tableware'], ['trade-port', 'A cargo port'], ['team-laptop', 'A learning session']]} /></section>}

            <section className="cz-gp-band" aria-labelledby="gp-int">
              <div>
                <p className="cz-gp-eyebrow">Built to work together</p>
                <h2 id="gp-int">One network behind every product</h2>
                <p>Every product page is connected to COLLABIZ. Your enquiry reaches the right team with a reference number. Verified local businesses can partner with a product, and offers, leads and payouts run through one system.</p>
                <div className="cz-row" style={{ gap: 10, flexWrap: 'wrap' }}><ButtonLink href="/onboarding/account-type" variant="accent">Become a partner</ButtonLink><ButtonLink href="/how-it-works" variant="secondary">How COLLABIZ works</ButtonLink></div>
              </div>
              <ul className="cz-gp-hub" aria-label="What connects">
                <li>Enquiries &amp; CRM</li><li>Partner network</li><li>Offers &amp; promotions</li><li>Solar &amp; energy desks</li><li>Property &amp; products</li><li>Action reminders</li>
              </ul>
            </section>
          </>
        )}
        <p className="cz-muted cz-gp-note">“Pilot”, “In development” and “Coming soon” products are at an early stage and may be available only in some areas. Regulated financial products appear only after regulatory clearance. Nothing here is an offer of investment, credit or financial products.</p>
      </div>
    </div>
  );
}
