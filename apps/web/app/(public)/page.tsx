'use client';
import Link from 'next/link';
import { SECTORS, sectorName } from '@collabiz/types';
import { Icon, Skeleton, type IconName } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

const inrShort = (minor: number) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(r >= 1e9 ? 0 : 1)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

const CAPABILITIES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'leads', title: 'Protected leads', body: 'Register a customer with consent and evidence. A sealed, time-stamped certificate protects your introduction while Unite Group reviews it.' },
  { icon: 'teams', title: 'Collaboration teams', body: 'Form multi-company teams under a signed NDA, agree roles and revenue shares, and bid together with one voice.' },
  { icon: 'earnings', title: 'Transparent commissions', body: 'Every rupee is tracked from projected to paid on an append-only ledger. Commission is earned only when the customer pays.' },
  { icon: 'search', title: 'Explainable matching', body: 'Recommendations show exactly why — sector, region, capacity, certifications — and only include partners who consent.' },
  { icon: 'verify', title: 'Verified reputation', body: 'Reputation comes from verified delivery, quality and settlement conduct. It cannot be bought or boosted.' },
];

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'verify', title: 'Join and verify', body: 'Create your company profile and complete KYC/KYB once. Verified partners unlock the full network.' },
  { icon: 'opportunities', title: 'Bring or find business', body: 'Register a protected lead, or apply to Unite Group and partner opportunities that match your capability.' },
  { icon: 'teams', title: 'Collaborate and deliver', body: 'Build a team, bid on tenders, sign contracts and track milestones with evidence the client certifies.' },
  { icon: 'earnings', title: 'Get paid transparently', body: 'Watch commission move to earned when the customer pays, request payout, and keep tax records in one place.' },
];

const ROUTES = [
  { key: 'A', title: 'Unite-owned business', body: 'Projects and supply opportunities published directly by Unite Group companies.' },
  { key: 'B', title: 'Partner-originated', body: 'You introduce the customer. Unite Group gets a timed first review; your introduction stays protected.' },
  { key: 'C', title: 'Partner exchange', body: 'Opportunities Unite releases to verified partners, with the buyer’s consent and the introducer credited.' },
  { key: 'D', title: 'Joint execution', body: 'Unite Group and partners deliver together under one contract, with shares agreed up front.' },
];

/** Screen 001 — Public homepage. Figures and the featured listing are live from the platform. */
export default function HomePage() {
  const stats = useQuery<{ verifiedPartners: number; groupCompanies: number; openOpportunities: number; openValue: number; activeSectors: number; protectedLeads: number; asOf: string }>('/public/stats');
  const featured = useQuery<any[]>('/public/opportunities');
  const companies = useQuery<any[]>('/public/group-companies');
  const opp = (featured.data ?? [])[0];
  const s = stats.data;
  return (
    <div data-screen="001" className="cz-home">
      {/* ---------- Hero ---------- */}
      <section className="cz-home-hero">
        <div className="cz-container cz-home-hero-grid">
          <div>
            <span className="cz-pill"><span className="cz-pill-dot" />The Unite-first B2B collaboration network</span>
            <h1>Win more business,<br /><span>together.</span></h1>
            <p className="cz-home-lede">
              COLLABIZ connects consultants, EPC contractors, traders, manufacturers and developers with Unite Group and with each other —
              with protected leads, verified partners and commissions you can trace from introduction to payment.
            </p>
            <div className="cz-row" style={{ gap: 12, marginTop: 28 }}>
              <Link href="/login?mode=register" className="cz-btn cz-btn-accent cz-btn-lg">Join as a partner<Icon name="arrow" size={17} /></Link>
              <Link href="/opportunities/public" className="cz-btn cz-btn-secondary cz-btn-lg">Browse opportunities</Link>
            </div>
            <ul className="cz-home-assurances" aria-label="Assurances">
              <li><Icon name="success" size={16} />Verified partners only</li>
              <li><Icon name="success" size={16} />Introductions protected by certificate</li>
              <li><Icon name="success" size={16} />Paid only when the customer pays</li>
            </ul>
          </div>

          {/* Product preview built from live data */}
          <div className="cz-home-preview" aria-label="Product preview">
            <div className="cz-preview-card cz-preview-main">
              <div className="cz-preview-head"><span className="cz-tag">Featured opportunity</span><span className="cz-badge" style={{ color: '#2F6F25', background: '#E7F4E3' }}>Open</span></div>
              {opp ? (
                <>
                  <div className="cz-mono cz-muted" style={{ marginTop: 14 }}>{opp.code}</div>
                  <h3 className="cz-preview-title">{opp.title}</h3>
                  <p className="cz-muted" style={{ fontSize: 13.5, margin: '0 0 16px' }}>{sectorName(opp.sector)} · {[opp.city, opp.region?.replace('IN-', '')].filter(Boolean).join(', ')}</p>
                  <div className="cz-preview-facts">
                    <div><span>Indicative value</span><strong>{opp.estimatedValue ? inrShort(opp.estimatedValue) : 'On request'}</strong></div>
                    <div><span>Closes</span><strong>{opp.deadline ? new Date(opp.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Rolling'}</strong></div>
                    <div><span>Published by</span><strong>{opp.publisher ?? 'Unite Group'}</strong></div>
                  </div>
                </>
              ) : <div style={{ marginTop: 16 }}><Skeleton height={14} width="40%" /><Skeleton height={22} style={{ marginTop: 10 }} /><Skeleton height={60} style={{ marginTop: 14 }} /></div>}
            </div>
            <div className="cz-preview-card cz-preview-float cz-preview-cert">
              <span className="cz-preview-icon"><Icon name="leads" size={18} /></span>
              <div><strong>Lead protected</strong><span>Certificate CZL-2026-00000006 · 90 days</span></div>
            </div>
            <div className="cz-preview-card cz-preview-float cz-preview-ledger">
              <div className="cz-preview-ledger-title">Commission · Milestone 2</div>
              <ol>
                {['Projected', 'Eligible', 'Earned', 'Paid'].map((st, i) => <li key={st} data-done={i < 3}>{st}</li>)}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Live figures ---------- */}
      <section className="cz-home-stats" aria-label="Live platform figures">
        <div className="cz-container">
          <dl>
            {[
              ['Verified partners', s?.verifiedPartners],
              ['Unite Group companies', s?.groupCompanies],
              ['Open opportunities', s?.openOpportunities],
              ['Open pipeline value', s ? inrShort(s.openValue) : undefined],
            ].map(([k, v]) => (
              <div key={k as string}><dt>{k}</dt><dd className="cz-num">{v ?? <Skeleton height={30} width={80} />}</dd></div>
            ))}
          </dl>
          <p className="cz-muted">Live from the platform{s ? ` · updated ${new Date(s.asOf ?? Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="cz-section">
        <div className="cz-container">
          <div className="cz-home-head"><span className="cz-eyebrow">How it works</span><h2>From introduction to payment, in one place</h2></div>
          <ol className="cz-home-steps">
            {STEPS.map((st, i) => (
              <li key={st.title}>
                <span className="cz-step-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="cz-feature-icon"><Icon name={st.icon} size={20} /></span>
                <h3>{st.title}</h3>
                <p className="cz-muted">{st.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Trust capabilities ---------- */}
      <section className="cz-section cz-home-tint">
        <div className="cz-container">
          <div className="cz-home-head"><span className="cz-eyebrow">Built for trust</span><h2>Five capabilities in every workflow</h2><p className="cz-muted">Not add-ons. Each one is enforced by the platform, from the database up.</p></div>
          <div className="cz-home-features">
            {CAPABILITIES.map((c) => (
              <article key={c.title} className="cz-feature">
                <span className="cz-feature-icon"><Icon name={c.icon} size={20} /></span>
                <h3>{c.title}</h3>
                <p className="cz-muted">{c.body}</p>
              </article>
            ))}
            <article className="cz-feature cz-feature-cta">
              <h3>See the full model</h3>
              <p>How Unite-first routing, teams and the commission ledger work together.</p>
              <Link href="/how-it-works" className="cz-btn cz-btn-secondary">How it works<Icon name="arrow" size={16} /></Link>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- Routes ---------- */}
      <section className="cz-section">
        <div className="cz-container">
          <div className="cz-home-head"><span className="cz-eyebrow">The Unite-first hybrid model</span><h2>Four ways business flows</h2></div>
          <div className="cz-home-routes">
            {ROUTES.map((r) => (
              <article key={r.key}>
                <span className="cz-route-key">{r.key}</span>
                <h3>{r.title}</h3>
                <p className="cz-muted">{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Sectors & companies ---------- */}
      <section className="cz-section cz-home-tint">
        <div className="cz-container cz-home-split">
          <div>
            <span className="cz-eyebrow">Sectors</span>
            <h2>Where partners are winning work</h2>
            <p className="cz-muted">Priority sectors carry the most Unite Group demand.</p>
            <ul className="cz-sector-list">
              {SECTORS.map((sec) => (
                <li key={sec.code} data-priority={sec.priority}>
                  <Link href={`/opportunities/public?sector=${sec.code}`}>{sec.name}{sec.priority && <span className="cz-tag">Priority</span>}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="cz-eyebrow">Unite Group</span>
            <h2>Companies you can work with</h2>
            <ul className="cz-company-list">
              {(companies.data ?? []).slice(0, 6).map((c) => (
                <li key={c.id}>
                  <span className="cz-company-mark" aria-hidden>{(c.brandName ?? '?').slice(0, 1)}</span>
                  <div><strong>{c.brandName}</strong><span className="cz-muted">{(c.sectors ?? []).slice(0, 3).map(sectorName).join(' · ')}{c.city ? ` · ${c.city}` : ''}</span></div>
                </li>
              ))}
              {companies.loading && [0, 1, 2].map((i) => <li key={i}><Skeleton height={40} /></li>)}
            </ul>
            <Link href="/group-companies" className="cz-link-arrow">All Unite Group companies<Icon name="arrow" size={15} /></Link>
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="cz-section">
        <div className="cz-container">
          <div className="cz-home-cta">
            <div>
              <h2>Bring your capability to the network</h2>
              <p>Verification takes one sitting. Your first protected lead can follow the same day.</p>
            </div>
            <div className="cz-row" style={{ gap: 12 }}>
              <Link href="/login?mode=register" className="cz-btn cz-btn-accent cz-btn-lg">Join as a partner</Link>
              <Link href="/rfq/new" className="cz-btn cz-btn-lg cz-btn-onnavy">Submit a requirement</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
