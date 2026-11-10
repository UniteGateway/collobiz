'use client';
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, Field, Notice, Stat, crore, pct, rupees } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';
import { api, useApi } from '@/lib/client';

type C = Record<string, any>;
interface R { consumer: C; supply: { solarMwh: number; batteryMwh: number; batteryPeakMwh: number }; result: { present: C; proposed: C; monthlySaving: number; annualSaving: number; savingPct: number; peakSavingMonthly: number; years: { year: number; present: number; proposed: number; saving: number }[]; lifetimeSaving: number; shortfallCostMonthly: number; note: string } }

/** Module 9 — industrial customer savings with a downloadable proposal PDF. */
export default function Savings() {
  const { query } = useScenario();
  const init = useApi<R>(`/api/savings?${query}`);
  const [c, setC] = useState<C | null>(null);
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (init.data && !c) { setC(init.data.consumer); setR(init.data); } }, [init.data, c]);
  if (!c) return <PageTitle title="Industrial Savings" subtitle="Loading the plant’s simulated supply…" />;
  const set = (k: string, v: unknown) => setC((x) => { const n = structuredClone(x!); const ks = k.split('.'); let o = n; ks.slice(0, -1).forEach((p) => (o = o[p])); o[ks[ks.length - 1]] = v; return n; });
  const num = (k: string, label: string, suffix?: string, hint?: string) => <Field label={label} type="number" step="any" suffix={suffix} hint={hint} value={k.split('.').reduce((o: C, p) => o[p], c) as unknown as number} onChange={(e) => set(k, Number(e.target.value))} />;
  const pctF = (k: string, label: string, hint?: string) => <Field label={label} type="number" step="0.1" suffix="%" hint={hint} value={+((k.split('.').reduce((o: C, p) => o[p], c) as unknown as number) * 100).toFixed(2)} onChange={(e) => set(k, Number(e.target.value) / 100)} />;
  const calc = async () => { setBusy(true); setErr(undefined); try { setR(await api<R>(`/api/savings?${query}`, { method: 'POST', body: JSON.stringify(c) })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const pdf = async () => {
    setBusy(true); setErr(undefined);
    try { const res = await fetch(`/api/savings/pdf?${query}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }); if (!res.ok) throw new Error((await res.json()).message); const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `proposal-${c.name}.pdf`; a.click(); URL.revokeObjectURL(url); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const s = r?.result;
  return (
    <>
      <PageTitle title="Industrial Savings" subtitle="Compare the consumer’s present bill with plant supply plus the discom for the rest. Plant energy comes from the simulated year." actions={<div className="flex gap-2"><Button onClick={calc} disabled={busy}>Calculate</Button><Button variant="secondary" onClick={pdf} disabled={busy}>Download proposal PDF</Button></div>} />
      <Notice tone="amber">Defaults are an illustrative consumer. Enter the consumer’s actual tariff from their bill and the open-access charges from the AP Open Access page; savings are indicative until those are confirmed.</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Consumer" className="xl:col-span-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Consumer name" value={c.name} onChange={(e) => set('name', e.target.value)} /><Field label="Location" value={c.location} onChange={(e) => set('location', e.target.value)} />
            {num('receivingVoltageKv', 'Receiving voltage', 'kV')}{num('contractDemandKva', 'Contracted demand', 'kVA')}
            {num('billedDemandKva', 'Billed demand', 'kVA')}{num('monthlyKwh', 'Monthly consumption', 'kWh')}
            {pctF('todShare.peak', 'Peak-hour share')}{pctF('todShare.normal', 'Normal-hour share')}{pctF('todShare.offpeak', 'Off-peak share')}
          </div>
        </Card>
        <Card title="Present tariff" subtitle="From the consumer’s bill">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('rate.peak', 'Peak energy rate', '₹/kWh')}{num('rate.normal', 'Normal energy rate', '₹/kWh')}{num('rate.offpeak', 'Off-peak energy rate', '₹/kWh')}
            {num('demandChargeRsKvaMonth', 'Demand charge', '₹/kVA/mo')}{num('electricityDutyRsKwh', 'Electricity duty', '₹/kWh')}{num('fixedChargesRsMonth', 'Fixed charges', '₹/month')}
            {pctF('discomEscalation', 'Discom tariff escalation', 'per year')}
          </div>
        </Card>
        <Card title="Proposed supply">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('ppaTariffRsKwh', 'Solar PPA tariff', '₹/kWh')}{num('peakBessTariffRsKwh', 'Peak BESS tariff', '₹/kWh')}
            {num('openAccessChargesRsKwh', 'Open-access charges', '₹/kWh', 'All-in, from Module 7')}{pctF('lossFraction', 'Transmission + distribution losses')}
            {pctF('ppaEscalation', 'PPA escalation', 'per year')}{num('contractYears', 'Contract term', 'years')}
            {pctF('allocation', 'Share of plant output for this consumer')}{num('demandReductionKva', 'Demand surrendered to discom', 'kVA')}
            {num('backupPremiumRsKwh', 'Backup/standby premium', '₹/kWh')}
          </div>
        </Card>
      </div>
      {s && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Present monthly bill" value={rupees(s.present.total)} /><Stat label="Proposed monthly bill" value={rupees(s.proposed.total)} tone="blue" />
            <Stat label="Monthly saving" value={rupees(s.monthlySaving)} hint={`${pct(s.savingPct)} of the bill`} tone={s.monthlySaving >= 0 ? 'green' : 'red'} />
            <Stat label="Annual saving" value={crore(s.annualSaving)} hint={`${crore(s.lifetimeSaving)} over ${s.years.length} years`} tone={s.annualSaving >= 0 ? 'green' : 'red'} />
            <Stat label="Peak-hour saving" value={rupees(s.peakSavingMonthly)} hint="per month" tone="blue" /><Stat label="Plant share of consumption" value={pct(s.proposed.coverage)} hint={`${Math.round(s.proposed.plantKwh).toLocaleString('en-IN')} kWh/month`} />
            <Stat label="Shortfall bought from discom" value={rupees(s.shortfallCostMonthly)} hint={`${Math.round(s.proposed.discomKwh).toLocaleString('en-IN')} kWh/month`} tone="amber" /><Stat label="Lost on the route" value={`${Math.round(s.proposed.lostKwh).toLocaleString('en-IN')} kWh`} hint="per month" />
          </div>
          <Card title={`${s.years.length}-year projection`} subtitle="₹ crore per year" className="mt-4">
            <div className="h-72"><ResponsiveContainer><BarChart data={s.years.map((y) => ({ year: y.year, present: y.present / 1e7, proposed: y.proposed / 1e7, saving: y.saving / 1e7 }))}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={(v) => `₹${Number(v).toFixed(2)} cr`} /><Legend /><Bar dataKey="present" name="Present bill" fill="#94a3b8" /><Bar dataKey="proposed" name="Proposed bill" fill="#1e6bff" /><Bar dataKey="saving" name="Saving" fill="#16a34a" /></BarChart></ResponsiveContainer></div>
            <p className="mt-2 text-[12px] text-slate-500">{s.note}</p>
          </Card>
        </>
      )}
    </>
  );
}
