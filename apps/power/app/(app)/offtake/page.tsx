'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Button, Card, Field, Notice, Select, Stat } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';
import { api, useApi } from '@/lib/client';

type R = Record<string, any>;
const STATES = ['AP', 'TS', 'TN', 'KA', 'GJ', 'MH', 'RJ', 'OD'].map((v) => ({ value: v, label: v }));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CONF: Record<string, { tone: 'green' | 'amber' | 'blue'; text: string }> = { verified: { tone: 'green', text: 'Verified' }, secondary: { tone: 'amber', text: 'Secondary source — confirm' }, user: { tone: 'blue', text: 'User-entered' } };
const TONE: Record<string, 'red' | 'amber' | 'blue'> = { block: 'red', warning: 'amber', info: 'blue' };

/** How much solar a consumer can take by open access and rooftop, against contract demand, consumption and the state's rules. */
export default function Offtake() {
  const { query } = useScenario();
  const rules = useApi<{ labels: Record<string, string>; rules: R[] }>('/api/offtake/rules');
  const [f, setF] = useState({ state: 'AP', structure: 'third_party', contractDemandKva: 5000, sanctionedLoadKw: '', monthlyConsumptionKwh: 1_800_000, loadShape: 'two_shift', proposedOaMw: 5, rooftopKwp: 300, rooftopKwhPerKwpYear: 1450, lossFraction: 0.05, ownershipPct: '', plantConsumptionSharePct: '' });
  const [res, setRes] = useState<R | null>(null); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const [nr, setNr] = useState({ state: 'AP', structure: 'all_open_access', key: 'oa_capacity_pct_of_cd', value: '', confidence: 'user', source: '', sourceUrl: '', effectiveFrom: '' });
  const [ruleErr, setRuleErr] = useState<string>();
  const num = (k: keyof typeof f, label: string, suffix?: string, hint?: string) => <Field label={label} type="number" step="any" suffix={suffix} hint={hint} value={f[k] as never} onChange={(e) => setF({ ...f, [k]: e.target.value })} />;
  const run = async () => {
    setBusy(true); setErr(undefined);
    const body = { ...f, sanctionedLoadKw: f.sanctionedLoadKw || undefined, ownershipPct: f.ownershipPct || undefined, plantConsumptionSharePct: f.plantConsumptionSharePct || undefined };
    try { setRes(await api(`/api/offtake/check?${query}`, { method: 'POST', body: JSON.stringify(body) })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const addRule = async () => {
    setRuleErr(undefined);
    try { await api('/api/offtake/rules', { method: 'POST', body: JSON.stringify({ ...nr, value: Number(nr.value), sourceUrl: nr.sourceUrl || undefined, effectiveFrom: nr.effectiveFrom || undefined }) }); setNr({ ...nr, value: '', source: '', sourceUrl: '', effectiveFrom: '' }); await rules.reload(); }
    catch (e) { setRuleErr((e as Error).message); }
  };
  const r = res?.result;
  return (
    <>
      <PageTitle title="Consumer offtake limits" subtitle="How much open-access and rooftop solar an industrial consumer can actually take — against contract demand, consumption hour by hour, banking and the state’s rules — before an offer is made." actions={<Button onClick={run} disabled={busy}>{busy ? 'Checking…' : 'Check this offer'}</Button>} />
      <Notice tone="amber" title="State limits are mostly unverified">The national rules below come from law-firm and trade-press summaries and are marked “secondary source — confirm”. Where no state limit is recorded the check says so; it never assumes there is none. Record each state’s rule with its order to make the check final.</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Consumer">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={STATES} />
            <Select label="Structure" value={f.structure} onChange={(e) => setF({ ...f, structure: e.target.value })} options={[{ value: 'third_party', label: 'Third-party PPA' }, { value: 'group_captive', label: 'Group captive' }, { value: 'captive', label: 'Captive' }]} />
            {num('contractDemandKva', 'Contract demand', 'kVA')}{num('sanctionedLoadKw', 'Sanctioned load (if different)', 'kW')}
            {num('monthlyConsumptionKwh', 'Monthly consumption', 'kWh')}
            <Select label="Working pattern" value={f.loadShape} onChange={(e) => setF({ ...f, loadShape: e.target.value })} options={[{ value: 'flat', label: 'Round the clock (3 shifts)' }, { value: 'two_shift', label: 'Two shifts, 6 AM–10 PM' }, { value: 'day_shift', label: 'Day shift, 8 AM–8 PM' }]} />
          </div>
        </Card>
        <Card title="Proposed supply">
          <div className="grid gap-3 sm:grid-cols-2">
            {num('proposedOaMw', 'Open-access capacity', 'MW', 'Follows the simulated plant’s delivery shape')}{num('lossFraction', 'Route losses', 'fraction')}
            {num('rooftopKwp', 'Rooftop solar at the premises', 'kWp')}{num('rooftopKwhPerKwpYear', 'Rooftop yield', 'kWh/kWp/yr')}
          </div>
        </Card>
        <Card title="Captive tests" subtitle="Group captive / captive only">
          <div className="grid gap-3 sm:grid-cols-2">{num('ownershipPct', 'Captive users’ equity', '%')}{num('plantConsumptionSharePct', 'Their share of generation', '%')}</div>
        </Card>
      </div>
      {r && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Offer status" value={r.ok ? 'No blocking issue' : 'Blocked'} tone={r.ok ? 'green' : 'red'} hint={`${r.unknownRules.length} rule(s) not recorded`} />
            <Stat label="Max by recorded rules" value={r.maxOaMwByRules == null ? 'Unknown' : `${r.maxOaMwByRules.toFixed(2)} MW`} hint={r.maxOaMwBindingRule ?? 'no state capacity rule recorded'} />
            <Stat label="Never above the load" value={`${res!.noSurplusMw.toFixed(2)} MW`} hint="largest MW with no hour of surplus" tone="blue" />
            <Stat label="Matches yearly use" value={`${res!.energyMatchMw.toFixed(2)} MW`} hint="annual energy = consumption (needs banking)" />
            <Stat label="RE share of consumption" value={`${(r.annual.reShare * 100).toFixed(1)}%`} hint={`rooftop: ${r.rooftop.arrangement}`} tone="green" />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Card title="Findings">
              <ul className="space-y-2">{r.findings.map((x: R, i: number) => <li key={i} className="flex gap-2 text-[13.5px]"><Badge tone={TONE[x.severity]}>{x.check}</Badge><span>{x.message}</span></li>)}</ul>
              {r.unknownRules.length > 0 && <div className="mt-3"><Notice tone="amber" title="Not recorded for this state — needed for a final offer"><ul className="list-disc pl-5">{r.unknownRules.map((u: string) => <li key={u}>{u}</li>)}</ul></Notice></div>}
            </Card>
            <Card title="Monthly energy at the consumer" subtitle="MWh: consumption against open-access and rooftop solar; surplus needs banking">
              <div className="h-[300px]"><ResponsiveContainer><BarChart data={r.monthly.map((m: R) => ({ m: MONTHS[m.month], use: m.consumption / 1000, oa: m.oa / 1000, rooftop: m.rooftop / 1000, surplus: m.surplus / 1000 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} unit=" MWh" width={70} /><Tooltip formatter={(v) => `${Number(v).toFixed(0)} MWh`} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="use" name="Consumption" fill="#0b1f3a" isAnimationActive={false} /><Bar dataKey="oa" name="Open access" stackId="s" fill="#f5b301" isAnimationActive={false} /><Bar dataKey="rooftop" name="Rooftop" stackId="s" fill="#16a34a" isAnimationActive={false} /><Bar dataKey="surplus" name="Surplus" fill="#ef4444" isAnimationActive={false} />
              </BarChart></ResponsiveContainer></div>
              {r.hourlySurplusShare != null && <p className="text-[13px]">{(r.hourlySurplusShare * 100).toFixed(0)}% of the solar energy arrives in hours when the consumer’s load is lower — that part needs banking even when the month balances.</p>}
            </Card>
          </div>
        </>
      )}
      <Card className="mt-4 overflow-x-auto" title="Rules used by the check" subtitle="Newest active rule per state, structure and limit applies; a state rule overrides the national one.">
        {rules.data && <table className="w-full min-w-[820px] text-[13px]"><thead><tr className="border-b text-left text-slate-500">{['State', 'Applies to', 'Limit', 'Value', 'Confidence', 'Source'].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rules.data.rules.filter((x) => x.active).map((x) => <tr key={x.id} data-rule={`${x.state}-${x.key}`} className="border-b border-slate-100 align-top dark:border-white/5"><td className="p-2">{x.state === 'ALL' ? 'National' : x.state}</td><td className="p-2">{x.structure.replace(/_/g, ' ')}</td><td className="p-2">{rules.data!.labels[x.key]}</td><td className="p-2 tabular-nums">{x.value}</td><td className="p-2"><Badge tone={CONF[x.confidence].tone}>{CONF[x.confidence].text}</Badge></td><td className="p-2">{x.sourceUrl ? <a className="underline" href={x.sourceUrl} target="_blank" rel="noreferrer">{x.source}</a> : x.source}{x.note && <div className="text-slate-500">{x.note}</div>}</td></tr>)}</tbody></table>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="State" value={nr.state} onChange={(e) => setNr({ ...nr, state: e.target.value })} options={[{ value: 'ALL', label: 'National' }, ...STATES]} />
          <Select label="Applies to" value={nr.structure} onChange={(e) => setNr({ ...nr, structure: e.target.value })} options={[['all_open_access', 'All open access'], ['third_party', 'Third party'], ['group_captive', 'Group captive'], ['captive', 'Captive'], ['rooftop', 'Rooftop']].map(([value, label]) => ({ value, label }))} />
          <Select label="Limit" value={nr.key} onChange={(e) => setNr({ ...nr, key: e.target.value })} options={Object.entries(rules.data?.labels ?? {}).map(([value, label]) => ({ value, label }))} />
          <Field label="Value" type="number" step="any" value={nr.value} onChange={(e) => setNr({ ...nr, value: e.target.value })} />
          <Select label="Confidence" value={nr.confidence} onChange={(e) => setNr({ ...nr, confidence: e.target.value })} options={[{ value: 'verified', label: 'Verified from the order' }, { value: 'secondary', label: 'Secondary source' }, { value: 'user', label: 'User-entered for this case' }]} />
          <Field label="Source (order number / title)" value={nr.source} onChange={(e) => setNr({ ...nr, source: e.target.value })} />
          <Field label="Source link" value={nr.sourceUrl} onChange={(e) => setNr({ ...nr, sourceUrl: e.target.value })} />
          <Field label="Effective from" type="date" value={nr.effectiveFrom} onChange={(e) => setNr({ ...nr, effectiveFrom: e.target.value })} />
        </div>
        {ruleErr && <div className="mt-2"><Notice tone="red">{ruleErr}</Notice></div>}
        <div className="mt-3"><Button variant="secondary" onClick={addRule} disabled={!nr.value || nr.source.length < 5}>Record rule</Button></div>
      </Card>
    </>
  );
}
