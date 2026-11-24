import type { Metadata } from 'next';
import { JoinWizard } from '@/components/Join';
import { PageHero, PhotoCards } from '@/components/PageHero';

export const metadata: Metadata = {
  title: 'Join the Unite Industry Club',
  description: 'Any business, in any industry, can collaborate with Unite Group on COLLABIZ — free or lower-cost power, selling with solar, barter, trading, exports and imports, and more.',
};

/** Join as any industry or collaborate with Unite Group. */
export default function JoinPage() {
  return (
    <div className="cz-page" data-screen="join">
      <PageHero layout="split" tone="sunrise" image="industry-worker" second="growth-green-energy" eyebrow="Unite Industry Club" title="Join the Unite Industry Club — any industry."
        lead="Sell your products under the Unite Powertek brand with free power, buy green power for your factory, and grow through the Unite network. Tell us what you do and what you want — you get your own club board." />
      <div className="cz-container">
        <section>
          <PhotoCards items={[
            { image: 'industry-engineer', badge: '1', title: 'Pick your industry', text: 'Manufacturing, retail, education, logistics, agriculture, real estate, technology — every industry is welcome.' },
            { image: 'energy-panel-roof', badge: '2', title: 'Choose what you want', text: 'Sell under the Unite brand with free power, buy green power, the barter club, trading, exports and imports, EPC work, property, jobs and more.' },
            { image: 'team-desk', badge: '3', title: 'Open your own board', text: 'Your board shows live opportunities for each choice and the Unite businesses that fit you, with the reason for every match.' },
          ]} />
        </section>
        <section className="cz-card" aria-label="Join">
          <JoinWizard />
        </section>
        <p className="cz-muted" style={{ marginTop: 16, fontSize: 14 }}>
          Membership is free. Matches are suggestions based on your industry and choices; they are not offers of work or guarantees of income. Regulated Unite businesses appear only after their clearances.
        </p>
      </div>
    </div>
  );
}
