'use client';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, Field, Notice, Select, Stat, mwh, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';
import { api, useApi } from '@/lib/client';

type Inputs = Record<string, any>;
interface Row { kv: number; label: string; lineLossMwh: number; transformerLossMwh: number; lossPct: number; capexCr: number; thermalOk: boolean; lifetimeLossValueCr: number; totalCostCr: number }
interface R { inputs: Inputs; lossValueRsKwh: number; results: Row[]; recommendedKv: number; selected: Row; flags: { severity: string; message: string }[]; poiMwh: number; peakMw: number; note: string }
const cr = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} cr`;

/** Module 6 — compare export voltages: losses, indicative capex and a 25-year cost, plus connectivity and approvals. */
export default function Voltage() {
  const { query } = useScenario();
  const init = useApi<R>(`/api/network?${query}`);
  const [n, setN] = useState<Inputs | null>(null); const [lv, setLv] = useState(0);
  const [r, setR] = useState<R | null>(null); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (init.data) { setN(init.data.inputs); setLv(init.data.lossValueRsKwh); setR(init.data); } }, [init.data]);
  if (init.error) return <><PageTitle title="Voltage & Evacuation" /><Notice tone="red">{init.error}</Notice></>;
  if (!n || !r) return <PageTitle title="Voltage & Evacuation" subtitle="Simulating the year’s export profile…" />;
  const set = (k: string, v: unknown) => setN({ ...n, [k]: v });
  const tx = n.transformers[0] ?? { name: 'Pooling transformer', mva: 50, noLoadLossKw: 25, loadLossKwRated: 220, capexCrPerMva: 0.12 };
  const setTx = (k: string, v: number) => setN({ ...n, transformers: [{ ...tx, [k]: v }] });
  const calc = async () => { setBusy(true); setErr(undefined); try { setR(await api<R>(`/api/network?${query}`, { method: 'POST', body: JSON.stringify({ inputs: n, lossValueRsKwh: lv }) })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const num = (k: string, label: string, suffix?: string, step = 'any') => <Field label={label} type="number" step={step} suffix={suffix} value={n[k]} onChange={(e) => set(k, Number(e.target.value))} />;
  const s = r.selected;
  return (
    <>
      <PageTitle title="Voltage & Evacuation" subtitle="Line and transformer losses, indicative capital cost and a 25-year comparison for each export voltage, from the simulated 15-minute export at the point of interconnection." actions={<Button onClick={calc} disabled={busy}>{busy ? 'Calculating…' : 'Calculate'}</Button>} />
      <Notice tone="amber">{r.note}</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Energy at the POI" value={mwh(r.poiMwh)} hint={`Peak ${r.peakMw.toFixed(1)} MW`} />
        <Stat label={`Losses at ${s.kv} kV`} value={pct(s.lossPct, 2)} hint={mwh(s.lineLossMwh + s.transformerLossMwh, 0) + ' a year'} tone={s.lossPct > 0.03 ? 'amber' : 'green'} />
        <Stat label={`Capex at ${s.kv} kV`} value={cr(s.capexCr)} hint="Line, bays, transformers and other works" />
        <Stat label="Lowest 25-year cost" value={`${r.recommendedKv} kV`} hint="Capex + value of lost energy, thermally adequate" tone="blue" />
      </div>
      {r.flags.length > 0 && <div className="mt-4 grid gap-2">{r.flags.map((f, i) => <Notice key={i} tone={f.severity === 'critical' ? 'red' : f.severity === 'warning' ? 'amber' : 'blue'}>{f.message}</Notice>)}</div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Connection" subtitle="Where and how the plant connects">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Export voltage" value={String(n.injectionKv)} onChange={(e) => set('injectionKv', Number(e.target.value))} options={r.results.map((x) => ({ value: String(x.kv), label: `${x.kv} kV` }))} />
            {num('receivingKv', 'Consumer receives at', 'kV')}
            {num('lineKm', 'Line length', 'km')}
            <Select label="Circuits" value={String(n.circuits)} onChange={(e) => set('circuits', Number(e.target.value))} options={[{ value: '1', label: 'Single circuit' }, { value: '2', label: 'Double circuit' }]} />
            {num('powerFactor', 'Power factor')}
            <Select label="Connected to" value={n.interface} onChange={(e) => set('interface', e.target.value)} options={[{ value: 'STU', label: 'State network (STU)' }, { value: 'CTU', label: 'Inter-state network (CTU/ISTS)' }]} />
            {num('evacuationCostCr', 'Other evacuation works', '₹ cr')}
            <Field label="Value of lost energy" type="number" step="any" suffix="₹/kWh" value={lv} onChange={(e) => setLv(Number(e.target.value))} hint="Defaults to the solar PPA tariff" />
          </div>
        </Card>
        <Card title="Pooling transformer" subtitle="From the transformer data sheet">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rating" type="number" suffix="MVA" value={tx.mva} onChange={(e) => setTx('mva', Number(e.target.value))} />
            <Field label="No-load loss" type="number" suffix="kW" value={tx.noLoadLossKw} onChange={(e) => setTx('noLoadLossKw', Number(e.target.value))} />
            <Field label="Load loss at rating" type="number" suffix="kW" value={tx.loadLossKwRated} onChange={(e) => setTx('loadLossKwRated', Number(e.target.value))} />
            <Field label="Cost" type="number" step="any" suffix="₹ cr/MVA" value={tx.capexCrPerMva} onChange={(e) => setTx('capexCrPerMva', Number(e.target.value))} />
          </div>
        </Card>
        <Card title="Approvals and arrangements" subtitle="Results assume what is not yet in place">
          <div className="grid gap-3">
            <Select label="Grid connectivity" value={n.connectivity} onChange={(e) => set('connectivity', e.target.value)} options={[{ value: 'not_applied', label: 'Not applied' }, { value: 'applied', label: 'Applied' }, { value: 'in_principle', label: 'In-principle approval' }, { value: 'granted', label: 'Granted' }]} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={n.meteringReady} onChange={(e) => set('meteringReady', e.target.checked)} /> Interface / ABT metering confirmed</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={n.schedulingArranged} onChange={(e) => set('schedulingArranged', e.target.checked)} /> Scheduling with the load despatch centre arranged</label>
            <fieldset className="text-sm"><legend className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-300">Networks the energy crosses</legend>
              {(['STU', 'DISCOM', 'ISTS'] as const).map((w) => <label key={w} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={n.wheelingNetworks.includes(w)} onChange={(e) => set('wheelingNetworks', e.target.checked ? [...n.wheelingNetworks, w] : n.wheelingNetworks.filter((x: string) => x !== w))} /> {w}</label>)}
            </fieldset>
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="25-year cost by voltage" subtitle="Capex plus the present value of energy lost in lines and transformers">
          <div className="h-72" role="img" aria-label="Bar chart of capex and lifetime loss value by export voltage">
            <ResponsiveContainer><BarChart data={r.results.map((x) => ({ kv: `${x.kv} kV`, Capex: +x.capexCr.toFixed(2), 'Lost energy (PV)': +x.lifetimeLossValueCr.toFixed(2) }))}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="kv" fontSize={12} /><YAxis fontSize={12} unit=" cr" /><Tooltip formatter={(v) => `₹${v} cr`} /><Legend />
              <Bar dataKey="Capex" stackId="a" fill="#0b1f3a" /><Bar dataKey="Lost energy (PV)" stackId="a" fill="#1e6bff" radius={[6, 6, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div>
        </Card>
        <Card title="Comparison" subtitle="Illustrative conductor and cost figures">
          <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Voltage comparison">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-slate-500"><th className="py-2">Voltage</th><th className="text-right">Losses</th><th className="text-right">Loss %</th><th className="text-right">Capex</th><th className="text-right">25-yr cost</th><th className="text-right">Thermal</th></tr></thead>
            <tbody>{r.results.map((x) => (
              <tr key={x.kv} className={x.kv === n.injectionKv ? 'bg-blue-50/60 dark:bg-blue-500/10' : ''}>
                <td className="py-2"><span className="font-medium">{x.label}</span> {x.kv === r.recommendedKv && <Badge tone="green">Lowest cost</Badge>}</td>
                <td className="text-right tabular-nums">{mwh(x.lineLossMwh + x.transformerLossMwh)}</td><td className="text-right tabular-nums">{pct(x.lossPct, 2)}</td>
                <td className="text-right tabular-nums">{cr(x.capexCr)}</td><td className="text-right tabular-nums">{cr(x.totalCostCr)}</td>
                <td className="text-right">{x.thermalOk ? <Badge tone="green">OK</Badge> : <Badge tone="red">Over limit</Badge>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}
