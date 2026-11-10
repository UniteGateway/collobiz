'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Notice, Stat, mwh, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { SimLoading } from '@/components/Loading';
import { MONTHS, useYear } from '@/lib/useSim';

/** Module 3 — AC-coupled battery: SOC, cycles, energy in/out, losses, degradation and augmentation. */
export default function Battery() {
  const y = useYear();
  if (!y.data) return <><PageTitle title="Battery Storage" /><SimLoading error={y.error} /></>;
  const d = y.data, b = d.project.config.bess, s = d.summary;
  const aug = d.bess.trajectory.filter((t) => t.augmentMwh > 0);
  return (
    <>
      <PageTitle title="Battery Storage" subtitle={`AC-coupled ${b.powerMw} MW / ${b.energyMwh} MWh (${(b.energyMwh / b.powerMw).toFixed(1)} h), round-trip efficiency ${pct(b.roundTripEfficiency, 0)}, SOC ${pct(b.minSocFraction, 0)}–${pct(b.maxSocFraction, 0)}. ${b.gridChargingAllowed ? 'Grid charging allowed.' : 'Charges from solar only.'}`} />
      <Notice tone="blue">Battery discharge is stored solar energy shifted in time — it is never counted as additional generation. Charging and discharging never happen in the same 15-minute interval.</Notice>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Usable energy" value={mwh(d.bess.usableMwh, 1)} hint={`Reserve ${mwh(b.energyMwh * b.minSocFraction, 1)} kept`} />
        <Stat label="Charged / discharged" value={`${mwh(s.chargedMwh)} / ${mwh(s.dischargedMwh)}`} hint={`Grid charging ${mwh(s.gridChargeMwh)}`} tone="blue" />
        <Stat label="Conversion losses" value={mwh(s.batteryLossMwh)} hint={`${pct(s.chargedMwh ? s.batteryLossMwh / s.chargedMwh : 0)} of energy charged`} tone="amber" />
        <Stat label="Equivalent full cycles" value={s.equivalentCycles.toFixed(0)} hint={`${(s.equivalentCycles / 365).toFixed(2)} per day`} tone="green" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="State of charge range by day" subtitle="% of nameplate — daily minimum and maximum">
          <div className="h-64"><ResponsiveContainer><AreaChart data={d.bess.dailySoc}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="day" tickFormatter={(v) => `${v + 1}`} /><YAxis domain={[0, 100]} unit="%" /><Tooltip labelFormatter={(v) => `Day ${Number(v) + 1}`} formatter={(v) => `${Number(v).toFixed(1)}%`} /><Area dataKey="max" name="Max SOC" stroke="#1e6bff" fill="#1e6bff" fillOpacity={0.15} /><Area dataKey="min" name="Min SOC" stroke="#16a34a" fill="#fff" fillOpacity={0.6} /></AreaChart></ResponsiveContainer></div>
        </Card>
        <Card title="Monthly battery energy" subtitle="MWh">
          <div className="h-64"><ResponsiveContainer><BarChart data={d.monthly.map((m, i) => ({ month: MONTHS[i], charged: m.charged, battery: m.battery }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(v) => mwh(Number(v))} /><Legend /><Bar dataKey="charged" name="Charged" fill="#93c5fd" /><Bar dataKey="battery" name="Delivered to industry" fill="#1e6bff" /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Capacity over 25 years" subtitle={`Calendar fade ${pct(b.fadePerYear)}/yr + cycle fade; augmented back to nameplate below ${pct(b.augmentationThreshold, 0)}`} className="lg:col-span-2">
          <div className="h-64"><ResponsiveContainer><LineChart data={d.bess.trajectory}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="year" /><YAxis unit=" MWh" /><Tooltip formatter={(v) => mwh(Number(v), 1)} /><Line type="stepAfter" dataKey="capacityMwh" name="Capacity" stroke="#1e6bff" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{aug.length ? `Augmentation in year ${aug.map((a) => `${a.year} (+${a.augmentMwh.toFixed(1)} MWh)`).join(', ')}. Its cost is carried in the financial model.` : 'No augmentation needed within 25 years at this cycling rate.'}</p>
        </Card>
      </div>
    </>
  );
}
