'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SECTORS, sectorName, type Query } from '@collabiz/types';
import { humanize, Button, EmptyState, LoadingState, Money, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from './Screen';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { INDIA_STATES, regionName, toMinor } from '@/lib/regions';

export interface Opp {
  id: string; code: string; title: string; summary: string; sector: string; kind: string; route: string; city: string | null; region: string | null;
  estimatedValue: number | null; currency: string; deadline: string | null; minLevel: string; requiredCertifications: string[]; status: string; publisher: string; isOwner: boolean; lat: number | null; lng: number | null;
}
export const ROUTE_LABEL: Record<string, string> = { unite_owned: 'Unite Group', partner_originated: 'Partner-originated', partner_exchange: 'Partner exchange', joint_execution: 'Joint execution' };

export function OpportunityCard({ o, href = `/opportunities/${o.id}` }: { o: Opp; href?: string }) {
  return (
    <Link href={href} className="cz-card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }} data-opp={o.code}>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}>
        <span className="cz-mono cz-muted">{o.code}</span>
        <StatusBadge status={o.route} tone={o.route === 'unite_owned' ? 'brand' : 'info'} label={ROUTE_LABEL[o.route]} />
      </div>
      <h2 style={{ margin: '8px 0 4px' }}>{o.title}</h2>
      <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>{sectorName(o.sector)} · {[o.city, o.region && regionName(o.region)].filter(Boolean).join(', ') || 'Location on request'} · {o.publisher}</p>
      <p style={{ fontSize: 14 }}>{o.summary.slice(0, 180)}{o.summary.length > 180 ? '…' : ''}</p>
      <div className="cz-row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
        <strong><Money minor={o.estimatedValue} currency={o.currency} /></strong>
        <span className="cz-muted">{o.deadline ? `Closes ${new Date(o.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Open'}</span>
      </div>
    </Link>
  );
}

export interface Filters { q: string; sector: string; region: string; kind: string; minValue: string; maxValue: string; deadlineBefore: string }
export const EMPTY_FILTERS: Filters = { q: '', sector: '', region: '', kind: '', minValue: '', maxValue: '', deadlineBefore: '' };
export const toQuery = (f: Filters, extra: Query = {}): Query => ({ q: f.q, sector: f.sector, region: f.region, kind: f.kind, minValue: toMinor(f.minValue), maxValue: toMinor(f.maxValue), deadlineBefore: f.deadlineBefore ? new Date(f.deadlineBefore).toISOString() : undefined, ...extra });

export function FilterBar({ f, setF, advanced }: { f: Filters; setF: (f: Filters) => void; advanced?: boolean }) {
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className={`cz-grid ${advanced ? 'cz-grid-4' : 'cz-grid-3'}`}>
      <TextInput label="Search" placeholder="Keyword or OPP code" value={f.q} onChange={set('q')} />
      <Select label="Sector" value={f.sector} onChange={set('sector')} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
      <Select label="State / region" value={f.region} onChange={set('region')} placeholder="Anywhere" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
      {advanced && <>
        <Select label="Type" value={f.kind} onChange={set('kind')} placeholder="Any type" options={['project', 'product_supply', 'service', 'job', 'distributorship', 'rfq', 'tender'].map((k) => ({ value: k, label: humanize(k) }))} />
        <TextInput label="Min value ₹" inputMode="decimal" value={f.minValue} onChange={set('minValue')} />
        <TextInput label="Max value ₹" inputMode="decimal" value={f.maxValue} onChange={set('maxValue')} />
        <TextInput label="Closing before" type="date" value={f.deadlineBefore} onChange={set('deadlineBefore')} />
      </>}
    </div>
  );
}

export function OpportunityList({ scope = 'all', advanced, allowSaveSearch, publicOnly }: { scope?: 'all' | 'unite' | 'exchange'; advanced?: boolean; allowSaveSearch?: boolean; publicOnly?: boolean }) {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const q = useQuery<Opp[]>(publicOnly ? '/public/opportunities' : '/opportunities', toQuery(f, { scope }));
  const [saved, setSaved] = useState<string | null>(null);
  const saveSearch = async () => {
    const name = window.prompt('Name this search', [f.q, f.sector && sectorName(f.sector), f.region && regionName(f.region)].filter(Boolean).join(' · ') || 'My search');
    if (!name) return;
    await api.post('/me/saved-searches', { name, query: { q: f.q || undefined, sector: f.sector || undefined, minValue: toMinor(f.minValue), maxValue: toMinor(f.maxValue) }, alert: true });
    setSaved(`Saved "${name}" — we'll alert you when new matching opportunities are published.`);
  };
  return (
    <div>
      <FilterBar f={f} setF={setF} advanced={advanced} />
      {allowSaveSearch && <div className="cz-row" style={{ marginBottom: 12 }}><Button variant="secondary" size="sm" onClick={saveSearch}>Save search &amp; alert me</Button>{saved && <span className="cz-muted" role="status">{saved}</span>}</div>}
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No opportunities match">Adjust filters or save the search to be alerted.</EmptyState> : (
        <div className="cz-grid cz-grid-2">{q.data.map((o) => <OpportunityCard key={o.id} o={o} />)}</div>
      )}
    </div>
  );
}
