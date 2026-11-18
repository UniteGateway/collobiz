'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ButtonLink, Card, EmptyState, LoadingState, Segmented } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { OfferCard, Reasons, type OfferView, type Reason } from '@/components/Collab';
import { useQuery } from '@/lib/hooks';

interface Matches {
  empty: boolean; note: string;
  offers: { offer: OfferView; score: number; reasons: Reason[] }[];
  programs: { program: { id: string; slug: string; name: string; tagline: string; sectorName: string }; score: number; reasons: Reason[] }[];
  partners: { resource: { id: string; kindLabel: string; title: string; description: string; city: string | null; verification: string }; organization: string; score: number; reasons: Reason[]; forNeed: string }[];
}

/** Ranked matches from what you have and need — offers, Unite programmes and businesses. */
export default function CollabMatches() {
  const m = useQuery<Matches>('/collab/matches');
  const [tab, setTab] = useState('all');
  const d = m.data;
  return (
    <Screen page={{ key: 'collab-matches', title: 'Matches for you', access: 'partner' }} eyebrow="Collab" description="Ranked from what you have and what you need. Matching suggests — you decide whom to contact.">
      {m.error ? <ApiErrorView error={m.error} onRetry={m.reload} /> : !d ? <LoadingState /> : d.empty ? (
        <Card><EmptyState icon="teams" title="Tell us what you have and need first" action={<ButtonLink href="/collab">Start</ButtonLink>}>Matches come from the resources and needs you declare in Collab.</EmptyState></Card>
      ) : <>
        <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'all', label: 'Everything' }, { value: 'offers', label: `Business offers (${d.offers.length})` }, { value: 'programs', label: `Unite programmes (${d.programs.length})` }, { value: 'partners', label: `Businesses (${d.partners.length})` }]} />
        <p className="cz-muted" style={{ fontSize: 13 }}>Suggestions only. Matches are based on what businesses have declared; check details before you commit.</p>
        <div className="cz-stack" style={{ gap: 22 }}>
          {(tab === 'all' || tab === 'offers') && <section aria-label="Business offers that fit"><h2 className="cz-collab-sub">Business offers that fit</h2>
            {d.offers.length ? <div className="cz-product-grid">{d.offers.map((x) => <OfferCard key={x.offer.id} o={x.offer} score={x.score} reasons={x.reasons} />)}</div> : <p className="cz-muted">No live offer fits yet.</p>}</section>}
          {(tab === 'all' || tab === 'programs') && <section aria-label="Unite programmes"><h2 className="cz-collab-sub">Unite programmes</h2>
            {d.programs.length ? <div className="cz-product-grid">{d.programs.map((x) => (
              <article key={x.program.id} className="cz-product"><span className="cz-tag">{x.program.sectorName}</span><h3><Link href={`/ventures/${x.program.slug}`}>{x.program.name}</Link></h3><p>{x.program.tagline}</p><Reasons reasons={x.reasons} score={x.score} /></article>
            ))}</div> : <p className="cz-muted">No open programme fits yet. <Link href="/collab/programs">See all Unite programmes</Link></p>}</section>}
          {(tab === 'all' || tab === 'partners') && <section aria-label="Businesses"><h2 className="cz-collab-sub">Businesses with what you need</h2>
            {d.partners.length ? <div className="cz-product-grid">{d.partners.map((x) => (
              <article key={x.resource.id} className="cz-product"><span className="cz-row" style={{ gap: 6 }}><span className="cz-tag">{x.resource.kindLabel}</span><span className="cz-tag">For: {x.forNeed}</span></span>
                <h3>{x.resource.title}</h3><p>{x.resource.description}</p><span className="cz-muted" style={{ fontSize: 13 }}>{x.organization}{x.resource.city ? ` · ${x.resource.city}` : ''} · {x.resource.verification === 'verified' ? 'Resource verified' : 'Self-declared resource'}</span>
                <Reasons reasons={x.reasons} score={x.score} /></article>
            ))}</div> : <p className="cz-muted">No business matches your needs yet.</p>}</section>}
        </div>
      </>}
    </Screen>
  );
}
