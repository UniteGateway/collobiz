'use client';
import { useState } from 'react';
import { ENERGY_CATEGORIES, ENERGY_STATES } from '@collabiz/types';
import { ButtonLink, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Disclaimer, ListingCard, mw, type EnergyListing } from '@/components/Energy';
import { useQuery } from '@/lib/hooks';

interface Summary { plants: number; buyers: number; mwAvailable: number; mwDemanded: number; note: string }

/** Unite Green Park — energy marketplace. */
export default function EnergyMarketplace() {
  const [side, setSide] = useState(''); const [category, setCategory] = useState(''); const [state, setState] = useState(''); const [q, setQ] = useState('');
  const sum = useQuery<Summary>('/energy/summary');
  const list = useQuery<EnergyListing[]>('/energy/listings', { side: side || undefined, category: category || undefined, state: state || undefined, q: q.trim().length > 1 ? q.trim() : undefined });
  const s = sum.data;
  return (
    <Screen page={{ key: 'energy', title: 'Energy marketplace', access: 'partner' }} eyebrow="Unite Green Park · powered by COLLABIZ"
      description="Solar, wind, hybrid and storage capacity, industrial power demand, projects and partners — matched with estimated delivered cost."
      actions={<><ButtonLink href="/energy/register?side=plant" variant="accent">Register a plant</ButtonLink><ButtonLink href="/energy/register?side=buyer" variant="secondary">Register power demand</ButtonLink></>}>
      <Disclaimer />
      <div className="cz-ugp-stats">
        {[['Plants & capacity listings', s?.plants], ['MW available (live listings)', s ? mw(s.mwAvailable).replace(' MW', '') : undefined], ['Buyer requirements', s?.buyers], ['MW demanded', s ? mw(s.mwDemanded).replace(' MW', '') : undefined]].map(([l, v]) => (
          <div key={l as string}><strong>{v ?? '—'}</strong><span>{l as string}</span><em>Declared by businesses — indicative</em></div>
        ))}
      </div>
      <div className="cz-ugp-filters" role="group" aria-label="Filter listings">
        <div className="cz-chips">{[['', 'All'], ['plant', 'Sell power'], ['buyer', 'Buy power']].map(([v, l]) => <button key={v} type="button" className={`cz-chip${side === v ? ' cz-chip-on' : ''}`} aria-pressed={side === v} onClick={() => setSide(v)}>{l}</button>)}</div>
        <label className="cz-mini-field">Category<select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All 15 categories</option>{ENERGY_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
        <label className="cz-mini-field">State<select aria-label="State" value={state} onChange={(e) => setState(e.target.value)}><option value="">All states</option>{ENERGY_STATES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></label>
        <label className="cz-mini-field" style={{ flex: 1, minWidth: 200 }}>Search<input aria-label="Search listings" value={q} onChange={(e) => setQ(e.target.value)} placeholder="MW, district, technology…" /></label>
      </div>
      {list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : !list.data ? <Skeleton height={300} /> : !list.data.length ? (
        <EmptyState title="No listings match">Try another category or state, or register your plant or requirement.</EmptyState>
      ) : <div className="cz-ugp-grid">{list.data.map((l) => <ListingCard key={l.id} l={l} />)}</div>}
    </Screen>
  );
}
