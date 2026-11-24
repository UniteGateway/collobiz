import type { Metadata } from 'next';
import Link from 'next/link';
import { ClubBenefits, ClubShowcase } from '@/components/Club';
import { PageHero, PhotoCards, PhotoMosaic } from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'Unite Industry Club',
  description: 'Make it. We brand it, power it and sell it. Any industry can sell its products under the Unite Powertek brand with free power, buy green power, and grow through the Unite network.',
};

const STEPS = [
  ['Join free', 'Pick your industry and what you want from the club.'],
  ['Submit your product', 'Specifications, certifications, monthly capacity and an optional free-power offer.'],
  ['Unite approves', 'Quality, certification and business checks.'],
  ['Sign online', 'You and Unite Powertek sign the brand licence on COLLABIZ — no paper, any country.'],
  ['Sold across the network', 'Listed in the Unite Powertek catalogue; every COLLABIZ partner, franchise and store can sell it.'],
] as const;
const STEP_PHOTOS = ['team-handshake', 'industry-engineer', 'team-laptop', 'deal-signing', 'trade-warehouse-team'];

/** Unite Industry Club — public landing page. */
export default function ClubPage() {
  return (
    <div className="cz-page" data-screen="club">
      <PageHero layout="band" tone="forest" image="industry-engineer" second="energy-panel-roof" eyebrow="Unite Industry Club" title="Make it. We brand it, power it and sell it."
        lead="Any industry, any product, anywhere in the world. Sell your products under the Unite Powertek brand with free solar power for your customers, buy green power for your own factory, and grow through the whole Unite network."
        actions={<><Link href="/join" className="cz-btn cz-btn-accent cz-btn-lg">Join the Industry Club</Link><Link href="/club/products" className="cz-btn cz-btn-secondary cz-btn-lg">Submit a product</Link></>} />
      <div className="cz-container">
      <section aria-labelledby="club-benefits" style={{ marginTop: 40 }}>
        <h2 id="club-benefits">What members get</h2>
        <ClubBenefits />
      </section>

      <section aria-labelledby="club-oem" style={{ marginTop: 40 }}>
        <h2 id="club-oem">How selling under the Unite brand works</h2>
        <PhotoCards items={STEPS.map(([t, d], i) => ({ image: STEP_PHOTOS[i], badge: `Step ${i + 1}`, title: t, text: d }))} />
      </section>

      <section aria-label="Club members at work" style={{ marginTop: 40 }}>
        <PhotoMosaic photos={[['industry-worker', 'A factory worker'], ['energy-wind-solar', 'Wind and solar power'], ['trade-port', 'Exports from a port'], ['unieco-tableware', 'Eco tableware made from rice husk'], ['energy-solar-sky', 'Solar panels under a blue sky']]} />
      </section>

      <section aria-labelledby="club-products" style={{ marginTop: 40 }}>
        <h2 id="club-products">Club products</h2>
        <ClubShowcase />
      </section>

      <p className="cz-muted" style={{ marginTop: 32, fontSize: 14 }}>
        Membership is free. Read the <Link href="/club/terms">Club Terms and Conditions</Link> and all <Link href="/club/legal">legal documents</Link>. Brand use needs Unite’s approval and a signed brand licence; commercial terms are agreed in the licence and are not charged through COLLABIZ. Free-power offers are made by the member with its product. Power is supplied by plant owners and DISCOMs under their own agreements; COLLABIZ does not sell power or quote tariffs.
      </p>
      </div>
    </div>
  );
}
