'use client';
/** Simulated real-time power flow for the current time of day on today's date (from the simulated year). */
import { useEffect, useState } from 'react';
import { BatteryCharging, Factory, Sun, UtilityPole } from 'lucide-react';
import { useScenario } from './Scenario';
import { useApi } from '@/lib/client';

interface Pt { time: string; solar: number; direct: number; charge: number; discharge: number; batteryToLoad: number; uncontractedExport: number; curtailed: number; unserved: number; load: number; soc: number }
export function FlowNow() {
  const { query } = useScenario();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const doy = now ? Math.min(364, Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000)) : null;
  const d = useApi<{ points: Pt[] }>(doy == null ? null : `/api/sim/day?${query}&day=${doy}`);
  if (!now || !d.data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />;
  const p = d.data.points[now.getHours() * 4 + Math.floor(now.getMinutes() / 15)];
  const Node = ({ icon: I, label, value, tone }: { icon: typeof Sun; label: string; value: string; tone: string }) => (
    <div className="flex flex-col items-center gap-1 text-center"><span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}><I size={22} /></span><span className="text-[12px] text-slate-500">{label}</span><strong className="text-sm tabular-nums">{value}</strong></div>
  );
  const Flow = ({ mw, label }: { mw: number; label: string }) => (
    <div className="flex flex-1 flex-col items-center"><div className="relative h-1 w-full overflow-hidden rounded bg-slate-200 dark:bg-white/10">{mw > 0.05 && <div className="absolute inset-y-0 w-1/3 animate-[flow_1.4s_linear_infinite] rounded bg-gradient-to-r from-transparent via-blue-500 to-transparent" />}</div><span className="mt-1 text-[11px] tabular-nums text-slate-500">{label} {mw.toFixed(1)} MW</span></div>
  );
  return (
    <div>
      <style>{'@keyframes flow{from{transform:translateX(-100%)}to{transform:translateX(300%)}}'}</style>
      <p className="mb-3 text-[12px] text-slate-500">Simulated for {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {p.time} — not live plant telemetry.</p>
      <div className="flex items-center gap-2">
        <Node icon={Sun} label="Solar" value={`${p.solar.toFixed(1)} MW`} tone="bg-amber-50 text-amber-500 dark:bg-amber-500/10" />
        <div className="flex flex-1 flex-col gap-3"><Flow mw={p.direct} label="direct" /><Flow mw={p.charge} label="charging" /></div>
        <Node icon={BatteryCharging} label={`BESS ${p.soc.toFixed(0)}%`} value={p.discharge > 0 ? `${p.discharge.toFixed(1)} MW out` : p.charge > 0 ? `${p.charge.toFixed(1)} MW in` : 'idle'} tone="bg-blue-50 text-blue-500 dark:bg-blue-500/10" />
        <div className="flex flex-1 flex-col gap-3"><Flow mw={p.direct + p.batteryToLoad} label="to industry" /><Flow mw={p.uncontractedExport} label="export" /></div>
        <Node icon={Factory} label="Industry" value={`${(p.direct + p.batteryToLoad).toFixed(1)} / ${p.load.toFixed(0)} MW`} tone="bg-green-50 text-green-600 dark:bg-green-500/10" />
        <Node icon={UtilityPole} label="Unserved" value={`${p.unserved.toFixed(1)} MW`} tone="bg-slate-100 text-slate-500 dark:bg-white/10" />
      </div>
    </div>
  );
}
