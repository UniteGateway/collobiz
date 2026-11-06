'use client';
import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SCREENS, SCREEN_STATUS } from '@collabiz/types';
import { AppShell, Button, LoadingState, PermissionDenied, Alert, ButtonLink } from '@collabiz/ui';
import { useSession } from '@/lib/session';

const LIVE = new Set(['implemented', 'verified']);
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
    items: g.ids.map((id) => SCREENS.find((s) => s.id === id)!).filter((s) => LIVE.has(SCREEN_STATUS[s.id]?.status ?? '')).map((s) => ({ href: s.route, label: s.title })),
  })).filter((g) => g.items.length);
  const initials = me.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <AppShell brandLabel="collabiz admin" topNav={[{ href: '/', label: 'Dashboard' }, { href: '/verification', label: 'Verification' }, { href: '/routing', label: 'Routing' }, { href: '/finance', label: 'Finance' }]}
      sections={[{ items: [{ href: '/', label: 'Executive dashboard' }, { href: '/opportunities', label: 'Opportunity publishing' }] }, ...sections]} currentPath={path} userInitials={initials}
      userMenu={<Button variant="ghost" size="sm" style={{ color: '#fff' }} onClick={logout}>Sign out</Button>}>
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
