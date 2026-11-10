'use client';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, Notice, Stat, mwh, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { SimLoading } from '@/components/Loading';
import { FEAS, LIMITING, MONTHS, useYear } from '@/lib/useSim';

/** Module 11 — CUF & reliability: every utilisation figure with its denominator; deliverability with the limiting factor. */
export default function Cuf() {
  const y = useYear();
  if (!y.data) return <><PageTitle title="CUF & Reliability" /><SimLoading error={y.error} /></>;
  const d = y.data, f = d.feasibility, a = f.annual, c = d.project.config, F = FEAS[a.feasibility as keyof typeof FEAS];
  return (
    <>
      <PageTitle title="CUF & Reliability" subtitle={`Can ${c.delivery.contractedMw} MW be delivered from ${c.delivery.windowStartHour}:00 to ${c.delivery.windowEndHour}:00 every day? Checked from the full 15-minute simulation.`} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <Badge tone={F.tone}>{F.label}</Badge>
          <p className="text-[15px]"><strong>{pct(a.coverage)}</strong> of contracted energy delivered from the plant in the year. Limiting factor: <strong>{LIMITING[a.limiting]}</strong>.</p>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Energy test, independent of dispatch: the contract needs {mwh(f.energyTest.annualDemandMwh)} a year; the plant makes {mwh(f.energyTest.annualSolarMwh)}, of which at most {mwh(f.energyTest.maxDeliverableMwh)} ({pct(f.energyTest.ratio)}) could reach the buyer in the window even with perfect storage after round-trip losses.</p>
      </Card>
      <div className="grid grid-cols-3 gap-4"><Stat label="Feasible days" value={a.feasibleDays} tone="green" /><Stat label="Conditionally feasible days" value={a.conditionalDays} tone="amber" /><Stat label="Not feasible days" value={a.notFeasibleDays} tone="red" /></div>
      <Card title="Utilisation measures" subtitle="Each has its own numerator and denominator. They are separate measures and are never added together." className="mt-4">
        <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Utilisation measures</caption><thead className="text-left text-[12px] text-slate-500"><tr><th className="py-2">Measure</th><th className="text-right">Value</th><th className="pl-4">Numerator</th><th>Denominator</th></tr></thead>
          <tbody>{d.metrics.map((m) => <tr key={m.label} className="border-t border-slate-100 dark:border-white/10" data-metric={m.label}><td className="py-2 font-medium">{m.label}</td><td className="text-right tabular-nums">{m.label.includes('cycles') ? m.value.toFixed(0) : pct(m.value, 2)}</td><td className="pl-4 text-slate-600 dark:text-slate-300">{m.numerator}</td><td className="text-slate-600 dark:text-slate-300">{m.denominator}</td></tr>)}
            <tr className="border-t border-slate-100 dark:border-white/10"><td className="py-2 font-medium">Firm-power availability</td><td className="text-right tabular-nums">{pct(d.firmAvailability, 1)}</td><td className="pl-4 text-slate-600">Window intervals with the full contracted MW from the plant</td><td className="text-slate-600">All 15-minute intervals in the delivery window</td></tr>
          </tbody></table></div>
        <div className="mt-3"><Notice tone="amber">{f.note} A figure like “40% CUF” obtained by adding solar CUF to battery utilisation is not valid and is not shown.</Notice></div>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Hourly demand coverage" subtitle="Share of contracted MW served, by hour of day">
          <div className="h-64"><ResponsiveContainer><BarChart data={d.hourlyCoverage.filter((h) => h.coverage != null).map((h) => ({ hour: `${h.hour}:00`, coverage: (h.coverage ?? 0) * 100 }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="hour" /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} /><ReferenceLine y={99.5} stroke="#16a34a" strokeDasharray="3 3" /><Bar dataKey="coverage" name="Coverage" radius={[4, 4, 0, 0]}>{d.hourlyCoverage.filter((h) => h.coverage != null).map((h) => <Cell key={h.hour} fill={(h.coverage ?? 0) >= 0.995 ? '#16a34a' : (h.coverage ?? 0) >= 0.9 ? '#f59e0b' : '#ef4444'} />)}</Bar></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Monthly deliverability">
          <table className="w-full text-sm"><caption className="sr-only">Monthly deliverability</caption><tbody>{f.monthly.map((m) => { const M = FEAS[m.feasibility as keyof typeof FEAS]; return <tr key={m.month} className="border-t border-slate-100 first:border-0 dark:border-white/10" data-month={MONTHS[m.month]}><td className="py-1.5 font-medium">{MONTHS[m.month]}</td><td className="text-right tabular-nums">{pct(m.coverage)}</td><td className="pl-3"><Badge tone={M.tone}>{M.label}</Badge></td><td className="pl-3 text-[12px] text-slate-500">{LIMITING[m.limiting]}</td></tr>; })}</tbody></table>
        </Card>
      </div>
      <Card title="Limiting factors across the year" subtitle="Days on which each constraint stopped full delivery" className="mt-4">
        <div className="flex flex-wrap gap-2">{Object.entries(f.limitingCounts).filter(([, n]) => n > 0).map(([k, n]) => <Badge key={k} tone={k === 'none' ? 'green' : 'slate'}>{LIMITING[k]}: {n} days</Badge>)}</div>
        <h3 className="mt-4 text-sm font-semibold">Hardest days</h3>
        <ul className="mt-1 space-y-1 text-sm">{f.worstDays.map((w) => <li key={w.day}><strong>Day {w.day + 1}</strong> · {pct(w.coverage)} served · {w.detail}</li>)}</ul>
      </Card>
    </>
  );
}
