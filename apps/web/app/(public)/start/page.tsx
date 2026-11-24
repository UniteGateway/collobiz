import type { Metadata } from 'next';
import Link from 'next/link';
import { StartPaths } from '@/components/StartPaths';

export const metadata: Metadata = { title: 'Get started', description: 'Buy from Unite, sell Unite products, grow your business or earn as a partner — choose where to start.' };

/** One page that answers "where do I start?" */
export default function StartPage() {
  return (
    <div className="cz-container cz-section" data-screen="start">
      <header className="cz-join-hero">
        <p className="cz-hx-eyebrow">Get started</p>
        <h1>What would you like to do?</h1>
        <p className="cz-hx-sub">Pick the one that fits you best. You can do more later — it is all one account.</p>
      </header>
      <div style={{ marginTop: 28 }}><StartPaths /></div>
      <p className="cz-muted" style={{ marginTop: 24 }}>Already a member? <Link href="/login">Sign in</Link>. Not sure? <Link href="/support/contact">Talk to the Unite team</Link>.</p>
    </div>
  );
}
