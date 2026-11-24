import React from 'react';
import Link from 'next/link';
import { SCREENS } from '@collabiz/types';
import { PageHero, PhotoCta, type HeroLayout, type HeroTone } from './PageHero';

/** Each public listing screen gets its own hero photo, colour and layout so modules look distinct. */
const LOOK: Record<string, { image: string; second?: string; tone: HeroTone; layout: HeroLayout; eyebrow: string; cta: string }> = {
  '004': { image: 'global-city', tone: 'navy', layout: 'cover', eyebrow: 'Unite Group', cta: 'team-boardroom' },
  '005': { image: 'trade-warehouse', second: 'energy-panel-roof', tone: 'teal', layout: 'split', eyebrow: 'Catalogue', cta: 'trade-forklift' },
  '006': { image: 'build-site-team', second: 'build-engineers', tone: 'ocean', layout: 'band', eyebrow: 'Opportunities', cta: 'build-excavator' },
  '008': { image: 'team-success', second: 'deal-handshake', tone: 'sunrise', layout: 'split', eyebrow: 'Success stories', cta: 'collab-hands' },
  '009': { image: 'global-skyline', tone: 'graphite', layout: 'cover', eyebrow: 'Worldwide', cta: 'trade-ship' },
};

/** Container + hero + title for public (unauthenticated) registry screens. */
export function PublicScreen({ id, children, title, description }: { id: string; children: React.ReactNode; title?: string; description?: React.ReactNode }) {
  const def = SCREENS.find((s) => s.id === id)!;
  const look = LOOK[id];
  if (!look) return (
    <div className="cz-container cz-section" data-screen={id}>
      <h1>{title ?? def.title}</h1>
      {description && <p className="cz-muted" style={{ maxWidth: 780 }}>{description}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
  return (
    <div className="cz-page" data-screen={id}>
      <PageHero eyebrow={look.eyebrow} title={title ?? def.title} lead={description} image={look.image} second={look.second} tone={look.tone} layout={look.layout} />
      <div className="cz-container">
        <div className="cz-page-block">{children}</div>
        <PhotoCta image={look.cta} title="Work with Unite Group" text="Join free as a verified partner to see partner-only listings, apply for work and get paid on documented milestones.">
          <Link href="/start" className="cz-btn cz-btn-accent cz-btn-lg">Get started</Link><Link href="/support/contact" className="cz-btn cz-btn-secondary cz-btn-lg">Talk to us</Link>
        </PhotoCta>
      </div>
    </div>
  );
}
