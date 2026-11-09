import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata: Metadata = { title: 'Partner Benefits & Membership' };

const LEVELS = [
  ['Registered', 'Browse public content, submit verification', 'Free onboarding'],
  ['Verified', 'Register eligible leads, receive invitations', 'Documented contractual rewards'],
  ['Certified', 'Product-specific selling and service competencies', 'Certification tied to capabilities'],
  ['Strategic', 'Consortium, large opportunities, complex programs', 'Case-by-case approval'],
  ['Country partner', 'Market development in authorized territories', 'Territorial contract, regulatory checks'],
];

/** Screen 007 — Partner Benefits & Membership (Master Book §2.4). */
export default function MembershipPage() {
  return (
    <div className="cz-container cz-section" data-screen="007">
      <h1>Partner benefits &amp; membership</h1>
      <p style={{ maxWidth: 760 }}>Levels reflect verified capability and delivery — never payments for recruiting other partners.</p>
      <div className="cz-table-wrap" style={{ marginTop: 16 }}>
        <table className="cz-table">
          <caption className="cz-sr-only">Membership levels</caption>
          <thead><tr><th scope="col">Level</th><th scope="col">Access</th><th scope="col">Commercial note</th></tr></thead>
          <tbody>{LEVELS.map(([l, a, c]) => <tr key={l}><td><strong>{l}</strong></td><td>{a}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="cz-alert cz-alert-info" style={{ marginTop: 16 }}>
        COLLABIZ rewards proven delivery and credible introductions, not the volume of unqualified referrals. There are no payments for recruiting
        partners and no implied guaranteed returns.
      </div>
      <Link href="/login?mode=register" className="cz-btn cz-btn-accent">Start free onboarding</Link>
    </div>
  );
}
