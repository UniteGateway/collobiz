import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'About COLLABIZ' };

/** Screen 002 — About COLLABIZ (Master Book §1). */
export default function AboutPage() {
  return (
    <div className="cz-container cz-section" data-screen="002">
      <h1>About COLLABIZ</h1>
      <p style={{ maxWidth: 820, fontSize: 17 }}>
        COLLABIZ is a global B2B collaboration ecosystem that connects individual consultants, construction and EPC contractors, product
        traders, manufacturers, distributors, project developers, technology firms, finance associates and qualified investors to
        opportunities associated with Unite Group and approved external partner transactions. It is not solely a referral application: it
        joins lead registration, multi-party collaboration, quotations, bids, contracts, delivery and settlement into one traceable workflow.
      </p>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 24 }}>
        <section className="cz-card"><h2>Vision</h2><p>Enable businesses of different sizes and geographies to combine capabilities and win real commercial opportunities.</p></section>
        <section className="cz-card"><h2>Mission</h2><p>Create a trusted, accountable business network where approved collaborations translate into measurable projects and fairly documented earnings.</p></section>
      </div>
      <section className="cz-card" style={{ marginTop: 16 }}>
        <h2>The problem we solve</h2>
        <ul>
          <li>Small and mid-size businesses struggle to access credible large contracts and partners.</li>
          <li>Business introductions are often undocumented and create commission ownership disputes.</li>
          <li>Buyers must coordinate consultants, EPC contractors, suppliers, financiers and local specialists using disconnected tools.</li>
          <li>Lead tracking, proposals, contract execution and payment status are fragmented.</li>
          <li>Traditional B2B listing marketplaces do not always manage complex multi-party project execution.</li>
        </ul>
      </section>
      <section className="cz-card">
        <h2>Platform boundaries</h2>
        <p>
          COLLABIZ is not by default an escrow bank, lender, securities exchange, regulated investment intermediary or contractual guarantor.
          Legal entities act as principals only when clearly named in signed agreements. Third-party partners may contract directly under the
          platform terms. Unite Group has an opportunity to participate — not a blanket legal claim on every external deal.
        </p>
      </section>
    </div>
  );
}
