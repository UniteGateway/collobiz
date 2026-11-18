'use client';
import { THEME_PHOTO, photo } from '@/lib/photos';
/**
 * Dashboard building blocks: a business-domain hero with a code-drawn illustration, a dependency-free area chart,
 * the ad carousel, news and video cards. All decoration is hidden from screen readers and stops moving for users who
 * prefer reduced motion.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@collabiz/ui';
import { api } from '@/lib/api';

export type Theme = 'energy' | 'build' | 'trade' | 'industry' | 'advisory' | 'collabiz';

/** Scene for each business domain: drawn in SVG so it is crisp, light and needs no outside image host. */
function Scene({ theme }: { theme: Theme }) {
  const common = { className: 'cz-scene', viewBox: '0 0 360 220', 'aria-hidden': true } as const;
  if (theme === 'energy') return (
    <svg {...common}>
      <circle className="cz-sun" cx="270" cy="62" r="30" />
      {Array.from({ length: 10 }, (_, i) => <line key={i} className="cz-ray" x1="270" y1="62" x2={270 + 52 * Math.cos((i * Math.PI) / 5)} y2={62 + 52 * Math.sin((i * Math.PI) / 5)} />)}
      <g className="cz-turbine" transform="translate(70 70)"><line x1="0" y1="0" x2="0" y2="120" className="cz-mast" /><g className="cz-blades"><path d="M0 0 L4 -46 L-4 -46 Z" /><path d="M0 0 L4 -46 L-4 -46 Z" transform="rotate(120)" /><path d="M0 0 L4 -46 L-4 -46 Z" transform="rotate(240)" /></g><circle r="5" /></g>
      {[0, 1, 2].map((r) => <g key={r} transform={`translate(${130 + r * 62} ${150 - r * 4})`}><path className="cz-panel" d="M0 40 L18 0 L70 0 L52 40 Z" /><path className="cz-panel-line" d="M9 20 L61 20 M35 0 L26 40" /></g>)}
      <path className="cz-ground" d="M0 200 Q 180 180 360 200 L360 220 L0 220 Z" />
    </svg>
  );
  if (theme === 'build') return (
    <svg {...common}>
      {[[40, 90, 50], [100, 60, 60], [170, 110, 44], [224, 40, 56]].map(([x, y, w], i) => <g key={i}><rect className="cz-bldg" x={x} y={y} width={w} height={200 - y} rx="4" />{Array.from({ length: Math.floor((200 - y) / 22) }, (_, j) => <rect key={j} className="cz-win" x={x + 8} y={y + 10 + j * 22} width={w - 16} height="8" rx="2" style={{ animationDelay: `${(i + j) * 0.4}s` }} />)}</g>)}
      <g className="cz-crane"><line x1="310" y1="200" x2="310" y2="30" /><line x1="250" y1="34" x2="350" y2="34" /><line className="cz-hook" x1="270" y1="34" x2="270" y2="90" /><rect className="cz-load" x="260" y="90" width="20" height="14" rx="2" /></g>
      <path className="cz-ground" d="M0 200 L360 200 L360 220 L0 220 Z" />
    </svg>
  );
  if (theme === 'trade') return (
    <svg {...common}>
      <path className="cz-route" d="M20 170 C 90 80, 170 200, 240 110 S 330 60, 350 70" />
      {[[40, 150], [150, 140], [250, 100], [340, 66]].map(([x, y], i) => <circle key={i} className="cz-node" cx={x} cy={y} r="7" style={{ animationDelay: `${i * 0.5}s` }} />)}
      <g className="cz-truck"><rect x="0" y="0" width="70" height="38" rx="5" /><rect className="cz-cab" x="70" y="12" width="28" height="26" rx="4" /><circle cx="18" cy="42" r="8" /><circle cx="82" cy="42" r="8" /></g>
      {[[220, 160], [244, 160], [232, 138]].map(([x, y], i) => <rect key={i} className="cz-box" x={x} y={y} width="24" height="22" rx="3" />)}
      <path className="cz-ground" d="M0 205 L360 205 L360 220 L0 220 Z" />
    </svg>
  );
  if (theme === 'industry') return (
    <svg {...common}>
      <path className="cz-bldg" d="M30 200 L30 120 L80 95 L80 120 L130 95 L130 120 L180 95 L180 200 Z" />
      <rect className="cz-bldg" x="190" y="60" width="22" height="140" rx="3" /><rect className="cz-bldg" x="222" y="80" width="18" height="120" rx="3" />
      {[0, 1, 2].map((i) => <circle key={i} className="cz-smoke" cx={201} cy={50 - i * 16} r={8 + i * 4} style={{ animationDelay: `${i * 0.9}s` }} />)}
      <g className="cz-gear" transform="translate(300 120)"><circle r="26" /><circle className="cz-gear-hole" r="9" />{Array.from({ length: 8 }, (_, i) => <rect key={i} x="-5" y="-36" width="10" height="12" rx="2" transform={`rotate(${i * 45})`} />)}</g>
      <path className="cz-ground" d="M0 200 L360 200 L360 220 L0 220 Z" />
    </svg>
  );
  if (theme === 'advisory') return (
    <svg {...common}>
      <rect className="cz-board" x="40" y="40" width="200" height="130" rx="12" />
      <path className="cz-chart-line" d="M60 145 L100 120 L140 130 L180 90 L220 70" />
      {[[60, 145], [100, 120], [140, 130], [180, 90], [220, 70]].map(([x, y], i) => <circle key={i} className="cz-node" cx={x} cy={y} r="5" style={{ animationDelay: `${i * 0.4}s` }} />)}
      {[[290, 70], [320, 120], [270, 150]].map(([x, y], i) => <g key={i}><line className="cz-link" x1="240" y1="105" x2={x} y2={y} /><circle className="cz-person" cx={x} cy={y} r="12" /></g>)}
    </svg>
  );
  return (
    <svg {...common}>
      {[[60, 60], [150, 40], [250, 70], [310, 150], [200, 140], [100, 160]].map(([x, y], i, a) => <g key={i}><line className="cz-link" x1={x} y1={y} x2={a[(i + 1) % a.length][0]} y2={a[(i + 1) % a.length][1]} /><line className="cz-link" x1={x} y1={y} x2="190" y2="100" /></g>)}
      <circle className="cz-hub" cx="190" cy="100" r="22" />
      {[[60, 60], [150, 40], [250, 70], [310, 150], [200, 140], [100, 160]].map(([x, y], i) => <circle key={i} className="cz-node" cx={x} cy={y} r="9" style={{ animationDelay: `${i * 0.35}s` }} />)}
    </svg>
  );
}

export function ThemeHero({ theme, themeLabel, eyebrow, title, children, actions }: { theme: Theme; themeLabel: string; eyebrow?: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="cz-dhero" data-theme={theme} aria-labelledby="dhero-h">
      <div className="cz-dhero-text">
        {eyebrow && <span className="cz-dhero-eyebrow">{eyebrow}</span>}
        <h1 id="dhero-h">{title}</h1>
        {children}
        {actions && <div className="cz-dhero-actions">{actions}</div>}
        <span className="cz-dhero-chip"><Icon name="sector" size={14} />{themeLabel}</span>
      </div>
      <img className="cz-dhero-photo" src={photo(THEME_PHOTO[theme] ?? THEME_PHOTO.collabiz)} alt="" aria-hidden fetchPriority="high" />
    </section>
  );
}

/** Area chart with gradient fill. A visually hidden table carries the same numbers for screen readers. */
export function AreaChart({ labels, values, format, label, tone = 'navy' }: { labels: string[]; values: number[]; format: (n: number) => string; label: string; tone?: 'navy' | 'green' | 'sun' }) {
  const W = 320, H = 120, max = Math.max(1, ...values);
  const pts = values.map((v, i) => [12 + (i * (W - 24)) / Math.max(1, values.length - 1), H - 14 - (v / max) * (H - 30)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const id = `g-${label.replace(/\W+/g, '')}`;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure className="cz-area" data-tone={tone}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${labels.map((l, i) => `${l} ${format(values[i])}`).join(', ')}`}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" className="cz-area-top" /><stop offset="100%" className="cz-area-bot" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="cz-area-grid" x1="0" x2={W} y1={H - 14 - f * (H - 30)} y2={H - 14 - f * (H - 30)} />)}
        <path d={`${line} L${pts[pts.length - 1][0]} ${H - 14} L${pts[0][0]} ${H - 14} Z`} fill={`url(#${id})`} />
        <path className="cz-area-line" d={line} />
        {pts.map(([x, y], i) => <circle key={i} className="cz-area-dot" cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5} />)}
      </svg>
      <figcaption className="cz-area-x">{labels.map((l) => <span key={l}>{l}</span>)}</figcaption>
      {!total && <p className="cz-area-empty">No activity in the last six months yet.</p>}
    </figure>
  );
}

export interface Ad { id: string; title: string; body: string | null; url: string; ctaLabel: string | null; hasImage: boolean; house?: boolean }
/** Ad slot: Unite-booked ads (or Unite's own programmes when none are booked), rotating every 7 seconds. */
export function AdCarousel({ ads, theme }: { ads: Ad[]; theme: Theme }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (ads.length < 2 || paused || still) return;
    const t = setInterval(() => setI((x) => (x + 1) % ads.length), 7000);
    return () => clearInterval(t);
  }, [ads.length, paused]);
  if (!ads.length) return null;
  const a = ads[Math.min(i, ads.length - 1)];
  const click = () => { if (!a.house) api.post(`/me/home/content/${a.id}/click`).catch(() => undefined); };
  return (
    <section className="cz-ad" data-theme={theme} aria-roledescription="carousel" aria-label={a.house ? 'From Unite' : 'Sponsored by Unite'} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {a.hasImage && <img className="cz-ad-img" src={`/api/v1/me/home/content/${a.id}/image`} alt="" />}
      <div className="cz-ad-body" aria-live="polite">
        <span className="cz-ad-tag">{a.house ? 'From Unite' : 'Sponsored'}</span>
        <h2>{a.title}</h2>
        {a.body && <p>{a.body}</p>}
        {a.url.startsWith('/') ? <Link className="cz-btn cz-btn-primary cz-btn-sm" href={a.url} onClick={click}>{a.ctaLabel ?? 'Learn more'}</Link>
          : <a className="cz-btn cz-btn-primary cz-btn-sm" href={a.url} target="_blank" rel="noopener noreferrer sponsored" onClick={click}>{a.ctaLabel ?? 'Learn more'}</a>}
      </div>
      {ads.length > 1 && <div className="cz-ad-dots" role="tablist" aria-label="Choose slide">{ads.map((x, k) => <button key={x.id} type="button" role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}: ${x.title}`} onClick={() => setI(k)} />)}</div>}
    </section>
  );
}

export interface News { id: string; title: string; body: string; important: boolean; publishedAt: string }
export function NewsCard({ news }: { news: News[] }) {
  return (
    <section className="cz-card cz-news" aria-labelledby="news-h">
      <div className="cz-card-head"><h2 id="news-h">News from Unite</h2><Link href="/announcements" className="cz-link-arrow">All news<Icon name="arrow" size={14} /></Link></div>
      {news.length ? (
        <ul>{news.map((n) => <li key={n.id}><span className="cz-news-date">{new Date(n.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span><span><strong>{n.important ? '● ' : ''}{n.title}</strong><span className="cz-muted">{n.body}</span></span></li>)}</ul>
      ) : <p className="cz-muted" style={{ margin: 0 }}>Announcements from Unite appear here.</p>}
    </section>
  );
}

export interface Video { id: string; title: string; body: string | null; embed: string | null }
/** Video slot: the first Unite video plays inline (privacy-enhanced player, loaded only when asked); others are listed. */
export function VideoCard({ videos }: { videos: Video[] }) {
  const [play, setPlay] = useState(false);
  const v = videos[0];
  return (
    <section className="cz-card cz-video" aria-labelledby="video-h">
      <div className="cz-card-head"><h2 id="video-h">Watch</h2></div>
      {v?.embed ? (
        <>
          <div className="cz-video-frame">
            {play ? <iframe src={`${v.embed}?autoplay=1`} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
              : <button type="button" className="cz-video-poster" onClick={() => { setPlay(true); api.post(`/me/home/content/${v.id}/click`).catch(() => undefined); }} aria-label={`Play video: ${v.title}`}><span className="cz-play"><Icon name="next" size={26} /></span></button>}
          </div>
          <p style={{ margin: '10px 0 0', fontWeight: 600 }}>{v.title}</p>
          {v.body && <p className="cz-muted" style={{ margin: '2px 0 0', fontSize: 13.5 }}>{v.body}</p>}
          {videos.slice(1).map((x) => <p key={x.id} className="cz-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Also: {x.title}</p>)}
        </>
      ) : (
        <div className="cz-video-empty"><span className="cz-play cz-play-muted"><Icon name="next" size={22} /></span><p className="cz-muted">Product demos and how-to videos from Unite will play here.</p></div>
      )}
    </section>
  );
}
