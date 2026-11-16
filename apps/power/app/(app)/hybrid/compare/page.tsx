'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge, Card, Notice, Skeleton } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useApi } from '@/lib/client';
import { DECISION_TEXT, DECISION_TONE, cr, gwh, pctN } from '@/lib/hybridClient';

/** Up to six scenarios side by side. Only results computed for the current inputs are compared. */
function CompareInner() {
  const ids = (useSearchParams().get('ids') ?? '').split(',').filter(Boolean);
  const q = useApi<any[]>('/api/hybrid/scenarios');
  const rows = (q.data ?? []).filter((r) => ids.includes(r.id));
  const val = (r: any, f: (h: any) => string) => (r.headline && !r.stale ? f(r.headline) : <span className="text-slate-400">{r.stale ? 'Out of date' : 'Not simulated'}</span>);
  const lines: [string, (r: any) => React.ReactNode][] = [
    ['Decision', (r) => (r.headline && !r.stale ? <Badge tone={DECISION_TONE[r.decision]}>{DECISION_TEXT[r.decision]}</Badge> : val(r, () => ''))],
    ['Solar / wind', (r) => `${r.inputs.solar.acMw} MW / ${r.inputs.wind.capacityMw} MW`],
    ['BESS', (r) => (r.inputs.bess.powerMw ? `${r.inputs.bess.powerMw} MW / ${r.inputs.bess.energyMwh} MWh` : '—')],
    ['Contract', (r) => `${r.inputs.product.contractedMw} MW · ${r.inputs.product.kind.replace(/_/g, ' ')}`],
    ['Voltage · export limit', (r) => `${r.inputs.grid.voltageKv} kV · ${r.inputs.grid.exportMw} MW`],
    ['PPA / peak tariff', (r) => `₹${r.inputs.prices.ppaRsKwh} / ₹${r.inputs.prices.peakRsKwh}`],
    ['Land needed', (r) => val(r, (h) => `${h.land.requiredAcres.toFixed(0)} of ${h.land.availableAcres} acres`)],
    ['Generation', (r) => val(r, (h) => gwh(h.summary.generationMwh))],
    ['Delivered to buyer', (r) => val(r, (h) => gwh(h.summary.deliveredMwh))],
    ['Contract delivered', (r) => val(r, (h) => pctN(h.compliance.reliability))],
    ['Hours fully served', (r) => val(r, (h) => pctN(h.compliance.hoursFullyServedShare, 0))],
    ['Peak energy delivered', (r) => val(r, (h) => gwh(h.summary.peakDeliveredMwh))],
    ['Curtailment', (r) => val(r, (h) => pctN((h.summary.curtailSolarMwh + h.summary.curtailWindMwh) / Math.max(1, h.summary.generationMwh)))],
    ['Landed cost', (r) => val(r, (h) => `₹${h.landed.landedRsKwh.toFixed(2)}/kWh`)],
    ['Buyer saving', (r) => val(r, (h) => `₹${h.landed.buyerSavingRsKwh.toFixed(2)}/kWh`)],
    ['Capex', (r) => val(r, (h) => cr(h.finance.capex.total, 0))],
    ['Project IRR', (r) => val(r, (h) => pctN(h.finance.projectIrr))],
    ['Equity IRR', (r) => val(r, (h) => pctN(h.finance.equityIrr))],
    ['Minimum DSCR', (r) => val(r, (h) => h.finance.minDscr?.toFixed(2) ?? '—')],
    ['Break-even tariff', (r) => val(r, (h) => (h.finance.breakEvenTariffRsKwh == null ? '—' : `₹${h.finance.breakEvenTariffRsKwh.toFixed(2)}`))],
    ['Main reason', (r) => val(r, (h) => h.decision.why[0] ?? '—')],
  ];
  return (
    <>
      <PageTitle title="Scenario comparison" subtitle="Technical results first. A scenario is never feasible just because it earns a return." />
      {q.error ? <Notice tone="red">{q.error}</Notice> : !q.data ? <Skeleton className="h-96" /> : rows.length < 2 ? <Notice tone="blue">Pick two to six scenarios on the <Link className="underline" href="/hybrid">Lab page</Link>.</Notice> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="border-b border-slate-200 dark:border-white/10"><th className="sticky left-0 bg-white p-3 text-left dark:bg-navy-900" />{rows.map((r) => <th key={r.id} className="p-3 text-left align-bottom font-semibold"><Link href={`/hybrid/${r.id}`} className="hover:underline">{r.name}</Link></th>)}</tr></thead>
            <tbody>{lines.map(([l, f]) => <tr key={l} className="border-b border-slate-100 dark:border-white/5"><th scope="row" className="sticky left-0 bg-white p-3 text-left font-medium text-slate-500 dark:bg-navy-900">{l}</th>{rows.map((r) => <td key={r.id} className="p-3 align-top">{f(r)}</td>)}</tr>)}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}

/** useSearchParams needs a Suspense boundary for the production build. */
export default function Compare() { return <Suspense fallback={null}><CompareInner /></Suspense>; }
