'use client';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell, Button, Icon, UiLink } from '@collabiz/ui';
import { partnerNav } from '@/lib/navigation';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { api } from '@/lib/api';
import { openLiveStream, useLive } from '@/lib/live';

export function DemoRibbon() {
  const f = useQuery<{ demoMode?: boolean }>('/meta/features');
  if (!f.data?.demoMode) return null;
  return <div className="cz-demo-ribbon" role="note"><strong>Demonstration environment</strong> · Companies, people and figures shown are sample data for evaluation.</div>;
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { me, logout, switchOrg } = useSession();
  const alerts = useQuery<{ unread: number }>(me ? '/notifications' : null, { unread: 'true' });
  const initials = me?.fullName.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const orgs = me?.memberships.filter((m, i, a) => a.findIndex((x) => x.organizationId === m.organizationId) === i) ?? [];
  const unread = alerts.data?.unread ?? 0;
  // Presence for the Community "online now" list: a heartbeat each minute while the app is open and visible.
  useEffect(() => {
    if (!me) return;
    const beat = () => { if (document.visibilityState === 'visible') api.post('/community/heartbeat').catch(() => undefined); };
    beat();
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [me]);
  // Live updates: one stream per tab; a new notification refreshes the bell at once and shows a short toast.
  useEffect(() => (me ? openLiveStream() : undefined), [me]);
  const [toast, setToast] = useState<{ title: string; link: string | null } | null>(null);
  useLive((e) => {
    if (e.type !== 'notification') return;
    alerts.reload();
    setToast({ title: e.data.title, link: e.data.link });
    window.setTimeout(() => setToast(null), 6000);
  });
  const tools = me ? (
    <>
      <UiLink href="/search" className="cz-icon-btn" aria-label="Search"><Icon name="search" /></UiLink>
      <UiLink href="/notifications" className="cz-icon-btn" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}><Icon name="bell" />{unread > 0 && <span className="cz-dot">{unread > 99 ? '99+' : unread}</span>}</UiLink>
    </>
  ) : null;
  const menu = me ? (
    <div className="cz-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
      {orgs.length > 1 && (
        <label style={{ fontSize: 13 }}>
          <span className="cz-sr-only">Active organization</span>
          <select className="cz-select" style={{ minHeight: 34, padding: '4px 30px 4px 10px', width: 190, fontSize: 13 }} value={me.activeOrg?.id ?? ''} onChange={(e) => switchOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.organizationId} value={o.organizationId}>{o.orgName}</option>)}
          </select>
        </label>
      )}
      <div className="cz-user">
        <div className="cz-user-text"><strong>{me.fullName}</strong><span>{me.activeOrg?.name ?? 'No organization yet'}</span></div>
        <span className="cz-avatar" aria-hidden>{initials}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out" className="cz-hide-sm"><Icon name="logout" size={16} /><span className="cz-sr-only">Sign out</span></Button>
    </div>
  ) : null;
  return (
    <AppShell sections={partnerNav(me)} currentPath={path} product="Partner" tools={tools} userMenu={menu} banner={<DemoRibbon />}
      sidebarFooter={me ? <><div className="cz-sidebar-user"><span className="cz-avatar" aria-hidden>{initials}</span><span><strong>{me.fullName}</strong><span>{me.activeOrg?.name ?? 'No organization yet'}</span></span></div><button type="button" className="cz-sidebar-signout" onClick={logout}><Icon name="logout" size={16} />Sign out</button></> : undefined}>
      {children}
      <div className="cz-toast-wrap" aria-live="polite">{toast && <UiLink href={toast.link ?? '/notifications'} className="cz-toast" onClick={() => setToast(null)}><Icon name="bell" size={16} />{toast.title}</UiLink>}</div>
    </AppShell>
  );
}
