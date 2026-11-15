'use client';
/** Scenario inputs, grouped as an engineer would fill them. Changing anything creates a new input version on save. */
import { useState, type ReactNode } from 'react';
import { Button, Card, Field, Notice, Select, cn } from '@/components/ui';
import { api } from '@/lib/client';

type S = Record<string, any>;
const STATES = ['AP', 'TS', 'TN', 'KA', 'GJ', 'MH', 'RJ', 'OD'].map((v) => ({ value: v, label: v }));
const PRODUCTS = [['solar_hours', 'Solar-hour supply'], ['daytime', 'Daytime supply'], ['evening_peak', 'Evening peak'], ['night', 'Night-time'], ['six_to_ten', '6 AM–10 PM'], ['sixteen_hour', '16-hour firm'], ['rtc', '24-hour RTC'], ['custom', 'Custom hours']].map(([value, label]) => ({ value, label }));
const PRODUCT_HOURS: Record<string, [number, number]> = { solar_hours: [8, 17], daytime: [6, 18], evening_peak: [18, 22], night: [22, 6], six_to_ten: [6, 22], sixteen_hour: [6, 22], rtc: [0, 24] };
const mask = (a: number, b: number) => Array.from({ length: 24 }, (_, h) => (a <= b ? h >= a && h < b : h >= a || h < b));
const VOLTS = [11, 33, 66, 110, 132, 220, 400, 765];

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-700 dark:text-slate-300">
      <span className="flex justify-between">{label}<span className="tabular-nums text-navy-900 dark:text-white">{value} {unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-blue-600" aria-label={`${label} (${unit})`} />
    </label>
  );
}
export function HourMask({ label, value, onChange }: { label: string; value: boolean[]; onChange: (v: boolean[]) => void }) {
  return (
    <fieldset><legend className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</legend>
      <div className="grid grid-cols-12 gap-1 sm:grid-cols-24" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
        {value.map((on, h) => <button key={h} type="button" aria-pressed={on} aria-label={`${String(h).padStart(2, '0')}:00`} onClick={() => onChange(value.map((x, i) => (i === h ? !x : x)))}
          className={cn('h-7 rounded-md text-[11px] tabular-nums ring-1', on ? 'bg-navy-900 text-white ring-navy-900 dark:bg-blue-500' : 'bg-white text-slate-500 ring-slate-200 dark:bg-white/5 dark:ring-white/10')}>{h}</button>)}
      </div>
    </fieldset>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;

export function Inputs({ id, inputs, version, onSaved, canEdit }: { id: string; inputs: S; version: number; onSaved: (run: boolean) => void; canEdit: boolean }) {
  const [s, setS] = useState<S>(structuredClone(inputs));
  const [err, setErr] = useState<string>(); const [issues, setIssues] = useState<{ path: string; message: string }[]>([]); const [busy, setBusy] = useState(false); const [note, setNote] = useState<string>();
  const set = (path: string, v: unknown) => setS((x) => { const n = structuredClone(x); const k = path.split('.'); let o = n; k.slice(0, -1).forEach((p) => (o = o[p])); o[k[k.length - 1]] = v; return n; });
  const get = (path: string) => path.split('.').reduce((o: S, p) => o?.[p], s);
  const num = (path: string, label: string, suffix?: string, step = 'any', scale = 1) => <Field label={label} type="number" step={step} suffix={suffix} value={+(Number(get(path)) * scale).toFixed(6)} onChange={(e) => set(path, Number(e.target.value) / scale)} error={issues.find((i) => i.path === path)?.message} />;
  const pctF = (path: string, label: string) => num(path, label, '%', '0.1', 100);
  const save = async (run: boolean) => {
    setBusy(true); setErr(undefined); setIssues([]); setNote(undefined);
    try { const r = await api<{ note?: string }>(`/api/hybrid/scenarios/${id}`, { method: 'PUT', body: JSON.stringify({ inputs: s, expectedVersion: version }) }); setNote(r.note); onSaved(run); }
    catch (e) { setErr((e as Error).message); setIssues((e as { issues?: { path: string; message: string }[] }).issues ?? []); } finally { setBusy(false); }
  };
  const dcac = s.solar.acMw > 0 ? (s.solar.dcMwp / s.solar.acMw).toFixed(2) : '—';
  return (
    <div className="space-y-4">
      {!canEdit && <Notice tone="blue">Viewers can explore inputs but not save them.</Notice>}
      {err && <Notice tone="red" title="Not saved">{err}{issues.length > 0 && <ul className="mt-1 list-disc pl-5">{issues.map((i) => <li key={i.path}>{i.path}: {i.message}</li>)}</ul>}</Notice>}
      {note && <Notice tone="amber">{note}</Notice>}
      <Card title="Project and contract">
        <Grid>
          <Field label="Scenario name" value={s.name} onChange={(e) => set('name', e.target.value)} />
          <Select label="Plant state" value={s.state} onChange={(e) => set('state', e.target.value)} options={STATES} />
          <Select label="Buyer state" value={s.destinationState} onChange={(e) => set('destinationState', e.target.value)} options={STATES} />
          <Select label="Structure" value={s.structure} onChange={(e) => set('structure', e.target.value)} options={[{ value: 'third_party', label: 'Third-party PPA' }, { value: 'group_captive', label: 'Group captive' }, { value: 'captive', label: 'Captive' }, { value: 'green_open_access', label: 'Green energy open access' }]} />
          <Select label="Delivery product" value={s.product.kind} onChange={(e) => { const k = e.target.value; set('product.kind', k); if (PRODUCT_HOURS[k]) set('product.hours', mask(...PRODUCT_HOURS[k])); }} options={PRODUCTS} />
          <Select label="Optimise for" value={s.objective} onChange={(e) => set('objective', e.target.value)} options={[{ value: 'balanced', label: 'Balanced (compliance, then profit)' }, { value: 'max_compliance', label: 'Maximum delivery compliance' }, { value: 'max_profit', label: 'Maximum project profit' }, { value: 'max_peak_revenue', label: 'Maximum peak revenue' }, { value: 'min_curtailment', label: 'Minimum curtailment' }]} />
          <Slider label="Contracted capacity" value={s.product.contractedMw} min={0} max={200} step={1} unit="MW" onChange={(v) => set('product.contractedMw', v)} />
          {pctF('product.allowedShortfall', 'Allowed shortfall (energy)')}
          <Select label="External balancing power allowed" value={String(s.product.externalBalancing)} onChange={(e) => set('product.externalBalancing', e.target.value === 'true')} options={[{ value: 'false', label: 'No — plant only' }, { value: 'true', label: 'Yes — at the balancing price' }]} />
        </Grid>
        <div className="mt-3"><HourMask label="Delivery hours (local time, hour starting)" value={s.product.hours} onChange={(v) => { set('product.hours', v); set('product.kind', 'custom'); }} /></div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Solar" subtitle={`DC/AC ratio ${dcac}`}>
          <div className="space-y-3">
            <Slider label="Solar AC" value={s.solar.acMw} min={0} max={300} step={1} unit="MW" onChange={(v) => { set('solar.acMw', v); set('solar.dcMwp', Math.round(v * (s.solar.acMw > 0 ? s.solar.dcMwp / s.solar.acMw : 1.3))); }} />
            {num('solar.dcMwp', 'DC capacity', 'MWp')}
            <Select label="Mounting" value={String(s.solar.tracker)} onChange={(e) => set('solar.tracker', e.target.value === 'true')} options={[{ value: 'false', label: 'Fixed tilt' }, { value: 'true', label: 'Single-axis tracker' }]} />
            <Select label="Weather year" value={s.solar.weather} onChange={(e) => set('solar.weather', e.target.value)} options={[{ value: 'typical', label: 'Typical' }, { value: 'sunny', label: 'Sunny' }, { value: 'monsoon_heavy', label: 'Heavy monsoon (stress)' }, { value: 'low_production', label: 'Low production (stress)' }]} />
          </div>
        </Card>
        <Card title="Wind" subtitle="Synthetic illustrative profile until site data is loaded">
          <div className="space-y-3">
            <Slider label="Wind capacity" value={s.wind.capacityMw} min={0} max={300} step={3} unit="MW" onChange={(v) => set('wind.capacityMw', v)} />
            <div className="grid grid-cols-2 gap-3">{num('wind.turbineRatingMw', 'Turbine rating', 'MW')}{num('wind.hubHeightM', 'Hub height', 'm')}{num('wind.rotorDiameterM', 'Rotor diameter', 'm')}{pctF('wind.wakeLoss', 'Wake loss')}{pctF('wind.electricalLoss', 'Electrical loss')}{pctF('wind.availability', 'Availability')}</div>
          </div>
        </Card>
        <Card title="Battery (BESS)" subtitle={s.bess.powerMw > 0 ? `${(s.bess.energyMwh / s.bess.powerMw).toFixed(1)} h at rated power, before efficiency and SOC limits` : 'No battery'}>
          <div className="space-y-3">
            <Slider label="Power (PCS)" value={s.bess.powerMw} min={0} max={200} step={1} unit="MW" onChange={(v) => set('bess.powerMw', v)} />
            <Slider label="Energy" value={s.bess.energyMwh} min={0} max={1000} step={5} unit="MWh" onChange={(v) => set('bess.energyMwh', v)} />
            <div className="grid grid-cols-2 gap-3">{pctF('bess.chargeEff', 'Charge efficiency')}{pctF('bess.dischargeEff', 'Discharge efficiency')}{pctF('bess.minSoc', 'Minimum SOC')}{pctF('bess.maxSoc', 'Maximum SOC')}{pctF('bess.reserveSoc', 'Reserve SOC')}{num('bess.auxMw', 'Auxiliary load', 'MW')}{num('bess.maxCyclesPerDay', 'Max cycles / day')}</div>
            <Select label="Coupling" value={s.bess.coupling} onChange={(e) => set('bess.coupling', e.target.value)} options={[{ value: 'ac', label: 'AC-coupled' }, { value: 'dc', label: 'DC-coupled (can store clipped solar)' }]} />
            <Select label="Charging from the grid" value={s.bess.grid} onChange={(e) => set('bess.grid', e.target.value)} options={[{ value: 'no', label: 'Not allowed' }, { value: 'conditional', label: 'Conditional (in set hours)' }, { value: 'yes', label: 'Allowed (in set hours)' }]} />
            {s.bess.grid !== 'no' && <HourMask label="Grid-charging hours" value={s.bess.gridChargeHours} onChange={(v) => set('bess.gridChargeHours', v)} />}
          </div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Grid connection">
          <Grid>
            <Select label="Connection voltage" value={VOLTS.includes(s.grid.voltageKv) ? String(s.grid.voltageKv) : 'custom'} onChange={(e) => { if (e.target.value === 'custom') set('grid.customVoltage', true); else { set('grid.voltageKv', Number(e.target.value)); set('grid.customVoltage', false); } }} options={[...VOLTS.map((v) => ({ value: String(v), label: `${v} kV` })), { value: 'custom', label: 'Custom…' }]} />
            {s.grid.customVoltage && num('grid.voltageKv', 'Custom voltage', 'kV')}
            {num('grid.exportMw', 'Approved export limit', 'MW')}{num('grid.importMw', 'Import limit', 'MW')}{num('grid.transformerMva', 'Transformer rating', 'MVA')}{num('grid.lineKm', 'Line length', 'km')}
          </Grid>
        </Card>
        <Card title="Prices (₹/kWh at the delivery point)" subtitle="Illustrative until the term sheet and market data are entered">
          <Grid>{num('prices.ppaRsKwh', 'PPA tariff', '₹/kWh')}{num('prices.peakRsKwh', 'Peak tariff', '₹/kWh')}{num('prices.shortfallPenaltyRsKwh', 'Shortfall penalty', '₹/kWh')}{num('prices.degradationRsKwh', 'Battery wear cost', '₹/kWh')}{num('prices.balancingRsKwh', 'Balancing power', '₹/kWh')}{pctF('prices.escalation', 'Tariff escalation / yr')}
            <Field label="Buyer’s present tariff" type="number" step="any" suffix="₹/kWh" value={s.consumerTariffRsKwh ?? 7.4} onChange={(e) => set('consumerTariffRsKwh', Number(e.target.value))} />
            <Select label="Merchant sale of surplus" value={String(s.prices.exportAllowed)} onChange={(e) => set('prices.exportAllowed', e.target.value === 'true')} options={[{ value: 'true', label: 'Allowed' }, { value: 'false', label: 'Not allowed' }]} />
          </Grid>
          <div className="mt-3"><HourMask label="Peak tariff hours (editable — not the same in every state or contract)" value={s.prices.peakHours} onChange={(v) => set('prices.peakHours', v)} /></div>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Land" subtitle="Screening assumptions — site layout decides">
          <Grid>{num('land.availableAcres', 'Available land', 'acres')}{num('land.solarAcresPerMwp', 'Solar land', 'acres/MWp')}{num('land.windSpacingAcresPerMw', 'Wind spacing', 'acres/MW')}{num('land.windPadAcresPerTurbine', 'Turbine pad', 'acres')}{num('land.substationAcres', 'Substation', 'acres')}
            <Select label="Solar and wind" value={String(s.land.coLocated)} onChange={(e) => set('land.coLocated', e.target.value === 'true')} options={[{ value: 'true', label: 'Share the same land' }, { value: 'false', label: 'Separate land' }]} />
          </Grid>
        </Card>
        <Card title="Costs and financing" subtitle={`Provenance: ${s.finance.provenance}`}>
          <Grid>{num('finance.solarCapexCrPerMwp', 'Solar capex', '₹cr/MWp')}{num('finance.windCapexCrPerMw', 'Wind capex', '₹cr/MW')}{num('finance.bessCapexCrPerMwh', 'BESS energy capex', '₹cr/MWh')}{num('finance.bessCapexCrPerMw', 'BESS power capex', '₹cr/MW')}{num('finance.gridCapexCr', 'Grid connection', '₹cr')}{pctF('finance.debtShare', 'Debt share')}{pctF('finance.interestRate', 'Interest rate')}{num('finance.tenorYears', 'Loan tenor', 'yr')}{pctF('finance.discountRate', 'Discount rate')}
            <Select label="Cost basis" value={s.finance.provenance} onChange={(e) => set('finance.provenance', e.target.value)} options={[{ value: 'illustrative', label: 'Illustrative assumptions' }, { value: 'quotation', label: 'Approved quotations' }, { value: 'actual', label: 'Verified actuals' }]} />
          </Grid>
        </Card>
      </div>
      {canEdit && <div className="sticky bottom-3 z-10 flex justify-end gap-2 rounded-2xl bg-white/90 p-3 ring-1 ring-slate-200 backdrop-blur dark:bg-navy-900/90 dark:ring-white/10">
        <Button variant="secondary" disabled={busy} onClick={() => save(false)}>Save</Button>
        <Button disabled={busy} onClick={() => save(true)}>Save and simulate the year</Button>
      </div>}
    </div>
  );
}
