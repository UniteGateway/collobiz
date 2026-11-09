'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FRANCHISE_FORMAT_LABELS, FRANCHISE_STATUS_LABELS } from '@collabiz/types';
import { Alert, Card, EmptyState, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Unit { id: string; code: string; brand: string; franchisee: string; format: string; city: string; status: string; salesThisMonth: number; royaltyTotal: number; monthlyTarget: number | null; checklist: { doneAt: string | null }[] }
interface Res { totals: { live: number; pipeline: number; applied: number; suspended: number; salesThisMonth: number; royaltyTotal: number; cities: number }; brands: { id: string; name: string; open: boolean }[]; units: Unit[] }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { live: 'success', applied: 'info', approved: 'info', agreement_signed: 'info', setup: 'warning', suspended: 'warning' };

/** Franchise network — applications, set-up and live franchise units across Unite brands. */
export default function FranchiseNetwork() {
  const q = useQuery<Res>('/admin/franchise');
  const [f, setF] = useState('pipeline');
  const toggle = useMutation(async (b: { id: string; open: boolean }) => { await api.request('PATCH', `/admin/franchise/brands/${b.id}`, { open: !b.open }); q.reload(); return true; });
  const d = q.data;
  const list = (d?.units ?? []).filter((u) => (f === 'pipeline' ? ['applied', 'approved', 'agreement_signed', 'setup'].includes(u.status) : f === 'live' ? ['live', 'suspended'].includes(u.status) : true));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Franchise" accent="network" sub="Unite brand franchises run by verified partners — applications, set-up checklists, live stores, monthly sales and royalty." chips={['Applications', 'Set-up checklist', 'Monthly sales', 'Royalty']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <KpiRow tint="red" items={[['location', d.totals.live, 'Live franchises', `${d.totals.cities} cities`], ['clock', d.totals.pipeline, 'In the pipeline', `${d.totals.applied} new applications`], ['value', inr(d.totals.salesThisMonth), 'Sales this month', 'reported by franchisees'], ['earnings', inr(d.totals.royaltyTotal), 'Royalty to date', 'on reported sales']]} />
          <div className="cz-ws-cols">
            <Card>
              <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}><h2>Franchises</h2><div className="cz-ws-scroll"><Segmented label="Show" value={f} onChange={setF} options={[{ value: 'pipeline', label: `Pipeline ${d.totals.pipeline}` }, { value: 'live', label: `Live ${d.totals.live + d.totals.suspended}` }, { value: 'all', label: 'All' }]} /></div></div>
              {!list.length ? <EmptyState icon="location" title="No franchises here" /> : (
                <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>{list.map((u) => (
                  <li key={u.id} className="cz-card cz-lead" data-unit={u.city}>
                    <div className="cz-lead-head"><Link href={`/workspace/franchise/${u.id}`}><strong>{u.brand} — {u.city}</strong></Link><span className="cz-muted">{u.franchisee} · {FRANCHISE_FORMAT_LABELS[u.format]} · {u.code}</span><span style={{ marginLeft: 'auto' }}><StatusBadge status={u.status} tone={TONE[u.status] ?? 'neutral'} label={FRANCHISE_STATUS_LABELS[u.status]} /></span></div>
                    <span className="cz-muted" style={{ fontSize: 13 }}>{u.status === 'live' ? `Sales this month ${inr(u.salesThisMonth)}${u.monthlyTarget ? ` of ${inr(u.monthlyTarget)} target` : ''} · royalty to date ${inr(u.royaltyTotal)}` : `Set-up checklist ${u.checklist.filter((c) => c.doneAt).length}/${u.checklist.length}`}</span>
                  </li>
                ))}</ul>
              )}
            </Card>
            <aside className="cz-ws-side">
              <Card title="Brands open to franchising">
                {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
                <ul className="cz-ws-list">{d.brands.map((b) => <li key={b.id}><span>{b.name}</span><button type="button" role="switch" aria-checked={b.open} aria-label={`${b.name} takes franchise applications`} className="cz-switch" data-on={b.open || undefined} onClick={() => toggle.run(b)}><span /></button></li>)}</ul>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
