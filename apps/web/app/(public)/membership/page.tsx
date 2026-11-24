import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero, PhotoCards, PhotoCta } from '@/components/PageHero';
export const metadata: Metadata = { title: 'Partner Benefits & Membership' };

const LEVELS = [
  ['Registered', 'Browse public content, submit verification', 'Free onboarding', 'person-laptop'],
  ['Verified', 'Register eligible leads, receive invitations', 'Documented contractual rewards', 'team-handshake'],
  ['Certified', 'Product-specific selling and service competencies', 'Certification tied to capabilities', 'team-laptop'],
  ['Strategic', 'Consortium, large opportunities, complex programs', 'Case-by-case approval', 'team-boardroom'],
  ['Country partner', 'Market development in authorized territories', 'Territorial contract, regulatory checks', 'global-city'],
];

/** Screen 007 — Partner Benefits & Membership (Master Book §2.4). */
export default function MembershipPage() {
  return (
    <div className="cz-page" data-screen="007">
      <PageHero layout="band" tone="plum" image="team-success" second="team-boardroom" eyebrow="Membership" title="Partner benefits & membership"
        lead="Levels reflect verified capability and delivery — never payments for recruiting other partners."
        actions={<Link href="/signup" className="cz-btn cz-btn-accent cz-btn-lg">Start free onboarding</Link>} />
      <div className="cz-container">
        <section>
          <h2 className="cz-big">Five levels</h2>
          <PhotoCards items={LEVELS.map(([l, a, c, img], i) => ({ image: img, badge: `Level ${i + 1}`, title: l, text: <>{a}. <strong>{c}.</strong></> }))} />
        </section>
        <div className="cz-table-wrap cz-page-block">
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
        <PhotoCta image="growth-green-energy" title="Start at Registered — free" text="Verify your business, then grow your level by delivering.">
          <Link href="/signup" className="cz-btn cz-btn-accent cz-btn-lg">Start free onboarding</Link>
        </PhotoCta>
      </div>
    </div>
  );
}
