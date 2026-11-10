'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Desk { country: string; name: string; currency: string | null; languages: string | null; notes: string | null; fx: { currency: string; inrPerUnit: number; asOf: string; note: string } | null;
  representatives: { organization: string; city: string | null; sectors: string[]; exclusive: boolean; until: string }[]; opportunities: { id: string; code: string; title: string; sector: string; city: string | null; value: number | null; deadline: string | null }[];
  enquiries: { id: string; code: string; direction: string; product: string; status: string; checklistDone: number }[]; myTerritory: { sectors: string[]; exclusive: boolean; until: string } | null; checklistLink: string }
const rupees = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);

/** Screen 176 — Country business desk: one market in one place — representatives, opportunities, your trade enquiries, currency and checklist. */
export default function CountryDesk() {
  const { country } = useParams<{ country: string }>();
  const q = useQuery<Desk>(`/global/desks/${country}`);
  const d = q.data;
  return (
    <Screen page={{ key: 'country-desk', title: d ? `${d.name} desk` : 'Country desk', access: 'partner' }} description={d ? [d.currency && `Currency ${d.currency}`, d.languages && `Languages: ${d.languages}`].filter(Boolean).join(' · ') : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            <div className="cz-figure"><span>Open opportunities</span><strong>{d.opportunities.length}</strong></div>
            <div className="cz-figure"><span>Country partners</span><strong>{d.representatives.length}</strong></div>
            <div className="cz-figure"><span>Your enquiries</span><strong>{d.enquiries.length}</strong></div>
            <div className="cz-figure"><span>Exchange rate</span><strong>{d.fx ? `₹${d.fx.inrPerUnit.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</strong><small>{d.fx ? `per ${d.fx.currency}, ${new Date(d.fx.asOf).toLocaleDateString('en-IN')} (indicative)` : 'not set'}</small></div>
          </div>
          {d.notes && <Card title="Doing business here"><p style={{ margin: 0, fontSize: 14.5 }}>{d.notes}</p><p style={{ margin: '8px 0 0', fontSize: 14 }}><Link href={d.checklistLink}>Export checklist for {d.name}</Link> — preparation guidance, not legal or customs advice.</p></Card>}
          {d.myTerritory && <Card title="Your territory"><p style={{ margin: 0 }}>{d.myTerritory.exclusive ? 'Exclusive' : 'Non-exclusive'} for {d.myTerritory.sectors.join(', ')} until {new Date(d.myTerritory.until).toLocaleDateString('en-IN')}.</p></Card>}
          <div className="cz-grid cz-grid-2">
            <Card title="Country partners">{d.representatives.length ? <ul className="cz-ws-list">{d.representatives.map((r, i) => <li key={i} data-representative={r.organization}><span><strong>{r.organization}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{r.sectors.join(', ')} · until {new Date(r.until).toLocaleDateString('en-IN')}</span></span>{r.exclusive && <StatusBadge status="exclusive" tone="info" label="Exclusive" />}</li>)}</ul> : <EmptyState icon="users" title="No country partner yet"><Link href="/global/country-partner">Apply to represent COLLABIZ here</Link></EmptyState>}</Card>
            <Card title="Open opportunities">{d.opportunities.length ? <ul className="cz-ws-list">{d.opportunities.map((o) => <li key={o.id}><span><Link href={`/opportunities/${o.id}`}><strong>{o.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{o.sector}{o.city ? ` · ${o.city}` : ''} · {rupees(o.value)}</span></span></li>)}</ul> : <EmptyState icon="map" title="No open listings" />}</Card>
          </div>
          <Card title="Your import / export enquiries">{d.enquiries.length ? <ul className="cz-ws-list">{d.enquiries.map((e) => <li key={e.id}><span><strong>{e.code}</strong> · {e.direction === 'export' ? 'Export' : 'Import'}: {e.product}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{e.checklistDone} checklist steps done</span></span><StatusBadge status={e.status} /></li>)}</ul> : <EmptyState icon="briefcase" title="No enquiries for this market"><Link href="/global/import-export">Start an import or export enquiry</Link></EmptyState>}</Card>
        </>
      )}
    </Screen>
  );
}
