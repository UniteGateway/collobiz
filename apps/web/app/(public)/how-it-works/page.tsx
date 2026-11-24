import type { Metadata } from 'next';
import Link from 'next/link';
import { Stepper } from '@collabiz/ui';
import { PlatformGrid } from '@/components/PlatformGrid';
import { ImageFeature, PageHero, PhotoCards, PhotoCta } from '@/components/PageHero';
export const metadata: Metadata = { title: 'How Collaboration Works' };

const LIFECYCLE = ['Draft', 'Submitted', 'Consent check', 'Duplicate review', 'Verified', 'Unite priority review', 'Accepted / Released', 'Qualification', 'Proposal', 'Award', 'Execution', 'Milestone certification', 'Settlement', 'Closed'];

/** Screen 003 — How Collaboration Works (Master Book §2.1–2.3). */
export default function HowItWorksPage() {
  return (
    <div className="cz-page" data-screen="003">
      <PageHero layout="split" tone="ocean" image="team-meeting" second="deal-signing" eyebrow="How it works" title="How collaboration works"
        lead="From verified registration to settled commission, every step is recorded with identity, consent, timestamps and approvals."
        actions={<><Link href="/start" className="cz-btn cz-btn-accent cz-btn-lg">Get started</Link><Link href="/opportunities/public" className="cz-btn cz-btn-secondary cz-btn-lg">See opportunities</Link></>}
        stats={[['4', 'ways to work together'], ['14', 'recorded lifecycle steps'], ['1', 'account for everything']]} />
      <div className="cz-container">
        <section>
          <h2 className="cz-big">Four ways to work together</h2>
          <p className="cz-sublead">Whoever brings the opportunity, the rules are the same and every step is on record.</p>
          <PhotoCards items={[
            { image: 'industry-engineer', badge: 'A', title: 'Unite-owned business', text: 'A Unite Group company publishes a product, job, RFQ, project or distributor request. Qualified partners apply; Unite controls commercial approvals and signing.' },
            { image: 'person-laptop', badge: 'B', title: 'Partner-originated opportunity', text: 'You submit a client-approved requirement. The matching Unite Group company gets a timed first review (default 4 business hours, configurable) and you receive a verified tracking ID and protection certificate.' },
            { image: 'trade-warehouse-team', badge: 'C', title: 'Partner exchange', text: 'If Unite declines or releases the opportunity — and the buyer consented — eligible partners can bid. Contracting principals and platform fees are disclosed.' },
            { image: 'build-site-team', badge: 'D', title: 'Joint execution', text: 'When more capability is needed, form a multi-partner team with NDA, role allocation, commercial sharing proposal, approvals and execution milestones.' },
          ]} />
        </section>
        <section className="cz-card" style={{ overflowX: 'auto' }}>
          <h2>Opportunity lifecycle</h2>
          <div style={{ minWidth: 900 }}><Stepper steps={LIFECYCLE} current={-1} /></div>
        </section>
        <ImageFeature image="team-handshake" eyebrow="Fair routing" title="Fair routing rules" tone="ocean" reverse>
          <ul>
            <li>No release of personally identifying buyer details without sufficient authorization.</li>
            <li>Duplicate leads are decided on evidence, timestamps and relationship history — not first-click ownership.</li>
            <li>Urgent tenders, holidays and customer-restricted leads follow exception workflows.</li>
            <li>Escalation to the category owner and central operations before auto-release where consent and rules allow.</li>
            <li>A partner can never approve their own KYC, deal award or commission payout.</li>
          </ul>
        </ImageFeature>
        <section aria-labelledby="platform-h" className="cz-hx">
          <h2 id="platform-h" className="cz-big">Everything in COLLABIZ</h2>
          <p className="cz-sublead">Every capability works with the others — the same customer, team and ledger from first call to final payment.</p>
          <PlatformGrid />
        </section>
        <PhotoCta image="collab-hands" title="Ready to collaborate?" text="Create your free account and register your first opportunity today.">
          <Link href="/signup" className="cz-btn cz-btn-accent cz-btn-lg">Create a free account</Link>
        </PhotoCta>
      </div>
    </div>
  );
}
