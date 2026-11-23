import type { Metadata } from 'next';
import { JoinWizard } from '@/components/Join';

export const metadata: Metadata = {
  title: 'Join the Unite Industry Club',
  description: 'Any business, in any industry, can collaborate with Unite Group on COLLABIZ — free or lower-cost power, selling with solar, barter, trading, exports and imports, and more.',
};

const HOW = [
  ['Pick your industry', 'Manufacturing, retail, education, logistics, agriculture, real estate, technology — every industry is welcome.'],
  ['Choose what you want', 'Sell under the Unite brand with free power, buy green power, the barter club, trading, exports and imports, EPC work, property, jobs and more.'],
  ['Open your own board', 'Your board shows live opportunities for each choice and the Unite businesses that fit you, with the reason for every match.'],
] as const;

/** Join as any industry or collaborate with Unite Group. */
export default function JoinPage() {
  return (
    <div className="cz-container cz-section" data-screen="join">
      <header className="cz-join-hero">
        <p className="cz-hx-eyebrow">Unite Industry Club</p>
        <h1>Join the Unite Industry Club — any industry.</h1>
        <p className="cz-hx-sub">Sell your products under the Unite Powertek brand with free power, buy green power for your factory, and grow through the Unite network. Tell us what you do and what you want — you get your own club board.</p>
      </header>
      <ol className="cz-join-how">
        {HOW.map(([t, d], i) => <li key={t}><span>{i + 1}</span><strong>{t}</strong><p>{d}</p></li>)}
      </ol>
      <div className="cz-card" style={{ marginTop: 24 }}>
        <JoinWizard />
      </div>
      <p className="cz-muted" style={{ marginTop: 16, fontSize: 14 }}>
        Membership is free. Matches are suggestions based on your industry and choices; they are not offers of work or guarantees of income. Regulated Unite businesses appear only after their clearances.
      </p>
    </div>
  );
}
