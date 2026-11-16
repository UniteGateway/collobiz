'use client';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, Notice, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';
import { RouteInputsCard, RouteResult, TariffRegister, rsKwh, type Body, type RouteResp } from '@/components/OpenAccess';
import { api, useApi } from '@/lib/client';

const CONDITIONS: Record<string, string> = {
  ists_connected: 'The plant is connected to the ISTS (not only to the state network)',
  eligible_technology: 'The technology (solar / co-located BESS) is covered by the waiver order',
  commissioning_date_within_window: 'Commissioning date falls within the window the order allows',
  supply_to_eligible_buyer: 'The power is sold to a buyer category the waiver covers',
};

/** Module 8 — interstate supply: route through STU → ISTS → STU → DISCOM, waivers only when every condition is confirmed. */
export default function Interstate() {
  const { query } = useScenario();
  const init = useApi<RouteResp>(`/api/openaccess?${query}&to=TS&compare=1`);
  const me = useApi<{ role: string }>('/api/me');
  const [b, setB] = useState<Body | null>(null); const [r, setR] = useState<RouteResp | null>(null);
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (init.data) { setB({ ...init.data.inputs }); setR(init.data); } }, [init.data]);
  const calc = async (body = b) => { setBusy(true); setErr(undefined); try { setR(await api<RouteResp>(`/api/openaccess?${query}`, { method: 'POST', body: JSON.stringify({ ...body, compare: true }) })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  if (init.error) return <><PageTitle title="Interstate Transmission" /><Notice tone="red">{init.error}</Notice></>;
  if (!b || !r) return <PageTitle title="Interstate Transmission" subtitle="Simulating the delivered energy…" />;
  const confirmed: string[] = b.confirmedConditions?.['ISTS.waiver'] ?? [];
  const toggle = (c: string, on: boolean) => setB({ ...b, confirmedConditions: { ...b.confirmedConditions, 'ISTS.waiver': on ? [...confirmed, c] : confirmed.filter((x) => x !== c) } });
  const waiver = r.waivers.find((w) => w.key === 'ISTS.waiver');
  return (
    <>
      <PageTitle title="Interstate Transmission" subtitle="Sell to a consumer in another state: every network on the way, its losses and charges, and ISTS waivers applied only when you confirm each condition." actions={<Button onClick={() => calc()} disabled={busy}>{busy ? 'Calculating…' : 'Calculate'}</Button>} />
      <Notice tone="amber">ISTS and state charges here are illustrative placeholders, not CERC or state commission figures. A connection to the state network at 132 kV does not by itself give ISTS access or waivers.</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4"><RouteResult r={r.result} /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RouteInputsCard b={b} set={(k, v) => setB({ ...b, [k]: v })} states={r.states} interstate />
        <Card title="ISTS charge waiver" subtitle={waiver ? `${(waiver.fraction * 100).toFixed(0)}% of ISTS charges (placeholder share) — applied only when all conditions are confirmed for this project` : 'No waiver record'}>
          <fieldset className="grid gap-2 text-sm"><legend className="sr-only">Waiver conditions confirmed</legend>
            {(waiver?.conditions ?? Object.keys(CONDITIONS)).map((c) => <label key={c} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={confirmed.includes(c)} onChange={(e) => toggle(c, e.target.checked)} /> {CONDITIONS[c] ?? c}</label>)}
          </fieldset>
          <div className="mt-3">{waiver && waiver.conditions.every((c) => confirmed.includes(c)) ? <Badge tone="green">All conditions confirmed — waiver applies</Badge> : <Badge tone="amber">Not all conditions confirmed — no waiver</Badge>}</div>
          {waiver?.notes && <p className="mt-2 text-[12.5px] text-slate-500">{waiver.notes}</p>}
        </Card>
      </div>
      {r.byState && (
        <Card title="Landed cost by consumer state" subtitle="Same plant, energy and tariff — only the destination changes. Lower is better." className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="h-72" role="img" aria-label="Bar chart of landed cost per kWh by destination state">
              <ResponsiveContainer><BarChart data={r.byState.map((s) => ({ name: s.code, landed: +s.landedRsKwh.toFixed(2) }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} unit=" ₹" /><Tooltip formatter={(v) => `₹${v}/kWh`} />
                <ReferenceLine y={b.consumerTariffRsKwh} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Discom tariff', fontSize: 11, fill: '#ef4444' }} />
                <Bar dataKey="landed" radius={[6, 6, 0, 0]}>{r.byState.map((s) => <Cell key={s.code} fill={s.code === b.destinationState ? '#1e6bff' : s.interstate ? '#0b1f3a' : '#16a34a'} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Landed cost by state">
              <thead><tr className="text-left text-[12px] uppercase tracking-wide text-slate-500"><th className="py-2">State</th><th className="text-right">Landed</th><th className="text-right">Saving</th><th className="text-right">Losses</th></tr></thead>
              <tbody>{r.byState.map((s) => (
                <tr key={s.code} className="border-t border-slate-100 dark:border-white/10"><td className="py-2">{s.name} {!s.interstate && <Badge tone="green">Same state</Badge>}</td><td className="text-right tabular-nums">{rsKwh(s.landedRsKwh)}</td><td className={`text-right tabular-nums ${s.buyerSavingRsKwh > 0 ? 'text-green-600' : 'text-red-500'}`}>{rsKwh(s.buyerSavingRsKwh)}</td><td className="text-right tabular-nums">{pct(s.lossPct, 1)}</td></tr>
              ))}</tbody>
            </table></div>
          </div>
        </Card>
      )}
      <div className="mt-4"><TariffRegister jurisdictions={['ISTS', b.destinationState]} role={me.data?.role} onChanged={() => calc()} /></div>
    </>
  );
}
