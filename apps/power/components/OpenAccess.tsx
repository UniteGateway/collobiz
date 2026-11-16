'use client';
/** Shared pieces for Modules 7–8: the delivered-cost result, the input form and the tariff-record register with review. */
import { useState } from 'react';
import { Badge, Button, Card, Field, Notice, Provenance, Select, Stat, mwh, pct, rupees } from '@/components/ui';
import { api, useApi } from '@/lib/client';

export type Body = Record<string, any>;
export interface Line { key: string; jurisdiction: string; type: string; label: string; basis: string; rs: number; perKwhReceived: number; provenance: 'verified' | 'user' | 'illustrative'; source: string; waived: number; waiverNote?: string }
export interface RouteResp {
  inputs: Body;
  result: { networks: string[]; lossFactors: { label: string; pct: number }[]; energyInjectedMwh: number; energyReceivedMwh: number; lines: Line[]; chargesRs: number; landedRsKwh: number; buyerSavingRsKwh: number; developerNetRsKwh: number; flags: string[]; illustrativeShare: number };
  byState: { code: string; name: string; landedRsKwh: number; buyerSavingRsKwh: number; lossPct: number; illustrativeShare: number; interstate: boolean }[] | null;
  waivers: { key: string; jurisdiction: string; waives: string; fraction: number; conditions: string[]; provenance: string; notes?: string | null }[];
  states: Record<string, string>;
}
export const rsKwh = (v: number) => `₹${v.toFixed(2)}/kWh`;
export const STRUCTURES = [{ value: 'third_party', label: 'Third-party sale' }, { value: 'group_captive', label: 'Group captive' }, { value: 'captive', label: 'Captive' }, { value: 'green_open_access', label: 'Green energy open access' }];

export function RouteInputsCard({ b, set, states, interstate }: { b: Body; set: (k: string, v: unknown) => void; states: Record<string, string>; interstate?: boolean }) {
  const num = (k: string, label: string, suffix?: string, hint?: string) => <Field label={label} type="number" step="any" suffix={suffix} hint={hint} value={b[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? undefined : Number(e.target.value))} />;
  const opts = Object.entries(states).map(([value, label]) => ({ value, label }));
  return (
    <Card title="Supply" subtitle="Energy defaults to what the plant delivered to the contracted load in the simulated year">
      <div className="grid gap-3 sm:grid-cols-2">
        {interstate && <Select label="Plant state" value={b.sourceState} onChange={(e) => set('sourceState', e.target.value)} options={opts} />}
        {interstate && <Select label="Consumer state" value={b.destinationState} onChange={(e) => set('destinationState', e.target.value)} options={opts} />}
        <Select label="Structure" value={b.structure} onChange={(e) => set('structure', e.target.value)} options={STRUCTURES} />
        {num('receivingKv', 'Consumer receives at', 'kV')}
        {num('capacityMw', 'Open-access capacity', 'MW')}
        {num('energyInjectedMwh', 'Energy injected', 'MWh/yr')}
        {num('ppaRsKwh', 'PPA tariff at the plant', '₹/kWh')}
        {num('consumerTariffRsKwh', 'Consumer’s discom tariff', '₹/kWh', 'From the consumer’s bill')}
        {num('bankedMwh', 'Energy banked', 'MWh/yr', 'Only if banking is used')}
        {interstate && <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!b.istsConnected} onChange={(e) => set('istsConnected', e.target.checked)} /> Plant is connected to the ISTS</label>}
      </div>
    </Card>
  );
}

export function RouteResult({ r }: { r: RouteResp['result'] }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Landed cost at the consumer" value={rsKwh(r.landedRsKwh)} hint="PPA plus all charges, per kWh received" />
        <Stat label="Consumer saving" value={rsKwh(r.buyerSavingRsKwh)} tone={r.buyerSavingRsKwh > 0 ? 'green' : 'red'} hint="Against the discom tariff entered" />
        <Stat label="Energy received" value={mwh(r.energyReceivedMwh)} hint={`${pct(1 - r.energyReceivedMwh / Math.max(1e-9, r.energyInjectedMwh), 1)} lost on the way`} />
        <Stat label="Charges a year" value={rupees(r.chargesRs)} tone={r.illustrativeShare > 0 ? 'amber' : 'navy'} hint={r.illustrativeShare > 0 ? `${pct(r.illustrativeShare, 0)} from illustrative records` : 'All from verified or user records'} />
      </div>
      {r.flags.length > 0 && <div className="mt-4 grid gap-2">{r.flags.map((f, i) => <Notice key={i} tone="amber">{f}</Notice>)}</div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Route" subtitle="Networks the energy crosses, in order">
          <ol className="grid gap-2 text-sm">{r.networks.map((n, i) => <li key={n} className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-navy-900 text-[11px] text-white dark:bg-blue-500">{i + 1}</span>{n}</li>)}</ol>
          <h3 className="mt-4 text-[13px] font-semibold">Losses applied</h3>
          <ul className="mt-1 grid gap-1 text-[13px] text-slate-600 dark:text-slate-300">{r.lossFactors.length ? r.lossFactors.map((l) => <li key={l.label}>{l.label}</li>) : <li>None at this receiving voltage</li>}</ul>
        </Card>
        <Card title="Charges" subtitle="Each line shows its basis and where the value comes from" className="xl:col-span-2">
          <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Open-access charges">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-slate-500"><th className="py-2">Charge</th><th>Basis</th><th className="text-right">₹ a year</th><th className="text-right">₹/kWh</th><th>Source</th></tr></thead>
            <tbody>{r.lines.map((l) => (
              <tr key={l.key} className="border-t border-slate-100 align-top dark:border-white/10">
                <td className="py-2"><span className="font-medium">{l.label}</span><div className="text-[12px] text-slate-500">{l.jurisdiction}</div></td>
                <td className="text-[12.5px] text-slate-600 dark:text-slate-300">{l.basis}{l.waiverNote && <div className={l.waived > 0 ? 'text-green-600' : 'text-amber-600'}>{l.waiverNote}</div>}</td>
                <td className="text-right tabular-nums">{rupees(l.rs)}</td><td className="text-right tabular-nums">{l.perKwhReceived.toFixed(3)}</td>
                <td><Provenance kind={l.provenance} /><div className="text-[11.5px] text-slate-500">{l.source}</div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}

interface TariffRow { id: string; key: string; jurisdiction: string; chargeType: string; value: number; unit: string; provenance: 'verified' | 'user' | 'illustrative'; orderTitle: string | null; orderUrl: string | null; effectiveFrom: string | null; effectiveTo: string | null; version: number; status: string; minKv: number | null; maxKv: number | null }
interface Change { id: string; key: string; proposed: { value: number; previousValue: number; provenance: string; orderTitle: string; orderUrl?: string; effectiveFrom: string }; status: string; createdAt: string; reviewer: string | null }

/** Tariff records for some jurisdictions, with “propose a change” (analyst) and approve/reject (admin). */
export function TariffRegister({ jurisdictions, role, onChanged }: { jurisdictions: string[]; role?: string; onChanged?: () => void }) {
  const t = useApi<{ records: TariffRow[] }>('/api/tariffs');
  const c = useApi<{ changes: Change[] }>('/api/tariffs/changes');
  const [edit, setEdit] = useState<TariffRow | null>(null);
  const [f, setF] = useState({ value: '', provenance: 'verified', orderTitle: '', orderUrl: '', effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string }>();
  const rows = (t.data?.records ?? []).filter((r) => jurisdictions.includes(r.jurisdiction) && r.status === 'approved');
  const pending = (c.data?.changes ?? []).filter((x) => x.status === 'pending' && jurisdictions.some((j) => x.key.startsWith(`${j}.`)));
  const propose = async () => {
    setMsg(undefined);
    try { await api('/api/tariffs/changes', { method: 'POST', body: JSON.stringify({ key: edit!.key, value: Number(f.value), provenance: f.provenance, orderTitle: f.orderTitle, orderUrl: f.orderUrl, effectiveFrom: f.effectiveFrom }) }); setEdit(null); c.reload(); setMsg({ tone: 'green', text: 'Change proposed. It applies once an admin approves it.' }); }
    catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); }
  };
  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setMsg(undefined);
    try { await api(`/api/tariffs/changes/${id}`, { method: 'POST', body: JSON.stringify({ decision }) }); c.reload(); t.reload(); onChanged?.(); setMsg({ tone: 'green', text: decision === 'approve' ? 'Approved — a new version is now in force from its start date.' : 'Rejected.' }); }
    catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); }
  };
  return (
    <Card title="Tariff records" subtitle="Only approved records feed the calculation. Replace illustrative placeholders with the order in force.">
      {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {pending.length > 0 && (
        <div className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm ring-1 ring-amber-100 dark:bg-amber-500/10 dark:ring-amber-500/20">
          <strong>Awaiting review</strong>
          <ul className="mt-2 grid gap-2">{pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span><span className="font-mono text-[12px]">{p.key}</span>: {p.proposed.previousValue} → <strong>{p.proposed.value}</strong> from {p.proposed.effectiveFrom} · {p.proposed.orderTitle}</span>
              {role === 'admin' && <span className="flex gap-2"><Button size="sm" onClick={() => decide(p.id, 'approve')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide(p.id, 'reject')}>Reject</Button></span>}</li>
          ))}</ul>
        </div>
      )}
      <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Tariff records">
        <thead><tr className="text-left text-[12px] uppercase tracking-wide text-slate-500"><th className="py-2">Record</th><th className="text-right">Value</th><th>Applies</th><th>Source</th><th>Version</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t border-slate-100 dark:border-white/10">
            <td className="py-2 font-mono text-[12px]">{r.key}</td><td className="text-right tabular-nums">{r.value} <span className="text-[11px] text-slate-500">{r.unit}</span></td>
            <td className="text-[12px] text-slate-500">{r.minKv || r.maxKv ? `${r.minKv ?? 0}–${r.maxKv ?? '∞'} kV` : 'All voltages'}</td>
            <td><Provenance kind={r.provenance} />{r.orderUrl ? <a href={r.orderUrl} target="_blank" rel="noreferrer" className="ml-1 text-[12px] text-blue-500 underline">{r.orderTitle ?? 'Order'}</a> : null}</td>
            <td className="text-[12px]">v{r.version}{r.effectiveFrom ? ` · from ${r.effectiveFrom.slice(0, 10)}` : ''}</td>
            <td className="text-right">{role !== 'viewer' && <Button size="sm" variant="ghost" onClick={() => { setEdit(r); setF({ ...f, value: String(r.value) }); }} aria-label={`Propose a change to ${r.key}`}>Propose change</Button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {edit && (
        <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10 sm:grid-cols-2">
          <div className="sm:col-span-2 text-sm font-medium">Propose a new value for <span className="font-mono">{edit.key}</span> ({edit.unit})</div>
          <Field label="New value" type="number" step="any" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <Select label="Source" value={f.provenance} onChange={(e) => setF({ ...f, provenance: e.target.value })} options={[{ value: 'verified', label: 'Official order (verified)' }, { value: 'user', label: 'Our own estimate' }]} />
          <Field label="Order or source title" value={f.orderTitle} onChange={(e) => setF({ ...f, orderTitle: e.target.value })} />
          <Field label="Link to the order" value={f.orderUrl} onChange={(e) => setF({ ...f, orderUrl: e.target.value })} hint={f.provenance === 'verified' ? 'Required for a verified value' : 'Optional'} />
          <Field label="In force from" type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
          <div className="flex items-end gap-2"><Button onClick={propose} disabled={!f.value || f.orderTitle.trim().length < 3}>Send for review</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
        </div>
      )}
      {!rows.length && !t.loading && <p className="text-sm text-slate-500">No records for {jurisdictions.join(', ')}.</p>}
      {rows.some((r) => r.provenance === 'illustrative') && <div className="mt-3"><Badge tone="amber">{rows.filter((r) => r.provenance === 'illustrative').length} of {rows.length} records are illustrative placeholders</Badge></div>}
    </Card>
  );
}
