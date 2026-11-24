'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { appBrand, type AppBrand, type AppFeature } from '@collabiz/types';
import { ButtonLink, EmptyState, ErrorState, Icon, LoadingState } from '@collabiz/ui';
import { VentureMark, stageLabel } from '@/components/Ventures';
import { ChannelApplyForm, ChannelMatcher } from '@/components/BrandChannels';
import { BiofixSchemes, ConnectorPanel, CourseShowcase, ProductEnquiry, type ConnectorView, ProductTile, ProjectShowcase, STATUS_LABEL, SolarLeadForm, WorkPanel, type ShowCourse, type ShowProject, groupName, stagePill, worksWith, type Product } from '@/components/Products';
import { SOLAR_LEAD_SOURCES, channelProduct, productSubdomain } from '@collabiz/types';
import { useEffect, useState } from 'react';
import { PhotoCards } from '@/components/PageHero';
import { venturePhoto } from '@/lib/photos';
import { isNotFound, useQuery } from '@/lib/hooks';

const url0 = (m: Record<string, string>) => Object.values(m)[0];
const IC: Record<string, string> = { doc: 'documents', globe: 'map', search: 'search', sparkle: 'award', chart: 'earnings', grid: 'package', shield: 'verify', flag: 'bookmark', people: 'users', clock: 'clock', bell: 'bell', check: 'check', map: 'location' };

type P = Product & { showcase?: { kind: 'property'; items: ShowProject[] } | { kind: 'courses'; items: ShowCourse[] } | null; work?: { open: number; done: number } | null; connector?: ConnectorView | null; channel?: boolean; brand?: { subdomain: string; logo?: string | null; heroImage?: string | null; features: { title: string; text: string; planned?: boolean }[]; workflow: { title: string; text: string }[]; range?: { title: string; text: string; image?: string; items: string[] }[]; benefits?: { title: string; items: string[] }[]; accent: string[] } | null; oem?: { status: string; partner: string | null } | null; related: { slug: string; name: string; sector: string; tagline: string; stage: string }[] };

/** A Unite product's own page: overview, features, what it works with, and an enquiry form wired into COLLABIZ. */
export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<P>(`/public/products/${slug}`);
  // Partner link: /businesses/<slug>?ref=CODE — kept for this visit so the enquiry is credited to the partner.
  const [ref, setRef] = useState<string | undefined>();
  const [mode, setMode] = useState<'solar' | 'general'>('solar');
  const [visit, setVisit] = useState<string | undefined>();
  const [ask, setAsk] = useState<string | undefined>();
  useEffect(() => { const r = new URLSearchParams(window.location.search).get('ref'); if (r && /^[A-Za-z0-9]{4,12}$/.test(r)) setRef(r.toUpperCase()); }, []);
  if (q.loading) return <div className="cz-gp-body"><LoadingState /></div>;
  if (q.error) return <div className="cz-gp-body">{isNotFound(q.error)
    ? <EmptyState title="Product not found"><Link href="/businesses">See all Unite products</Link></EmptyState> : <ErrorState error={q.error} onRetry={q.reload} />}</div>;
  const p = q.data!;
  // Built-in brand settings, overridden by what Unite admins set for a brand product in the admin console.
  const base = appBrand(p.slug);
  const b: AppBrand | undefined = p.brand ? { ...(base ?? { accent: [p.brand.accent[0], p.brand.accent[1]] as [string, string], features: [] }),
    ...(p.brand.logo ? { logo: p.brand.logo } : {}),
    ...(p.brand.features.length ? { features: p.brand.features.map((x): AppFeature => ({ ...x, icon: 'check' })) } : {}), ...(p.brand.workflow.length ? { workflow: p.brand.workflow } : {}) } : base;
  const pill = stagePill(p.stage);
  const summary = p.summary.replace(/\s*www\.[^\s]+$/, '');
  const accent = b?.accent ?? ['#0B3D91', '#1F9D55'];
  return (
    <div className="cz-gp cz-gp-product" style={{ ['--a1' as string]: accent[0], ['--a2' as string]: accent[1] }} data-screen="product">
      <nav className="cz-gp-subnav" aria-label={`${p.name} page`}>
        <div className="cz-gp-subnav-in">
          <Link href="/businesses" className="cz-gp-subnav-brand"><VentureMark name={p.name} sector={p.sector} slug={p.slug} size={30} /><span>{p.name}</span></Link>
          <div className="cz-gp-subnav-links"><a href="#overview">Overview</a>{b?.features?.length ? <a href="#features">Features</a> : null}{p.brand?.range?.length ? <a href="#range">Range</a> : null}{p.brand?.benefits?.length ? <a href="#benefits">Benefits</a> : null}<a href="#works-with">Works with</a><a href="#contact">Contact</a></div>
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
            {b?.app && <a className="cz-btn cz-btn-accent" href={b.app.signup} target="_blank" rel="noopener noreferrer" data-app-link="signup">Start free on {p.name} <Icon name="external" size={14} /></a>}
            {b?.app && <a className="cz-btn cz-btn-ghost" href={b.app.login} target="_blank" rel="noopener noreferrer" data-app-link="login">Log in to {p.name}</a>}
            {b?.website && <a className="cz-btn cz-btn-secondary" href={b.website} target="_blank" rel="noopener noreferrer">Visit {b.website.replace(/^https?:\/\//, '')} <Icon name="external" size={14} /></a>}
          </div>
          <dl className="cz-gp-facts">
            <div><dt>Status</dt><dd><span className={`cz-gp-pill cz-gp-pill-${pill.tone}`}>{pill.label}</span></dd></div>
            <div><dt>Category</dt><dd>{p.category}</dd></div>
            {p.company && <div><dt>Operated by</dt><dd>{p.company}</dd></div>}
            {process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN && <div><dt>Web address</dt><dd>{p.brand?.subdomain ?? productSubdomain(p.slug)}.{process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN}</dd></div>}
          </dl>
        </div>
        <div className="cz-gp-phero-media">
          <img src={b?.artwork ?? p.brand?.heroImage ?? venturePhoto(p.slug, p.sector)} alt={b?.artwork ? `${p.name} artwork` : p.brand?.heroImage ? `${p.name} product` : ''} className={p.brand?.heroImage ? 'cz-gp-phero-product' : undefined} />
          {!b?.artwork && <span className="cz-gp-phero-logo">{b?.logo ? <img src={b.logo} alt={`${p.name} logo`} /> : <VentureMark name={p.name} sector={p.sector} size={64} />}</span>}
        </div>
      </section>

      <div className="cz-gp-body">
        {b?.features?.length ? (
          <section id="features" className="cz-gp-section" aria-labelledby="f-h">
            <h2 id="f-h">{b.features.every((x) => x.planned) ? `Planned for ${p.name}` : `What you can do with ${p.name}`}</h2>
            {b.features.some((x) => x.planned) && <p className="cz-muted" style={{ marginTop: -6 }}>Features marked “Planned” are on the roadmap and not available yet.</p>}
            <ul className="cz-gp-features">{b.features.map((x) => <li key={x.title}><span className="cz-gp-ficon"><Icon name={(IC[x.icon] ?? 'check') as never} size={20} /></span><strong>{x.title}</strong>{x.text ? <p>{x.text}</p> : null}{x.planned && <span className="cz-gp-pill cz-gp-pill-soon">Planned</span>}{x.href && <a className="cz-gp-flink" href={x.href} target="_blank" rel="noopener noreferrer">Learn more on {new URL(x.href).host} <Icon name="external" size={13} /></a>}</li>)}</ul>
          </section>
        ) : null}

        {p.brand?.range?.length ? (
          <section id="range" className="cz-gp-section" aria-labelledby="range-h" data-brand-range>
            <h2 id="range-h">The {p.name} range</h2>
            <PhotoCards items={p.brand.range.map((r) => ({ image: r.image ?? p.brand?.heroImage ?? venturePhoto(p.slug, p.sector), title: r.title, text: <>{r.text}{r.items.length > 0 && <span className="cz-range-tags">{r.items.map((i) => <span key={i}>{i}</span>)}</span>}</> }))} />
          </section>
        ) : null}

        {p.brand?.benefits?.length ? (
          <section id="benefits" className="cz-gp-section" aria-labelledby="ben-h" data-brand-benefits>
            <h2 id="ben-h">Benefits at a glance</h2>
            <div className="cz-benefits">{p.brand.benefits.map((g, i) => (
              <article key={g.title} className={`cz-benefit cz-benefit-${i % 4}`}><h3>{g.title}</h3><ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul></article>
            ))}</div>
          </section>
        ) : null}

        {b?.industryPages && (
          <section className="cz-gp-section" aria-labelledby="ind-h" id="industries">
            <h2 id="ind-h">{p.name} for your industry</h2>
            <div className="cz-board-why">{[...new Map(Object.entries(b.industryPages).map(([sec, url]) => [url, sec])).entries()].map(([url, sec]) => (
              <a key={url} className="cz-chip" href={url} target="_blank" rel="noopener noreferrer">{groupName(sec)} ↗</a>
            ))}</div>
            <p className="cz-muted" style={{ fontSize: 13.5 }}>Opens the industry page on {new URL(b.website ?? url0(b.industryPages)).host}. COLLABIZ members can also move leads between {p.name} and their COLLABIZ CRM — <Link href="/bizo">see how</Link>.</p>
          </section>
        )}

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
            <li key={x.title}><span className="cz-gp-int-icon" aria-hidden>{x.icon}</span><div><strong>{x.title}</strong><p>{x.text}</p>{x.href && <a href={x.href}>Open in COLLABIZ (members) →</a>}</div><span className={`cz-gp-int-st cz-gp-int-${x.status}`}>{STATUS_LABEL[x.status]}</span></li>
          ))}</ul>
          {p.related.length > 0 && <>
            <h3 className="cz-gp-h3">More in {groupName(p.sector)}</h3>
            <ul className="cz-gp-grid">{p.related.map((r) => <li key={r.slug}><ProductTile p={r} /></li>)}</ul>
          </>}
        </section>

        {p.showcase?.kind === 'property' && (
          <section className="cz-gp-section" aria-labelledby="sc-h" id="projects">
            <h2 id="sc-h">Projects on sale</h2>
            <ProjectShowcase items={p.showcase.items} onVisit={(id) => { setVisit(id); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} />
            <p className="cz-muted" style={{ fontSize: 13 }}>Prices and availability come live from the Unite sales team and can change. Check the project's registration and documents before you book.</p>
          </section>
        )}
        {p.showcase?.kind === 'courses' && (
          <section className="cz-gp-section" aria-labelledby="sc-h" id="courses">
            <h2 id="sc-h">Courses you can take now</h2>
            <CourseShowcase items={p.showcase.items} />
          </section>
        )}

        {p.connector && p.connector.kind !== 'micro' && (
          <section className="cz-gp-section" aria-labelledby="live-h" id="live">
            <h2 id="live-h">Live from COLLABIZ {p.connector.module}</h2>
            <ConnectorPanel c={p.connector} onAsk={(id) => { setAsk(id); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} />
          </section>
        )}

        {p.channel && (
          <section className="cz-gp-section" aria-labelledby="sell-h" id="sell">
            <h2 id="sell-h">Sell {p.name}</h2>
            {p.oem && <p className="cz-muted" data-oem>Made under the Unite brand by {p.oem.partner ?? 'an approved manufacturer'} · {p.oem.status}.</p>}
            <p>Become a {p.name} distributor, dealer, store or franchise{channelProduct(p.slug)?.roles.includes('manufacturer') ? ' — or apply to manufacture for the Unite brand' : ''}. Approved partners get a dealer dashboard and sales CRM in COLLABIZ.</p>
            <details className="cz-card" style={{ marginBottom: 12 }}><summary><strong>Not sure which role fits? Ask the matching agent</strong></summary><div style={{ marginTop: 12 }}><ChannelMatcher /></div></details>
            <div className="cz-card"><ChannelApplyForm product={p.slug} fixedProduct /></div>
          </section>
        )}

        {p.slug === 'unite-biofix' && (
          <section className="cz-gp-section" aria-labelledby="schemes-h" id="schemes">
            <h2 id="schemes-h">Public programmes to check</h2>
            <BiofixSchemes />
          </section>
        )}

        {p.work && (
          <section className="cz-gp-section" aria-labelledby="work-h">
            <h2 id="work-h">Post or find work</h2>
            <WorkPanel p={p} work={p.work} />
          </section>
        )}

        <section id="contact" className="cz-gp-section cz-gp-contact" aria-labelledby="c-h">
          <div>
            {(SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug) ? <>
              <h2 id="c-h">{p.slug === 'roofz' ? 'Offer your roof, or go solar' : 'Get a solar quote'}</h2>
              <p className="cz-muted">{p.slug === 'roofz' ? 'Tell us about your roof. The Unite Solar team checks whether it suits a solar project you host (PPA or roof rent) or a system you own, and calls you within two working days. Any lease or PPA terms are agreed in writing before work starts.' : `${p.name} sends your request to the Unite Solar desk. A solar adviser calls you within two working days to check your roof and bill. There is no charge for the quote.`}</p>
            </> : <>
              <h2 id="c-h">{p.slug === 'unite-biofix' ? 'Register feedstock, land or demand' : p.stage === 'live' || p.stage === 'pilot' ? `Get in touch with ${p.name}` : `Be first to hear about ${p.name}`}</h2>
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
          ) : <ProductEnquiry p={p} refCode={ref} projects={p.showcase?.kind === 'property' ? p.showcase.items : undefined} projectId={visit} items={p.connector?.items} itemId={ask} dealers={p.channel} />}
        </section>
        <p className="cz-muted cz-gp-note">{p.stage === 'live' ? '' : `${p.name} is at an early stage and may be available only in some areas. `}Nothing on this page is an offer of investment, credit or financial products, and no earnings are guaranteed.</p>
      </div>
    </div>
  );
}
