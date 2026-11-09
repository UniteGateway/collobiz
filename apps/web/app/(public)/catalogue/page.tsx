'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SECTORS, sectorName } from '@collabiz/types';
import { EmptyState, ErrorState, LoadingState, Money, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { PublicScreen } from '@/components/PublicScreen';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface CatalogItem { id: string; kind: string; name: string; sector: string; description: string; unit: string | null; listPrice: number | null; currency: string; priceNote: string | null; ownerName: string; ownerOrgId: string; visibility: string; specs: Record<string, string>; image: string | null }

function CatalogueInner() {
  const owner = useSearchParams().get('owner') ?? undefined;
  const { me } = useSession();
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [kind, setKind] = useState('');
  const items = useQuery<CatalogItem[]>('/catalog', { q, sector, kind, owner });
  return (
    <PublicScreen id="005" description={me?.activeOrg ? 'Prices and partner-only listings are shown according to your verification and membership level.' : 'Sign in as a verified partner to see partner-only listings and trade prices.'}>
      <div className="cz-grid cz-grid-3">
        <TextInput label="Search" placeholder="e.g. transformer, rooftop EPC" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
        <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Products & services" options={[{ value: 'product', label: 'Products' }, { value: 'service', label: 'Services' }]} />
      </div>
      {items.loading ? <LoadingState /> : items.error ? <ErrorState error={items.error} onRetry={items.reload} /> : !items.data?.length ? <EmptyState title="No matching products or services" >Try a different search or sector.</EmptyState> : (
        <div className="cz-grid cz-grid-3">
          {items.data.map((i) => (
            <Link key={i.id} href={`/catalogue/${i.id}`} className="cz-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              {i.image && <img className="cz-cat-thumb" src={i.image} alt="" loading="lazy" decoding="async" />}
              <div className="cz-row" style={{ justifyContent: 'space-between' }}><StatusBadge status={i.kind} tone="brand" /><span className="cz-row" style={{ gap: 6 }}>{i.specs?.Availability?.startsWith('Sourcing') && <StatusBadge status="sourcing" tone="warning" label="Sourcing" />}{i.visibility === 'partners' && <StatusBadge status="partners" tone="info" label="Partners only" />}</span></div>
              <h2 style={{ marginTop: 8 }}>{i.name}</h2>
              <p className="cz-muted" style={{ fontSize: 13 }}>{i.ownerName} · {sectorName(i.sector)}</p>
              <p style={{ fontSize: 14 }}>{i.description.slice(0, 140)}{i.description.length > 140 ? '…' : ''}</p>
              <strong>{i.listPrice != null ? <><Money minor={i.listPrice} currency={i.currency} />{i.unit ? ` / ${i.unit}` : ''}</> : <span className="cz-muted">{i.priceNote}</span>}</strong>
            </Link>
          ))}
        </div>
      )}
    </PublicScreen>
  );
}
/** Screen 005 — Products & Services Catalogue. */
export default function CataloguePage() {
  return <Suspense><CatalogueInner /></Suspense>;
}
