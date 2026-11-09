'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { EmptyState, SearchInput, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { INTEREST, VentureMark, stageLabel, type Venture } from '@/components/Ventures';
import { useQuery } from '@/lib/hooks';

type Row = Venture & { myInterest: string | null; openOffers: number };

/** Unite businesses — every Unite Group business partners can help grow, not only solar. */
export default function VenturesPage() {
  const q = useQuery<Row[]>('/ventures');
  const [tab, setTab] = useState('open');
  const [sector, setSector] = useState('');
  const [search, setSearch] = useState('');
  const rows = q.data ?? [];
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))], [rows]);
  const list = rows.filter((v) => (tab === 'open' ? v.open : tab === 'mine' ? !!v.myInterest && v.myInterest !== 'withdrawn' : !v.open))
    .filter((v) => !sector || v.sector === sector).filter((v) => !search || `${v.name} ${v.tagline} ${v.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Screen page={{ key: 'ventures', title: 'Unite businesses', access: 'partner' }}
      description="Every Unite Group business you can help grow — energy, property, commerce, jobs, education, media, mobility and more. Choose the ones that fit your network and ask to promote them.">
      <div className="cz-row" style={{ marginBottom: 14, gap: 12 }}>
        <Segmented label="Businesses" value={tab} onChange={setTab} options={[{ value: 'open', label: `Open to partners ${rows.filter((r) => r.open).length}` }, { value: 'mine', label: 'My businesses' }, { value: 'soon', label: `Coming soon ${rows.filter((r) => !r.open).length}` }]} />
      </div>
      <div className="cz-grid cz-grid-2" style={{ marginBottom: 14 }}>
        <SearchInput label="Search businesses" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or what it does" />
        <div className="cz-field"><label className="cz-label" htmlFor="vsector">Sector</label>
          <select id="vsector" className="cz-input" value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All sectors</option>{sectors.map((s) => <option key={s} value={s}>{sectorName(s)}</option>)}</select></div>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={260} /> : !list.length ? (
        <div className="cz-card"><EmptyState icon="building" title={tab === 'mine' ? 'You are not promoting any business yet' : 'No businesses match'}>{tab === 'mine' ? 'Open a business that fits your network and ask to promote it.' : null}</EmptyState></div>
      ) : (
        <ul className="cz-venture-grid">
          {list.map((v) => (
            <li key={v.id}>
              <Link href={`/ventures/${v.slug}`} className="cz-card cz-venture" data-venture={v.slug}>
                <div className="cz-venture-head"><VentureMark name={v.name} sector={v.sector} /><div><strong>{v.name}</strong><span className="cz-muted">{v.category}</span></div></div>
                <span className="cz-venture-tag">{v.tagline}</span>
                <p className="cz-venture-sum">{v.summary}</p>
                <div className="cz-venture-foot">
                  <span className="cz-tag">{sectorName(v.sector)}</span><span className="cz-muted">{stageLabel(v.stage)}</span>
                  {v.myInterest ? <StatusBadge status={v.myInterest} tone={INTEREST[v.myInterest]?.[1]} label={INTEREST[v.myInterest]?.[0]} /> : v.openOffers > 0 ? <StatusBadge status="open" label={`${v.openOffers} offer${v.openOffers === 1 ? '' : 's'} for you`} /> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
