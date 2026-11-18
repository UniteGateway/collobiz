'use client';
import { useState } from 'react';
import { Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Disclaimer, ListingCard, mw, type EnergyListing } from '@/components/Energy';
import { useQuery } from '@/lib/hooks';

interface S { code: string; name: string; x: number; y: number; supply: number; demand: number; net: number | null }
const color = (v: number | null, max: number) => {
  if (v == null) return '#E4E7EC';
  if (v === 0) return '#FEF3C7';
  const a = Math.min(1, Math.abs(v) / Math.max(1, max));
  return v > 0 ? `rgba(22, 163, 74, ${0.25 + a * 0.7})` : `rgba(234, 88, 12, ${0.25 + a * 0.7})`;
};

/** Schematic state map of supply and demand. */
export default function EnergyMap() {
  const q = useQuery<S[]>('/energy/map');
  const [metric, setMetric] = useState<'net' | 'supply' | 'demand'>('net'); const [view, setView] = useState<'map' | 'table'>('map'); const [pick, setPick] = useState<string>('');
  const list = useQuery<EnergyListing[]>(pick ? '/energy/listings' : null, { state: pick });
  const val = (s: S) => (metric === 'net' ? s.net : metric === 'supply' ? (s.supply || (s.net == null ? null : 0)) : s.demand ? -s.demand : (s.net == null ? null : 0));
  const max = Math.max(1, ...(q.data ?? []).map((s) => Math.abs(val(s) ?? 0)));
  return (
    <Screen page={{ key: 'energy-map', title: 'Energy opportunity map', access: 'partner' }} eyebrow="Unite Green Park"
      description="Where verified plant capacity and power demand sit, state by state. A schematic map — tap a state to see its listings. Figures are listed capacity, not contracted power.">
      <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="cz-chips" role="group" aria-label="Measure">{([['net', 'Supply − demand'], ['supply', 'Supply MW'], ['demand', 'Demand MW']] as const).map(([k, l]) => <button key={k} type="button" className={`cz-chip${metric === k ? ' cz-chip-on' : ''}`} aria-pressed={metric === k} onClick={() => setMetric(k)}>{l}</button>)}</div>
        <div className="cz-chips" role="group" aria-label="View">{([['map', 'Map'], ['table', 'Table']] as const).map(([k, l]) => <button key={k} type="button" className={`cz-chip${view === k ? ' cz-chip-on' : ''}`} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={420} /> : view === 'map' ? (
        <div className="cz-ugp-mapwrap">
          <div className="cz-ugp-map" role="list" aria-label="States">
            {q.data.map((s) => { const v = val(s); return (
              <button key={s.code} type="button" role="listitem" className={`cz-ugp-tile${pick === s.code ? ' cz-on' : ''}`} style={{ gridColumn: s.x, gridRow: s.y, background: color(v, max) }}
                onClick={() => setPick(pick === s.code ? '' : s.code)} aria-label={`${s.name}: supply ${s.supply} MW, demand ${s.demand} MW`} aria-pressed={pick === s.code}>
                <strong>{s.code}</strong><span>{v == null ? '—' : `${v > 0 && metric === 'net' ? '' : ''}${Math.round(metric === 'demand' ? Math.abs(v) : v)} MW`}</span>
              </button>); })}
          </div>
          <ul className="cz-ugp-legend"><li><i style={{ background: 'rgba(22,163,74,.8)' }} />More supply</li><li><i style={{ background: 'rgba(234,88,12,.8)' }} />More demand</li><li><i style={{ background: '#E4E7EC' }} />No live listings</li></ul>
        </div>
      ) : (
        <div className="cz-card" style={{ overflowX: 'auto' }}><table className="cz-table" aria-label="Supply and demand by state"><thead><tr><th>State</th><th>Supply</th><th>Demand</th><th>Supply − demand</th></tr></thead>
          <tbody>{q.data.filter((s) => s.net != null).sort((a, b) => (b.net ?? 0) - (a.net ?? 0)).map((s) => <tr key={s.code}><td>{s.name}</td><td>{mw(s.supply)}</td><td>{mw(s.demand)}</td><td>{mw(s.net)}</td></tr>)}</tbody></table></div>
      )}
      {pick ? (
        <section style={{ marginTop: 16 }} aria-label="Listings in the chosen state"><h2 style={{ fontSize: 18 }}>{q.data?.find((s) => s.code === pick)?.name}</h2>
          {!list.data ? <Skeleton height={160} /> : list.data.length ? <div className="cz-ugp-grid">{list.data.map((l) => <ListingCard key={l.id} l={l} />)}</div> : <p className="cz-muted">No live listings in this state.</p>}</section>
      ) : <p className="cz-muted" style={{ marginTop: 12 }}>Choose a state to see its plant and demand listings.</p>}
      <Disclaimer />
    </Screen>
  );
}
