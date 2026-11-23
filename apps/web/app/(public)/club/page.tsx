import type { Metadata } from 'next';
import Link from 'next/link';
import { ClubBenefits, ClubShowcase } from '@/components/Club';

export const metadata: Metadata = {
  title: 'Unite Industry Club',
  description: 'Make it. We brand it, power it and sell it. Any industry can sell its products under the Unite Powertek brand with free power, buy green power, and grow through the Unite network.',
};

const STEPS = [
  ['Join free', 'Pick your industry and what you want from the club.'],
  ['Submit your product', 'Specifications, certifications, monthly capacity and an optional free-power offer.'],
  ['Unite approves', 'Quality, certifications and factory checks, then a signed brand licence.'],
  ['Sold across the network', 'Listed in the Unite Powertek catalogue; every COLLABIZ partner, franchise and store can sell it.'],
] as const;

/** Unite Industry Club — public landing page. */
export default function ClubPage() {
  return (
    <div className="cz-container cz-section" data-screen="club">
      <header className="cz-join-hero">
        <p className="cz-hx-eyebrow">Unite Industry Club</p>
        <h1>Make it. We brand it, power it and sell it.</h1>
        <p className="cz-hx-sub">Any industry can join. Sell your products under the Unite Powertek brand with free solar power for your customers, buy green power for your own factory, and grow through the whole Unite network.</p>
        <div className="cz-join-actions">
          <Link href="/join" className="cz-btn cz-btn-primary cz-btn-lg">Join the Industry Club</Link>
          <Link href="/club/products" className="cz-btn cz-btn-secondary cz-btn-lg">Submit a product</Link>
        </div>
      </header>

      <section aria-labelledby="club-benefits" style={{ marginTop: 40 }}>
        <h2 id="club-benefits">What members get</h2>
        <ClubBenefits />
      </section>

      <section aria-labelledby="club-oem" style={{ marginTop: 40 }}>
        <h2 id="club-oem">How selling under the Unite brand works</h2>
        <ol className="cz-join-how">{STEPS.map(([t, d], i) => <li key={t}><span>{i + 1}</span><strong>{t}</strong><p>{d}</p></li>)}</ol>
      </section>

      <section aria-labelledby="club-products" style={{ marginTop: 40 }}>
        <h2 id="club-products">Club products</h2>
        <ClubShowcase />
      </section>

      <p className="cz-muted" style={{ marginTop: 32, fontSize: 14 }}>
        Membership is free. Brand use needs Unite’s approval and a signed brand licence; licence terms are agreed with Unite and are not charged through COLLABIZ. Free-power offers are made by the member with its product. Power is supplied by plant owners and DISCOMs under their own agreements; COLLABIZ does not sell power or quote tariffs.
      </p>
    </div>
  );
}
