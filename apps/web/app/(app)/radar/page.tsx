'use client';
import Link from 'next/link';
import { useState } from 'react';
import { INDIA_STATES, SECTORS, regionLabel } from '@collabiz/types';
import { Card, EmptyState, LoadingState, Select } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

const rupees = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
interface R { region: string; totals: { opportunities: number; packages: number; partners: number; capacity: number }; clusters: { city: string; opportunities: number; partners: number; topSectors: string[] }[];
  opportunities: { id: string; code: string; title: string; city: string | null; sector: string; value: number | null }[]; packages: { id: string; title: string; project: string; budget: number }[];
  partners: { id: string; name: string; city: string | null; sectors: string[] }[]; capacity: { id: string; title: string; org: string; value: number }[]; note: string }

/** Screen 171 — Local opportunity radar: what is happening in a state — open work, partners, spare capacity — by city. */
export default function Radar() {
  const [region, setRegion] = useState('');
  const [sector, setSector] = useState('');
  const q = useQuery<R>(`/radar?${new URLSearchParams({ ...(region ? { region } : {}), ...(sector ? { sector } : {}) })}`);
  const d = q.data;
  return (
    <Screen page={{ key: 'radar', title: 'Opportunity radar', access: 'partner' }} description="Open opportunities, work packages, verified partners and spare capacity in a state, grouped by city — to find work and collaborators near you.">
      <div className="cz-row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 220 }}><Select label="State" value={region || d?.region || ''} onChange={(e) => setRegion(e.target.value)} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} /></div>
        <div style={{ minWidth: 220 }}><Select label="Sector" placeholder="All sectors" value={sector} onChange={(e) => setSector(e.target.value)} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} /></div>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            <div className="cz-figure"><span>Open opportunities</span><strong>{d.totals.opportunities}</strong><small>{regionLabel(d.region)}</small></div>
            <div className="cz-figure"><span>Work packages</span><strong>{d.totals.packages}</strong><small>open for bids</small></div>
            <div className="cz-figure"><span>Verified partners</span><strong>{d.totals.partners}</strong><small>covering this state</small></div>
            <div className="cz-figure"><span>Spare capacity</span><strong>{d.totals.capacity}</strong><small>on XCHANGE</small></div>
          </div>
          <Card title="Clusters">
            {!d.clusters.length ? <EmptyState icon="map" title="Nothing here yet">Try another state or sector.</EmptyState> : (
              <div className="cz-choice-grid">{d.clusters.map((c) => <div key={c.city} className="cz-figure" data-cluster={c.city}><span>{c.city}</span><strong style={{ fontSize: 17 }}>{c.opportunities} {c.opportunities === 1 ? 'opportunity' : 'opportunities'} · {c.partners} {c.partners === 1 ? 'partner' : 'partners'}</strong><small>{c.topSectors.join(' · ')}</small></div>)}</div>
            )}
          </Card>
          <div className="cz-grid cz-grid-2">
            <Card title="Open opportunities">{d.opportunities.length ? <ul className="cz-ws-list">{d.opportunities.map((o) => <li key={o.id}><span><Link href={`/opportunities/${o.id}`}><strong>{o.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{o.sector} · {o.city ?? '—'} · {rupees(o.value)}</span></span></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>None open.</p>}</Card>
            <Card title="Verified partners nearby">{d.partners.length ? <ul className="cz-ws-list">{d.partners.map((p) => <li key={p.id} data-near={p.name}><span><Link href={`/partners/${p.id}`}><strong>{p.name}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{p.city ?? '—'} · {p.sectors.join(', ')}</span></span></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>None yet.</p>}</Card>
            <Card title="Work packages">{d.packages.length ? <ul className="cz-ws-list">{d.packages.map((w) => <li key={w.id}><span><Link href="/packages"><strong>{w.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{w.project} · {rupees(w.budget)}</span></span></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>None open.</p>}</Card>
            <Card title="Spare capacity">{d.capacity.length ? <ul className="cz-ws-list">{d.capacity.map((c) => <li key={c.id}><span><Link href="/xchange"><strong>{c.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{c.org} · {rupees(c.value)}</span></span></li>)}</ul> : <p className="cz-muted" style={{ margin: 0 }}>None listed.</p>}</Card>
          </div>
          <p className="cz-muted" style={{ fontSize: 12.5 }}>{d.note}</p>
        </>
      )}
    </Screen>
  );
}
