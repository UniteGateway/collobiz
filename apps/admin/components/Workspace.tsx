'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon, type IconName } from '@collabiz/ui';
import type { WorkspaceApp } from '@collabiz/types';

/** Address of the partner web app (same site, without the "admin." prefix; port 3000 locally). */
export function webUrl(path: string) {
  if (typeof window === 'undefined') return path;
  const { protocol, hostname, port } = window.location;
  if (hostname.startsWith('admin.')) return `${protocol}//${hostname.slice(6)}${path}`;
  if (port === '3001') return `${protocol}//${hostname}:3000${path}`;
  return path;
}
/** Hrefs from the API use "web:/path" for pages in the partner web app. */
export const resolveHref = (h: string) => (h.startsWith('web:') ? webUrl(h.slice(4)) : h);
export const inr = (paise: number) => {
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${(r / 1_00_00_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  if (r >= 1_00_000) return `₹${(r / 1_00_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

const TABS: [string, string, IconName][] = [['/workspace', 'Home', 'home'], ['/workspace/apps', 'Apps', 'package'], ['/workspace/companies', 'Companies', 'building'], ['/workspace/meet', 'Meet', 'calendar']];

/** Workspace header: section tabs and one search box across the platform. */
export function WorkspaceNav() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <div className="cz-ws-nav">
      <nav aria-label="Workspace">
        {TABS.map(([href, label, icon]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}><Icon name={icon} size={16} />{label}</Link>)}
        <a href={webUrl('/inbox')}><Icon name="messages" size={16} />Connect</a>
      </nav>
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) router.push(`/workspace/search?q=${encodeURIComponent(q.trim())}`); }}>
        <Icon name="search" size={16} />
        <input aria-label="Search the workspace" placeholder="Search companies, partners, projects, businesses…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
    </div>
  );
}

export function Hero({ eyebrow, title, accent, sub, chips }: { eyebrow?: string; title: string; accent?: string; sub: string; chips?: string[] }) {
  return (
    <section className="cz-ws-hero">
      <div className="cz-ws-hero-text">
        {eyebrow && <span className="cz-ws-eyebrow">{eyebrow}</span>}
        <h1>{title}{accent && <> <span>{accent}</span></>}</h1>
        <p>{sub}</p>
        {chips && <ul>{chips.map((c) => <li key={c}><Icon name="check" size={14} />{c}</li>)}</ul>}
      </div>
      <img src="/brand/collabiz-mark.png" alt="" className="cz-ws-hero-mark" width={150} height={150} />
    </section>
  );
}

export function AppTile({ app, compact }: { app: WorkspaceApp; compact?: boolean }) {
  const href = app.href ? (app.app === 'web' ? webUrl(app.href) : app.href) : undefined;
  const body = (
    <>
      <span className={`cz-app-icon cz-tint-${app.tint}`}><Icon name={app.icon as IconName} size={compact ? 20 : 22} /></span>
      <span className="cz-app-text">
        <strong>{app.name}</strong>
        {!compact && <span>{app.description}</span>}
        {app.status !== 'live' && <em className={`cz-app-status cz-app-${app.status}`}>{compact ? (app.status === 'partial' ? 'Partly live' : `Phase ${app.phase}`) : app.status === 'partial' ? `Partly live · more in Phase ${app.phase}` : `Coming in Phase ${app.phase}`}</em>}
      </span>
    </>
  );
  const title = app.note ?? undefined;
  if (!href) return <div className="cz-app-tile" data-app={app.key} data-status={app.status} title={title} aria-disabled="true">{body}</div>;
  return app.app === 'web'
    ? <a className="cz-app-tile" data-app={app.key} data-status={app.status} href={href} title={title}>{body}</a>
    : <Link className="cz-app-tile" data-app={app.key} data-status={app.status} href={href} title={title}>{body}</Link>;
}
