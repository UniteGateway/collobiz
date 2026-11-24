'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { GuideChat } from './GuideChat';
import { PageVideos, SocialIcons } from './SiteKit';

/** Five destinations only; everything else is one click away in the footer. */
const NAV = [
  { href: '/businesses', label: 'Unite businesses' },
  { href: '/partner-with-unite', label: 'Sell Unite products' },
  { href: '/club', label: 'Industry Club' },
  { href: '/opportunities/public', label: 'Opportunities' },
  { href: '/how-it-works', label: 'How it works' },
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
          <nav aria-label="Mobile">{NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}{!me && <><Link href="/start">Get started</Link><Link href="/login">Sign in</Link></>}</nav>
        </details>
        <Link href="/" className="cz-brand" aria-label="COLLABIZ home"><img src="/brand/collabiz-mark.png" alt="" width={30} height={30} /><span>collabiz</span></Link>
        <nav aria-label="Primary">
          {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="cz-spacer" />
        {me ? <Link href="/dashboard" className="cz-btn cz-btn-accent cz-btn-sm">My dashboard</Link> : (
          <>
            <Link href="/login" className="cz-btn cz-btn-ghost cz-btn-sm cz-hide-xs">Sign in</Link>
            <Link href="/start" className="cz-btn cz-btn-accent cz-btn-sm">Get started</Link>
          </>
        )}
      </header>
    </>
  );
}

export function PublicFooter() {
  return (
    <footer className="cz-bigfoot" data-footer>
      <div className="cz-container">
        <div className="cz-bigfoot-top">
          <div className="cz-bigfoot-brand">
            <span className="cz-bigfoot-logo"><img src="/brand/collabiz-mark.png" alt="" />COLLABIZ</span>
            <p>The Unite-first B2B collaboration network. Buy from Unite, sell Unite products, grow your business and earn as a partner — in one account.</p>
            <a className="cz-bigfoot-phone" href="tel:+919667660773">+91 96676 60773</a>
          </div>
          <div className="cz-bigfoot-follow">
            <SocialIcons size="lg" heading={<h4>Follow Unite Group</h4>} />
            <Link href="/start" className="cz-btn cz-btn-accent">Get started free</Link>
          </div>
        </div>
        <div className="cz-bigfoot-grid">
          <nav aria-label="Get started"><h4>Get started</h4><Link href="/businesses">Buy from Unite</Link><Link href="/partner-with-unite">Sell Unite products</Link><Link href="/join">Grow my business</Link><Link href="/signup">Earn as a partner</Link></nav>
          <nav aria-label="Explore"><h4>Explore</h4><Link href="/how-it-works">How it works</Link><Link href="/opportunities/public">Opportunities</Link><Link href="/club">Industry Club</Link><Link href="/catalogue">Catalogue</Link><Link href="/store">Store</Link><Link href="/membership">Membership</Link></nav>
          <nav aria-label="Company"><h4>Company</h4><Link href="/about">About</Link><Link href="/group-companies">Unite Group</Link><Link href="/success-stories">Success stories</Link><Link href="/locations">Partner locations</Link><Link href="/umeet">U meet</Link></nav>
          <nav aria-label="Support"><h4>Support</h4><Link href="/support/contact">Contact &amp; FAQs</Link><Link href="/club/terms">Terms</Link><Link href="/club/legal">Legal documents</Link><Link href="/verify-certificate">Verify a certificate</Link><Link href="/settings/privacy">Privacy &amp; data rights</Link></nav>
        </div>
        <div className="cz-bigfoot-legal">
          <p>
            COLLABIZ is not an escrow bank, lender, securities exchange or regulated investment intermediary. Legal entities act as principals only
            when named in signed agreements. Earnings are never guaranteed; commissions become payable only on defined contractual triggers.
          </p>
          <p>© {new Date().getFullYear()} Unite Group · COLLABIZ</p>
        </div>
      </div>
    </footer>
  );
}
export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main">{children}<PageVideos /></main>
      <PublicFooter />
      <GuideChat />
    </>
  );
}
