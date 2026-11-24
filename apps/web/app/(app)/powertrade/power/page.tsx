'use client';
import Link from 'next/link';
import { useState } from 'react';
import { PT_ARRANGEMENTS, PT_DOCUMENTS, PT_OBJECTIVES, type PtArrangement, type PtObjective } from '@collabiz/types';
import { Alert, Button, EmptyState, Select, Skeleton, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { PtHeader, PtNav, rupees } from '@/components/Powertrade';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Row { arrangement: PtArrangement; label: string; eligible: boolean; findings: { severity: string; message: string }[]; landedPaisePerKwh: number | null; monthlyUnitsCovered: number; monthlySavingPaise: number | null; capitalNeeded: boolean; charges: { label: string; perKwh: number; provenance: string }[]; requiredDocs: string[] }
interface Result { rows: Row[]; ranked: PtArrangement[]; illustrative: boolean; presentBillPaise: number; note: string }
const STATES = [['AP', 'Andhra Pradesh'], ['TS', 'Telangana'], ['KA', 'Karnataka'], ['TN', 'Tamil Nadu'], ['MH', 'Maharashtra'], ['OD', 'Odisha'], ['GJ', 'Gujarat'], ['RJ', 'Rajasthan']];

/** Get discounted power — compare arrangements for the member's electricity profile. */
export default function PowerCompare() {
  const prof = useQuery<{ profile: { state: string } | null; energy: { monthlyUnits: number; tariffPaisePerKwh: number; contractDemandKva: number } | null }>('/powertrade/profile');
  const [f, setF] = useState({ arrangements: ['rooftop_resco', 'rooftop_epc', 'third_party', 'group_captive'] as PtArrangement[], ppa: '4.20', mw: '2', state: 'TS', cuf: '20', ownership: '', objective: 'max_savings' as PtObjective });
  const [res, setRes] = useState<Result | null>(null);
  const m = useMutation(async () => {
    const r = await api.post<Result>('/powertrade/power-scenarios/compare', { arrangements: f.arrangements, ppaPaisePerKwh: Math.round(Number(f.ppa) * 100), capacityMw: Number(f.mw), sourceState: f.state, cufPct: Number(f.cuf), ownershipPct: f.ownership ? Number(f.ownership) : undefined, objective: f.objective });
    setRes(r); return true;
  });
  const e = prof.data?.energy;
  return (
    <Screen page={{ key: 'powertrade-power', title: 'Get discounted power', access: 'partner' }} header={false}>
      <PtHeader title="Get discounted power" lead="Compare rooftop, open-access, group-captive and captive options for your own bill — every charge shows where it comes from." />
      <PtNav />
      {!prof.data ? <Skeleton height={200} /> : !prof.data.profile || !e ? (
        <EmptyState title="Add your electricity profile first" action={<Link href="/powertrade/join" className="cz-btn cz-btn-accent">Add it now</Link>}>Units, tariff and contract demand are needed for a fair comparison.</EmptyState>
      ) : (
        <>
          <div className="pt-widgets">
            <div className="pt-widget"><span className="pt-w-text"><span>Present bill (estimate)</span><strong>{rupees(e.monthlyUnits * e.tariffPaisePerKwh)}/mo</strong><small>{e.monthlyUnits.toLocaleString('en-IN')} units at ₹{(e.tariffPaisePerKwh / 100).toFixed(2)}</small></span></div>
            <div className="pt-widget"><span className="pt-w-text"><span>Contract demand</span><strong>{e.contractDemandKva.toLocaleString('en-IN')} kVA</strong><small><Link href="/powertrade/join">Edit profile</Link></small></span></div>
          </div>
          <form className="cz-card cz-stack" style={{ gap: 12 }} onSubmit={(ev) => { ev.preventDefault(); m.run(); }} data-form="pt-compare">
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <fieldset className="cz-fieldset"><legend>Arrangements to compare</legend>
              <div className="pt-interests">{(Object.keys(PT_ARRANGEMENTS) as PtArrangement[]).map((k) => <label key={k} className="pt-pick" data-on={f.arrangements.includes(k)}><input type="checkbox" checked={f.arrangements.includes(k)} onChange={() => setF({ ...f, arrangements: f.arrangements.includes(k) ? f.arrangements.filter((x) => x !== k) : [...f.arrangements, k] })} />{PT_ARRANGEMENTS[k].label}</label>)}</div>
            </fieldset>
            <div className="cz-grid cz-grid-3">
              <TextInput label="PPA or levelised rate (₹/kWh)" inputMode="decimal" value={f.ppa} onChange={(ev) => setF({ ...f, ppa: ev.target.value })} />
              <TextInput label="Plant capacity (MW AC)" inputMode="decimal" value={f.mw} onChange={(ev) => setF({ ...f, mw: ev.target.value })} />
              <Select label="Plant location (state)" value={f.state} onChange={(ev) => setF({ ...f, state: ev.target.value })} options={STATES.map(([v, l]) => ({ value: v, label: l }))} />
              <TextInput label="Capacity utilisation (%)" inputMode="decimal" value={f.cuf} onChange={(ev) => setF({ ...f, cuf: ev.target.value })} />
              <TextInput label="Your equity share for captive (%)" inputMode="decimal" placeholder="Needed for captive options" value={f.ownership} onChange={(ev) => setF({ ...f, ownership: ev.target.value })} />
              <Select label="What matters most" value={f.objective} onChange={(ev) => setF({ ...f, objective: ev.target.value as PtObjective })} options={Object.entries(PT_OBJECTIVES).map(([value, label]) => ({ value, label }))} />
            </div>
            <div><Button type="submit" loading={m.pending} disabled={!f.arrangements.length}>Compare</Button></div>
          </form>
          {res && (
            <section className="cz-stack" style={{ gap: 12, marginTop: 16 }} data-pt-results>
              {res.illustrative && <Alert tone="info" title="Indicative comparison">{res.note}</Alert>}
              {res.ranked.length > 0 && <p className="pt-note">Best for “{PT_OBJECTIVES[f.objective]}”: <strong>{res.rows.find((r) => r.arrangement === res.ranked[0])!.label}</strong>{res.ranked.length > 1 ? `, then ${res.ranked.slice(1).map((a) => PT_ARRANGEMENTS[a].label).join(', ')}` : ''}.</p>}
              <div className="pt-scenarios">{res.rows.map((r) => (
                <article key={r.arrangement} className="cz-card pt-scenario" data-eligible={r.eligible} data-arrangement={r.arrangement}>
                  <h3>{r.label}</h3>
                  {r.eligible ? <dl>
                    <div><dt>Landed cost</dt><dd>₹{((r.landedPaisePerKwh ?? 0) / 100).toFixed(2)}/kWh</dd></div>
                    <div><dt>Units covered</dt><dd>{r.monthlyUnitsCovered.toLocaleString('en-IN')}/mo</dd></div>
                    <div><dt>Saving</dt><dd className={r.monthlySavingPaise != null && r.monthlySavingPaise > 0 ? 'pt-pos' : 'pt-neg'}>{rupees(r.monthlySavingPaise)}/mo</dd></div>
                    <div><dt>Capital</dt><dd>{r.capitalNeeded ? 'Needed' : 'None'}</dd></div>
                  </dl> : <p className="pt-neg"><strong>Not eligible as entered</strong></p>}
                  <ul className="pt-findings">{r.findings.map((x, i) => <li key={i} data-sev={x.severity}>{x.message}</li>)}</ul>
                  {r.charges.length > 0 && <details><summary>Network charges ({r.charges.length})</summary><ul className="pt-charges">{r.charges.map((c) => <li key={c.label}><span>{c.label}</span><span>₹{c.perKwh.toFixed(3)}/kWh</span><em>{c.provenance}</em></li>)}</ul></details>}
                  <p className="cz-muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Documents: {r.requiredDocs.map((d) => PT_DOCUMENTS[d]).join(' · ')}</p>
                </article>
              ))}</div>
              <p className="cz-muted" style={{ fontSize: 13 }}>Power is supplied by licensed developers, traders and DISCOMs under their own agreements. COLLABIZ does not sell electricity. <Link href="/unite-solar">Get a Unite Solar rooftop quote</Link> · <Link href="/energy">See plants on Green Park</Link></p>
            </section>
          )}
        </>
      )}
    </Screen>
  );
}
