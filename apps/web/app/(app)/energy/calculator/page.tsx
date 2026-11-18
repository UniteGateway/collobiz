'use client';
import { useMemo, useState } from 'react';
import { CostInputsSchema, ILLUSTRATIVE_STATE_CHARGES, deliveredCost, energyStateName, type CostInputs } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Select, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { Disclaimer } from '@/components/Energy';

const crore = (rs: number) => (Math.abs(rs) >= 1e7 ? `₹${(rs / 1e7).toFixed(2)} Cr` : `₹${(rs / 1e5).toFixed(1)} L`);
const FIELDS: [keyof CostInputs, string][] = [['transmission', 'Transmission (₹/kWh)'], ['wheeling', 'Wheeling (₹/kWh)'], ['lossPct', 'Transmission + wheeling losses (%)'], ['bankingPct', 'Banking (% of energy)'], ['css', 'Cross-subsidy surcharge (₹/kWh)'],
  ['additionalSurcharge', 'Additional surcharge (₹/kWh)'], ['scheduling', 'Scheduling & other (₹/kWh)'], ['tradingMargin', 'Trading service charge (₹/kWh)'], ['duty', 'Electricity duty / taxes (₹/kWh)'], ['discomRsKwh', 'Eligible DISCOM tariff (₹/kWh)']];

/** Delivered power cost calculator (client-side; same formula as the shared rules). */
export default function Calculator() {
  const [state, setState] = useState('AP'); const [manual, setManual] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() => ({ capacityMw: '10', cufPct: '20', ppaRsKwh: '4.2', years: '15', escalationPct: '0', ...Object.fromEntries(Object.entries(ILLUSTRATIVE_STATE_CHARGES.AP).map(([k, x]) => [k, String(x)])) }));
  const [run, setRun] = useState<Record<string, string> | null>(null);
  const pickState = (s: string) => { setState(s); setV({ ...v, ...Object.fromEntries(Object.entries(ILLUSTRATIVE_STATE_CHARGES[s]).map(([k, x]) => [k, String(x)])) }); };
  const parsed = useMemo(() => (run ? CostInputsSchema.safeParse(Object.fromEntries(Object.entries(run).map(([k, x]) => [k, Number(x)]))) : null), [run]);
  const r = parsed?.success ? deliveredCost(parsed.data) : null;
  const field = (k: string, label: string, disabled = false) => <TextInput key={k} label={label} inputMode="decimal" value={v[k] ?? ''} disabled={disabled} onChange={(e) => setV({ ...v, [k]: e.target.value })} />;
  return (
    <Screen page={{ key: 'energy-calculator', title: 'Delivered power cost calculator', access: 'partner' }} eyebrow="Unite Green Park"
      description="Estimate the delivered cost of renewable power and compare it with the DISCOM tariff. Every figure is a forecast — not a quotation or a verified project number.">
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Inputs">
          <div className="cz-grid cz-grid-2">{field('capacityMw', 'Contracted capacity (MW)')}{field('cufPct', 'Expected CUF (%)')}{field('ppaRsKwh', 'PPA tariff (₹/kWh)')}{field('years', 'Tenure (years)')}{field('escalationPct', 'Tariff escalation (% a year)')}</div>
          <Checkbox label="Enter all charges myself (no state configuration)" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          {!manual && <>
            <Select label="State (intra-state open access)" value={state} onChange={(e) => pickState(e.target.value)} options={Object.keys(ILLUSTRATIVE_STATE_CHARGES).map((s) => ({ value: s, label: energyStateName(s) }))} />
            <Alert tone="warning" title="Illustrative — not verified">These state charges are demonstration values for testing only. Replace them with the current SERC tariff and open-access order before use. Inter-state supply: enter its charges manually.</Alert>
          </>}
          <div className="cz-grid cz-grid-2">{FIELDS.map(([k, l]) => field(k, l))}</div>
          <Button variant="accent" onClick={() => setRun({ ...v })}>Calculate</Button>
        </Card>
        <Card title="Estimate">
          {!run ? <p className="cz-muted">Run the calculation to see delivered cost and savings.</p> : !r ? <Alert tone="danger">Check the inputs — every field needs a number in range.</Alert> : <>
            <div className="cz-ugp-result">
              <div><span>Delivered cost</span><strong>₹{r.landedRsKwh.toFixed(2)}/kWh</strong></div>
              <div className={r.savingRsKwh >= 0 ? 'cz-good' : 'cz-bad'}><span>Saving vs DISCOM</span><strong>₹{r.savingRsKwh.toFixed(2)}/kWh</strong><em>{(r.savingPct * 100).toFixed(1)}%</em></div>
              <div><span>Energy received a year</span><strong>{Math.round(r.receivedMwh).toLocaleString('en-IN')} MWh</strong></div>
              <div className={r.annualSavingRs >= 0 ? 'cz-good' : 'cz-bad'}><span>Saving in year 1</span><strong>{crore(r.annualSavingRs)}</strong><em>{crore(r.totalSavingRs)} over {r.rows.length} years</em></div>
            </div>
            <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Year-1 cost build-up (₹/kWh received)</h3>
            <ul className="cz-hbars">{r.breakdown.map((x) => <li key={x.label}><span>{x.label}</span><i style={{ width: `${(x.rsKwh / r.landedRsKwh) * 100}%` }} /><strong style={{ minWidth: 46 }}>{x.rsKwh.toFixed(2)}</strong></li>)}</ul>
            <details style={{ marginTop: 12 }}><summary>Year-by-year</summary>
              <table className="cz-table" aria-label="Year by year"><thead><tr><th>Year</th><th>PPA</th><th>Delivered</th><th>DISCOM</th><th>Saving</th></tr></thead>
                <tbody>{r.rows.map((y) => <tr key={y.year}><td>{y.year}</td><td>{y.ppa.toFixed(2)}</td><td>{y.landed.toFixed(2)}</td><td>{y.discom.toFixed(2)}</td><td>{crore(y.savingRs)}</td></tr>)}</tbody></table></details>
          </>}
        </Card>
      </div>
      <Disclaimer />
    </Screen>
  );
}
