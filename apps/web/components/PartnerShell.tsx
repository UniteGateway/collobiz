'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import { SCREENS, SCREEN_FAMILIES, SCREEN_STATUS } from '@collabiz/types';
import { AppShell, Button, type NavSection } from '@collabiz/ui';
import { useSession } from '@/lib/session';

const LIVE = new Set(['implemented', 'verified']);
const SKIP_FAMILIES = new Set([1, 14]); // public site, admin portal

/** Sidebar is generated from the screen registry, showing only screens that are implemented. */
export function buildNav(): NavSection[] {
  return SCREEN_FAMILIES.filter((f) => !SKIP_FAMILIES.has(f.id)).map((f) => ({
    title: f.name,
    items: SCREENS.filter((s) => s.family === f.id && s.app === 'web' && !s.route.includes('[') && !s.route.startsWith('/onboarding') && s.access !== 'public' && LIVE.has(SCREEN_STATUS[s.id]?.status ?? ''))
      .map((s) => ({ href: s.route, label: s.title, screen: s.id })),
  })).filter((s) => s.items.length);
}

const TOP = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/marketplace', label: 'Opportunities' },
  { href: '/my/leads', label: 'My Business' },
  { href: '/inbox', label: 'Messages' },
];

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me, logout, switchOrg } = useSession();
  const initials = me?.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const orgs = me?.memberships.filter((m, i, a) => a.findIndex((x) => x.organizationId === m.organizationId) === i) ?? [];
  const menu = me ? (
    <div className="cz-row" style={{ gap: 8 }}>
      {orgs.length > 1 && (
        <label style={{ fontSize: 13 }}>
          <span className="cz-sr-only">Active organization</span>
          <select className="cz-select" style={{ minHeight: 32, padding: '4px 8px', width: 200 }} value={me.activeOrg?.id ?? ''} onChange={(e) => switchOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.organizationId} value={o.organizationId}>{o.orgName}</option>)}
          </select>
        </label>
      )}
      <Button variant="ghost" size="sm" onClick={logout} style={{ color: '#fff' }}>Sign out</Button>
    </div>
  ) : null;
  return (
    <AppShell topNav={TOP} sections={[{ items: [{ href: '/dashboard', label: 'Home' }] }, ...buildNav()]} currentPath={path} userInitials={initials} userMenu={menu}>
      {children}
    </AppShell>
  );
}
