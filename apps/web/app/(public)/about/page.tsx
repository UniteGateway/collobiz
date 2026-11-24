import type { Metadata } from 'next';
import Link from 'next/link';
import { ImageFeature, PageHero, PhotoCards, PhotoCta, PhotoMosaic } from '@/components/PageHero';
export const metadata: Metadata = { title: 'About COLLABIZ' };

/** Screen 002 — About COLLABIZ (Master Book §1). */
export default function AboutPage() {
  return (
    <div className="cz-page" data-screen="002">
      <PageHero layout="cover" tone="navy" image="global-skyline" eyebrow="About COLLABIZ" title={<>Businesses grow faster<br />when they work together.</>}
        lead="COLLABIZ is the B2B collaboration network of Unite Group — where consultants, contractors, traders, manufacturers, distributors, developers, technology firms and finance associates win real work together."
        actions={<><Link href="/start" className="cz-btn cz-btn-accent cz-btn-lg">Get started</Link><Link href="/how-it-works" className="cz-btn cz-btn-secondary cz-btn-lg">How it works</Link></>} />
      <div className="cz-container">
        <section>
          <h2 className="cz-big">More than a referral app</h2>
          <p className="cz-sublead">
            COLLABIZ connects businesses to opportunities associated with Unite Group and approved external partner transactions. It joins lead
            registration, multi-party collaboration, quotations, bids, contracts, delivery and settlement into one traceable workflow.
          </p>
          <PhotoMosaic photos={[['team-boardroom', 'A leadership team in a boardroom meeting'], ['energy-installer', 'A solar installer at work'], ['trade-port', 'A container port'], ['build-engineers', 'Engineers on a site'], ['team-handshake', 'Partners shaking hands']]} label="Unite Group at work" />
        </section>
        <ImageFeature image="growth-seedling" eyebrow="Vision" title="Every business, any size, anywhere — winning together." tone="forest">
          <p>Enable businesses of different sizes and geographies to combine capabilities and win real commercial opportunities.</p>
        </ImageFeature>
        <ImageFeature image="deal-signing" eyebrow="Mission" title="A trusted network where collaborations become projects." reverse tone="ocean">
          <p>Create a trusted, accountable business network where approved collaborations translate into measurable projects and fairly documented earnings.</p>
        </ImageFeature>
        <section>
          <h2 className="cz-big">The problems we solve</h2>
          <p className="cz-sublead">Why businesses join COLLABIZ.</p>
          <PhotoCards items={[
            { image: 'industry-worker', title: 'Access to large contracts', text: 'Small and mid-size businesses struggle to access credible large contracts and partners.' },
            { image: 'finance-report', title: 'Undocumented introductions', text: 'Business introductions are often undocumented and create commission ownership disputes.' },
            { image: 'team-meeting', title: 'Disconnected teams', text: 'Buyers coordinate consultants, EPC contractors, suppliers, financiers and local specialists using disconnected tools.' },
            { image: 'tech-data', title: 'Fragmented tracking', text: 'Lead tracking, proposals, contract execution and payment status are fragmented.' },
            { image: 'build-site-team', title: 'Complex projects', text: 'Traditional B2B listing marketplaces do not always manage complex multi-party project execution.' },
          ]} />
        </section>
        <ImageFeature image="office-open" eyebrow="Platform boundaries" title="Clear about what we are — and what we are not." tone="graphite">
          <p>
            COLLABIZ is not by default an escrow bank, lender, securities exchange, regulated investment intermediary or contractual guarantor.
            Legal entities act as principals only when clearly named in signed agreements. Third-party partners may contract directly under the
            platform terms. Unite Group has an opportunity to participate — not a blanket legal claim on every external deal.
          </p>
        </ImageFeature>
        <PhotoCta image="collab-overhead" title="Bring your business to the network" text="Join free. Choose what you want to do — buy, sell Unite products, grow your business or earn as a partner.">
          <Link href="/start" className="cz-btn cz-btn-accent cz-btn-lg">Get started</Link><Link href="/group-companies" className="cz-btn cz-btn-secondary cz-btn-lg">Meet Unite Group</Link>
        </PhotoCta>
      </div>
    </div>
  );
}
