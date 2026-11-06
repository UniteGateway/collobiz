'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { Card, EmptyState, LoadingState, Money } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import type { Opp } from '@/components/Opportunities';
import { useQuery } from '@/lib/hooks';

// India bounding box for the dependency-free plot (lat 6–36°N, lng 68–98°E).
const B = { minLat: 6, maxLat: 36, minLng: 68, maxLng: 98 };
const x = (lng: number) => ((lng - B.minLng) / (B.maxLng - B.minLng)) * 100;
const y = (lat: number) => (1 - (lat - B.minLat) / (B.maxLat - B.minLat)) * 100;

/** Screen 038 — Location-Based Opportunities Map (accessible list alongside the plot). */
export default function MapPage() {
  const q = useQuery<Opp[]>('/opportunities', { mapped: 'true', limit: '200' }); // only located listings, so new unmapped ones never crowd them out
  const [sel, setSel] = useState<string | null>(null);
  const pts = (q.data ?? []).filter((o) => o.lat != null && o.lng != null);
  return (
    <Screen id="038" description="Opportunities with a mapped site location. The list beside the map is the accessible equivalent.">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !pts.length ? <EmptyState title="No mapped opportunities" /> : (
        <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <svg viewBox="0 0 100 100" role="img" aria-label={`${pts.length} opportunities plotted by location`} style={{ width: '100%', background: 'var(--cz-navy-50)', borderRadius: 12 }}>
              <rect x="0" y="0" width="100" height="100" fill="none" stroke="var(--cz-grey-300)" />
              {pts.map((o) => (
                <g key={o.id} onClick={() => setSel(o.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={x(o.lng!)} cy={y(o.lat!)} r={sel === o.id ? 2.6 : 1.8} fill={sel === o.id ? 'var(--cz-green-700)' : 'var(--cz-navy-700)'} />
                  <title>{`${o.code} · ${o.title}`}</title>
                </g>
              ))}
            </svg>
          </Card>
          <Card title="Opportunities by location">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {pts.map((o) => (
                <li key={o.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--cz-grey-100)', background: sel === o.id ? 'var(--cz-navy-50)' : undefined }} onMouseEnter={() => setSel(o.id)}>
                  <Link href={`/opportunities/${o.id}`}><strong>{o.city}</strong> — {o.title}</Link>
                  <div className="cz-muted" style={{ fontSize: 13 }}>{sectorName(o.sector)} · <Money minor={o.estimatedValue} /></div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </Screen>
  );
}
