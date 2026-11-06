'use client';
import { useState } from 'react';
import Link from 'next/link';
import { SECTORS, sectorName } from '@collabiz/types';
import { ButtonLink, Card, DataTable, EmptyState, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inr, TradingTabs, when } from '@/components/Trading';
import { useQuery } from '@/lib/hooks';

/** Screen 085 — Trading Marketplace: supplier products, Unite catalogue products and (for suppliers) open buyer requirements. */
export default function TradingMarket() {
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const m = useQuery<any>('/trading/market', { q: q || undefined, sector: sector || undefined });
  const d = m.data;
  return (
    <Screen id="085" actions={<ButtonLink href="/trading/requirements/new">Post a requirement</ButtonLink>}>
      <TradingTabs />
      <div className="cz-row" style={{ alignItems: 'flex-end' }}>
        <TextInput label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
      </div>
      {m.loading ? <LoadingState /> : m.error ? <ApiErrorView error={m.error} onRetry={m.reload} /> : (
        <>
          {d.isSupplier && (
            <Card title="Open buyer requirements you can quote on">
              <DataTable caption="Open requirements" rows={d.openRequirements} empty={<EmptyState title="No open requirements in your sectors" />} columns={[
                { key: 'title', header: 'Requirement', render: (r: any) => <><Link href={`/trading/quotations?requirement=${r.id}`}>{r.title}</Link><div className="cz-mono cz-muted">{r.code} · {r.buyer}</div></> },
                { key: 'items', header: 'Items', render: (r: any) => r.items.map((i: any) => `${i.item} × ${i.quantity} ${i.unit}`).join('; ') },
                { key: 'deliveryLocation', header: 'Deliver to' }, { key: 'closesAt', header: 'Closes', render: (r: any) => when(r.closesAt) },
              ]} />
            </Card>
          )}
          <Card title="Products">
            <DataTable caption="Products" rows={[...d.products, ...d.catalog]} empty={<EmptyState title="No products match" />} rowKey={(p: any) => `${p.source}-${p.id}`} columns={[
              { key: 'name', header: 'Product', render: (p: any) => <>{p.name}<div className="cz-muted" style={{ fontSize: 12 }}>{sectorName(p.sector)}</div></> },
              { key: 'supplier', header: 'Supplier', render: (p: any) => <>{p.supplier}{p.source === 'catalog' && <> <StatusBadge status="unite" tone="brand" label="Unite Group" /></>}</> },
              { key: 'price', header: 'Price', render: (p: any) => (p.price != null ? `${inr(p.price)} / ${p.unit}` : 'On request') },
              { key: 'terms', header: 'MOQ · lead time', render: (p: any) => (p.source === 'supplier' ? `${p.moq} ${p.unit} · ${p.leadTimeDays} days` : '—') },
              { key: 'stock', header: 'Availability', render: (p: any) => (p.stock ? <StatusBadge status={p.stock} /> : '—') },
              { key: 'enquire', header: 'Enquire', render: (p: any) => <Link href={`/trading/enquiry?${p.source === 'supplier' ? 'product' : 'catalog'}=${p.id}`} aria-label={`Enquire about ${p.name}`}>Enquire / price request</Link> },
            ]} />
          </Card>
        </>
      )}
    </Screen>
  );
}
