'use client';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Notice, Provenance, Select } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { api, useApi } from '@/lib/client';

type Any = Record<string, any>;
interface Proj { id: string | null; name: string; version: number; config: Any; prices: Any; issues: { field: string; message: string; severity: string }[] }
const VOLTS = [33, 66, 110, 132, 220, 400];

/** Module 1 — plant configuration. Every assumption is editable; the five capacities are shown side by side. */
export default function Config() {
  const q = useApi<Proj>('/api/project');
  const [p, setP] = useState<Proj | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setP(structuredClone(q.data)); }, [q.data]);
  if (!p) return <PageTitle title="Project Configuration" subtitle="Loading…" />;
  const c = p.config, pr = p.prices;
  const set = (path: string, v: unknown) => setP((x) => { const n = structuredClone(x!); const keys = path.split('.'); let o: Any = n; keys.slice(0, -1).forEach((k) => (o = o[k])); o[keys[keys.length - 1]] = v; return n; });
  const num = (path: string, label: string, suffix?: string, step = 'any', hint?: string) => {
    const v = path.split('.').reduce((o: Any, k) => o[k], p as Any) as unknown as number;
    return <Field label={label} type="number" step={step} suffix={suffix} hint={hint} value={v} onChange={(e) => set(path, e.target.value === '' ? '' : Number(e.target.value))} error={p.issues.find((i) => i.field === path.replace(/^config\./, '') && i.severity === 'error')?.message} />;
  };
  const pctField = (path: string, label: string, hint?: string) => {
    const v = path.split('.').reduce((o: Any, k) => o[k], p as Any) as unknown as number;
    return <Field label={label} type="number" step="0.1" suffix="%" hint={hint} value={+(v * 100).toFixed(3)} onChange={(e) => set(path, Number(e.target.value) / 100)} />;
  };
  const price = (key: string, label: string) => (
    <div className="flex items-end gap-2"><div className="flex-1"><Field label={label} type="number" step="0.01" suffix="₹/kWh" value={pr[key].value} onChange={(e) => { set(`prices.${key}.value`, Number(e.target.value)); set(`prices.${key}.provenance`, 'user'); }} /></div><div className="pb-2"><Provenance kind={pr[key].provenance} /></div></div>
  );
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ version: number; issues: Proj['issues'] }>('/api/project', { method: 'PUT', body: JSON.stringify({ id: p.id, name: p.name, config: p.config, prices: p.prices }) });
      setMsg({ tone: r.issues.length ? 'amber' : 'green', text: `Saved as version ${r.version}.${r.issues.length ? ` Warnings: ${r.issues.map((i) => i.message).join('; ')}` : ''} Simulations re-run with the new inputs.` });
      q.reload();
    } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(false); }
  };
  const caps = [
    ['Solar DC capacity', `${c.solar.dcMwp} MWp`, 'PV modules at standard test conditions. Denominator of DC CUF.'],
    ['Solar inverter AC capacity', `${c.solar.acMw} MW`, 'Caps solar output (clipping above it). Denominator of AC CUF.'],
    ['BESS inverter (PCS) capacity', `${c.bess.powerMw} MW`, 'Maximum charge and discharge rate of the battery.'],
    ['Grid interconnection capacity', `${c.delivery.gridExportMw} MW AC`, 'Limit on everything leaving the plant at the point of interconnection.'],
    ['Contracted consumer capacity', `${c.delivery.contractedMw} MW`, `Promised to industry from ${c.delivery.windowStartHour}:00 to ${c.delivery.windowEndHour}:00.`],
  ];
  return (
    <>
      <PageTitle title="Project Configuration" subtitle={`Version ${p.version}. All inputs are editable; saving re-runs every simulation.`} actions={<Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save configuration'}</Button>} />
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <Card title="Five different capacities" subtitle="They constrain different things and are never interchanged" className="mb-4">
        <div className="grid gap-3 md:grid-cols-5">{caps.map(([l, v, h]) => <div key={l} className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-[12px] text-slate-500">{l}</div><div className="mt-1 text-xl font-semibold">{v}</div><p className="mt-1 text-[12px] text-slate-500">{h}</p></div>)}</div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Project & site">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
            <Field label="Location" value={c.site.location} onChange={(e) => set('config.site.location', e.target.value)} />
            {num('config.site.latitude', 'Latitude', '°N')}{num('config.site.longitude', 'Longitude', '°E')}
            {num('config.site.tiltDeg', 'Module tilt', '°')}{num('config.site.azimuthDeg', 'Azimuth (180 = south)', '°')}
          </div>
        </Card>
        <Card title="Solar">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('config.solar.dcMwp', 'DC capacity', 'MWp')}{num('config.solar.acMw', 'Inverter AC capacity', 'MW')}
            {pctField('config.solar.dcLossFraction', 'DC losses (soiling, wiring, mismatch)')}{pctField('config.solar.inverterEfficiency', 'Inverter efficiency')}
            {num('config.solar.tempCoeffPerC', 'Power temperature coefficient', '/°C', '0.0001')}{num('config.solar.noctC', 'NOCT', '°C')}
            {pctField('config.solar.firstYearDegradation', 'First-year degradation')}{pctField('config.solar.annualDegradation', 'Annual degradation')}
          </div>
        </Card>
        <Card title="Battery (BESS)">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('config.bess.powerMw', 'Discharge power (5–35)', 'MW')}{num('config.bess.energyMwh', 'Energy capacity (20–200)', 'MWh')}
            {pctField('config.bess.roundTripEfficiency', 'Round-trip efficiency', 'AC to AC')}{num('config.bess.maxCyclesPerDay', 'Max cycles per day', '/day')}
            {pctField('config.bess.minSocFraction', 'Reserve (minimum SOC)')}{pctField('config.bess.maxSocFraction', 'Maximum SOC')}
            {pctField('config.bess.fadePerYear', 'Calendar fade per year')}{pctField('config.bess.augmentationThreshold', 'Augment when capacity falls below')}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={c.bess.gridChargingAllowed} onChange={(e) => set('config.bess.gridChargingAllowed', e.target.checked)} /> Allow charging from the grid <Badge tone={c.bess.gridChargingAllowed ? 'amber' : 'slate'}>{c.bess.gridChargingAllowed ? 'Grid energy is not renewable' : 'Solar-only charging'}</Badge></label>
        </Card>
        <Card title="Delivery & grid">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('config.delivery.contractedMw', 'Industrial supply target', 'MW')}{num('config.delivery.gridExportMw', 'Grid export capacity', 'MW AC')}
            {num('config.delivery.windowStartHour', 'Delivery window start', 'h', '1')}{num('config.delivery.windowEndHour', 'Delivery window end', 'h', '1')}
            {num('config.delivery.peakStartHour', 'Peak period start', 'h', '1')}{num('config.delivery.peakEndHour', 'Peak period end', 'h', '1')}
            <Select label="Export voltage (subject to network availability)" value={String(c.delivery.exportVoltageKv)} onChange={(e) => set('config.delivery.exportVoltageKv', Number(e.target.value))} options={VOLTS.map((v) => ({ value: String(v), label: `${v} kV` }))} />
            {num('config.delivery.collectionVoltageKv', 'Internal collection voltage', 'kV')}
          </div>
        </Card>
        <Card title="Prices & PPA terms" subtitle="Badges show where each figure comes from" className="lg:col-span-2">
          <div className="grid gap-3 md:grid-cols-3">
            {price('ppaSolarRsKwh', 'Solar PPA tariff')}{price('peakBessRsKwh', 'Peak BESS tariff')}{price('degradationRsKwh', 'Battery throughput cost')}
            {price('shortfallPenaltyRsKwh', 'Shortfall penalty (contract)')}{price('deliveryChargeRsKwh', 'Open-access charges borne by developer')}
          </div>
          <p className="mt-3 text-[12px] text-slate-500">Hourly merchant, grid and consumer tariff profiles are edited on the AP Open Access and Industrial Savings pages. Illustrative values are placeholders, not regulated rates.</p>
        </Card>
      </div>
    </>
  );
}
