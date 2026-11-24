/**
 * Corporate page building blocks for the public inner pages: a large hero (three layouts, eight colour tones so each
 * module looks different), a photo mosaic, alternating image + text features and a stat row. Server-safe (no hooks).
 * Photos are the bundled royalty-free set in /public/photos (see lib/photos.ts) or brand images.
 */
import React from 'react';

export type HeroTone = 'navy' | 'forest' | 'sunrise' | 'ocean' | 'earth' | 'plum' | 'graphite' | 'teal';
export type HeroLayout = 'cover' | 'split' | 'band';
const src = (p: string) => (p.startsWith('/') ? p : `/photos/${p}.webp`);

export function PageHero({ eyebrow, title, lead, image, imageAlt = '', second, tone = 'navy', layout = 'cover', actions, stats, children }: {
  eyebrow?: string; title: React.ReactNode; lead?: React.ReactNode; image: string; imageAlt?: string; second?: string; tone?: HeroTone; layout?: HeroLayout;
  actions?: React.ReactNode; stats?: [React.ReactNode, string][]; children?: React.ReactNode;
}) {
  const text = (
    <div className="cz-ph-text">
      {eyebrow && <p className="cz-ph-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {lead && <p className="cz-ph-lead">{lead}</p>}
      {actions && <div className="cz-ph-actions">{actions}</div>}
      {children}
    </div>
  );
  const statRow = stats?.length ? <dl className="cz-ph-stats">{stats.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl> : null;
  if (layout === 'split') return (
    <header className={`cz-ph cz-ph-split cz-tone-${tone}`} data-hero="split">
      <div className="cz-ph-inner">
        {text}
        <div className="cz-ph-media">
          <img src={src(image)} alt={imageAlt} className="cz-ph-main" fetchPriority="high" />
          {second && <img src={src(second)} alt="" className="cz-ph-float" loading="lazy" />}
        </div>
      </div>
      {statRow && <div className="cz-ph-inner">{statRow}</div>}
    </header>
  );
  if (layout === 'band') return (
    <header className={`cz-ph cz-ph-band cz-tone-${tone}`} data-hero="band">
      <div className="cz-ph-inner cz-ph-center">{text}{statRow}</div>
      <div className="cz-ph-strip">
        <img src={src(image)} alt={imageAlt} fetchPriority="high" />
        {second && <img src={src(second)} alt="" loading="lazy" />}
      </div>
    </header>
  );
  return (
    <header className={`cz-ph cz-ph-cover cz-tone-${tone}`} data-hero="cover" style={{ '--cz-ph-img': `url(${src(image)})` } as React.CSSProperties}>
      <div className="cz-ph-inner">{text}{statRow}</div>
    </header>
  );
}

/** Four or five photos in an asymmetric grid — fills the width with no gaps. */
export function PhotoMosaic({ photos, label }: { photos: (string | [string, string])[]; label?: string }) {
  const list = photos.map((p) => (Array.isArray(p) ? p : [p, ''] as [string, string]));
  return (
    <figure className={`cz-mosaic cz-mosaic-${Math.min(list.length, 5)}`} aria-label={label}>
      {list.slice(0, 5).map(([p, alt], i) => <img key={p + i} src={src(p)} alt={alt} loading="lazy" decoding="async" />)}
    </figure>
  );
}

/** A large image with text beside it; alternate `reverse` down the page. */
export function ImageFeature({ image, imageAlt = '', eyebrow, title, children, reverse, tone }: { image: string; imageAlt?: string; eyebrow?: string; title: React.ReactNode; children: React.ReactNode; reverse?: boolean; tone?: HeroTone }) {
  return (
    <section className={`cz-feature${reverse ? ' is-reverse' : ''}${tone ? ` cz-tone-${tone}` : ''}`}>
      <img src={src(image)} alt={imageAlt} loading="lazy" decoding="async" />
      <div>{eyebrow && <p className="cz-ph-eyebrow">{eyebrow}</p>}<h2>{title}</h2>{children}</div>
    </section>
  );
}

/** Photo cards: image on top, title and text below (for steps, levels, benefits). */
export function PhotoCards({ items }: { items: { image: string; title: React.ReactNode; text: React.ReactNode; href?: string; badge?: string }[] }) {
  return (
    <div className="cz-photo-cards">
      {items.map((x, i) => {
        const inner = <><div className="cz-pc-img"><img src={src(x.image)} alt="" loading="lazy" decoding="async" />{x.badge && <span>{x.badge}</span>}</div><div className="cz-pc-body"><h3>{x.title}</h3><p>{x.text}</p></div></>;
        return x.href ? <a key={i} className="cz-photo-card" href={x.href}>{inner}</a> : <article key={i} className="cz-photo-card">{inner}</article>;
      })}
    </div>
  );
}

/** Full-width closing call to action on a photo. */
export function PhotoCta({ image, title, text, children }: { image: string; title: React.ReactNode; text?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="cz-photo-cta" style={{ '--cz-ph-img': `url(${src(image)})` } as React.CSSProperties}>
      <div><h2>{title}</h2>{text && <p>{text}</p>}{children && <div className="cz-ph-actions">{children}</div>}</div>
    </section>
  );
}
