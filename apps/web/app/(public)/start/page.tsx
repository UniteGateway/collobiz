import type { Metadata } from 'next';
import Link from 'next/link';
import { StartPaths } from '@/components/StartPaths';
import { PageHero, PhotoMosaic } from '@/components/PageHero';

export const metadata: Metadata = { title: 'Get started', description: 'Buy from Unite, sell Unite products, grow your business or earn as a partner — choose where to start.' };

/** One page that answers "where do I start?" */
export default function StartPage() {
  return (
    <div className="cz-page" data-screen="start">
      <PageHero layout="cover" tone="teal" image="team-handshake" eyebrow="Get started" title="What would you like to do?" lead="Pick the one that fits you best. You can do more later — it is all one account." />
      <div className="cz-container">
        <section><StartPaths /></section>
        <section>
          <PhotoMosaic photos={[['energy-rooftop-install', 'Solar panels being installed'], ['trade-warehouse-team', 'A warehouse team'], ['team-startup', 'A small business team'], ['person-laptop', 'A partner working on a laptop']]} />
          <p className="cz-muted" style={{ marginTop: 20 }}>Already a member? <Link href="/login">Sign in</Link>. Not sure? Use the chat button, or <Link href="/support/contact">talk to the Unite team</Link>.</p>
        </section>
      </div>
    </div>
  );
}
