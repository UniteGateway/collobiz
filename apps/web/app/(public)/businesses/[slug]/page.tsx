'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appBrand } from '@collabiz/types';
import { ButtonLink, EmptyState, ErrorState, Icon, LoadingState } from '@collabiz/ui';
import { VentureMark, stageLabel } from '@/components/Ventures';
import { ProductEnquiry, ProductTile, STATUS_LABEL, SolarLeadForm, WorkPanel, groupName, stagePill, worksWith, type Product } from '@/components/Products';
import { SOLAR_LEAD_SOURCES } from '@collabiz/types';
import { useEffect, useState } from 'react';
import { venturePhoto } from '@/lib/photos';
import { isNotFound, useQuery } from '@/lib/hooks';

const IC: Record<string, string> = { doc: 'documents', globe: 'map', search: 'search', sparkle: 'award', chart: 'earnings', grid: 'package', shield: 'verify', flag: 'bookmark', people: 'users', clock: 'clock', bell: 'bell', check: 'check', map: 'location' };

type P = Product & { work?: { open: number; done: number } | null; related: { slug: string; name: string; sector: string; tagline: string; stage: string }[] };

/** A Unite product's own page: overview, features, what it works with, and an enquiry form wired into COLLABIZ. */
export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<P>(`/public/products/${slug}`);
  // Partner link: /businesses/<slug>?ref=CODE — kept for this visit so the enquiry is credited to the partner.
  const [ref, setRef] = useState<string | undefined>();
  const [mode, setMode] = useState<'solar' | 'general'>('solar');
  useEffect(() => { const r = new URLSearchParams(window.location.search).get('ref'); if (r && /^[A-Za-z0-9]{4,12}$/.test(r)) setRef(r.toUpperCase()); }, []);
  if (q.loading) return <div className="cz-gp-body"><LoadingState /></div>;
  if (q.error) return <div className="cz-gp-body">{isNotFound(q.error)
    ? <EmptyState title="Product not found"><Link href="/businesses">See all Unite products</Link></EmptyState> : <ErrorState error={q.error} onRetry={q.reload} />}</div>;
  const p = q.data!;
  const b = appBrand(p.slug);
  const pill = stagePill(p.stage);
  const summary = p.summary.replace(/\s*www\.[^\s]+$/, '');
  const accent = b?.accent ?? ['#0B3D91', '#1F9D55'];
  return (
    <div className="cz-gp cz-gp-product" style={{ ['--a1' as string]: accent[0], ['--a2' as string]: accent[1] }} data-screen="product">
      <nav className="cz-gp-subnav" aria-label={`${p.name} page`}>
        <div className="cz-gp-subnav-in">
          <Link href="/businesses" className="cz-gp-subnav-brand"><VentureMark name={p.name} sector={p.sector} slug={p.slug} size={30} /><span>{p.name}</span></Link>
          <div className="cz-gp-subnav-links"><a href="#overview">Overview</a>{b?.features?.length ? <a href="#features">Features</a> : null}<a href="#works-with">Works with</a><a href="#contact">Contact</a></div>
          <a href="#contact" className="cz-btn cz-btn-primary cz-btn-sm">{p.stage === 'live' || p.stage === 'pilot' ? 'Get started' : 'Register interest'}</a>
        </div>
      </nav>

      <section id="overview" className="cz-gp-phero">
        <div className="cz-gp-phero-text">
          <p className="cz-gp-crumb"><Link href="/businesses">Unite products</Link> <span aria-hidden>›</span> {groupName(p.sector)}</p>
          <h1>{p.name}</h1>
          <p className="cz-gp-phero-tag">{p.tagline}</p>
          <p className="cz-gp-lede">{summary}</p>
          <div className="cz-row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <a href="#contact" className="cz-btn cz-btn-primary">{p.stage === 'live' || p.stage === 'pilot' ? 'Talk to the team' : 'Notify me at launch'}</a>
            {b?.website && <a className="cz-btn cz-btn-secondary" href={b.website} target="_blank" rel="noopener noreferrer">Visit {b.website.replace(/^https?:\/\//, '')} <Icon name="external" size={14} /></a>}
          </div>
          <dl className="cz-gp-facts">
            <div><dt>Status</dt><dd><span className={`cz-gp-pill cz-gp-pill-${pill.tone}`}>{pill.label}</span></dd></div>
            <div><dt>Category</dt><dd>{p.category}</dd></div>
            {p.company && <div><dt>Operated by</dt><dd>{p.company}</dd></div>}
          </dl>
        </div>
        <div className="cz-gp-phero-media">
          <img src={b?.artwork ?? venturePhoto(p.slug, p.sector)} alt={b?.artwork ? `${p.name} artwork` : ''} />
          {!b?.artwork && <span className="cz-gp-phero-logo">{b?.logo ? <img src={b.logo} alt={`${p.name} logo`} /> : <VentureMark name={p.name} sector={p.sector} size={64} />}</span>}
        </div>
      </section>

      <div className="cz-gp-body">
        {b?.features?.length ? (
          <section id="features" className="cz-gp-section" aria-labelledby="f-h">
            <h2 id="f-h">{b.features.every((x) => x.planned) ? `Planned for ${p.name}` : `What you can do with ${p.name}`}</h2>
            {b.features.some((x) => x.planned) && <p className="cz-muted" style={{ marginTop: -6 }}>Features marked “Planned” are on the roadmap and not available yet.</p>}
            <ul className="cz-gp-features">{b.features.map((x) => <li key={x.title}><span className="cz-gp-ficon"><Icon name={(IC[x.icon] ?? 'check') as never} size={20} /></span><strong>{x.title}</strong>{x.text ? <p>{x.text}</p> : null}{x.planned && <span className="cz-gp-pill cz-gp-pill-soon">Planned</span>}</li>)}</ul>
          </section>
        ) : null}

        {b?.workflow?.length ? (
          <section className="cz-gp-section" aria-labelledby="w-h">
            <h2 id="w-h">How it works</h2>
            <ol className="cz-gp-steps">{b.workflow.map((x, i) => <li key={x.title}><span>{i + 1}</span><strong>{x.title}</strong><p>{x.text}</p></li>)}</ol>
          </section>
        ) : null}

        <section id="works-with" className="cz-gp-section" aria-labelledby="ww-h">
          <h2 id="ww-h">Works with</h2>
          <p className="cz-muted" style={{ marginTop: -6 }}>How {p.name} connects to COLLABIZ. “Connected” is live today; “Next” is the planned integration and “Not yet” is waiting on the business, so neither is available yet.</p>
          <ul className="cz-gp-int">{worksWith(p).map((x) => (
            <li key={x.title}><span className="cz-gp-int-icon" aria-hidden>{x.icon}</span><div><strong>{x.title}</strong><p>{x.text}</p></div><span className={`cz-gp-int-st cz-gp-int-${x.status}`}>{STATUS_LABEL[x.status]}</span></li>
          ))}</ul>
          {p.related.length > 0 && <>
            <h3 className="cz-gp-h3">More in {groupName(p.sector)}</h3>
            <ul className="cz-gp-grid">{p.related.map((r) => <li key={r.slug}><ProductTile p={r} /></li>)}</ul>
          </>}
        </section>

        {p.work && (
          <section className="cz-gp-section" aria-labelledby="work-h">
            <h2 id="work-h">Post or find work</h2>
            <WorkPanel p={p} work={p.work} />
          </section>
        )}

        <section id="contact" className="cz-gp-section cz-gp-contact" aria-labelledby="c-h">
          <div>
            {(SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug) ? <>
              <h2 id="c-h">Get a solar quote</h2>
              <p className="cz-muted">{p.name} sends your request to the Unite Solar desk. A solar adviser calls you within two working days to check your roof and bill. There is no charge for the quote.</p>
            </> : <>
              <h2 id="c-h">{p.stage === 'live' || p.stage === 'pilot' ? `Get in touch with ${p.name}` : `Be first to hear about ${p.name}`}</h2>
              <p className="cz-muted">{stageLabel(p.stage)}. Your message goes to the {p.name} team in COLLABIZ and you get a reference number by email.</p>
            </>}
            {p.open && <p className="cz-muted">Run a business? <ButtonLink href="/onboarding/account-type" variant="ghost" size="sm">Partner with {p.name}</ButtonLink></p>}
          </div>
          {(SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug) ? (
            <div className="cz-stack" style={{ gap: 12 }}>
              <div className="cz-gp-seg" role="group" aria-label="Type of request">
                <label className={mode === 'solar' ? 'is-on' : ''}><input type="radio" name="mode" checked={mode === 'solar'} onChange={() => setMode('solar')} />Solar quote</label>
                <label className={mode === 'general' ? 'is-on' : ''}><input type="radio" name="mode" checked={mode === 'general'} onChange={() => setMode('general')} />Other enquiry</label>
              </div>
              {mode === 'solar' ? <SolarLeadForm p={p} refCode={ref} /> : <ProductEnquiry p={p} refCode={ref} />}
            </div>
          ) : <ProductEnquiry p={p} refCode={ref} />}
        </section>
        <p className="cz-muted cz-gp-note">{p.stage === 'live' ? '' : `${p.name} is at an early stage and may be available only in some areas. `}Nothing on this page is an offer of investment, credit or financial products, and no earnings are guaranteed.</p>
      </div>
    </div>
  );
}
