'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';

const NAV = [
  { href: '/about', label: 'About' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/group-companies', label: 'Unite Group' },
  { href: '/catalogue', label: 'Catalogue' },
  { href: '/opportunities/public', label: 'Opportunities' },
  { href: '/membership', label: 'Membership' },
  { href: '/support/contact', label: 'Contact' },
];

export function PublicHeader() {
  const path = usePathname();
  const { me } = useSession();
  return (
    <>
      <a href="#main" className="cz-skip">Skip to content</a>
      <header className="cz-topbar">
        <details className="cz-public-menu">
          <summary aria-label="Open menu">Menu</summary>
          <nav aria-label="Mobile">{NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}</nav>
        </details>
        <Link href="/" className="cz-brand"><img src="/brand/collabiz-mark.png" alt="" width={30} height={30} /><span>collabiz</span></Link>
        <nav aria-label="Primary">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="cz-spacer" />
        {me ? <Link href="/dashboard" className="cz-btn cz-btn-accent cz-btn-sm">My dashboard</Link> : (
          <>
            <Link href="/login">Sign in</Link>
            <Link href="/login?mode=register" className="cz-btn cz-btn-accent cz-btn-sm">Join as partner</Link>
          </>
        )}
      </header>
    </>
  );
}

export function PublicFooter() {
  return (
    <footer className="cz-footer">
      <div className="cz-container cz-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <img src="/brand/collabiz-logo.png" alt="COLLABIZ — Connect. Collaborate. Grow." width={220} style={{ background: '#fff', borderRadius: 8, padding: 8 }} />
          <p style={{ marginTop: 12 }}>Powered by Unite Group · Unite-first hybrid collaboration</p>
        </div>
        <nav aria-label="Footer" className="cz-stack" style={{ gap: 6 }}>
          <Link href="/success-stories">Success stories</Link>
          <Link href="/locations">Global partner locations</Link>
          <Link href="/support/contact">Contact, FAQs &amp; support</Link>
          <Link href="/settings/privacy">Privacy &amp; data rights</Link>
        </nav>
        <p style={{ maxWidth: 420, fontSize: 12 }}>
          COLLABIZ is not an escrow bank, lender, securities exchange or regulated investment intermediary. Legal entities act as principals only
          when named in signed agreements. Earnings are never guaranteed; commissions become payable only on defined contractual triggers.
        </p>
      </div>
    </footer>
  );
}

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main">{children}</main>
      <PublicFooter />
    </>
  );
}
