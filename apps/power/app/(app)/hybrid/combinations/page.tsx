'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge, Button, Card, Field, Notice, Select } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { api, useApi } from '@/lib/client';
import { DECISION_TEXT, DECISION_TONE, cr, pctN, useJob } from '@/lib/hybridClient';

interface Row { id: string; solarAcMw: number; windMw: number; bessMw: number; bessMwh: number; pruned?: string; reliability?: number; hoursServed?: number; equityIrr?: number | null; projectIrr?: number | null; npvCr?: number; lcoe?: number; capexCr?: number; curtailedShare?: number; landAcres?: number; technical?: string; decision?: string; pareto?: boolean }
interface Run { id: string; result: { ranked: Row[]; pruned: Row[]; screeningDays: number; note: string } }

/** Combination builder: enumerate solar, wind and BESS sizes around a base scenario, prune the impossible, screen and rank. */
function CombinationsInner() {
  const from = useSearchParams().get('from');
  const router = useRouter();
  const list = useApi<{ id: string; name: string }[]>('/api/hybrid/scenarios');
  const [base, setBase] = useState(from ?? '');
  const [f, setF] = useState({ s0: 20, s1: 60, ss: 20, w0: 0, w1: 40, ws: 20, b0: 0, b1: 40, bs: 20, hours: '2,4', budget: '', rankBy: 'reliability' });
  const [run, setRun] = useState<Run | null>(null); const [err, setErr] = useState<string>();
  const job = useJob(async (j) => { setRun(await api<Run>(`/api/hybrid/combinations/${j.resultId}`)); });
  const n = (k: keyof typeof f, label: string, unit: string) => <Field label={label} type="number" suffix={unit} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />;
  const count = (Math.floor((f.s1 - f.s0) / f.ss) + 1) * (Math.floor((f.w1 - f.w0) / f.ws) + 1) * ((f.b0 === 0 ? 1 : 0) + (Math.floor((f.b1 - Math.max(f.b0, f.bs)) / f.bs) + 1) * f.hours.split(',').filter(Boolean).length);
  const go = async () => {
    setErr(undefined); setRun(null);
    try { await job.start('/api/hybrid/combinations', { scenarioId: base || list.data?.[0]?.id, request: { solarAcMw: { min: f.s0, max: f.s1, step: f.ss }, windMw: { min: f.w0, max: f.w1, step: f.ws }, bessMw: { min: f.b0, max: f.b1, step: f.bs }, bessHours: f.hours.split(',').map(Number).filter((x) => x > 0), budgetCr: f.budget ? Number(f.budget) : undefined, rankBy: f.rankBy } }); }
    catch (e) { setErr((e as Error).message); }
  };
  const create = async (c: Row) => {
    const src = await api<any>(`/api/hybrid/scenarios/${base}`);
    const inputs = { ...src.inputs, solar: { ...src.inputs.solar, acMw: c.solarAcMw, dcMwp: Math.round(c.solarAcMw * (src.inputs.solar.acMw > 0 ? src.inputs.solar.dcMwp / src.inputs.solar.acMw : 1.3)) }, wind: { ...src.inputs.wind, capacityMw: c.windMw }, bess: { ...src.inputs.bess, powerMw: c.bessMw, energyMwh: c.bessMwh } };
    const r = await api<{ id: string }>('/api/hybrid/scenarios', { method: 'POST', body: JSON.stringify({ fromId: base, name: `${src.name.split(' — ')[0]} — ${c.id}`, inputs }) });
    router.push(`/hybrid/${r.id}`);
  };
  const running = job.job?.status === 'running';
  return (
    <>
      <PageTitle title="Combination builder" subtitle="Keeps the base scenario’s site, contract, prices and costs; varies solar, wind and battery sizes. Combinations that break land, grid or budget limits are removed before simulation." />
      {err && <div className="mb-3"><Notice tone="red">{err}</Notice></div>}
      <Card title="Search space">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Base scenario" value={base} onChange={(e) => setBase(e.target.value)} options={[{ value: '', label: 'Choose…' }, ...(list.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
          {n('s0', 'Solar from', 'MW')}{n('s1', 'Solar to', 'MW')}{n('ss', 'Solar step', 'MW')}{n('w0', 'Wind from', 'MW')}{n('w1', 'Wind to', 'MW')}{n('ws', 'Wind step', 'MW')}{n('b0', 'BESS from', 'MW')}{n('b1', 'BESS to', 'MW')}{n('bs', 'BESS step', 'MW')}
          <Field label="BESS durations" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} hint="Hours, comma separated" />
          <Field label="Budget (optional)" type="number" suffix="₹ cr" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
          <Select label="Rank by" value={f.rankBy} onChange={(e) => setF({ ...f, rankBy: e.target.value })} options={[{ value: 'reliability', label: 'Delivery compliance' }, { value: 'equity_irr', label: 'Equity IRR' }, { value: 'npv', label: 'NPV' }, { value: 'lcoe', label: 'Lowest LCOE' }, { value: 'capex', label: 'Lowest capex' }]} />
        </div>
        <div className="mt-4 flex items-center gap-3"><Button onClick={go} disabled={running || !base || count > 60}>{running ? 'Screening…' : `Compare ${count} combinations`}</Button>{count > 60 && <span className="text-[13px] text-red-500">Narrow the ranges to 60 or fewer.</span>}
          {running && job.job && <span className="text-[13px] tabular-nums" role="status">{job.job.done} / {job.job.total}</span>}</div>
      </Card>
      {job.job?.status === 'failed' && <div className="mt-3"><Notice tone="red">{job.job.error}</Notice></div>}
      {run && (
        <Card className="mt-4 overflow-x-auto" title={`Ranked combinations (${run.result.ranked.length})`} subtitle={run.result.note}>
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500 dark:border-white/10">{['Solar', 'Wind', 'BESS', 'Contract delivered', 'Hours served', 'Curtailed', 'Capex', 'Project IRR', 'Equity IRR', 'LCOE', 'Status', ''].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{run.result.ranked.map((c, i) => (
              <tr key={c.id} data-combo={c.id} className="border-b border-slate-100 dark:border-white/5">
                <td className="p-2">{i === 0 && <Badge tone="green">Top</Badge>} {c.solarAcMw} MW</td><td className="p-2">{c.windMw} MW</td><td className="p-2">{c.bessMw ? `${c.bessMw} MW / ${c.bessMwh} MWh` : '—'}</td>
                <td className="p-2 font-medium">{pctN(c.reliability)}</td><td className="p-2">{pctN(c.hoursServed, 0)}</td><td className="p-2">{pctN(c.curtailedShare)}</td><td className="p-2">{cr(c.capexCr, 0)}</td><td className="p-2">{pctN(c.projectIrr)}</td><td className="p-2">{pctN(c.equityIrr)}</td><td className="p-2">₹{c.lcoe?.toFixed(2)}</td>
                <td className="p-2"><Badge tone={DECISION_TONE[c.decision ?? ''] ?? 'slate'}>{DECISION_TEXT[c.decision ?? ''] ?? '—'}</Badge>{c.pareto && <span className="ml-1"><Badge tone="blue">Pareto</Badge></span>}</td>
                <td className="p-2"><button className="text-blue-600 hover:underline" onClick={() => create(c)}>Create scenario</button></td>
              </tr>
            ))}</tbody>
          </table>
          {run.result.pruned.length > 0 && <details className="mt-3 text-[13px]"><summary className="cursor-pointer text-slate-500">{run.result.pruned.length} removed before simulation</summary><ul className="mt-2 list-disc pl-5">{run.result.pruned.map((c) => <li key={c.id}>{c.id}: {c.pruned}</li>)}</ul></details>}
          <p className="mt-3 text-[12px] text-slate-500">Pareto: no other combination is at least as good on delivery, NPV and capex and better on one. Create a scenario from a row to run the full year and review it. <Link href="/hybrid" className="underline">All scenarios</Link></p>
        </Card>
      )}
    </>
  );
}

/** useSearchParams needs a Suspense boundary for the production build. */
export default function Combinations() { return <Suspense fallback={null}><CombinationsInner /></Suspense>; }
