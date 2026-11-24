'use client';
/**
 * Admin-managed website content on every page: social links (large footer + strip in the app) and YouTube videos placed
 * on a page by Unite admins (Admin → Website content). Videos load a thumbnail first; the player (youtube-nocookie)
 * loads only when the visitor presses play. Nothing renders when nothing is set, so pages never show empty boxes.
 */
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SOCIAL_NETWORKS, type SocialKey, type SocialLinks } from '@collabiz/types';
import { api } from '@/lib/api';

export interface SiteVideo { youtubeId: string; title: string; description: string | null; placements: string[] }
interface Site { social: SocialLinks; videos: SiteVideo[] }

let cache: Site | null = null;
let pending: Promise<Site> | null = null;
const listeners = new Set<(s: Site) => void>();
function loadSite() {
  if (!pending) pending = api.get<Site>('/public/site').then((s) => { cache = s; listeners.forEach((l) => l(s)); return s; }).catch(() => { pending = null; return { social: {}, videos: [] }; });
  return pending;
}
/** Refresh after an admin edits content. */
export function reloadSite() { pending = null; return loadSite(); }
export function useSite(): Site | null {
  const [s, setS] = useState<Site | null>(cache);
  useEffect(() => { listeners.add(setS); if (!cache) loadSite(); return () => { listeners.delete(setS); }; }, []);
  return s;
}

const ICON: Record<SocialKey, React.ReactNode> = {
  facebook: <path d="M14 8.5V7c0-.7.4-1 1-1h2V2.5h-3C11.2 2.5 10 4.4 10 7v1.5H7.5V12H10v9.5h4V12h2.8l.7-3.5z" fill="currentColor" />,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" /></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" /><path d="M10 9v6l5.2-3z" fill="var(--cz-social-bg, #011E48)" /></>,
  linkedin: <path d="M3.5 9h4v12h-4zM5.5 2.8a2.3 2.3 0 110 4.6 2.3 2.3 0 010-4.6zM10 9h3.8v1.7h.1c.5-1 1.8-2.1 3.8-2.1 4 0 4.8 2.7 4.8 6.1V21h-4v-5.5c0-1.3 0-3-1.8-3-1.9 0-2.2 1.4-2.2 2.9V21H10z" fill="currentColor" />,
  x: <path d="M3.5 3h5l4.2 5.8L17.8 3h2.6l-6.5 7.4L21 21h-5l-4.6-6.3L5.8 21H3.2l7-8z" fill="currentColor" />,
  whatsapp: <><path d="M12 2.5a9.5 9.5 0 00-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1012 2.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M8.6 7.6c.3-.5.6-.5.9-.5h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.6.8c-.2.2-.2.4 0 .6.7 1.2 1.6 2.1 2.8 2.7.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.6-.1l1.8.9c.3.1.4.3.4.5 0 .5-.2 1.4-1 1.9-.7.4-1.8.6-3.6-.2-2.3-1-3.9-3.1-4.4-4-.5-.8-.9-2-.3-3z" fill="currentColor" /></>,
  telegram: <path d="M21.5 3.5L2.8 10.7c-1 .4-1 1.6 0 1.9l4.6 1.5 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.7.5 1.6.1 1.8-.7l3-15.5c.2-1-.7-1.8-1.6-1.5zM9.6 14.2l8.6-7.6-6.8 8.9-.4 3z" fill="currentColor" />,
};

/** Social icons for the links admins have set (none shown when none are set — never placeholder links). */
export function SocialIcons({ size = 'lg', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const s = useSite();
  const links = SOCIAL_NETWORKS.filter((n) => s?.social?.[n.key]);
  if (!links.length) return null;
  return (
    <ul className={`cz-social cz-social-${size} ${className}`} aria-label="Unite Group on social media" data-social>
      {links.map((n) => (
        <li key={n.key}><a href={s!.social[n.key]} target="_blank" rel="noopener noreferrer" aria-label={`${n.label} (opens in a new tab)`} data-network={n.key}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>{ICON[n.key]}</svg><span>{n.label}</span>
        </a></li>
      ))}
    </ul>
  );
}

/** One video: thumbnail with a play button; the YouTube player loads on click. */
export function VideoFrame({ v, large }: { v: SiteVideo; large?: boolean }) {
  const [play, setPlay] = useState(false);
  return (
    <figure className={`cz-video${large ? ' is-large' : ''}`} data-video={v.youtubeId}>
      <div className="cz-video-frame">
        {play ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}?autoplay=1&rel=0&modestbranding=1`} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <button type="button" onClick={() => setPlay(true)} aria-label={`Play video: ${v.title}`}>
            <img src={`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" />
            <span className="cz-video-play" aria-hidden><svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
          </button>
        )}
      </div>
      <figcaption><strong>{v.title}</strong>{v.description && <span>{v.description}</span>}</figcaption>
    </figure>
  );
}

/** Placement key for a path: "/" → home, /businesses/<slug> → product:<slug>, app modules → module:<first segment>, else page:<path>. */
export function placementsFor(path: string, app = false): string[] {
  if (path === '/') return ['home'];
  const seg = path.split('/').filter(Boolean);
  if (app) return [`module:${seg[0] ?? 'dashboard'}`];
  if (seg[0] === 'businesses' && seg[1]) return [`product:${seg[1]}`, `page:${path}`];
  return [`page:${path}`];
}

/** Videos placed on this page by admins — a featured player plus the rest beside it. Renders nothing if none. */
export function PageVideos({ placement, app, heading = 'Watch' }: { placement?: string; app?: boolean; heading?: string }) {
  const path = usePathname() ?? '/';
  const s = useSite();
  const keys = placement ? [placement] : placementsFor(path, app);
  const vids = (s?.videos ?? []).filter((v) => v.placements.some((p) => keys.includes(p)));
  if (!vids.length) return null;
  const [first, ...rest] = vids;
  return (
    <section className={`cz-videos${app ? ' is-app' : ''}`} aria-labelledby="cz-videos-h" data-videos={vids.length}>
      <div className="cz-container">
        <h2 id="cz-videos-h">{heading}</h2>
        <div className={rest.length ? 'cz-videos-grid' : 'cz-videos-one'}>
          <VideoFrame v={first} large />
          {rest.length > 0 && <div className="cz-videos-rest">{rest.slice(0, 6).map((v) => <VideoFrame key={v.youtubeId} v={v} />)}</div>}
        </div>
      </div>
    </section>
  );
}

/** Bottom of every signed-in page: social links and the main help links, on one line. */
export function AppFooter() {
  return (
    <footer className="cz-app-footer" data-app-footer>
      <SocialIcons size="md" />
      <nav aria-label="Footer"><a href="/help">Help</a><a href="/umeet">U meet</a><a href="/support/contact">Contact Unite</a><a href="/club/terms">Terms</a><a href="/settings/privacy">Privacy</a></nav>
      <span>© {new Date().getFullYear()} Unite Group · COLLABIZ</span>
    </footer>
  );
}
