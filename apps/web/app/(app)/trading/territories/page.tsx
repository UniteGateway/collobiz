'use client';
import { useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, DataTable, EmptyState, Grid, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inDays, inr, TradingTabs, when } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { INDIA_STATES, regionName, toMinor } from '@/lib/regions';

/** Screen 093 — Distributor Territory Management (exclusive territories cannot overlap; enquiries route to them). */
export default function Territories() {
  const q = useQuery<any[]>('/trading/territories');
  const sup = useQuery<any[]>('/trading/suppliers');
  const [f, setF] = useState({ distributorOrgId: '', region: 'IN-KA', sector: 'power_equipment', exclusive: false, startDate: inDays(0), endDate: inDays(365), targetValue: '' });
  const [rev, setRev] = useState('');
  const grant = useMutation(async () => { await api.post('/trading/territories', { ...f, targetValue: toMinor(f.targetValue) }); q.reload(); sup.reload(); return true; });
  const revoke = useMutation(async (id: string) => { await api.post(`/trading/territories/${id}/revoke`, { reason: rev }); setRev(''); q.reload(); return true; });
  const distributors = (sup.data ?? []).filter((s) => s.types.includes('distributor'));
  return (
    <Screen id="093" description="Manufacturers and traders appoint distributors by region and sector. Enquiries from buyers in an exclusive territory are routed to the appointed distributor.">
      <TradingTabs />
      {(grant.error || revoke.error) && <Alert tone="danger">{grant.error ?? revoke.error}</Alert>}
      <Card title="Territories">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Territories" rows={q.data ?? []} empty={<EmptyState title="No territories" />} columns={[
            { key: 'party', header: 'Appointment', render: (t: any) => (t.side === 'supplier' ? `${t.distributor} (your distributor)` : `Distributor for ${t.supplier}`) },
            { key: 'region', header: 'Region', render: (t: any) => regionName(t.region) }, { key: 'sector', header: 'Sector', render: (t: any) => sectorName(t.sector) },
            { key: 'exclusive', header: 'Type', render: (t: any) => <StatusBadge status={t.exclusive ? 'exclusive' : 'non_exclusive'} tone={t.exclusive ? 'brand' : 'neutral'} label={t.exclusive ? 'Exclusive' : 'Non-exclusive'} /> },
            { key: 'period', header: 'Period', render: (t: any) => `${when(t.startDate)} → ${when(t.endDate)}` },
            { key: 'targetValue', header: 'Target', render: (t: any) => (t.targetValue ? inr(t.targetValue) : '—') },
            { key: 'status', header: 'Status', render: (t: any) => <StatusBadge status={t.status === 'active' && !t.current ? 'scheduled' : t.status} /> },
            { key: 'a', header: 'Revoke', render: (t: any) => (t.side === 'supplier' && t.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => revoke.run(t.id)} disabled={rev.trim().length < 5} aria-label={`Revoke ${t.distributor} ${t.region}`}>Revoke</Button> : null) },
          ]} />
        )}
        {(q.data ?? []).some((t) => t.side === 'supplier' && t.status === 'active') && <TextInput label="Reason for revoking" value={rev} onChange={(e) => setRev(e.target.value)} />}
      </Card>
      <Card title="Appoint a distributor">
        <Grid cols={3}>
          <Select label="Distributor" value={f.distributorOrgId} onChange={(e) => setF({ ...f, distributorOrgId: e.target.value })} placeholder="Choose a verified distributor" options={distributors.map((d) => ({ value: d.id, label: d.name }))} error={grant.fieldErrors.distributorOrgId} />
          <Select label="Region" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
          <Select label="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          <TextInput label="From" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
          <TextInput label="To" type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} error={grant.fieldErrors.endDate} />
          <TextInput label="Annual target (₹, optional)" inputMode="decimal" value={f.targetValue} onChange={(e) => setF({ ...f, targetValue: e.target.value })} />
        </Grid>
        <Checkbox label="Exclusive territory" checked={f.exclusive} onChange={(e) => setF({ ...f, exclusive: e.target.checked })} />
        <Button onClick={() => grant.run()} disabled={!f.distributorOrgId} loading={grant.pending}>Appoint distributor</Button>
      </Card>
    </Screen>
  );
}
