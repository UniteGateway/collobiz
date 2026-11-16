'use client';
import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, Field, Notice, Select, Stat, crore, pct } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';
import { api, useApi } from '@/lib/client';

type F = Record<string, any>;
interface Yr { year: number; revenueCr: number; opexCr: number; ebitdaCr: number; augmentationCr: number; interestCr: number; principalCr: number; taxCr: number; projectCfCr: number; equityCfCr: number; dscr: number | null; deliveredMwh: number }
interface R {
  inputs: F; yearOne: { revenueRs: number; variableCostRs: number; deliveredMwh: number; equivalentCycles: number; revenueBreakdown: { ppa: number; peak: number; merchant: number }; priceProvenance: string[] };
  result: { capex: Record<string, number>; debtCr: number; equityCr: number; years: Yr[]; projectIrr: number | null; equityIrr: number | null; npvCr: number; minDscr: number | null; avgDscr: number | null; paybackYear: number | null; lcoeRsKwh: number; notes: string[] };
  sensitivity: { key: string; label: string; projectIrr: number | null; equityIrr: number | null; npvCr: number; minDscr: number | null; lcoeRsKwh: number }[];
}
const cr = (v: number) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} cr`;
const irrS = (v: number | null) => (v == null ? 'n/a' : pct(v, 1));
const CAPEX_LABEL: Record<string, string> = { solar: 'Solar modules, inverters, BoS', bessPower: 'BESS power (PCS)', bessEnergy: 'BESS energy (cells)', evacuation: 'Evacuation & grid works', development: 'Development', contingency: 'Contingency' };

/** Module 10 — project finance on the simulated year: capex, debt, cash flows, IRR, DSCR, LCOE and sensitivities. */
export default function Finance() {
  const { query } = useScenario();
  const init = useApi<R>(`/api/finance?${query}`);
  const [f, setF] = useState<F | null>(null); const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (init.data) { setF(init.data.inputs); setR(init.data); } }, [init.data]);
  if (init.error) return <><PageTitle title="Financial Analysis" /><Notice tone="red">{init.error}</Notice></>;
  if (!f || !r) return <PageTitle title="Financial Analysis" subtitle="Simulating year one…" />;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const calc = async () => { setBusy(true); setErr(undefined); try { setR(await api<R>(`/api/finance?${query}`, { method: 'POST', body: JSON.stringify(f) })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const num = (k: string, label: string, suffix?: string) => <Field label={label} type="number" step="any" suffix={suffix} value={f[k]} onChange={(e) => set(k, Number(e.target.value))} />;
  const pctF = (k: string, label: string) => <Field label={label} type="number" step="0.1" suffix="%" value={+(f[k] * 100).toFixed(3)} onChange={(e) => set(k, Number(e.target.value) / 100)} />;
  const x = r.result, y1 = r.yearOne;
  return (
    <>
      <PageTitle title="Financial Analysis" subtitle="Project and equity returns, debt cover and the cost of energy, with year one taken from the simulated dispatch." actions={<Button onClick={calc} disabled={busy}>{busy ? 'Calculating…' : 'Calculate'}</Button>} />
      <Notice tone={f.provenance === 'illustrative' ? 'amber' : 'blue'}>{x.notes.join(' ')}</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Project IRR" value={irrS(x.projectIrr)} tone={x.projectIrr != null && x.projectIrr >= f.discountRate ? 'green' : 'amber'} hint={`Hurdle ${pct(f.discountRate, 1)}`} />
        <Stat label="Equity IRR" value={irrS(x.equityIrr)} />
        <Stat label="NPV" value={cr(x.npvCr)} tone={x.npvCr >= 0 ? 'green' : 'red'} hint={`At ${pct(f.discountRate, 1)}`} />
        <Stat label="Minimum DSCR" value={x.minDscr == null ? 'No debt' : x.minDscr.toFixed(2)} tone={x.minDscr != null && x.minDscr < 1.2 ? 'red' : 'navy'} hint={x.avgDscr ? `Average ${x.avgDscr.toFixed(2)}` : undefined} />
        <Stat label="LCOE" value={`₹${x.lcoeRsKwh.toFixed(2)}/kWh`} hint="Lifetime cost per kWh at the POI" />
        <Stat label="Equity payback" value={x.paybackYear ? `Year ${x.paybackYear}` : 'Not within life'} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Capital cost" subtitle={`${crore(x.capex.total * 1e7)} · debt ${cr(x.debtCr)} · equity ${cr(x.equityCr)}`}>
          <ul className="grid gap-1.5 text-sm">{Object.entries(CAPEX_LABEL).map(([k, l]) => <li key={k} className="flex justify-between"><span>{l}</span><span className="tabular-nums">{cr(x.capex[k])}</span></li>)}</ul>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {num('solarCapexCrPerMwp', 'Solar', '₹ cr/MWp')}{num('bessCapexCrPerMwh', 'BESS energy', '₹ cr/MWh')}{num('bessCapexCrPerMw', 'BESS power', '₹ cr/MW')}
            {num('evacuationCapexCr', 'Evacuation', '₹ cr')}{num('devCostCr', 'Development', '₹ cr')}{pctF('contingency', 'Contingency')}
            <Select label="Cost basis" value={f.provenance} onChange={(e) => set('provenance', e.target.value)} options={[{ value: 'illustrative', label: 'Illustrative' }, { value: 'quotation', label: 'Quotations' }, { value: 'actual', label: 'Actuals' }]} />
          </div>
        </Card>
        <Card title="Operations" subtitle={`Year 1 revenue ${crore(y1.revenueRs)} · ${Math.round(y1.equivalentCycles)} battery cycles`}>
          <ul className="grid gap-1.5 text-sm">
            <li className="flex justify-between"><span>Solar PPA</span><span className="tabular-nums">{crore(y1.revenueBreakdown.ppa)}</span></li>
            <li className="flex justify-between"><span>Peak BESS supply</span><span className="tabular-nums">{crore(y1.revenueBreakdown.peak)}</span></li>
            <li className="flex justify-between"><span>Merchant / exchange</span><span className="tabular-nums">{crore(y1.revenueBreakdown.merchant)}</span></li>
            <li className="flex justify-between text-slate-500"><span>Grid energy and delivery costs</span><span className="tabular-nums">−{crore(y1.variableCostRs)}</span></li>
          </ul>
          <div className="mt-2">{y1.priceProvenance.includes('illustrative') && <Badge tone="amber">Some prices are illustrative — edit them in Project Configuration</Badge>}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {num('solarOmCrPerMwpYr', 'Solar O&M', '₹ cr/MWp/yr')}{num('bessOmCrPerMwhYr', 'BESS O&M', '₹ cr/MWh/yr')}{pctF('omEscalation', 'O&M escalation')}
            {pctF('insurancePct', 'Insurance (of capex)')}{num('augmentationCrPerMwh', 'Battery augmentation', '₹ cr/MWh')}{pctF('tariffEscalation', 'Tariff escalation')}
          </div>
        </Card>
        <Card title="Funding and tax">
          <div className="grid gap-3 sm:grid-cols-2">
            {pctF('debtShare', 'Debt share')}{pctF('interestRate', 'Interest rate')}{num('tenorYears', 'Loan tenor', 'years')}
            {pctF('discountRate', 'Discount rate')}{pctF('taxRate', 'Tax rate')}{num('years', 'Project life', 'years')}
          </div>
        </Card>
      </div>
      <Card title="Cash flows" subtitle="Revenue, operating cost and cash to equity by year; line shows debt service cover" className="mt-4">
        <div className="h-80" role="img" aria-label="Chart of yearly revenue, opex and equity cash flow with DSCR">
          <ResponsiveContainer><ComposedChart data={x.years.map((y) => ({ year: y.year, Revenue: +y.revenueCr.toFixed(2), Opex: +(-y.opexCr - y.augmentationCr).toFixed(2), 'Equity cash': +y.equityCfCr.toFixed(2), DSCR: y.dscr ? +y.dscr.toFixed(2) : null }))}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="year" fontSize={12} /><YAxis yAxisId="cr" fontSize={12} unit=" cr" /><YAxis yAxisId="d" orientation="right" fontSize={12} domain={[0, 'auto']} /><Tooltip /><Legend />
            <Bar yAxisId="cr" dataKey="Revenue" fill="#1e6bff" radius={[4, 4, 0, 0]} /><Bar yAxisId="cr" dataKey="Opex" fill="#94a3b8" /><Bar yAxisId="cr" dataKey="Equity cash" fill="#16a34a" />
            <Line yAxisId="d" dataKey="DSCR" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart></ResponsiveContainer>
        </div>
      </Card>
      <Card title="Sensitivities" subtitle="Each case changes one assumption from the base" className="mt-4">
        <div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Sensitivity analysis">
          <thead><tr className="text-left text-[12px] uppercase tracking-wide text-slate-500"><th className="py-2">Case</th><th className="text-right">Project IRR</th><th className="text-right">Equity IRR</th><th className="text-right">NPV</th><th className="text-right">Min DSCR</th><th className="text-right">LCOE</th></tr></thead>
          <tbody>{r.sensitivity.map((s) => (
            <tr key={s.key} className={`border-t border-slate-100 dark:border-white/10 ${s.key === 'base' ? 'font-medium' : ''}`}><td className="py-2">{s.label}</td><td className="text-right tabular-nums">{irrS(s.projectIrr)}</td><td className="text-right tabular-nums">{irrS(s.equityIrr)}</td>
              <td className={`text-right tabular-nums ${s.npvCr < 0 ? 'text-red-500' : ''}`}>{cr(s.npvCr)}</td><td className="text-right tabular-nums">{s.minDscr == null ? '—' : s.minDscr.toFixed(2)}</td><td className="text-right tabular-nums">₹{s.lcoeRsKwh.toFixed(2)}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
