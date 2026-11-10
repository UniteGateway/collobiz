'use client';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, Notice, Stat, crore, mwh, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { SimLoading } from '@/components/Loading';
import { FlowNow } from '@/components/FlowNow';
import { useApi } from '@/lib/client';
import { useScenario } from '@/components/Scenario';
import { FEAS, LIMITING, MONTHS, useYear } from '@/lib/useSim';

export default function Dashboard() {
  const y = useYear();
  const { query } = useScenario();
  const sv = useApi<{ result: { monthlySaving: number; annualSaving: number; savingPct: number; lifetimeSaving: number } }>(`/api/savings?${query}`);
  if (!y.data) return <><PageTitle title="Executive Dashboard" /><SimLoading error={y.error} /></>;
  const d = y.data, s = d.summary, c = d.project.config, f = d.feasibility.annual, F = FEAS[f.feasibility as keyof typeof FEAS];
  return (
    <>
      <PageTitle title="Executive Dashboard" subtitle={`${d.project.name} · ${c.site.location} · ${c.solar.dcMwp} MWp DC / ${c.solar.acMw} MW AC solar + ${c.bess.powerMw} MW / ${c.bess.energyMwh} MWh BESS · export ${c.delivery.gridExportMw} MW at ${c.delivery.exportVoltageKv} kV`} />
      {d.solar.weather.kind === 'illustrative' && <div className="mb-4"><Notice tone="amber" title="Illustrative weather and prices">{d.solar.weather.label}. Prices and tariffs marked illustrative are placeholders. Results show how the plant behaves, not certified yields or regulated rates.</Notice></div>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Solar generation (AC)" value={mwh(d.solar.acMwh)} hint={`CUF ${pct(d.solar.cufDc.value)} DC · ${pct(d.solar.cufAc.value)} AC`} tone="blue" />
        <Stat label="BESS" value={`${c.bess.powerMw} MW / ${c.bess.energyMwh} MWh`} hint={`${(c.bess.energyMwh / c.bess.powerMw).toFixed(1)} h · ${s.equivalentCycles.toFixed(0)} cycles/yr`} />
        <Stat label="Delivered to industry" value={mwh(s.directMwh + s.batteryToLoadMwh)} hint={`${pct(s.demandCoverage)} of ${c.delivery.contractedMw} MW × 6 AM–10 PM`} tone="green" />
        <Stat label={`${c.delivery.contractedMw} MW contract`} value={<Badge tone={F.tone}>{F.label}</Badge>} hint={`Limiting: ${LIMITING[f.limiting]}`} />
        <Stat label="Developer revenue (yr 1)" value={crore(d.revenue.net)} hint={`PPA ${crore(d.revenue.ppa)} · peak ${crore(d.revenue.peak)} · export ${crore(d.revenue.merchant)}`} tone="blue" />
        <Stat label="Consumer saving (example)" value={sv.data ? crore(sv.data.result.annualSaving) : '…'} hint={sv.data ? `${pct(sv.data.result.savingPct)} of the bill · ${crore(sv.data.result.lifetimeSaving)} over 25 yrs` : 'Illustrative consumer'} tone="green" />
        <Stat label="Curtailed" value={mwh(s.curtailedMwh)} hint={`Clipped at inverter ${mwh(d.solar.clippedMwh)}`} tone="amber" />
        <Stat label="Unserved contract energy" value={mwh(s.unservedMwh)} hint={`Firm availability ${pct(d.firmAvailability)} of window intervals`} tone="red" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Simulated power flow now" className="lg:col-span-2"><FlowNow /></Card>
        <Card title="Profitability" subtitle="Full 25-year model on Financial Analysis">
          <p className="text-sm text-slate-600 dark:text-slate-300">Year-1 net revenue {crore(d.revenue.net)} from {mwh(s.poiMwh)} at the point of interconnection.</p>
          <Link href="/finance" className="mt-3 inline-block text-sm font-medium text-blue-500">Open the financial model →</Link>
        </Card>
      </div>
      <Card title="Monthly energy" subtitle="MWh — solar generation vs where it went" className="mt-4">
        <div className="h-72"><ResponsiveContainer><BarChart data={d.monthly.map((m, i) => ({ month: MONTHS[i], ...m }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => mwh(Number(v))} /><Legend />
          <Bar isAnimationActive={false} dataKey="direct" name="Direct to industry" stackId="a" fill="#16a34a" /><Bar isAnimationActive={false} dataKey="battery" name="Battery to industry" stackId="a" fill="#1e6bff" /><Bar isAnimationActive={false} dataKey="exported" name="Exported (uncontracted)" stackId="a" fill="#93c5fd" /><Bar isAnimationActive={false} dataKey="curtailed" name="Curtailed" stackId="a" fill="#f59e0b" /><Bar isAnimationActive={false} dataKey="unserved" name="Unserved demand" fill="#ef4444" /></BarChart></ResponsiveContainer></div>
      </Card>
      <p className="mt-3 text-[12px] text-slate-500">Simulation {d.computedMs > 0 ? `computed in ${(d.computedMs / 1000).toFixed(1)} s` : 'from cache'} · mode {d.req.mode.replace(/_/g, ' ')} · weather {d.req.scenario.replace(/_/g, ' ')}</p>
    </>
  );
}
