'use client';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inr } from '@/components/Growth';
import { useQuery } from '@/lib/hooks';

interface Terr { territories: { id: string; countryName: string; sectorNames: string[]; exclusive: boolean; startsOn: string; endsOn: string; daysLeft: number }[]; opportunities: { id: string; code: string; title: string; countryName: string; sector: string; estimatedValue: number | null }[]; enquiries: { id: string; code: string; direction: string; product: string; route: string; status: string }[]; alliances: number }

/** Screen 121 — International territory dashboard for country partners. */
export default function Territory() {
  const q = useQuery<Terr>('/global/territory');
  const d = q.data;
  return (
    <Screen id="121" title="My territory" description="Your markets, the open work in them, and trade enquiries on your routes.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : !d.territories.length ? (
        <div className="cz-card"><EmptyState icon="map" title="You don’t hold a territory yet" action={<Link className="cz-btn cz-btn-accent" href="/global/country-partner">Apply to be a country partner</Link>}>Country partners represent the network in a market outside India.</EmptyState></div>
      ) : (
        <>
          <div className="cz-ta-kpis">
            {d.territories.map((t) => (
              <div key={t.id} className="cz-ta-kpi" style={{ cursor: 'default' }}>
                <span className="cz-ta-kpi-top"><span>{t.exclusive ? 'Exclusive territory' : 'Territory'}</span><Icon name="map" size={16} /></span>
                <strong style={{ fontSize: 24 }}>{t.countryName}</strong>
                <span className="cz-ta-kpi-hint">{t.sectorNames.join(' · ')}</span>
                <span className="cz-ta-kpi-hint">Until {new Date(t.endsOn).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · {t.daysLeft} days left</span>
              </div>
            ))}
            <Link href="/alliances" className="cz-ta-kpi"><span className="cz-ta-kpi-top"><span>Open alliance proposals</span><Icon name="teams" size={16} /></span><strong>{d.alliances}</strong><span className="cz-ta-kpi-hint">Incoming and outgoing</span></Link>
          </div>
          <div className="cz-perf" style={{ marginTop: 20 }}>
            <section className="cz-card" aria-labelledby="to-h">
              <h2 id="to-h" className="cz-help-h">Opportunities in your markets</h2>
              {!d.opportunities.length ? <p className="cz-muted">No open listings in your markets yet.</p> : <ul className="cz-cert-mini">{d.opportunities.map((o) => <li key={o.id}><Icon name="opportunities" size={16} /><span><Link href={`/opportunities/${o.id}`}><strong>{o.title}</strong></Link><span className="cz-muted">{o.code} · {sectorName(o.sector)} · {inr(o.estimatedValue) ?? 'Value on request'}</span></span></li>)}</ul>}
            </section>
            <section className="cz-card" aria-labelledby="te-h">
              <h2 id="te-h" className="cz-help-h">Trade enquiries on your routes</h2>
              {!d.enquiries.length ? <p className="cz-muted">No enquiries yet.</p> : <ul className="cz-cert-mini">{d.enquiries.map((e) => <li key={e.id}><Icon name="trading" size={16} /><span><strong>{e.product}</strong><span className="cz-muted">{e.code} · {e.direction} · {e.route}</span></span><StatusBadge status={e.status} /></li>)}</ul>}
            </section>
          </div>
        </>
      )}
    </Screen>
  );
}
