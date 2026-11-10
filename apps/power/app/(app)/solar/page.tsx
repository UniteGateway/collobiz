'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, Notice, Stat, mwh, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { SimLoading } from '@/components/Loading';
import { useScenario } from '@/components/Scenario';
import { useApi } from '@/lib/client';
import { MONTHS, useYear } from '@/lib/useSim';

interface Scen { target: number; basis: 'dc' | 'ac'; achievable: boolean; note: string | null; acMwh: number; clippedMwh: number; cufDc: number; cufAc: number; irradianceScale: number }
/** Module 2 — solar generation: realistic daily curves, seasonal/monsoon variation, clipping, degradation, CUF on two bases. */
export default function Solar() {
  const y = useYear();
  const { query } = useScenario();
  const sc = useApi<{ rows: Scen[] }>('/api/solar/scenarios');
  const day = useApi<{ points: { time: string; solar: number; dc: number; clipped: number; poa: number }[] }>(`/api/sim/day?${query}&day=80`);
  const dayJul = useApi<{ points: { time: string; solar: number }[] }>(`/api/sim/day?${query}&day=196`);
  if (!y.data) return <><PageTitle title="Solar Generation" /><SimLoading error={y.error} /></>;
  const d = y.data, c = d.project.config;
  const typ = day.data?.points.map((p, i) => ({ ...p, july: dayJul.data?.points[i]?.solar ?? 0 }));
  return (
    <>
      <PageTitle title="Solar Generation" subtitle="Physics model at 15-minute resolution: sun position, clear-sky irradiance, cloud and monsoon variation, temperature and inverter losses, degradation and AC clipping."
        actions={<a href={`/api/sim/export?${query}&range=year`}><Button variant="secondary">Export 8,760-hour profile (CSV)</Button></a>} />
      <div className="mb-4"><Notice tone={d.solar.weather.kind === 'illustrative' ? 'amber' : 'blue'} title={`Weather source: ${d.solar.weather.kind === 'illustrative' ? 'illustrative' : d.solar.weather.kind}`}>{d.solar.weather.label}. PVGIS and NASA POWER are wired as data sources but are not reachable from this server yet (network access needed); the CUF scenarios below calibrate the model to your stated CUF instead.</Notice></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="AC energy (year 1)" value={mwh(d.solar.acMwh)} tone="blue" hint={`DC ${mwh(d.solar.dcMwh)}`} />
        <Stat label="CUF — DC basis" value={pct(d.solar.cufDc.value, 2)} hint={d.solar.cufDc.denominator} />
        <Stat label="CUF — AC basis" value={pct(d.solar.cufAc.value, 2)} hint={d.solar.cufAc.denominator} />
        <Stat label="Clipped at inverter" value={mwh(d.solar.clippedMwh)} hint={`Peak AC ${d.solar.peakAcMw.toFixed(1)} MW of ${c.solar.acMw} MW`} tone="amber" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Typical days" subtitle="MW AC — 21 March vs 15 July (monsoon)">
          <div className="h-72"><ResponsiveContainer><AreaChart data={typ ?? []} syncId="solar"><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="time" interval={11} /><YAxis unit=" MW" /><Tooltip formatter={(v) => `${Number(v).toFixed(2)} MW`} />
            <Area dataKey="solar" name="21 Mar AC" stroke="#1e6bff" fill="#1e6bff" fillOpacity={0.18} /><Area dataKey="july" name="15 Jul AC" stroke="#16a34a" fill="#16a34a" fillOpacity={0.12} /><Area dataKey="clipped" name="Clipped" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} /></AreaChart></ResponsiveContainer></div>
        </Card>
        <Card title="Monthly generation" subtitle="MWh AC — monsoon months are lower">
          <div className="h-72"><ResponsiveContainer><BarChart data={d.monthly.map((m, i) => ({ month: MONTHS[i], solar: m.solar }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => mwh(Number(v))} /><Bar dataKey="solar" name="Solar AC" fill="#1e6bff" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Daily energy through the year" subtitle="MWh AC per day" className="lg:col-span-2">
          <div className="h-56"><ResponsiveContainer><LineChart data={d.daily}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="day" tickFormatter={(v) => `${v + 1}`} /><YAxis /><Tooltip labelFormatter={(v) => `Day ${Number(v) + 1}`} formatter={(v) => mwh(Number(v), 1)} /><Line dataKey="solar" dot={false} stroke="#1e6bff" strokeWidth={1.5} /></LineChart></ResponsiveContainer></div>
        </Card>
      </div>
      <Card title="CUF scenarios (19–22%)" subtitle="Each target reached by changing the weather input, not the output; the other-basis CUF and clipping follow from the plant" className="mt-4">
        {!sc.data ? <p className="text-sm text-slate-500">Calibrating eight scenarios…</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">CUF scenarios</caption><thead className="text-left text-[12px] text-slate-500"><tr><th className="py-2">Target</th><th>Basis</th><th className="text-right">AC energy</th><th className="text-right">CUF DC</th><th className="text-right">CUF AC</th><th className="text-right">Clipped</th><th>Status</th></tr></thead>
            <tbody>{sc.data.rows.map((r) => <tr key={`${r.target}-${r.basis}`} className="border-t border-slate-100 dark:border-white/10"><td className="py-2">{pct(r.target, 0)}</td><td>{r.basis.toUpperCase()} ({r.basis === 'dc' ? `${c.solar.dcMwp} MWp` : `${c.solar.acMw} MW`})</td><td className="text-right tabular-nums">{mwh(r.acMwh)}</td><td className="text-right tabular-nums">{pct(r.cufDc, 2)}</td><td className="text-right tabular-nums">{pct(r.cufAc, 2)}</td><td className="text-right tabular-nums">{mwh(r.clippedMwh)}</td><td>{r.achievable ? <Badge tone="green">Reachable</Badge> : <Badge tone="red">{r.note}</Badge>}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
