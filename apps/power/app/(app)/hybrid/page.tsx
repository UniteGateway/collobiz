'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, Notice, Skeleton } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { api, useApi } from '@/lib/client';
import { DECISION_TEXT, DECISION_TONE, cr, pctN } from '@/lib/hybridClient';

interface Row {
  id: string; name: string; sampleKey: string | null; stale: boolean; decision: string | null; reviewStage: string; computedAt: string | null;
  inputs: { solar: { acMw: number }; wind: { capacityMw: number }; bess: { powerMw: number; energyMwh: number }; product: { kind: string; contractedMw: number }; grid: { voltageKv: number; exportMw: number }; illustrative: boolean };
  headline: { compliance: { reliability: number; hoursFullyServedShare: number }; finance: { capex: { total: number }; projectIrr: number | null } } | null;
}

/** Hybrid Power Lab — every scenario with its decision status; pick up to six to compare side by side. */
export default function HybridLab() {
  const router = useRouter();
  const q = useApi<Row[]>('/api/hybrid/scenarios');
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string>();
  const create = async (fromId?: string, name?: string) => {
    setBusy(true); setErr(undefined);
    try { const r = await api<{ id: string }>('/api/hybrid/scenarios', { method: 'POST', body: JSON.stringify({ fromId, name: name ?? 'New hybrid scenario' }) }); router.push(`/hybrid/${r.id}?tab=inputs`); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]));
  return (
    <>
      <PageTitle title="Hybrid Power Lab" subtitle="Design. Simulate. Optimise. Compare solar, wind and battery combinations hour by hour against a delivery contract, open-access charges and project returns — before negotiating a PPA."
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => router.push('/hybrid/policies')}>Regulatory sources</Button>
          <Button variant="secondary" disabled={pick.length < 2} onClick={() => router.push(`/hybrid/compare?ids=${pick.join(',')}`)}>Compare {pick.length ? `(${pick.length})` : ''}</Button>
          <Button onClick={() => create()} disabled={busy}>New scenario</Button>
        </div>} />
      <Notice tone="amber" title="Illustrative data">Solar and wind resource data, costs and open-access charges are illustrative until site measurements, quotations and verified orders are loaded. Each result says so; none is a recommendation to sign.</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.error ? <Notice tone="red">{q.error}</Notice> : !q.data ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />) : q.data.map((r) => (
          <Card key={r.id} className="flex flex-col" title={<Link href={`/hybrid/${r.id}`} className="hover:underline" data-scenario={r.sampleKey ?? r.name}>{r.name}</Link>}
            action={<input type="checkbox" aria-label={`Compare ${r.name}`} checked={pick.includes(r.id)} onChange={() => toggle(r.id)} className="mt-1 h-4 w-4" />}>
            <div className="flex flex-wrap gap-1.5 text-[12px]">
              {r.inputs.solar.acMw > 0 && <Badge tone="amber">Solar {r.inputs.solar.acMw} MW</Badge>}
              {r.inputs.wind.capacityMw > 0 && <Badge tone="blue">Wind {r.inputs.wind.capacityMw} MW</Badge>}
              {r.inputs.bess.powerMw > 0 && <Badge tone="green">BESS {r.inputs.bess.powerMw} MW / {r.inputs.bess.energyMwh} MWh</Badge>}
              <Badge>{r.inputs.grid.voltageKv} kV · {r.inputs.grid.exportMw} MW export</Badge>
            </div>
            <p className="mt-3 text-[13px] text-slate-500">{r.inputs.product.contractedMw} MW · {r.inputs.product.kind.replace(/_/g, ' ')}</p>
            <div className="mt-auto pt-4">
              {r.headline ? (
                <div className="flex items-end justify-between gap-2">
                  <div className="text-[13px]"><div><strong className="text-[20px] text-navy-900 dark:text-white">{pctN(r.headline.compliance.reliability)}</strong> <span className="text-slate-500">of contracted energy</span></div>
                    <div className="text-slate-500">{pctN(r.headline.compliance.hoursFullyServedShare, 0)} of hours fully served · capex {cr(r.headline.finance.capex.total, 0)}</div></div>
                  <Badge tone={DECISION_TONE[r.decision ?? ''] ?? 'slate'}>{DECISION_TEXT[r.decision ?? ''] ?? '—'}</Badge>
                </div>
              ) : <p className="text-[13px] text-slate-500">Not simulated yet.</p>}
              {r.stale && <p className="mt-2 text-[12px] text-amber-600">Inputs changed since the last run — results are out of date.</p>}
              <div className="mt-3 flex gap-2"><Link href={`/hybrid/${r.id}`} className="text-[13px] font-medium text-blue-600 hover:underline">Open</Link><button className="text-[13px] text-slate-500 hover:underline" onClick={() => create(r.id, `${r.name} (copy)`)}>Duplicate</button></div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
