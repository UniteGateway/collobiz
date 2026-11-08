'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { Button, ButtonLink, EmptyState, Icon, Pagination, SearchInput, Segmented, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ROUTE_LABEL, type Opp } from '@/components/Opportunities';
import { api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { INDIA_STATES, regionName, toMinor } from '@/lib/regions';

interface Page { items: Opp[]; total: number; limit: number; offset: number; counts: { all: number; unite: number; exchange: number } }
interface FeedItem { opportunity: { id: string }; match?: { score: number } | null }

const PAGE_SIZE = 12;
const KIND_LABEL: Record<string, string> = { project: 'Project', product_supply: 'Product supply', service: 'Service', job: 'Job', distributorship: 'Distributorship', rfq: 'RFQ', tender: 'Tender' };
const SORTS = [{ value: 'newest', label: 'Newest first' }, { value: 'closing', label: 'Closing soonest' }, { value: 'value', label: 'Highest value' }];

const inr = (minor: number | null) => {
  if (minor == null) return null;
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};
const closing = (d: string | null): { text: string; tone: 'urgent' | 'soon' | 'normal' } => {
  if (!d) return { text: 'Rolling', tone: 'normal' };
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000);
  if (days < 0) return { text: 'Closed', tone: 'normal' };
  if (days === 0) return { text: 'Closes today', tone: 'urgent' };
  if (days <= 7) return { text: `${days} day${days === 1 ? '' : 's'} left`, tone: 'urgent' };
  if (days <= 21) return { text: `${days} days left`, tone: 'soon' };
  return { text: `Closes ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, tone: 'normal' };
};

interface F { q: string; scope: string; sector: string; region: string; kind: string; minValue: string; maxValue: string; sort: string }
const EMPTY: F = { q: '', scope: 'all', sector: '', region: '', kind: '', minValue: '', maxValue: '', sort: 'newest' };

/** Screen 031 — Opportunities marketplace: find, compare and shortlist work you are eligible for. */
export default function MarketplacePage() {
  const { me } = useSession();
  const [f, setF] = useState<F>(EMPTY);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Deep links such as ?sector=solar_renewable from the homepage pre-fill the filters.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const init = { ...EMPTY, ...Object.fromEntries([...p.entries()].filter(([k]) => k in EMPTY)) } as F;
    setF(init); setQ(init.q);
  }, []);
  // Typing settles for 300 ms before searching.
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q })), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [f]);

  const query = useMemo(() => ({ paged: 'true', limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE), sort: f.sort, scope: f.scope, q: f.q, sector: f.sector, region: f.region, kind: f.kind, minValue: toMinor(f.minValue), maxValue: toMinor(f.maxValue) }), [f, page]);
  const res = useQuery<Page>('/opportunities', query);
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  const feed = useQuery<{ items: FeedItem[] }>(verified ? '/me/feed' : null);
  const scores = useMemo(() => new Map((feed.data?.items ?? []).filter((i) => i.match).map((i) => [i.opportunity.id, i.match!.score])), [feed.data]);

  const set = (k: keyof F, v: string) => setF((x) => ({ ...x, [k]: v }));
  const chips = [
    f.sector && { k: 'sector' as const, label: sectorName(f.sector) },
    f.region && { k: 'region' as const, label: regionName(f.region) },
    f.kind && { k: 'kind' as const, label: KIND_LABEL[f.kind] ?? f.kind },
    f.minValue && { k: 'minValue' as const, label: `From ₹${Number(f.minValue).toLocaleString('en-IN')}` },
    f.maxValue && { k: 'maxValue' as const, label: `Up to ₹${Number(f.maxValue).toLocaleString('en-IN')}` },
    f.q && { k: 'q' as const, label: `“${f.q}”` },
  ].filter(Boolean) as { k: keyof F; label: string }[];
  const clearAll = () => { setF({ ...EMPTY, scope: f.scope, sort: f.sort }); setQ(''); };

  const saveSearch = async () => {
    const name = [f.q, f.sector && sectorName(f.sector), f.region && regionName(f.region)].filter(Boolean).join(' · ') || 'All opportunities';
    try {
      await api.post('/me/saved-searches', { name, query: { q: f.q || undefined, sector: f.sector || undefined, minValue: toMinor(f.minValue), maxValue: toMinor(f.maxValue) }, alert: true });
      setNotice(`Saved “${name}”. We’ll let you know when a new match is published.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not save this search.'); }
  };

  const d = res.data;
  const counts = d?.counts;
  return (
    <Screen id="031" title="Opportunities" description="Work published by Unite Group companies and verified partners, matched to your capability."
      actions={<><ButtonLink href="/marketplace/saved" variant="secondary"><Icon name="bookmark" size={16} />Saved</ButtonLink><ButtonLink href="/leads/new" variant="accent"><Icon name="leads" size={16} />Register a lead</ButtonLink></>}>
      <div className="cz-mkt">
        {/* ---------- Search & filters ---------- */}
        <div className="cz-mkt-toolbar">
          <div className="cz-mkt-search">
            <SearchInput label="Search opportunities" placeholder="Search by keyword, city or OPP code" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Segmented label="Source" value={f.scope} onChange={(v) => set('scope', v)} options={[
            { value: 'all', label: `All${counts ? ` ${counts.all}` : ''}` },
            { value: 'unite', label: `Unite Group${counts ? ` ${counts.unite}` : ''}` },
            { value: 'exchange', label: `Partner exchange${counts ? ` ${counts.exchange}` : ''}` },
          ]} />
        </div>
        <div className="cz-mkt-filters">
          <label className="cz-chip-select"><span className="cz-sr-only">Sector</span>
            <select value={f.sector} onChange={(e) => set('sector', e.target.value)}><option value="">All sectors</option>{SECTORS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          </label>
          <label className="cz-chip-select"><span className="cz-sr-only">Location</span>
            <select value={f.region} onChange={(e) => set('region', e.target.value)}><option value="">Anywhere in India</option>{INDIA_STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label className="cz-chip-select"><span className="cz-sr-only">Type</span>
            <select value={f.kind} onChange={(e) => set('kind', e.target.value)}><option value="">Any type</option>{Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <button type="button" className="cz-chip-btn" aria-expanded={more} onClick={() => setMore(!more)}><Icon name="filter" size={14} />Value</button>
          <span className="cz-mkt-spacer" />
          <label className="cz-chip-select cz-chip-plain"><span className="cz-muted">Sort</span>
            <select value={f.sort} onChange={(e) => set('sort', e.target.value)} aria-label="Sort by">{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          </label>
        </div>
        {more && (
          <div className="cz-mkt-more">
            <label>Minimum value (₹)<input className="cz-input" inputMode="decimal" placeholder="e.g. 500000" value={f.minValue} onChange={(e) => set('minValue', e.target.value.replace(/[^\d.]/g, ''))} /></label>
            <label>Maximum value (₹)<input className="cz-input" inputMode="decimal" placeholder="No limit" value={f.maxValue} onChange={(e) => set('maxValue', e.target.value.replace(/[^\d.]/g, ''))} /></label>
          </div>
        )}

        {/* ---------- Result summary ---------- */}
        <div className="cz-mkt-summary">
          <p aria-live="polite">{d ? <><strong>{d.total}</strong> {d.total === 1 ? 'opportunity' : 'opportunities'}</> : 'Searching…'}</p>
          {chips.length > 0 && (
            <ul className="cz-active-filters" aria-label="Active filters">
              {chips.map((c) => <li key={c.k}><button type="button" onClick={() => { set(c.k, ''); if (c.k === 'q') setQ(''); }} aria-label={`Remove filter ${c.label}`}>{c.label}<Icon name="close" size={12} /></button></li>)}
              <li><button type="button" className="cz-link-btn" onClick={clearAll}>Clear all</button></li>
            </ul>
          )}
          {verified && <Button size="sm" variant="ghost" onClick={saveSearch}><Icon name="bell" size={15} />Alert me</Button>}
        </div>
        {notice && <p role="status" className="cz-mkt-notice"><Icon name="success" size={15} />{notice}</p>}

        {/* ---------- Results ---------- */}
        {res.error ? <ApiErrorView error={res.error} onRetry={res.reload} /> : !d ? (
          <ul className="cz-opp-list" aria-busy>{Array.from({ length: 5 }, (_, i) => <li key={i} className="cz-opp-skel"><Skeleton height={18} width="60%" /><Skeleton height={13} width="40%" style={{ marginTop: 10 }} /></li>)}</ul>
        ) : !d.items.length ? (
          <div className="cz-card"><EmptyState icon="search" title="No opportunities match these filters" action={chips.length ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button> : undefined}>
            {verified ? 'Try a wider area or sector, or turn on an alert and we’ll tell you when something matching is published.' : 'Try a wider area or sector.'}
          </EmptyState></div>
        ) : (
          <ul className="cz-opp-list">
            {d.items.map((o) => {
              const c = closing(o.deadline);
              const score = scores.get(o.id);
              return (
                <li key={o.id}>
                  <Link href={`/opportunities/${o.id}`} className="cz-opp-row" data-opp={o.code}>
                    <span className="cz-opp-main">
                      <span className="cz-opp-meta">
                        <span className={`cz-route cz-route-${o.route === 'unite_owned' ? 'unite' : 'partner'}`}>{ROUTE_LABEL[o.route]}</span>
                        <span>{KIND_LABEL[o.kind] ?? o.kind}</span>
                        <span className="cz-mono">{o.code}</span>
                      </span>
                      <strong className="cz-opp-title">{o.title}</strong>
                      <span className="cz-opp-sub">
                        <span><Icon name="sector" size={13} />{sectorName(o.sector)}</span>
                        <span><Icon name="location" size={13} />{[o.city, o.region && regionName(o.region)].filter(Boolean).join(', ') || 'Location shared on request'}</span>
                        <span><Icon name="company" size={13} />{o.publisher}</span>
                      </span>
                    </span>
                    <span className="cz-opp-side">
                      <span className="cz-opp-value">{inr(o.estimatedValue) ?? <span className="cz-muted">Value on request</span>}</span>
                      <span className={`cz-opp-close cz-close-${c.tone}`}>{c.tone !== 'normal' && <Icon name="clock" size={13} />}{c.text}</span>
                      {score != null && <span className="cz-opp-match" title="How well this matches your profile">{score}% match</span>}
                    </span>
                    <Icon name="next" size={16} className="cz-opp-chevron" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {d && d.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={d.total} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} noun="opportunities" />}
      </div>
    </Screen>
  );
}
