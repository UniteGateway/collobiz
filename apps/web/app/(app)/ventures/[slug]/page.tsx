'use client';
import { useState } from 'react';
import Link from 'next/link';
import { venturePhoto } from '@/lib/photos';
import { useParams } from 'next/navigation';
import { INDIA_STATES, appBrand, sectorName, productUrl } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, DescriptionList, Icon, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MEMBER_LINKS } from '@/components/Products';
import { INTEREST, VentureMark, roleLabel, stageLabel, type Venture } from '@/components/Ventures';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Detail = Venture & { myLink?: { code: string; path: string; enquiries: number; converted: number }; roles: string[]; myInterest: { status: string; roles: string[]; regions: string[]; message: string; decisionNote: string | null } | null; offers: { id: string; code: string; title: string; deadline: string; status: string; myStatus: string }[]; promoters: number };
const PAGE = { key: 'venture', title: 'Unite business', access: 'partner' as const };
/** Feature icons in the brand data map onto the design-system icon set. */
const IC: Record<string, string> = { doc: 'documents', globe: 'map', search: 'search', sparkle: 'award', chart: 'earnings', grid: 'package', shield: 'verify', flag: 'bookmark', people: 'users', clock: 'clock', bell: 'bell', check: 'check', map: 'location' };

/** One Unite business: what it is, what partners can do, offers from it, and the request to promote it. */
export default function VenturePage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<Detail>(`/ventures/${slug}`);
  const [f, setF] = useState<{ roles: string[]; regions: string[]; message: string }>({ roles: [], regions: [], message: '' });
  const ask = useMutation(async () => { await api.post(`/ventures/${slug}/interest`, f); q.reload(); return true; });
  const withdraw = useMutation(async () => { await api.post(`/ventures/${slug}/interest/withdraw`); q.reload(); return true; });
  if (q.loading) return <Screen page={PAGE}><LoadingState /></Screen>;
  if (q.error) return <Screen page={PAGE}><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const v = q.data!;
  const mine = v.myInterest && v.myInterest.status !== 'withdrawn' ? v.myInterest : null;
  const brand = appBrand(v.slug);
  return (
    <Screen page={{ ...PAGE, title: v.name }} eyebrow="Unite businesses" description={v.tagline}
      actions={<StatusBadge status={v.open ? 'open' : 'pending'} label={v.availability} />}>
      <p style={{ marginTop: -6 }}><Link href="/ventures" className="cz-back"><Icon name="prev" size={14} />All Unite businesses</Link></p>
      <section className="cz-app-hero" style={{ ['--a1' as string]: brand?.accent[0] ?? '#0B3D91', ['--a2' as string]: brand?.accent[1] ?? '#1F9D55' }} aria-labelledby="app-h">
        <img className="cz-app-hero-photo" src={venturePhoto(v.slug, v.sector)} alt="" />
        <div className="cz-app-hero-logo">{brand?.logo ? <img src={brand.logo} alt={`${v.name} logo`} /> : <VentureMark name={v.name} sector={v.sector} size={88} />}</div>
        <div className="cz-app-hero-text">
          <span className="cz-app-hero-eyebrow">{v.category} · {stageLabel(v.stage)}</span>
          <h2 id="app-h">{v.tagline}</h2>
          <p>{v.summary.replace(/\s*www\.[^\s]+$/, '')}</p>
          <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {brand?.website && <a className="cz-btn cz-btn-light" href={brand.website} target="_blank" rel="noopener noreferrer">Open {brand.website.replace(/^https?:\/\//, '')}<Icon name="external" size={14} /></a>}
            {v.open && !mine && <a className="cz-btn cz-btn-ghost-light" href="#promote">Promote {v.name}</a>}
            <Link className="cz-btn cz-btn-ghost-light" href={`/businesses/${v.slug}`}>Public page</Link>
            {MEMBER_LINKS[v.slug] && <Link className="cz-btn cz-btn-light" href={MEMBER_LINKS[v.slug].href}>Open {MEMBER_LINKS[v.slug].title}</Link>}
          </div>
        </div>
      </section>
      <div className="cz-app-stats">
        <div><span>Stage</span><strong>{stageLabel(v.stage)}</strong></div>
        <div><span>Partners promoting</span><strong>{v.promoters}</strong></div>
        <div><span>Offers for you</span><strong>{v.offers.length}</strong></div>
        <div><span>Your status</span><strong>{mine ? INTEREST[mine.status]?.[0] ?? mine.status : v.open ? 'Not joined' : 'Coming soon'}</strong></div>
      </div>
      <section className="cz-app-section" aria-labelledby="feat-h">
        <h2 id="feat-h">{brand?.features?.every((x) => x.planned) ? 'Planned features' : 'Features'}</h2>
        <div className="cz-app-features">{(brand?.features ?? v.roles.map((r) => ({ title: roleLabel(r), text: `Partners can ${roleLabel(r).toLowerCase()} for ${v.name}.`, icon: 'people' }))).map((x) => (
          <article key={x.title}><span className="cz-app-feat-ic" aria-hidden><Icon name={(IC[x.icon] ?? 'check') as never} size={18} /></span><h3>{x.title}</h3>{x.text ? <p>{x.text}</p> : null}{'planned' in x && x.planned ? <span className="cz-gp-pill cz-gp-pill-soon">Planned</span> : null}</article>
        ))}</div>
      </section>
      {brand?.workflow && (
        <section className="cz-app-section" aria-labelledby="flow-h"><h2 id="flow-h">How {v.name} works</h2>
          <ol className="cz-app-flow">{brand.workflow.map((w, i) => <li key={w.title}><span>{String(i + 1).padStart(2, '0')}</span><strong>{w.title}</strong><p>{w.text}</p></li>)}</ol>
        </section>
      )}
      {brand?.plans && (
        <section className="cz-app-section" aria-labelledby="plans-h"><h2 id="plans-h">Plans</h2>
          <div className="cz-app-plans">{brand.plans.map((pl) => <article key={pl.name} className={pl.featured ? 'cz-featured' : ''}><span>{pl.name}</span><strong>{pl.price}</strong><em>{pl.per}</em><p>{pl.text}</p></article>)}</div>
          {brand.planNote && <p className="cz-muted" style={{ fontSize: 12.5 }}>{brand.planNote}</p>}
        </section>
      )}
      {brand?.integration && <Alert tone={brand.integration.status === 'connected' ? 'success' : 'info'} title={brand.integration.status === 'connected' ? 'Connected to COLLABIZ' : 'Integration'}>{brand.integration.text}</Alert>}
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <div className="cz-stack">
          <Card title="About">
            <DescriptionList items={[['Sector', sectorName(v.sector)], ['Stage', stageLabel(v.stage)], ['Run by', v.company ?? 'Unite Group'], ['Partners promoting it', String(v.promoters)], ['Rewards', v.rewardNote ?? 'Set in each offer']]} />
          </Card>
          <Card title="How partners help">
            <ul className="cz-check-list">{v.roles.map((r) => <li key={r}><Icon name="check" size={15} />{roleLabel(r)}</li>)}</ul>
          </Card>
        </div>
        <div className="cz-stack">
          {mine ? (
            <Card title="Your request" actions={<StatusBadge status={mine.status} tone={INTEREST[mine.status]?.[1]} label={INTEREST[mine.status]?.[0]} />}>
              {mine.status === 'approved' && <Alert tone="success">You are an approved promoter of {v.name}. Offers from this business reach you directly.</Alert>}
              {mine.status === 'pending' && <Alert tone="info">{v.company ?? 'Unite Group'} will review your request and reply by notification.</Alert>}
              {mine.status === 'declined' && <Alert tone="warning">Not approved{mine.decisionNote ? `: ${mine.decisionNote}` : ''}. You can ask again later.</Alert>}
              <p className="cz-muted" style={{ margin: '8px 0' }}>{mine.roles.map(roleLabel).join(' · ')}</p>
              <p style={{ whiteSpace: 'pre-line' }}>{mine.message}</p>
              {withdraw.error && <Alert tone="danger">{withdraw.error}</Alert>}
              {mine.status !== 'declined' && <Button variant="ghost" onClick={() => withdraw.run()} loading={withdraw.pending}>Stop promoting</Button>}
            </Card>
          ) : null}
          {(!mine || mine.status === 'declined') && (v.open ? (
            <Card title={`Promote ${v.name}`}><span id="promote" />
              <form noValidate onSubmit={(e) => { e.preventDefault(); ask.run(); }}>
                {ask.error && <Alert tone="danger">{ask.error}</Alert>}
                <ChipSelect legend="How you will help" options={v.roles.map((r) => ({ value: r, label: roleLabel(r) }))} value={f.roles} onChange={(roles) => setF({ ...f, roles })} />
                <ChipSelect legend="Where (optional)" options={INDIA_STATES.map(([c, n]) => ({ value: c, label: n }))} value={f.regions} onChange={(regions) => setF({ ...f, regions })} />
                <TextArea label="Your network and plan" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={ask.fieldErrors.message} hint="Who you can reach and how. At least 20 characters." />
                <Button type="submit" variant="accent" loading={ask.pending} disabled={!f.roles.length || f.message.trim().length < 20}>Ask to promote {v.name}</Button>
              </form>
            </Card>
          ) : <Card title="Coming soon"><p style={{ margin: 0 }}>{v.name} is not open to partners yet. It will appear under “Open to partners” when Unite Group starts working with partners on it.</p></Card>)}
          {v.myLink && <PartnerLink name={v.name} slug={v.slug} link={v.myLink} />}
          <Card title={`Offers from ${v.name}`}>
            {!v.offers.length ? <p className="cz-muted" style={{ margin: 0 }}>No offers for you yet.{mine?.status === 'approved' ? ' They will appear here and on your Home page.' : ''}</p> : (
              <ul className="cz-pick-list">{v.offers.map((o) => <li key={o.id} className="cz-row" style={{ justifyContent: 'space-between' }}><Link href={`/offers/${o.id}`}>{o.title}</Link><span className="cz-muted cz-mono" style={{ fontSize: 12.5 }}>{o.code}</span></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </Screen>
  );
}

/** Personal tracked link to the public product page; enquiries through it are recorded as introduced by this partner. */
function PartnerLink({ name, slug, link }: { name: string; slug: string; link: { code: string; path: string; enquiries: number; converted: number } }) {
  const [copied, setCopied] = useState(false);
  const domain = process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN;
  const url = domain ? productUrl(slug, { productsDomain: domain, ref: link.code }) : typeof window !== 'undefined' ? `${window.location.origin}${link.path}` : link.path;
  return (
    <Card title="Your partner link" id="partner-link">
      <p style={{ marginTop: 0 }}>Share this link to the {name} page. Enquiries and solar requests sent through it are recorded as introduced by you.</p>
      <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <code className="cz-mono" style={{ padding: '8px 12px', background: 'var(--cz-grey-100, #f2f4f7)', borderRadius: 10, wordBreak: 'break-all' }}>{url}</code>
        <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? 'Copied' : 'Copy link'}</Button>
      </div>
      <p className="cz-muted" style={{ marginBottom: 0, fontSize: 13 }}>{link.enquiries} enquir{link.enquiries === 1 ? 'y' : 'ies'} through your link · {link.converted} moved into the sales pipeline. Rewards follow your signed agreement with Unite Group; nothing is paid automatically.</p>
    </Card>
  );
}
