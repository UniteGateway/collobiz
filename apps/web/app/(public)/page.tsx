'use client';
import Link from 'next/link';
import { OFFER_CATEGORIES, SECTORS, appBrand, sectorName } from '@collabiz/types';
import { Icon, Skeleton, type IconName } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';
import { useBrandProducts } from '@/components/BrandChannels';

const inrShort = (minor: number) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(r >= 1e9 ? 0 : 1)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

/** Everything COLLABIZ does, as one grid. Big tiles carry a photo. */
const PLATFORM: { icon: IconName; title: string; text: string; href: string; photo?: string; wide?: boolean }[] = [
  { icon: 'leads', title: 'Protected leads & CRM', text: 'Register a customer with consent and evidence. A time-stamped certificate protects your introduction, and the deal runs in your own pipeline.', href: '/how-it-works', photo: 'team-success', wide: true },
  { icon: 'tenders', title: 'Teams & tenders', text: 'Form multi-company teams under NDA and bid together.', href: '/how-it-works' },
  { icon: 'projects', title: 'Projects & milestones', text: 'Evidence-backed milestones the client certifies.', href: '/how-it-works' },
  { icon: 'earnings', title: 'Commissions you can trace', text: 'Projected → eligible → earned → paid, on an append-only ledger.', href: '/how-it-works' },
  { icon: 'value', title: 'Unite Solar & Green Park', text: 'Rooftop, EPC and PPA quotes from a bill; renewable capacity meets industrial demand with landed-cost estimates.', href: '/businesses/sunite', photo: 'energy-wind-coast', wide: true },
  { icon: 'building', title: 'Property & industrial parks', text: 'Unite residential projects and industrial parks with RERA details, live availability and site-visit booking.', href: '/businesses/prodeal', photo: 'property-tower', wide: true },
  { icon: 'briefcase', title: 'Micro-contracts & capacity', text: 'Small fixed-price jobs and bookable idle capacity.', href: '/businesses/xpert' },
  { icon: 'trading', title: 'Business offers & XCHANGE', text: 'Franchises, dealerships, capacity — and barter or part-cash deals.', href: '/login?next=/business-offers' },
  { icon: 'verify', title: 'Proof passport', text: 'Verified delivery and payment history that buyers can check.', href: '/login?next=/proof' },
  { icon: 'bell', title: 'ACTION OS', text: 'One board for every follow-up, deadline and approval.', href: '/login?next=/action-os' },
  { icon: 'learning', title: 'Learning & certificates', text: 'Short courses with certificates partners can share.', href: '/businesses/unite-learning' },
];

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

const ROUTES = [
  { key: 'A', title: 'Unite-owned business', body: 'Projects and supply published directly by Unite Group companies.' },
  { key: 'B', title: 'Partner-originated', body: 'You introduce the customer; your introduction stays protected.' },
  { key: 'C', title: 'Partner exchange', body: 'Opportunities Unite releases to verified partners, introducer credited.' },
  { key: 'D', title: 'Joint execution', body: 'Unite Group and partners deliver together under one contract.' },
];

/** Screen 001 — Public homepage. Figures, the featured listing, companies and products are live from the platform. */
export default function HomePage() {
  const stats = useQuery<{ verifiedPartners: number; groupCompanies: number; openOpportunities: number; openValue: number; activeSectors: number; protectedLeads: number; asOf: string }>('/public/stats');
  const featured = useQuery<any[]>('/public/opportunities');
  const companies = useQuery<any[]>('/public/group-companies');
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
          <span className="cz-hx-kicker">The Unite-first B2B collaboration network</span>
          <h1 id="hx-h">Win more business,<br />together.</h1>
          <p>COLLABIZ connects consultants, EPC contractors, traders, manufacturers and developers with Unite Group and with each other — with protected leads, verified partners and commissions you can trace from introduction to payment.</p>
          <div className="cz-hx-ctas">
            <Link href="/signup" className="cz-hx-btn cz-hx-btn-light">Join as a partner<Icon name="arrow" size={17} /></Link>
            <Link href="/club" className="cz-hx-btn cz-hx-btn-glass">Unite Industry Club</Link>
            <Link href="/opportunities/public" className="cz-hx-btn cz-hx-btn-glass">Browse opportunities</Link>
          </div>
        </div>
        <dl className="cz-hx-stats" aria-label="Live platform figures">
          {[
            ['Verified partners', s?.verifiedPartners],
            ['Unite Group companies', s?.groupCompanies],
            ['Open opportunities', s?.openOpportunities],
            ['Open pipeline value', s ? inrShort(s.openValue) : undefined],
          ].map(([k, v]) => <div key={k as string}><dt>{k}</dt><dd>{v ?? <Skeleton height={26} width={60} />}</dd></div>)}
        </dl>
      </section>

      {/* ---------- What COLLABIZ is ---------- */}
      <section className="cz-hx-section cz-hx-intro" aria-labelledby="intro-h">
        <p className="cz-hx-eyebrow">What is COLLABIZ</p>
        <h2 id="intro-h">One place to find business, work together and get paid.</h2>
        <p className="cz-hx-lede">Unite Group publishes its demand here first — solar, infrastructure, property, trade and services. Verified businesses bring their own customers, form teams for bigger work, and every introduction, milestone and commission is recorded from start to finish.</p>
        <div className="cz-hx-pillars">
          {[
            { icon: 'opportunities' as IconName, t: 'Find business', d: 'Unite Group opportunities, business offers, tenders and Unite products to sell.' },
            { icon: 'teams' as IconName, t: 'Work together', d: 'Teams, consortiums, micro-contracts, capacity sharing and barter between businesses.' },
            { icon: 'earnings' as IconName, t: 'Get paid', d: 'Protected introductions and a commission ledger that pays when the customer pays.' },
          ].map((p) => <article key={p.t}><span><Icon name={p.icon} size={22} /></span><h3>{p.t}</h3><p>{p.d}</p></article>)}
        </div>
      </section>

      {/* ---------- Three ways in ---------- */}
      <section className="cz-hx-section" aria-labelledby="ways-h">
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">Get started</p><h2 id="ways-h">Three ways in. One network behind them.</h2></div>
        <div className="cz-hx-ways">
          {[
            { tag: 'Collab', title: 'Resource-first matching', text: 'Describe what you have and need once. COLLABIZ matches you with business offers, Unite programmes and other businesses — and tells you why.', href: '/login?next=/collab', cta: 'Start a Collab', photo: 'team-desk' },
            { tag: 'Business offers', title: 'A marketplace both sides publish to', text: `Partnerships, franchises, dealerships, EPC contracts, idle capacity and businesses for sale across ${OFFER_CATEGORIES.length} categories — checked before they go live.`, href: '/login?next=/business-offers', cta: 'Explore offers', photo: 'deal-handshake' },
            { tag: 'Unite Green Park', title: 'Renewable energy marketplace', text: 'Solar, wind, hybrid and storage capacity meets industrial demand — with delivered-cost estimates and a staged deal room.', href: '/login?next=/energy', cta: 'Enter the marketplace', photo: 'energy-wind-solar' },
          ].map((w) => (
            <article key={w.tag} className="cz-hx-way">
              <img src={`/photos/${w.photo}.webp`} alt="" aria-hidden loading="lazy" />
              <div><span>{w.tag}</span><h3>{w.title}</h3><p>{w.text}</p><Link href={w.href}>{w.cta}<Icon name="arrow" size={15} /></Link></div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- Everything in one place ---------- */}
      <section className="cz-hx-section" aria-labelledby="platform-h">
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">The platform</p><h2 id="platform-h">Everything your business needs, in one place.</h2>
          <p className="cz-hx-sub">Every capability below is built into COLLABIZ and works with the others — the same customer, team and ledger from first call to final payment.</p></div>
        <ul className="cz-hx-bento">
          {PLATFORM.map((x) => (
            <li key={x.title} className={x.wide ? 'is-wide' : undefined}>
              <Link href={x.href}>
                {x.photo && <img src={`/photos/${x.photo}.webp`} alt="" aria-hidden loading="lazy" />}
                <span className="cz-hx-bento-ic"><Icon name={x.icon} size={20} /></span>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </Link>
            </li>
          ))}
        </ul>
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

      {/* ---------- Routes ---------- */}
      <section className="cz-hx-section" aria-labelledby="routes-h">
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">The Unite-first hybrid model</p><h2 id="routes-h">Four ways business flows.</h2></div>
        <ul className="cz-hx-routes">{ROUTES.map((r) => <li key={r.key}><span>{r.key}</span><h3>{r.title}</h3><p>{r.body}</p></li>)}</ul>
      </section>

      {/* ---------- Industries ---------- */}
      <section className="cz-hx-section" aria-labelledby="ind-h">
        <div className="cz-hx-head"><p className="cz-hx-eyebrow">Industries</p><h2 id="ind-h">Built for the businesses that build India.</h2></div>
        <ul className="cz-hx-ind">
          {[['Solar & renewable energy', 'Rooftop, EPC, PPA, BESS and open access', 'energy-wind-sunset'], ['EPC & infrastructure', 'Tenders, consortiums and milestone billing', 'build-excavator'],
            ['Trade & logistics', 'RFQs, exports, barter and part-cash deals', 'trade-port'], ['Manufacturing', 'Capacity sharing, supply and procurement', 'industry-engineer'],
            ['Real estate', 'Property sales, franchise outlets and industrial parks', 'property-tower'], ['Consulting & services', 'Advisory teams, BPO and professional services', 'team-meeting']].map(([t, d, ph]) => (
            <li key={t}><img src={`/photos/${ph}.webp`} alt="" aria-hidden loading="lazy" /><div><h3>{t}</h3><p>{d}</p></div></li>
          ))}
        </ul>
      </section>

      {/* ---------- Sectors & companies ---------- */}
      <section className="cz-hx-section" aria-label="Sectors and Unite Group companies">
        <div className="cz-hx-split cz-hx-split-even">
          <div className="cz-hx-panel">
            <p className="cz-hx-eyebrow">Sectors</p>
            <h2>Where partners are winning work.</h2>
            <ul className="cz-hx-sectors">{SECTORS.map((sec) => (
              <li key={sec.code}><Link href={`/opportunities/public?sector=${sec.code}`} data-priority={sec.priority || undefined}>{sec.name}</Link></li>
            ))}</ul>
          </div>
          <div className="cz-hx-panel">
            <p className="cz-hx-eyebrow">Unite Group</p>
            <h2>Companies you can work with.</h2>
            <ul className="cz-hx-companies">
              {(companies.data ?? []).slice(0, 6).map((c) => (
                <li key={c.id}><span aria-hidden>{(c.brandName ?? '?').slice(0, 1)}</span><div><strong>{c.brandName}</strong><small>{(c.sectors ?? []).slice(0, 3).map(sectorName).join(' · ')}{c.city ? ` · ${c.city}` : ''}</small></div></li>
              ))}
              {companies.loading && [0, 1, 2].map((i) => <li key={i}><Skeleton height={40} /></li>)}
            </ul>
            <Link href="/group-companies" className="cz-hx-more">All Unite Group companies<Icon name="arrow" size={15} /></Link>
          </div>
        </div>
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

      {/* ---------- Closing CTA ---------- */}
      <section className="cz-hx-cta" aria-labelledby="cta-h">
        <img src="/photos/collab-overhead.webp" alt="" aria-hidden loading="lazy" />
        <div>
          <h2 id="cta-h">Bring your capability to the network.</h2>
          <p>Verification takes one sitting. Your first protected lead can follow the same day.</p>
          <div className="cz-hx-ctas">
            <Link href="/signup" className="cz-hx-btn cz-hx-btn-light">Join as a partner</Link>
            <Link href="/club" className="cz-hx-btn cz-hx-btn-glass">Join the Industry Club</Link>
            <Link href="/rfq/new" className="cz-hx-btn cz-hx-btn-glass">Submit a requirement</Link>
          </div>
        </div>
      </section>
      <p className="cz-hx-note">Figures are live from the platform{s ? ` · updated ${new Date(s.asOf ?? Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}. Earnings are never guaranteed; commission becomes payable only on defined contractual triggers.</p>
    </div>
  );
}
