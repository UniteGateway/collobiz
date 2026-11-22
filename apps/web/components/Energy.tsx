'use client';
/** Unite Green Park — shared pieces: listing card, counters and the disclaimer. */
import Link from 'next/link';
import { ENERGY_DISCLAIMER } from '@collabiz/types';
import { Icon } from '@collabiz/ui';
import { photo } from '@/lib/photos';

export interface EnergyListing {
  id: string; code: string; side: 'plant' | 'buyer'; category: string; categoryLabel: string; title: string; state: string; stateName: string; district: string | null; source: string; stage: string | null;
  capacityMw: number; availableMw: number | null; tariffRsKwh: number | null; targetRsKwh: number | null; ppaYears: number | null; models: string[]; description: string; status: string; demo: boolean; isOwner: boolean;
  owner: string | null; private: Record<string, unknown> | null; moderationNote: string | null; createdAt: string;
}
export const SOURCE_PHOTO: Record<string, string> = { solar: 'energy-wind-sunset', wind: 'energy-wind-solar', hybrid: 'energy-wind-solar', bess: 'energy-control-room', any: 'energy-solar-sky' };
export const mw = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MW`);
export const rs = (n: number | null | undefined) => (n == null ? 'On request' : `₹${Number(n).toFixed(2)}/kWh`);
const STAGE: Record<string, string> = { planned: 'Planned', construction: 'Under construction', operational: 'Operational' };

export function Disclaimer() {
  return <p className="cz-energy-disclaimer"><Icon name="info" size={14} />{ENERGY_DISCLAIMER}</p>;
}

export function ListingCard({ l }: { l: EnergyListing }) {
  return (
    <Link href={`/energy/listings/${l.id}`} className="cz-ugp-card" data-listing={l.title}>
      <div className="cz-ugp-card-img"><img src={photo(SOURCE_PHOTO[l.source] ?? 'energy-solar-sky')} alt="" aria-hidden loading="lazy" />
        <span className={`cz-ugp-side cz-ugp-${l.side}`}>{l.side === 'plant' ? 'Supply' : 'Demand'}</span>{l.demo && <span className="cz-ugp-demo">Demo</span>}</div>
      <div className="cz-ugp-card-body">
        <span className="cz-ugp-cat">{l.categoryLabel}</span>
        <h3>{l.title}</h3>
        <dl className="cz-ugp-facts">
          <div><dt>{l.side === 'plant' ? 'Capacity' : 'Required'}</dt><dd>{l.side === 'plant' && l.availableMw != null && l.availableMw !== l.capacityMw ? `${mw(l.availableMw)} of ${Number(l.capacityMw)}` : mw(l.capacityMw)}</dd></div>
          <div><dt>{l.side === 'plant' ? 'Indicative tariff' : 'Current tariff'}</dt><dd>{rs(l.tariffRsKwh)}</dd></div>
          <div><dt>PPA</dt><dd>{l.ppaYears ? `${l.ppaYears} years` : '—'}</dd></div>
          <div><dt>Model</dt><dd>{l.models.join(' / ') || '—'}</dd></div>
        </dl>
        <p className="cz-ugp-where"><Icon name="location" size={13} />{l.stateName}{l.district ? ` · ${l.district}` : ''} · {l.owner}</p>
        <p className="cz-ugp-tags">{l.demo && <span>Demo — not verified</span>}{l.stage && <span>{STAGE[l.stage] ?? l.stage}</span>}</p>
      </div>
    </Link>
  );
}
