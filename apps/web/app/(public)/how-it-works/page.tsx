import type { Metadata } from 'next';
import { Stepper } from '@collabiz/ui';
export const metadata: Metadata = { title: 'How Collaboration Works' };

const LIFECYCLE = ['Draft', 'Submitted', 'Consent check', 'Duplicate review', 'Verified', 'Unite priority review', 'Accepted / Released', 'Qualification', 'Proposal', 'Award', 'Execution', 'Milestone certification', 'Settlement', 'Closed'];

/** Screen 003 — How Collaboration Works (Master Book §2.1–2.3). */
export default function HowItWorksPage() {
  return (
    <div className="cz-container cz-section" data-screen="003">
      <p className="cz-breadcrumb">Public Website &amp; Discovery <span className="cz-screen-id">SCREEN 003</span></p>
      <h1>How collaboration works</h1>
      <p style={{ maxWidth: 780 }}>From verified registration to settled commission, every step is recorded with identity, consent, timestamps and approvals.</p>
      <section className="cz-card" style={{ marginTop: 16, overflowX: 'auto' }}>
        <h2>Opportunity lifecycle</h2>
        <div style={{ minWidth: 900 }}><Stepper steps={LIFECYCLE} current={-1} /></div>
      </section>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 16 }}>
        {[
          ['A. Unite-owned business', 'A Unite Group company publishes a product, job, RFQ, project or distributor request. Qualified partners apply; Unite controls commercial approvals and signing.'],
          ['B. Partner-originated opportunity', 'You submit a client-approved requirement. The matching Unite Group company gets a timed first review (default 4 business hours, configurable) and you receive a verified tracking ID and protection certificate.'],
          ['C. Partner exchange', 'If Unite declines or releases the opportunity — and the buyer consented — eligible partners can bid. Contracting principals and platform fees are disclosed.'],
          ['D. Joint execution', 'When more capability is needed, form a multi-partner team with NDA, role allocation, commercial sharing proposal, approvals and execution milestones.'],
        ].map(([t, d]) => <section key={t} className="cz-card"><h2>{t}</h2><p>{d}</p></section>)}
      </div>
      <section className="cz-card" style={{ marginTop: 16 }}>
        <h2>Fair routing rules</h2>
        <ul>
          <li>No release of personally identifying buyer details without sufficient authorization.</li>
          <li>Duplicate leads are decided on evidence, timestamps and relationship history — not first-click ownership.</li>
          <li>Urgent tenders, holidays and customer-restricted leads follow exception workflows.</li>
          <li>Escalation to the category owner and central operations before auto-release where consent and rules allow.</li>
          <li>A partner can never approve their own KYC, deal award or commission payout.</li>
        </ul>
      </section>
    </div>
  );
}
