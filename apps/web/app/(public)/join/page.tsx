import type { Metadata } from 'next';
import { JoinWizard } from '@/components/Join';

export const metadata: Metadata = {
  title: 'Join as any industry',
  description: 'Any business, in any industry, can collaborate with Unite Group on COLLABIZ — free or lower-cost power, selling with solar, barter, trading, exports and imports, and more.',
};

const HOW = [
  ['Pick your industry', 'Manufacturing, retail, education, logistics, agriculture, real estate, technology — every industry is welcome.'],
  ['Choose how you collaborate', 'Free or lower-cost power, selling your products with solar, the barter club, trading, exports and imports, EPC work, property, jobs and more.'],
  ['Open your own board', 'Your board shows live opportunities for each choice and the Unite businesses that fit you, with the reason for every match.'],
] as const;

/** Join as any industry or collaborate with Unite Group. */
export default function JoinPage() {
  return (
    <div className="cz-container cz-section" data-screen="join">
      <header className="cz-join-hero">
        <p className="cz-hx-eyebrow">Join COLLABIZ</p>
        <h1>Join as any industry. Collaborate with Unite Group.</h1>
        <p className="cz-hx-sub">COLLABIZ is one business network. Energy is one part of it; your industry is another. Tell us what you do and what you want — you get your own board with the opportunities that fit you.</p>
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
