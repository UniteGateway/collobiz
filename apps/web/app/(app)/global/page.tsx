'use client';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inr } from '@/components/Growth';
import { useQuery } from '@/lib/hooks';

interface Overview { markets: { country: string; name: string; opportunities: number; countryPartners: number }[]; opportunities: { id: string; code: string; title: string; sector: string; country: string; countryName: string; city: string | null; estimatedValue: number | null; deadline: string | null; publisher: string }[]; isCountryPartner: boolean }

/** Screen 119 — Global opportunities portal: international work and the markets where Unite Group is active. */
export default function GlobalPortal() {
  const q = useQuery<Overview>('/global/overview');
  const d = q.data;
  return (
    <Screen id="119" title="Global markets" description="International opportunities from Unite Group companies, and the markets where country partners represent the network."
      actions={<><Link href="/global/import-export" className="cz-btn cz-btn-secondary"><Icon name="trading" size={16} />Import or export enquiry</Link>{!d?.isCountryPartner && <Link href="/global/country-partner" className="cz-btn cz-btn-accent">Become a country partner</Link>}</>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <>
          <ul className="cz-market-grid" aria-label="Markets">
            {d.markets.map((m) => (
              <li key={m.country} className="cz-market" data-active={m.opportunities > 0 || m.countryPartners > 0 || undefined}>
                <span className="cz-market-code">{m.country}</span>
                <strong><Link href={`/global/desks/${m.country}`}>{m.name}</Link></strong>
                <span className="cz-muted">{m.opportunities ? `${m.opportunities} open` : 'No open listings'} · {m.countryPartners ? `${m.countryPartners} country partner${m.countryPartners === 1 ? '' : 's'}` : 'Partner wanted'}</span>
              </li>
            ))}
          </ul>
          <h2 className="cz-help-h" style={{ marginTop: 28 }}>International opportunities</h2>
          {!d.opportunities.length ? <div className="cz-card"><EmptyState icon="map" title="No international listings right now" /></div> : (
            <ul className="cz-opp-list">
              {d.opportunities.map((o) => (
                <li key={o.id}>
                  <Link href={`/opportunities/${o.id}`} className="cz-opp-row" data-opp={o.code}>
                    <span className="cz-opp-main">
                      <span className="cz-opp-meta"><span className="cz-route cz-route-unite">{o.countryName}</span><span className="cz-mono">{o.code}</span></span>
                      <strong className="cz-opp-title">{o.title}</strong>
                      <span className="cz-opp-sub"><span><Icon name="sector" size={13} />{sectorName(o.sector)}</span><span><Icon name="location" size={13} />{[o.city, o.countryName].filter(Boolean).join(', ')}</span><span><Icon name="company" size={13} />{o.publisher}</span></span>
                    </span>
                    <span className="cz-opp-side"><span className="cz-opp-value">{inr(o.estimatedValue) ?? 'On request'}</span>{o.deadline && <span className="cz-opp-close">Closes {new Date(o.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}</span>
                    <Icon name="next" size={16} className="cz-opp-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
