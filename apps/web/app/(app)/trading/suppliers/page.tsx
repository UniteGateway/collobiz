'use client';
import { useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DataTable, EmptyState, Grid, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inr, TradingTabs } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { regionName, toMinor } from '@/lib/regions';

/** Screen 086 — Supplier & Manufacturer Catalogue (+ product management for suppliers). */
export default function Suppliers() {
  const [sector, setSector] = useState('');
  const q = useQuery<any[]>('/trading/suppliers', { sector: sector || undefined });
  const market = useQuery<any>('/trading/market');
  const mine = useQuery<any[]>(market.data?.isSupplier ? '/trading/products/mine' : null);
  const [f, setF] = useState({ name: '', sector: 'power_equipment', description: '', unit: 'nos', price: '', moq: '1', leadTimeDays: '7', stock: 'in_stock' });
  const add = useMutation(async () => { await api.post('/trading/products', { ...f, price: toMinor(f.price), moq: Number(f.moq) || 1, leadTimeDays: Number(f.leadTimeDays) || 0 }); setF({ ...f, name: '', description: '', price: '' }); mine.reload(); return true; });
  const archive = useMutation(async (id: string, status: string) => { await api.patch(`/trading/products/${id}`, { status }); mine.reload(); return true; });
  return (
    <Screen id="086">
      <TradingTabs />
      <Select label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="All sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
      <Card title="Verified suppliers">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Suppliers" rows={q.data ?? []} empty={<EmptyState title="No suppliers in this sector" />} columns={[
            { key: 'name', header: 'Supplier', render: (s: any) => <>{s.name}<div className="cz-muted" style={{ fontSize: 12 }}>{s.types.join(', ')} · {s.city}</div></> },
            { key: 'level', header: 'Level', render: (s: any) => <StatusBadge status={s.level} tone="brand" /> },
            { key: 'sectors', header: 'Sectors', render: (s: any) => s.sectors.map(sectorName).join(', ') },
            { key: 'regions', header: 'Coverage', render: (s: any) => s.regions.map(regionName).join(', ') },
            { key: 'products', header: 'Products' },
            { key: 'distributors', header: 'Authorised distributors', render: (s: any) => (s.distributors.length ? s.distributors.map((d: any) => `${d.name} (${regionName(d.region)}${d.exclusive ? ', exclusive' : ''})`).join('; ') : '—') },
          ]} />
        )}
      </Card>
      {market.data?.isSupplier && (
        <>
          <Card title="My products">
            {(add.error || archive.error) && <Alert tone="danger">{add.error ?? archive.error}</Alert>}
            <DataTable caption="My products" rows={mine.data ?? []} empty={<EmptyState title="No products listed yet" />} columns={[
              { key: 'name', header: 'Product' }, { key: 'price', header: 'Price', render: (p: any) => (p.price != null ? inr(p.price) : 'On request') },
              { key: 'stock', header: 'Stock', render: (p: any) => <StatusBadge status={p.stock} /> }, { key: 'status', header: 'Listing', render: (p: any) => <StatusBadge status={p.status} /> },
              { key: 'a', header: 'Action', render: (p: any) => <Button size="sm" variant="ghost" onClick={() => archive.run(p.id, p.status === 'published' ? 'archived' : 'published')} aria-label={`${p.status === 'published' ? 'Archive' : 'Publish'} ${p.name}`}>{p.status === 'published' ? 'Archive' : 'Publish'}</Button> },
            ]} />
          </Card>
          <Card title="List a product">
            <Grid cols={2}>
              <TextInput label="Product name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={add.fieldErrors.name} />
              <Select label="Product sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
              <TextInput label="Unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
              <TextInput label="Price per unit (₹, blank = on request)" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
              <TextInput label="Minimum order quantity" inputMode="numeric" value={f.moq} onChange={(e) => setF({ ...f, moq: e.target.value })} />
              <TextInput label="Lead time (days)" inputMode="numeric" value={f.leadTimeDays} onChange={(e) => setF({ ...f, leadTimeDays: e.target.value })} />
            </Grid>
            <TextArea label="Description" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={add.fieldErrors.description} />
            <Button onClick={() => add.run()} loading={add.pending}>List product</Button>
          </Card>
        </>
      )}
    </Screen>
  );
}
