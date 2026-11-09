'use client';
import { useState } from 'react';
import Link from 'next/link';
import { VENTURE_STAGE_LABELS, sectorName } from '@collabiz/types';
import { Alert, Card, EmptyState, LoadingState, PageHeader, SearchInput, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Row { id: string; num: number; slug: string; name: string; category: string; sector: string; tagline: string; stage: string; open: boolean; availability: string; company: string | null; regulated: boolean; regulatedReason: string | null; cleared: boolean; pending: number; promoters: number; offers: number; wonValue: number }

/** Unite Group businesses — choose which ones partners can promote, and follow the results. */
export default function VenturesAdmin() {
  const q = useQuery<Row[]>('/admin/ventures');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const toggle = useMutation(async (r: Row) => { await api.request('PATCH', `/admin/ventures/${r.id}`, { open: !r.open }); q.reload(); return true; });
  const rows = (q.data ?? []).filter((r) => (tab === 'open' ? r.open : tab === 'requests' ? r.pending > 0 : tab === 'regulated' ? r.regulated : tab === 'soon' ? !r.open && !r.regulated : true))
    .filter((r) => !search || `${r.name} ${r.category} ${r.tagline}`.toLowerCase().includes(search.toLowerCase()));
  const pending = (q.data ?? []).reduce((s, r) => s + r.pending, 0);
  return (
    <div>
      <PageHeader title="Unite businesses" breadcrumb="Unite Group Administration"
        description="All Unite Group businesses from the master portfolio. Open a business to let partners ask to promote it, approve promoters, then send them direct offers. Finance and investment businesses stay locked until regulatory review." />
      <div className="cz-row" style={{ marginBottom: 14, gap: 12 }}>
        <Segmented label="Filter" value={tab} onChange={setTab} options={[{ value: 'all', label: `All ${q.data?.length ?? ''}` }, { value: 'open', label: 'Open to partners' }, { value: 'requests', label: `Requests ${pending}` }, { value: 'soon', label: 'Coming soon' }, { value: 'regulated', label: 'Regulatory review' }]} />
        <SearchInput label="Search businesses" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or category" />
      </div>
      {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !rows.length ? <Card><EmptyState icon="building" title="No businesses match" /></Card> : (
        <ul className="cz-offer-list" aria-label="Unite businesses">
          {rows.map((r) => (
            <li key={r.id} className="cz-card cz-offer" data-venture={r.slug}>
              <div className="cz-offer-head"><span className="cz-tag">{sectorName(r.sector)}</span><span className="cz-muted" style={{ fontSize: 12.5 }}>{VENTURE_STAGE_LABELS[r.stage]}</span>
                <StatusBadge status={r.regulated && !r.cleared ? 'on_hold' : r.open ? 'open' : 'pending'} label={r.availability} /></div>
              <strong className="cz-offer-title"><Link href={`/ventures/${r.id}`}>{r.name}</Link> <span className="cz-muted" style={{ fontWeight: 400, fontSize: 14 }}>— {r.tagline}</span></strong>
              <span className="cz-muted">{r.category}{r.company ? ` · ${r.company}` : ''}{r.regulated && !r.cleared ? ` · ${r.regulatedReason}` : ''}</span>
              <div className="cz-offer-stats" style={{ alignItems: 'center' }}>
                <span><strong>{r.promoters}</strong> promoters</span>{r.pending > 0 && <span><strong>{r.pending}</strong> requests</span>}<span><strong>{r.offers}</strong> offers</span>{r.wonValue > 0 && <span><strong>₹{Math.round(r.wonValue / 100).toLocaleString('en-IN')}</strong> won</span>}
                {!(r.regulated && !r.cleared) && <span className="cz-row" style={{ marginLeft: 'auto', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}><span style={{ fontSize: 13.5, color: 'var(--cz-navy-900)' }}>Open to partners</span><button type="button" role="switch" aria-checked={r.open} aria-label={`${r.name} open to partners`} className="cz-switch" data-on={r.open || undefined} onClick={() => toggle.run(r)}><span /></button></span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
