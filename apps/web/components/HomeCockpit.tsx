'use client';
/**
 * Member home, top section (design v5): hero banner with quick goals, module tiles, live figures, featured
 * opportunities, the matching agent's quick choices, business performance and the Unite brands.
 * Every figure is the member's own live data — nothing is sample or projected.
 */
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { Icon, Skeleton, type IconName } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';
import { photo } from '@/lib/photos';

const inr = (minor = 0) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

const GOALS: [string, string][] = [['Sell your products', '/partner-with-unite'], ['Get discounted power', '/powertrade/power'], ['Exchange & barter', '/xchange'], ['Find partners & investors', '/collab'], ['Launch a new business', '/launch']];
const TILES: { label: string; sub: string; href: string; icon: IconName; tone: string }[] = [
  { label: 'Energy & Solar', sub: 'PPA · EPC · Captive', href: '/energy', icon: 'sun', tone: 'blue' },
  { label: 'ROOFZ', sub: 'Rooftop business & leasing', href: '/businesses/roofz', icon: 'roof', tone: 'red' },
  { label: 'Business Offers', sub: 'Buy · Sell · Source', href: '/business-offers', icon: 'briefcase', tone: 'indigo' },
  { label: 'Trade & Exports', sub: 'Import · Export · Global', href: '/trading', icon: 'globe', tone: 'green' },
  { label: 'XCHANGE', sub: 'Barter · Part-cash', href: '/xchange', icon: 'barter', tone: 'violet' },
  { label: 'Franchise', sub: 'Distribute · Partner · Grow', href: '/franchise', icon: 'building', tone: 'amber' },
  { label: 'Projects & Tenders', sub: 'EPC · Govt · Private', href: '/tenders', icon: 'factory', tone: 'sky' },
  { label: 'Investments', sub: 'Equity · JV · Funding', href: '/invest', icon: 'coins', tone: 'rose' },
  { label: 'AI Match', sub: 'Smart partnering', href: '/ai/matching', icon: 'sparkles', tone: 'purple' },
];
const QUICK: [string, string][] = [['I want to buy power', '/powertrade/power'], ['I want to sell my product', '/club/products'], ['I have a rooftop or land', '/businesses/roofz'], ['I am looking for investment', '/invest'], ['I want a business partner', '/collab']];
const SECTOR_PIC: Record<string, string> = { solar: 'energy-panel-roof', power_equipment: 'industry-engineer', infrastructure: 'build-site-team', real_estate: 'property-tower', local_commerce: 'trade-warehouse', technology: 'tech-data', consulting: 'team-boardroom', ev: 'energy-ev-carport', agri_food: 'growth-seedling', financial_services: 'finance-analysis' };
const BRANDS: [string, string, string][] = [['Unite Solar', '/brands/sunx.png', '/businesses/sunx'], ['Unite Powertek', '/brands/unite-powertek.png', '/powertek'], ['ROOFZ', '/brands/roofz.png', '/businesses/roofz'], ['PRIZO', '/brands/prizo.png', '/businesses/prizo'], ['LeadDNA', '/brands/leaddna.png', '/businesses/leaddna'], ['UNIECO', '/brands/unieco.png', '/businesses/unieco']];

interface Opp { id: string; title: string; sector: string; city: string | null; estimatedValue: number | null; deadline: string | null }
interface Trend { months: string[]; earnings: number[]; leads: number[]; deals: number[] }

export function HomeHero({ greet, name, org }: { greet: string; name: string; org?: React.ReactNode }) {
  return (
    <section className="v5-hero" aria-labelledby="v5-hero-h">
      <img className="v5-hero-img" src={photo('deal-handshake')} alt="" aria-hidden />
      <div className="v5-hero-text">
        <p className="v5-hero-greet">{greet}, {name}{org ? <> · {org}</> : null}</p>
        <h1 id="v5-hero-h">A business network for <span>growth, energy &amp; opportunity</span></h1>
        <p className="v5-hero-sub">Collaborate · Trade · Grow · Save on power · Build together</p>
        <div className="v5-hero-ctas">
          <Link href="/marketplace" className="v5-btn v5-btn-green">Find opportunities <Icon name="arrow" size={16} /></Link>
          <Link href="/business-offers" className="v5-btn v5-btn-white">List your business</Link>
        </div>
      </div>
      <ul className="v5-hero-goals" aria-label="What you can do">
        {GOALS.map(([t, h]) => <li key={t}><Link href={h}><Icon name="success" size={18} />{t}</Link></li>)}
      </ul>
    </section>
  );
}

export function HomeTiles() {
  return (
    <nav className="v5-tiles" aria-label="Modules">
      {TILES.map((t) => (
        <Link key={t.label} href={t.href} className="v5-tile" data-tone={t.tone}>
          <span className="v5-tile-icon"><Icon name={t.icon} size={26} /></span>
          <strong>{t.label}</strong><span>{t.sub}</span>
        </Link>
      ))}
    </nav>
  );
}

export function HomeFigures({ f, loading }: { f: Record<string, number>; loading: boolean }) {
  const items: [IconName, string, string, string][] = [
    ['crm', loading ? '' : inr(f.pipelineValue), 'Open pipeline', '/crm/pipeline'],
    ['leads', loading ? '' : String(f.activeLeads ?? 0), 'Active leads', '/my/leads'],
    ['projects', loading ? '' : String(f.activeProjects ?? 0), 'Active projects', '/projects'],
    ['opportunities', loading ? '' : String(f.openApplications ?? 0), 'Open applications', '/my/opportunities'],
    ['earnings', loading ? '' : inr(f.earnedUnpaid), 'Earned, not yet paid', '/earnings'],
  ];
  return (
    <div className="v5-figures">
      {items.map(([icon, v, l, h]) => (
        <Link key={l} href={h} className="v5-figure"><span className="v5-figure-icon"><Icon name={icon} size={22} /></span><span><strong>{v || <Skeleton height={24} width={70} />}</strong><span>{l}</span></span></Link>
      ))}
    </div>
  );
}

export function FeaturedOpportunities() {
  const q = useQuery<{ items: Opp[] }>('/opportunities', { paged: 'true', limit: '4', sort: 'newest' });
  return (
    <section className="v5-card v5-featured" aria-labelledby="v5-feat-h">
      <div className="v5-card-head"><h2 id="v5-feat-h"><Icon name="target" size={20} />Featured opportunities</h2><Link href="/marketplace">View all <Icon name="arrow" size={14} /></Link></div>
      {!q.data ? <Skeleton height={220} /> : !q.data.items.length ? <p className="cz-muted">New opportunities appear here as soon as they are published.</p> : (
        <div className="v5-opps">{q.data.items.map((o) => (
          <article key={o.id} className="v5-opp">
            <div className="v5-opp-img"><img src={photo(SECTOR_PIC[o.sector] ?? 'team-meeting')} alt="" loading="lazy" /><span>{sectorName(o.sector)}</span></div>
            <h3>{o.title}</h3>
            <p>{[o.city, o.estimatedValue ? inr(o.estimatedValue) : null].filter(Boolean).join(' · ') || ' '}</p>
            <Link href={`/opportunities/${o.id}`} className="v5-btn v5-btn-outline">View details</Link>
          </article>
        ))}</div>
      )}
    </section>
  );
}

export function MatchAgent() {
  return (
    <section className="v5-agent" aria-labelledby="v5-agent-h">
      <div className="v5-agent-head"><h2 id="v5-agent-h"><Icon name="sparkles" size={20} />Matching agent</h2><Link href="/ai/matching" className="v5-pill">Match now <Icon name="arrow" size={13} /></Link></div>
      <div className="v5-agent-body">
        <div>
          <p>Find the right business, energy, product or investment match — with the reason for every suggestion.</p>
          <ul>{['Partners & clients', 'Power & energy deals', 'Product buyers & suppliers', 'Investment & funding'].map((t) => <li key={t}><Icon name="success" size={16} />{t}</li>)}</ul>
        </div>
        <div className="v5-quick"><strong><Icon name="zap" size={16} />Quick match</strong>{QUICK.map(([t, h]) => <Link key={t} href={h}>{t}<Icon name="next" size={14} /></Link>)}</div>
      </div>
    </section>
  );
}

export function BusinessPerformance({ f, trend }: { f: Record<string, number>; trend?: Trend }) {
  const max = Math.max(1, ...(trend?.deals ?? [0]));
  const maxL = Math.max(1, ...(trend?.leads ?? [0]));
  const mon = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
  return (
    <section className="v5-card v5-perf" aria-labelledby="v5-perf-h">
      <div className="v5-card-head"><h2 id="v5-perf-h"><Icon name="trend" size={20} />My business performance</h2><Link href="/performance">Details <Icon name="arrow" size={14} /></Link></div>
      <div className="v5-perf-grid">
        <div className="v5-perf-kpis">
          <div data-tone="green"><Icon name="earnings" size={22} /><strong>{inr(f.earnedUnpaid)}</strong><span>Earned (commissions)</span></div>
          <div data-tone="blue"><Icon name="trend" size={22} /><strong>{inr(f.pipelineValue)}</strong><span>Pipeline value</span></div>
          <div data-tone="amber"><Icon name="coins" size={22} /><strong>{f.openDeals ?? 0}</strong><span>Deals in progress</span></div>
          <div data-tone="indigo"><Icon name="teams" size={22} /><strong>{f.activeProjects ?? 0}</strong><span>Active projects</span></div>
        </div>
        <figure className="v5-chart" aria-label="New deal value (bars) and leads registered (line), last six months">
          {!trend ? <Skeleton height={160} /> : (
            <>
              <svg viewBox="0 0 300 150" preserveAspectRatio="none" role="img" aria-hidden>
                {trend.deals.map((v, i) => <rect key={i} x={12 + i * 48} y={130 - (v / max) * 110} width="26" height={(v / max) * 110} rx="4" className="v5-bar" />)}
                <polyline fill="none" className="v5-line" points={trend.leads.map((v, i) => `${25 + i * 48},${130 - (v / maxL) * 110}`).join(' ')} />
                {trend.leads.map((v, i) => <circle key={i} cx={25 + i * 48} cy={130 - (v / maxL) * 110} r="3.5" className="v5-dot" />)}
              </svg>
              <figcaption><span>{trend.months.map(mon).join(' · ')}</span><span><i className="v5-k-bar" />Deal value <i className="v5-k-line" />Leads</span></figcaption>
            </>
          )}
        </figure>
      </div>
    </section>
  );
}

export function EcosystemBrands() {
  return (
    <section className="v5-card v5-brands" aria-labelledby="v5-br-h">
      <div className="v5-card-head"><h2 id="v5-br-h"><Icon name="building" size={20} />Ecosystem &amp; brands</h2><Link href="/ventures">All <Icon name="arrow" size={14} /></Link></div>
      <div className="v5-brand-grid">{BRANDS.map(([n, src, h]) => <Link key={n} href={h} title={n}><img src={src} alt={n} loading="lazy" /></Link>)}</div>
    </section>
  );
}
