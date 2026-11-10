'use client';
import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SCREENS, SCREEN_STATUS } from '@collabiz/types';
import { AppShell, Button, Icon, LoadingState, PermissionDenied, Alert, ButtonLink, type IconName } from '@collabiz/ui';
import { useSession } from '@/lib/session';

const LIVE = new Set(['implemented', 'verified']);
/** Short, task-oriented labels and icons for the console (registry titles are too long for navigation). */
const LABELS: Record<string, [string, IconName]> = {
  '127': ['Executive dashboard', 'home'], '139': ['Analytics', 'crm'], '128': ['Group companies', 'building'], '129': ['Users & roles', 'users'], '141': ['Audit & security', 'audit'],
  '130': ['Verification queue', 'verify'], '131': ['Risk & compliance', 'lock'], '132': ['Routing queue', 'leads'], '133': ['Review SLA', 'calendar'], '134': ['Lead conflicts', 'warning'],
  '137': ['Tenders', 'tenders'], '136': ['Catalogue', 'package'], '135': ['Commission policy', 'earnings'], '138': ['Settlements', 'earnings'], '140': ['AI governance', 'info'], '142': ['Content', 'documents'],
};
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Overview', ids: ['127', '139'] },
  { title: 'Organization', ids: ['128', '129', '141'] },
  { title: 'Partners & compliance', ids: ['130', '131'] },
  { title: 'Opportunities & routing', ids: ['132', '133', '134', '137'] },
  { title: 'Catalogue', ids: ['136'] },
  { title: 'Finance', ids: ['135', '138'] },
  { title: 'AI & content', ids: ['140', '142'] },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { me, loading, logout } = useSession();
  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, me, router, path]);
  if (loading || !me) return <LoadingState label="Checking administrator session…" />;
  const sections = GROUPS.map((g) => ({
    title: g.title,
    items: [
      ...g.ids.map((id) => SCREENS.find((s) => s.id === id)!).filter((s) => LIVE.has(SCREEN_STATUS[s.id]?.status ?? '')).map((s) => ({ href: s.route, label: LABELS[s.id]?.[0] ?? s.title, icon: LABELS[s.id]?.[1] })),
      // Supporting queues that are not registry screens of their own.
      ...(g.title === 'Partners & compliance' ? [{ href: '/reputation-appeals', label: 'Reputation appeals', icon: 'verify' as IconName }, { href: '/country-partners', label: 'Country partners', icon: 'map' as IconName }] : []),
    ],
  })).filter((g) => g.items.length);
  const initials = me.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <AppShell product="Administration"
      sections={[{ items: [{ href: '/workspace', label: 'Workspace', icon: 'sector' }, { href: '/', label: 'Overview', icon: 'home' }, { href: '/opportunities', label: 'Opportunity publishing', icon: 'opportunities' }, { href: '/ventures', label: 'Unite businesses', icon: 'building' }, { href: '/offers', label: 'Direct offers', icon: 'briefcase' }, { href: '/growth', label: 'Growth Desk', icon: 'opportunities' }, { href: '/pilot', label: 'Pilot feedback', icon: 'messages' }, { href: '/tender-reviews', label: 'Tender reviews', icon: 'tenders' }, { href: '/resolution', label: 'Resolution centre', icon: 'warning' }, { href: '/reconciliation', label: 'Payment reconciliation', icon: 'earnings' }, { href: '/bank-statements', label: 'Bank statements', icon: 'documents' }, { href: '/integrations', label: 'Integrations', icon: 'external' }] }, ...sections]} currentPath={path}
      userMenu={
        <div className="cz-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <div className="cz-user"><div className="cz-user-text"><strong>{me.fullName}</strong><span>{me.platformRoles.map((r) => r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())).join(', ') || 'No platform role'}</span></div><span className="cz-avatar" aria-hidden>{initials}</span></div>
          <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out"><Icon name="logout" size={16} /><span className="cz-sr-only">Sign out</span></Button>
        </div>
      }>
      {me.platformRoles.length === 0 ? (
        <PermissionDenied reason="The administration portal is restricted to Unite Group administrators." />
      ) : me.mfaRequired && !me.mfaVerified ? (
        <div className="cz-card">
          <Alert tone="warning" title="Multi-factor authentication required.">Administrative capabilities stay locked until you enrol MFA and sign in with a code.</Alert>
          <ButtonLink href="/mfa">Set up MFA</ButtonLink>
        </div>
      ) : children}
    </AppShell>
  );
}
