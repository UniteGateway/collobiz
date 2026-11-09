'use client';
import { useState } from 'react';
import { SOLAR_SYSTEM_LABELS } from '@collabiz/types';
import { ButtonLink, Segmented, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { SolarNav, kwLabel, rupees } from '@/components/Solar';
import { useQuery } from '@/lib/hooks';

interface Kit { id: string; code: string; name: string; system: string; capacityKw: number; panelW: number; panelCount: number; inverterKw: number; batteryKwh: number | null; phase: number; price: number; warrantyYears: number; includes: string[]; description: string }

/** All Unite Solar kits — on-grid, hybrid and off-grid. */
export default function SolarKits() {
  const q = useQuery<Kit[]>('/solar/kits');
  const [sys, setSys] = useState('on_grid');
  const list = (q.data ?? []).filter((k) => k.system === sys);
  return (
    <Screen page={{ key: 'solar-kits', title: 'Solar kits', access: 'verified-partner' }} description="Ready packages with ALMM-listed panels, inverter, structure, wiring, installation and service. Prices include GST.">
      <SolarNav />
      <Segmented label="System" value={sys} onChange={setSys} options={Object.entries(SOLAR_SYSTEM_LABELS).map(([value, label]) => ({ value, label: `${label} ${(q.data ?? []).filter((k) => k.system === value).length || ''}`.trim() }))} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : (
        <div className="cz-product-grid">{list.map((k) => (
          <article key={k.id} className="cz-product" data-kit={k.code}>
            <span className="cz-tag" style={{ alignSelf: 'flex-start' }}>{k.code}</span>
            <h3>{k.name}</h3>
            <p>{k.description}</p>
            <ul className="cz-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              <li>{k.panelCount} × {k.panelW} W panels · {kwLabel(k.inverterKw)} inverter{k.phase === 3 ? ' (3-phase)' : ''}</li>
              {k.batteryKwh && <li>{k.batteryKwh} kWh lithium battery</li>}
              <li>{k.warrantyYears}-year panel performance warranty</li>
            </ul>
            <span className="cz-price">{rupees(k.price)}</span>
            <ButtonLink href={`/solar/new`} size="sm" variant="secondary">Quote this size</ButtonLink>
          </article>
        ))}</div>
      )}
    </Screen>
  );
}
