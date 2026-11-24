'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { VAI_CRITERIA, VAI_EVIDENCE_KINDS, VAI_MANDATORY_CHECKS, VAI_OPP_TYPES, VAI_ROLES, type VaiConveyorResult, type VaiCriterion, type VaiFinanceResult, type VaiRole, type VaiScoreResult } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, EmptyState, Select, Skeleton, Tabs, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { OppStatus, SampleTag, ScoreBadge, VaiHeader, VaiNav, rupees } from '@/components/VentureAi';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Ev = { id: string; kind: keyof typeof VAI_EVIDENCE_KINDS; statement: string; source: string | null; sourceDate: string | null };
interface Detail {
  id: string; code: string; title: string; type: keyof typeof VAI_OPP_TYPES; status: string; sample: boolean; problem: string; marketGap: string; targetCustomers: string; proposedSolution: string;
  competitors: string | null; technology: string | null; manufacturing: string | null; risks: string | null; regulatory: string | null; investmentPaise: number | null; marginPct: number | null; countries: string[];
  roles: { role: VaiRole; count: number; categories: string[] }[]; evidence: Ev[]; proposer: string; mine: boolean; staff: boolean; venture: { id: string; code: string } | null; decisionNote: string | null;
  score: { inputs: Record<string, { value: number | null; evidence: string }>; checks: Record<string, string>; result: VaiScoreResult } | null;
  finance: { inputs: Record<string, number>; result: VaiFinanceResult; sensitivity: { case: string; netProfit: number }[]; versions: number } | null;
  concept: { names?: string[]; conveyor?: { inputs: Record<string, number>; result: VaiConveyorResult } } | null;
}
interface Cand { capabilityId: string; org: string; countries: string[]; percent: number; reasons: string[]; gaps: string[] }
interface Matches { roles: { role: VaiRole; label: string; count: number; candidates: Cand[] }[]; note: string }

/** Opportunity workspace: evidence, weighted score, financial model, Solar Conveyor combination sizing and role matching. */
export default function VaiOpportunity() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Detail>(`/venture-ai/opportunities/${id}`);
  const [tab, setTab] = useState('overview');
  const submit = useMutation(async () => { await api.post(`/venture-ai/opportunities/${id}/submit`, {}); q.reload(); return true; });
  const o = q.data;
  const editable = !!o && (o.staff || (o.mine && ['draft', 'in_review'].includes(o.status)));
  return (
    <Screen page={{ key: 'venture-ai-opportunity', title: 'Opportunity', access: 'partner' }} header={false}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !o ? <Skeleton height={320} /> : (
        <>
          <VaiHeader title={o.title} lead={<>{VAI_OPP_TYPES[o.type]} · {o.code} · proposed by {o.proposer}</>}>
            <div className="pt-cta"><OppStatus s={o.status} /> {o.sample && <SampleTag />} <ScoreBadge score={o.score?.result ?? null} />
              {o.mine && o.status === 'draft' && <Button size="sm" onClick={() => submit.run()} loading={submit.pending}>Submit to Unite for review</Button>}
              {o.venture && (o.mine || o.staff) && <ButtonLink size="sm" href={`/venture-ai/rooms/${o.venture.id}`} variant="accent">Open Venture Room</ButtonLink>}</div>
          </VaiHeader>
          <VaiNav />
          {o.sample && <Alert tone="info">Sample — a Unite demonstration. Its evidence is assumptions only, and its numbers are illustrative until real quotes and data are added.</Alert>}
          {submit.error && <Alert tone="danger">{submit.error}</Alert>}
          {o.decisionNote && <Alert tone={o.status === 'rejected' ? 'warning' : 'info'}>Unite: {o.decisionNote}</Alert>}
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview & evidence' }, { value: 'score', label: 'Score' }, { value: 'finance', label: 'Financial model' }, { value: 'combine', label: 'Combination studio' }, { value: 'roles', label: 'Roles & members' }]} />
          {tab === 'overview' && <Overview o={o} editable={editable} reload={q.reload} />}
          {tab === 'score' && <Score o={o} editable={editable} reload={q.reload} />}
          {tab === 'finance' && <Finance o={o} editable={editable} reload={q.reload} />}
          {tab === 'combine' && <Combine o={o} editable={editable} reload={q.reload} />}
          {tab === 'roles' && <Roles o={o} />}
        </>
      )}
    </Screen>
  );
}

type P = { o: Detail; editable: boolean; reload: () => void };

function Overview({ o, editable, reload }: P) {
  const [e, setE] = useState({ kind: 'assumption', statement: '', source: '', sourceDate: '' });
  const add = useMutation(async () => { await api.post(`/venture-ai/opportunities/${o.id}/evidence`, { kind: e.kind, statement: e.statement, source: e.source || undefined, sourceDate: e.sourceDate || undefined }); setE({ ...e, statement: '', source: '', sourceDate: '' }); reload(); return true; });
  const rows: [string, string | null][] = [['Customer problem', o.problem], ['Market gap', o.marketGap], ['Target customers', o.targetCustomers], ['Proposed solution', o.proposedSolution], ['Competitors', o.competitors], ['Technology', o.technology], ['Manufacturing', o.manufacturing], ['Risks', o.risks], ['Regulatory approvals', o.regulatory]];
  return (
    <div className="vai-two">
      <Card title="The opportunity">
        <dl className="vai-dl">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          <div><dt>Investment (estimate)</dt><dd>{rupees(o.investmentPaise)}</dd></div><div><dt>Countries</dt><dd>{o.countries.join(', ')}</dd></div></dl>
        {o.concept?.names?.length ? <p className="vai-muted">Working names: {o.concept.names.join(' · ')} — trademark search still required.</p> : null}
      </Card>
      <Card title="Evidence" subtitle="Verified facts carry a source and date. Everything else is an assumption or a forecast.">
        {(['verified', 'forecast', 'assumption'] as const).map((k) => {
          const list = o.evidence.filter((x) => x.kind === k);
          return list.length ? <div key={k} className="vai-ev" data-kind={k}><h3>{VAI_EVIDENCE_KINDS[k]}s</h3><ul>{list.map((x) => <li key={x.id}>{x.statement}{x.source && <small> — {x.source}, {x.sourceDate}</small>}</li>)}</ul></div> : null;
        })}
        {!o.evidence.length && <EmptyState icon="search" title="No evidence yet" />}
        {editable && (
          <form className="vai-row" onSubmit={(x) => { x.preventDefault(); add.run(); }}>
            {add.error && <Alert tone="danger">{add.error}</Alert>}
            <Select label="Kind" value={e.kind} onChange={(x) => setE({ ...e, kind: x.target.value })} options={Object.entries(VAI_EVIDENCE_KINDS).map(([value, label]) => ({ value, label }))} />
            <TextInput label="Statement" value={e.statement} onChange={(x) => setE({ ...e, statement: x.target.value })} />
            {e.kind === 'verified' && <><TextInput label="Source" value={e.source} onChange={(x) => setE({ ...e, source: x.target.value })} /><TextInput label="Source date" type="date" value={e.sourceDate} onChange={(x) => setE({ ...e, sourceDate: x.target.value })} /></>}
            <Button type="submit" size="sm" variant="secondary" loading={add.pending}>Add</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function Score({ o, editable, reload }: P) {
  const keys = Object.keys(VAI_CRITERIA) as VaiCriterion[];
  const [c, setC] = useState(() => Object.fromEntries(keys.map((k) => [k, { value: o.score?.inputs[k]?.value != null ? String(o.score.inputs[k].value) : '', evidence: o.score?.inputs[k]?.evidence ?? 'none' }])) as Record<VaiCriterion, { value: string; evidence: string }>);
  const [checks, setChecks] = useState<Record<string, string>>(() => ({ legal: 'pending', financial: 'pending', engineering: 'pending', safety: 'pending', ...(o.score?.checks ?? {}) }));
  const run = useMutation(async () => { await api.post(`/venture-ai/opportunities/${o.id}/score`, { criteria: Object.fromEntries(keys.map((k) => [k, { value: c[k].value === '' ? null : Number(c[k].value), evidence: c[k].evidence }])), checks }); reload(); return true; });
  const r = o.score?.result;
  return (
    <div className="vai-two">
      <Card title="Score inputs" subtitle="0–100 per criterion. Leave blank if you don’t know — missing criteria are listed, never guessed.">
        <form onSubmit={(e) => { e.preventDefault(); run.run(); }} className="cz-stack" style={{ gap: 10 }}>
          {run.error && <Alert tone="danger">{run.error}</Alert>}
          <table className="vai-table"><thead><tr><th>Criterion</th><th>Weight</th><th>Value</th><th>Evidence</th></tr></thead><tbody>
            {keys.map((k) => <tr key={k}><td>{VAI_CRITERIA[k].label}</td><td>{VAI_CRITERIA[k].weight}</td>
              <td><input className="cz-input" aria-label={`${VAI_CRITERIA[k].label} value`} inputMode="numeric" disabled={!editable} value={c[k].value} onChange={(e) => setC({ ...c, [k]: { ...c[k], value: e.target.value.replace(/[^\d]/g, '').slice(0, 3) } })} /></td>
              <td><select className="cz-input" aria-label={`${VAI_CRITERIA[k].label} evidence`} disabled={!editable} value={c[k].evidence} onChange={(e) => setC({ ...c, [k]: { ...c[k], evidence: e.target.value } })}><option value="strong">Strong</option><option value="some">Some</option><option value="none">None</option></select></td></tr>)}
          </tbody></table>
          <h3 className="vai-h3">Mandatory checks</h3>
          <div className="vai-checks">{Object.entries(VAI_MANDATORY_CHECKS).map(([k, label]) => <label key={k}>{label}<select className="cz-input" disabled={!editable} value={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.value })}><option value="pending">Pending</option><option value="pass">Pass</option><option value="fail">Fail</option></select></label>)}</div>
          {editable && <div><Button type="submit" loading={run.pending}>Calculate score</Button></div>}
        </form>
      </Card>
      <Card title="Result">
        {!r ? <EmptyState icon="target" title="Not scored yet" /> : (
          <div className="cz-stack" style={{ gap: 12 }} data-score-result>
            <div className="vai-big"><ScoreBadge score={r} /><span>{r.label}</span></div>
            {r.failedChecks.length > 0 && <Alert tone="danger">Blocked: failed {r.failedChecks.join(', ')} check. Approval is not possible until this is resolved.</Alert>}
            {r.missing.length > 0 && <Alert tone="warning">Missing: {r.missing.join(', ')}.</Alert>}
            <p className="vai-muted">Evidence quality {r.evidenceQuality}% · 80+ priority · 65–79 validate first · below 65 uncertain</p>
            <ul className="vai-bars">{r.contributions.map((x) => <li key={x.key}><span>{x.label}</span><span className="vai-bar"><i style={{ width: `${x.value}%` }} /></span><b>{x.value}</b><small>{x.points.toFixed(1)} pts</small></li>)}</ul>
          </div>
        )}
      </Card>
    </div>
  );
}

const FIN: [string, string, number][] = [
  ['unitPricePaise', 'Selling price per unit (₹)', 100], ['unitCostPaise', 'Unit cost — BOM + manufacturing (₹)', 100], ['freightPerUnitPaise', 'Freight per unit (₹)', 100], ['packagingPerUnitPaise', 'Packaging per unit (₹)', 100],
  ['dutyPct', 'Import duty %', 1], ['dealerMarginPct', 'Dealer margin %', 1], ['distributorMarginPct', 'Distributor margin %', 1], ['salesCommissionPct', 'Sales commission %', 1], ['marketingPctOfRevenue', 'Marketing % of revenue', 1],
  ['year1Units', 'Units in year 1', 1], ['growthPct', 'Growth per year %', 1], ['years', 'Years', 1], ['fixedCostsPerYearPaise', 'Fixed costs per year (₹)', 100], ['capexPaise', 'Capital expenditure (₹)', 100], ['workingCapitalDays', 'Working capital days', 1], ['taxPct', 'Tax %', 1],
];
function Finance({ o, editable, reload }: P) {
  const prev = o.finance?.inputs ?? {};
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(FIN.map(([k, , s]) => [k, prev[k] != null ? String(prev[k] / s) : ({ years: '5', workingCapitalDays: '60', taxPct: '25' } as Record<string, string>)[k] ?? ''])));
  const run = useMutation(async () => { await api.post(`/venture-ai/opportunities/${o.id}/finance`, Object.fromEntries(FIN.filter(([k]) => f[k] !== '').map(([k, , s]) => [k, s === 100 ? Math.round(Number(f[k]) * 100) : Number(f[k])]))); reload(); return true; });
  const r = o.finance?.result;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <Card title="Inputs" subtitle="Enter your own figures or supplier quotes. The model is a formula — same inputs, same answer.">
        <form onSubmit={(e) => { e.preventDefault(); run.run(); }} className="cz-stack" style={{ gap: 10 }}>
          {run.error && <Alert tone="danger">{run.error}</Alert>}
          <div className="vai-grid">{FIN.map(([k, l]) => <TextInput key={k} label={l} inputMode="decimal" disabled={!editable} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} error={run.fieldErrors[k]} />)}</div>
          {editable && <div><Button type="submit" loading={run.pending}>Calculate</Button></div>}
        </form>
      </Card>
      {r && (
        <Card title={`Five-year model · version ${o.finance!.versions}`} subtitle="Projection from the inputs above — not a forecast of actual results.">
          <div className="pt-kpis">
            <div className="vai-stat"><span>Contribution per unit</span><strong>{rupees(r.unitContributionPaise)}</strong></div>
            <div className="vai-stat"><span>Break-even units / year</span><strong>{r.breakEvenUnitsPerYear?.toLocaleString('en-IN') ?? '—'}</strong></div>
            <div className="vai-stat"><span>Payback</span><strong>{r.paybackYear ? `Year ${r.paybackYear}` : 'Not within the period'}</strong></div>
            <div className="vai-stat"><span>ROI</span><strong>{r.roiPct != null ? `${r.roiPct}%` : '—'}</strong></div>
            <div className="vai-stat"><span>IRR</span><strong>{r.irrPct != null ? `${r.irrPct}%` : '—'}</strong></div>
          </div>
          {r.notes.map((n) => <Alert key={n} tone="info">{n}</Alert>)}
          <div className="vai-scroll"><table className="vai-table"><thead><tr><th>Year</th><th>Units</th><th>Revenue</th><th>COGS</th><th>Channel</th><th>Marketing</th><th>Fixed</th><th>EBITDA</th><th>Net profit</th><th>Cash flow</th><th>Cumulative</th></tr></thead>
            <tbody>{r.years.map((y) => <tr key={y.year}><td>{y.year}</td><td>{y.units.toLocaleString('en-IN')}</td><td>{rupees(y.revenue)}</td><td>{rupees(y.cogs)}</td><td>{rupees(y.channel)}</td><td>{rupees(y.marketing)}</td><td>{rupees(y.fixed)}</td><td>{rupees(y.ebitda)}</td><td>{rupees(y.netProfit)}</td><td>{rupees(y.cashFlow)}</td><td>{rupees(y.cumulative)}</td></tr>)}</tbody></table></div>
          <h3 className="vai-h3">Sensitivity — final-year net profit</h3>
          <ul className="vai-sens">{o.finance!.sensitivity.map((s) => <li key={s.case}><span>{s.case}</span><strong data-neg={s.netProfit < 0 || undefined}>{rupees(s.netProfit)}</strong></li>)}</ul>
        </Card>
      )}
    </div>
  );
}

const CONV: [string, string, number, string][] = [
  ['motorKw', 'Conveyor motor (kW)', 1, '22'], ['hoursPerDay', 'Running hours per day', 1, '10'], ['loadFactorPct', 'Load factor %', 1, '70'], ['daysPerYear', 'Working days per year', 1, '300'],
  ['peakSunHours', 'Peak sun hours at site', 1, '5'], ['performanceRatioPct', 'PV performance ratio %', 1, '78'], ['batteryHours', 'Battery backup hours', 1, '2'], ['depthOfDischargePct', 'Battery depth of discharge %', 1, '80'],
  ['solarCostPaisePerWp', 'Solar cost (₹ per Wp)', 100, '38'], ['batteryCostPaisePerKwh', 'Battery cost (₹ per kWh)', 100, '18000'], ['gridTariffPaisePerKwh', 'Grid tariff (₹ per kWh)', 100, '8.5'],
];
function Combine({ o, editable, reload }: P) {
  const prev = o.concept?.conveyor?.inputs ?? {};
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(CONV.map(([k, , s, d]) => [k, prev[k] != null ? String(prev[k] / s) : d])));
  const run = useMutation(async () => { await api.post(`/venture-ai/opportunities/${o.id}/conveyor`, Object.fromEntries(CONV.map(([k, , s]) => [k, s === 100 ? Math.round(Number(f[k]) * 100) : Number(f[k])]))); reload(); return true; });
  const r = o.concept?.conveyor?.result;
  return (
    <div className="vai-two">
      <Card title="Solar Conveyor sizing" subtitle="Combination product: conveyor + PV array + battery + drives. Default costs are placeholders you should replace with supplier quotes.">
        <form onSubmit={(e) => { e.preventDefault(); run.run(); }} className="cz-stack" style={{ gap: 10 }}>
          {run.error && <Alert tone="danger">{run.error}</Alert>}
          <div className="vai-grid">{CONV.map(([k, l]) => <TextInput key={k} label={l} inputMode="decimal" disabled={!editable} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} error={run.fieldErrors[k]} />)}</div>
          {editable && <div><Button type="submit" loading={run.pending}>Size the system</Button></div>}
        </form>
      </Card>
      <Card title="Result">
        {!r ? <EmptyState icon="sun" title="Not sized yet">Use the conveyor’s motor rating and running hours.</EmptyState> : (
          <div className="cz-stack" style={{ gap: 10 }} data-conveyor-result>
            <div className="pt-kpis">
              <div className="vai-stat"><span>Energy per day</span><strong>{r.energyKwhPerDay} kWh</strong></div>
              <div className="vai-stat"><span>Solar array</span><strong>{r.solarKwp} kWp</strong></div>
              <div className="vai-stat"><span>Battery</span><strong>{r.batteryKwh} kWh</strong></div>
              <div className="vai-stat"><span>Solar + battery cost</span><strong>{rupees(r.totalCostPaise)}</strong></div>
              <div className="vai-stat"><span>Grid power avoided / year</span><strong>{rupees(r.annualGridSavingPaise)}</strong></div>
              <div className="vai-stat"><span>Simple payback</span><strong>{r.simplePaybackYears != null ? `${r.simplePaybackYears} years` : '—'}</strong></div>
            </div>
            {r.notes.map((n) => <Alert key={n} tone="warning">{n}</Alert>)}
          </div>
        )}
      </Card>
    </div>
  );
}

function Roles({ o }: { o: Detail }) {
  const visible = o.status === 'approved' || o.mine || o.staff;
  const q = useQuery<Matches>(visible ? `/venture-ai/opportunities/${o.id}/matches` : null);
  const room = o.venture && o.mine;
  const [msg, setMsg] = useState('');
  const invite = useMutation(async (capabilityId: string, role: VaiRole) => { await api.post(`/venture-ai/rooms/${o.venture!.id}/invitations`, { capabilityId, role, message: msg || `We would like you to join ${o.title} as ${VAI_ROLES[role]}.` }); q.reload(); return role; });
  if (!q.data) return q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : <Skeleton height={200} />;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <Alert tone="info">{q.data.note}</Alert>
      {room && <TextInput label="Invitation message (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} hint="Say what the member would do, how they earn and the main risks." />}
      {!room && o.mine && <Alert tone="warning">You can invite members once Unite approves the opportunity and the Venture Room opens.</Alert>}
      {invite.error && <Alert tone="danger">{invite.error}</Alert>}
      {invite.data && <Alert tone="success">Invitation sent for {VAI_ROLES[invite.data]}. The member decides whether to join.</Alert>}
      {q.data.roles.map((r, i) => (
        <Card key={`${r.role}-${i}`} title={`${r.label} × ${r.count}`}>
          {r.candidates.length ? <ul className="vai-list">{r.candidates.map((c) => (
            <li key={c.capabilityId} data-candidate={c.org}>
              <div><strong>{c.org}</strong> <span className="vai-match">{c.percent}% match</span><p>{c.reasons.join(' · ')}</p>{c.gaps.length > 0 && <p className="vai-muted">Gaps: {c.gaps.join(' · ')}</p>}</div>
              {room && <Button size="sm" variant="secondary" onClick={() => invite.run(c.capabilityId, r.role)} loading={invite.pending}>Invite</Button>}
            </li>))}</ul> : <EmptyState icon="users" title="No members offer this role yet">Members appear here after they add it to their capability profile.</EmptyState>}
        </Card>
      ))}
      <p className="vai-muted">Not finding the right partner? <Link href="/venture-ai/capabilities">Members add capabilities here</Link>.</p>
    </div>
  );
}
