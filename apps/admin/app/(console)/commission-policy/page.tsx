'use client';
import { useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DataTable, EmptyState, Grid, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

const inr = (m?: number | null) => (m == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(m / 100));
const toMinor = (v: string) => (v.trim() === '' ? undefined : Math.round(Number(v) * 100));

/** Screen 135 — Commission Policy Configuration (draft by a commission admin, activation by a second finance approver). */
export default function CommissionPolicy() {
  const { me } = useSession();
  const q = useQuery<any[]>('/commissions/policies');
  const [f, setF] = useState({ code: '', name: '', sector: '', basis: 'percent', rate: '2', flat: '', tier1: '100000000', tier1Rate: '2.5', tier2Rate: '1.5', tds: '5', clawback: '90' });
  const canDraft = me?.capabilities.includes('commission.configure');
  const canActivate = me?.capabilities.includes('commission.approve');
  const draft = useMutation(async () => {
    const tiers = f.basis === 'tiered' ? [{ upTo: toMinor(f.tier1) ?? null, rateBps: Math.round(Number(f.tier1Rate) * 100) }, { upTo: null, rateBps: Math.round(Number(f.tier2Rate) * 100) }] : undefined;
    await api.post('/admin/commission-policies', { code: f.code.toUpperCase(), name: f.name, sector: f.sector || undefined, basis: f.basis, rateBps: f.basis === 'percent' ? Math.round(Number(f.rate) * 100) : undefined, flatAmount: f.basis === 'flat' ? toMinor(f.flat) : undefined, tiers, tdsBps: Math.round(Number(f.tds) * 100), clawbackDays: Number(f.clawback) || 0 });
    q.reload(); return true;
  });
  const act = useMutation(async (id: string, action: string) => { await api.post(`/admin/commission-policies/${id}/${action}`); q.reload(); return true; });
  const terms = (p: any) => (p.basis === 'percent' ? `${p.rateBps / 100}%` : p.basis === 'flat' ? inr(p.flatAmount) : p.tiers.map((t: any) => `${t.rateBps / 100}%${t.upTo ? ` ≤ ${inr(t.upTo)}` : ' above'}`).join(', '));
  return (
    <Screen id="135" description="Rates are demo values until the sector commission matrix is approved (B-10). An active policy is never edited: draft a new version and activate it; agreements keep the terms they were created with.">
      {(draft.error || act.error) && <Alert tone="danger">{draft.error ?? act.error}</Alert>}
      <Card title="Policies">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Commission policies" rows={q.data ?? []} empty={<EmptyState title="No policies" />} columns={[
            { key: 'code', header: 'Policy', render: (p: any) => <>{p.name}<div className="cz-mono cz-muted">{p.code} v{p.version}{p.sector ? ` · ${sectorName(p.sector)}` : ''}</div></> },
            { key: 'terms', header: 'Rate', render: terms }, { key: 'tds', header: 'TDS', render: (p: any) => `${p.tdsBps / 100}%` }, { key: 'clawback', header: 'Clawback', render: (p: any) => `${p.clawbackDays} days` },
            { key: 'status', header: 'Status', render: (p: any) => <>{<StatusBadge status={p.status} />}{p.legalReviewed !== 'approved' && <div className="cz-muted" style={{ fontSize: 12 }}>legal review pending</div>}</> },
            { key: 'a', header: 'Action', render: (p: any) => (p.status === 'draft' && canActivate ? <Button size="sm" onClick={() => act.run(p.id, 'activate')} aria-label={`Activate ${p.code} v${p.version}`}>Activate</Button> : p.status === 'active' && canDraft ? <Button size="sm" variant="ghost" onClick={() => act.run(p.id, 'retire')} aria-label={`Retire ${p.code} v${p.version}`}>Retire</Button> : null) },
          ]} />
        )}
      </Card>
      {canDraft && (
        <Card title="Draft a policy or a new version">
          <Grid cols={3}>
            <TextInput label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} error={draft.fieldErrors.code} hint="Same code = new version" />
            <TextInput label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={draft.fieldErrors.name} />
            <Select label="Sector (optional)" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} placeholder="Any sector" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
            <Select label="Basis" value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })} options={[{ value: 'percent', label: 'Percentage' }, { value: 'flat', label: 'Flat amount' }, { value: 'tiered', label: 'Tiered' }]} />
            {f.basis === 'percent' && <TextInput label="Rate (%)" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />}
            {f.basis === 'flat' && <TextInput label="Flat amount (₹)" inputMode="decimal" value={f.flat} onChange={(e) => setF({ ...f, flat: e.target.value })} />}
            {f.basis === 'tiered' && <><TextInput label="Tier 1 up to (₹)" inputMode="decimal" value={f.tier1} onChange={(e) => setF({ ...f, tier1: e.target.value })} /><TextInput label="Tier 1 rate (%)" inputMode="decimal" value={f.tier1Rate} onChange={(e) => setF({ ...f, tier1Rate: e.target.value })} /><TextInput label="Above tier 1 (%)" inputMode="decimal" value={f.tier2Rate} onChange={(e) => setF({ ...f, tier2Rate: e.target.value })} /></>}
            <TextInput label="TDS (%)" inputMode="decimal" value={f.tds} onChange={(e) => setF({ ...f, tds: e.target.value })} />
            <TextInput label="Clawback window (days)" inputMode="numeric" value={f.clawback} onChange={(e) => setF({ ...f, clawback: e.target.value })} />
          </Grid>
          <Button onClick={() => draft.run()} loading={draft.pending}>Save draft</Button>
          <p className="cz-muted" style={{ fontSize: 13 }}>A different person with finance approval rights activates the draft.</p>
        </Card>
      )}
    </Screen>
  );
}
