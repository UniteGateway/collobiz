'use client';
import Link from 'next/link';
import { appBrand, sectorName } from '@collabiz/types';
import { Icon, Skeleton, type IconName } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';
import { useBrandProducts } from '@/components/BrandChannels';
import { StartPaths } from '@/components/StartPaths';

const inrShort = (minor: number) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(r >= 1e9 ? 0 : 1)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'verify', title: 'Join and verify', body: 'Create your company profile and complete KYC/KYB once.' },
  { icon: 'opportunities', title: 'Bring or find business', body: 'Register a protected lead or apply to opportunities that fit.' },
  { icon: 'teams', title: 'Collaborate and deliver', body: 'Team up, bid, sign and track milestones with evidence.' },
  { icon: 'earnings', title: 'Get paid transparently', body: 'Commission becomes earned when the customer pays.' },
];

const TRUST: { icon: IconName; title: string; body: string }[] = [
  { icon: 'lock', title: 'Introductions are protected', body: 'Sealed certificates and timed first reviews.' },
  { icon: 'verify', title: 'Partners are verified', body: 'KYC/KYB before the full network opens.' },
  { icon: 'earnings', title: 'Money is never held', body: 'COLLABIZ records payments; it never holds funds.' },
  { icon: 'award', title: 'Reputation is earned', body: 'From verified delivery — it cannot be bought.' },
  { icon: 'eye', title: 'Matching is explainable', body: 'Every recommendation shows its reasons.' },
];


/** Screen 001 — Public homepage. Figures, the featured listing, companies and products are live from the platform. */
export default function HomePage() {
  const stats = useQuery<{ verifiedPartners: number; groupCompanies: number; openOpportunities: number; openValue: number; activeSectors: number; protectedLeads: number; asOf: string }>('/public/stats');
  const featured = useQuery<any[]>('/public/opportunities');
  const brands = useBrandProducts();
  const products = useQuery<{ slug: string; name: string; tagline: string }[]>('/public/products');
  const opp = (featured.data ?? [])[0];
  const s = stats.data;
  const logos = (products.data ?? []).filter((p) => appBrand(p.slug)?.logo).slice(0, 18);
  return (
    <div data-screen="001" className="cz-hx">
      {/* ---------- Full hero ---------- */}
      <section className="cz-hx-hero" aria-labelledby="hx-h">
        <img className="cz-hx-hero-img" src="/photos/collab-hands.webp" alt="" aria-hidden fetchPriority="high" />
        <div className="cz-hx-hero-in">
          <span className="cz-hx-kicker">Unite Group’s business network</span>
          <h1 id="hx-h">Win more business,<br />together.</h1>
          <p>Buy from Unite businesses, sell Unite products, grow your business with any industry, or earn as a partner — one account, one network.</p>
          <div className="cz-hx-ctas">
            <Link href="/start" className="cz-hx-btn cz-hx-btn-light">Get started<Icon name="arrow" size={17} /></Link>
            <Link href="/businesses" className="cz-hx-btn cz-hx-btn-glass">Explore Unite businesses</Link>
          </div>
        </div>
      </section>

      {/* ---------- Four clear paths ---------- */}
      <section className="cz-hx-section" aria-labelledby="paths-h" data-home-paths>
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">Get started</p><h2 id="paths-h">What would you like to do?</h2>
          <p className="cz-hx-sub">Four ways in. Choose the one that fits you — everything works from one account.</p></div>
        <StartPaths />
      </section>

      {/* ---------- Unite products ---------- */}
      <section className="cz-hx-section cz-hx-products" aria-labelledby="prod-h">
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">Unite Group products</p><h2 id="prod-h">{products.data ? `${products.data.length} Unite businesses to use, sell and grow.` : 'Unite businesses to use, sell and grow.'}</h2>
          <p className="cz-hx-sub">Energy, property, commerce, jobs, learning, media and mobility — each with its own page, connected to COLLABIZ.</p></div>
        <ul className="cz-hx-logos" aria-label="Unite products">
          <li><Link href="/go-eb5/apply" aria-label="GO EB5"><img src="/brands/goeb5.png" alt="" /></Link></li>
          {logos.map((p) => <li key={p.slug}><Link href={`/businesses/${p.slug}`} aria-label={p.name}><img src={appBrand(p.slug)!.logo} alt="" loading="lazy" /></Link></li>)}
        </ul>
        <div className="cz-hx-center"><Link href="/businesses" className="cz-hx-btn cz-hx-btn-dark">See all Unite products<Icon name="arrow" size={16} /></Link></div>
      </section>

      {/* ---------- Unite brand products: become a channel partner ---------- */}
      <section className="cz-hx-section" aria-labelledby="brand-h" data-home-brands>
        <div className="cz-hx-head">
          <p className="cz-hx-eyebrow">New · Unite brand products</p>
          <h2 id="brand-h">Sell Unite brand products.</h2>
          <p className="cz-hx-sub">Made by established manufacturers under the Unite brand. Become a distributor, dealer, store or franchise — our matching agent tells you which product fits your business.</p>
        </div>
        <div className="cz-board-why" style={{ marginBottom: 16 }}>
          {(brands.data?.items ?? []).map((x) => <Link key={x.slug} className="cz-chip" href={`/businesses/${x.slug}`}>{x.name}</Link>)}
        </div>
        <div className="cz-hx-ctas"><Link href="/partner-with-unite" className="cz-hx-btn cz-hx-btn-light cz-hx-btn-dark">Find my fit and apply<Icon name="arrow" size={16} /></Link></div>
      </section>

      {/* ---------- Featured + how it works ---------- */}
      <section className="cz-hx-section" aria-labelledby="how-h">
        <div className="cz-hx-split">
          <div>
            <p className="cz-hx-eyebrow">How it works</p>
            <h2 id="how-h">From introduction to payment.</h2>
            <ol className="cz-hx-steps">{STEPS.map((st, i) => (
              <li key={st.title}><span className="cz-hx-step-n">{i + 1}</span><div><h3>{st.title}</h3><p>{st.body}</p></div></li>
            ))}</ol>
          </div>
          <aside className="cz-hx-feature" aria-label="Featured opportunity">
            <img src="/photos/build-engineers.webp" alt="" aria-hidden loading="lazy" />
            <div className="cz-hx-feature-card">
              <span className="cz-hx-chip">Featured opportunity · live</span>
              {opp ? <>
                <h3>{opp.title}</h3>
                <p>{sectorName(opp.sector)} · {[opp.city, opp.region?.replace('IN-', '')].filter(Boolean).join(', ')}</p>
                <dl>
                  <div><dt>Indicative value</dt><dd>{opp.estimatedValue ? inrShort(opp.estimatedValue) : 'On request'}</dd></div>
                  <div><dt>Closes</dt><dd>{opp.deadline ? new Date(opp.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Rolling'}</dd></div>
                  <div><dt>Published by</dt><dd>{opp.publisher ?? 'Unite Group'}</dd></div>
                </dl>
                <Link href="/opportunities/public">All open opportunities<Icon name="arrow" size={15} /></Link>
              </> : <><Skeleton height={22} /><Skeleton height={60} style={{ marginTop: 12 }} /></>}
            </div>
          </aside>
        </div>
      </section>

      {/* ---------- Trust ---------- */}
      <section className="cz-hx-section cz-hx-dark" aria-labelledby="trust-h">
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">Built for trust</p><h2 id="trust-h">Enforced by the platform, not promised.</h2></div>
        <ul className="cz-hx-trust">{TRUST.map((x) => <li key={x.title}><Icon name={x.icon} size={22} /><h3>{x.title}</h3><p>{x.body}</p></li>)}</ul>
        <div className="cz-hx-center"><Link href="/how-it-works" className="cz-hx-btn cz-hx-btn-light">See the full model<Icon name="arrow" size={16} /></Link></div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section className="cz-hx-cta" aria-labelledby="cta-h">
        <img src="/photos/collab-overhead.webp" alt="" aria-hidden loading="lazy" />
        <div>
          <h2 id="cta-h">Not sure where to start?</h2>
          <p>Tell us what you do and we will point you to the right place — it is free to join.</p>
          <div className="cz-hx-ctas">
            <Link href="/start" className="cz-hx-btn cz-hx-btn-light">Get started</Link>
            <Link href="/support/contact" className="cz-hx-btn cz-hx-btn-glass">Talk to the Unite team</Link>
          </div>
        </div>
      </section>
      <p className="cz-hx-note">Figures are live from the platform{s ? ` · updated ${new Date(s.asOf ?? Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}. Earnings are never guaranteed; commission becomes payable only on defined contractual triggers.</p>
    </div>
  );
}
