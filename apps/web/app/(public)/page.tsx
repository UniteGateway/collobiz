import Link from 'next/link';
import { SECTORS, OPPORTUNITY_ROUTES } from '@collabiz/types';

/** Screen 001 — Website homepage. */
export default function HomePage() {
  return (
    <div data-screen="001">
      <section className="cz-hero">
        <div className="cz-container">
          <p style={{ letterSpacing: '.18em', fontSize: 13, textTransform: 'uppercase', color: '#9fd391' }}>Connect. Collaborate. Grow.</p>
          <h1>Bring business, find capability, execute professionally and track the commercial outcome.</h1>
          <p>
            COLLABIZ is the Unite-first hybrid B2B collaboration network for consultants, EPC contractors, traders, manufacturers,
            distributors and project developers — with protected leads, transparent commissions and verified reputation.
          </p>
          <div className="cz-row" style={{ marginTop: 24 }}>
            <Link href="/login?mode=register" className="cz-btn cz-btn-accent">Join as a partner</Link>
            <Link href="/opportunities/public" className="cz-btn cz-btn-secondary">Browse opportunities</Link>
            <Link href="/rfq/new" className="cz-btn cz-btn-ghost" style={{ color: '#fff' }}>Submit a requirement →</Link>
          </div>
        </div>
      </section>

      <section className="cz-section">
        <div className="cz-container">
          <h2>Five trust capabilities</h2>
          <p className="cz-muted">Built into every workflow, not bolted on.</p>
          <div className="cz-grid cz-grid-3" style={{ marginTop: 16 }}>
            {[
              ['Protected leads', 'Time-stamped registration with evidence, duplicate checks and a signed conditional protection period — with appeal and release workflows.'],
              ['Collaboration teams', 'Multi-organization teams with capacities, role assignment, NDA boundaries, shared tasks, joint proposals and approvals.'],
              ['Transparent commissions', 'Projected → eligible → earned → approved → invoiced → paid, on an auditable, append-only ledger with clear deductions.'],
              ['Explainable AI matching', 'Matches on sector, geography, capacity and certifications with your consent — always human-reviewed, never an automatic promise.'],
              ['Verified reputation', 'Scores from verified job history, quality, on-time delivery and settlement conduct — never from paid placement.'],
              ['Unite-first routing', 'Partner-originated opportunities get a timed Unite Group first review, then approved partner exchange where consent allows.'],
            ].map(([t, d]) => (
              <div className="cz-card" key={t}><h3>{t}</h3><p className="cz-muted" style={{ margin: 0 }}>{d}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="cz-section" style={{ background: '#fff' }}>
        <div className="cz-container">
          <h2>The Unite-first hybrid model</h2>
          <div className="cz-grid cz-grid-4" style={{ marginTop: 16 }}>
            {Object.entries(OPPORTUNITY_ROUTES).map(([k, v]) => (
              <div key={k} className="cz-kpi"><div className="cz-kpi-label">Route</div><strong>{v}</strong></div>
            ))}
          </div>
          <p style={{ marginTop: 16 }}>
            <Link href="/how-it-works">See how collaboration works →</Link>
          </p>
        </div>
      </section>

      <section className="cz-section">
        <div className="cz-container">
          <h2>Priority sectors</h2>
          <div className="cz-chips" style={{ marginTop: 12 }}>
            {SECTORS.map((s) => <span key={s.code} className="cz-chip" aria-pressed={s.priority}>{s.name}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
}
