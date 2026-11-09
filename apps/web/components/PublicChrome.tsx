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
          <nav aria-label="Mobile">{NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}{!me && <Link href="/login">Sign in</Link>}</nav>
        </details>
        <Link href="/" className="cz-brand" aria-label="COLLABIZ home"><img src="/brand/collabiz-mark.png" alt="" width={30} height={30} /><span>collabiz</span></Link>
        <nav aria-label="Primary">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="cz-spacer" />
        {me ? <Link href="/dashboard" className="cz-btn cz-btn-accent cz-btn-sm">My dashboard</Link> : (
          <>
            <Link href="/login" className="cz-btn cz-btn-ghost cz-btn-sm cz-hide-xs">Sign in</Link>
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
      <div className="cz-container">
        <div className="cz-footer-grid">
          <div>
            <img src="/brand/collabiz-logo.png" alt="COLLABIZ — Connect. Collaborate. Grow." width={188} />
            <p className="cz-muted" style={{ marginTop: 14, maxWidth: 320 }}>The Unite-first B2B collaboration network. Powered by Unite Group.</p>
          </div>
          <nav aria-label="Platform"><h4>Platform</h4><Link href="/how-it-works">How it works</Link><Link href="/opportunities/public">Opportunities</Link><Link href="/catalogue">Catalogue</Link><Link href="/membership">Membership</Link></nav>
          <nav aria-label="Company"><h4>Company</h4><Link href="/about">About</Link><Link href="/group-companies">Unite Group</Link><Link href="/success-stories">Success stories</Link><Link href="/locations">Partner locations</Link></nav>
          <nav aria-label="Support"><h4>Support</h4><Link href="/support/contact">Contact &amp; FAQs</Link><Link href="/verify-certificate">Verify a certificate</Link><Link href="/settings/privacy">Privacy &amp; data rights</Link></nav>
        </div>
        <p className="cz-footer-legal">
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
