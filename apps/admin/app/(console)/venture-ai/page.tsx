'use client';
import { useEffect, useState } from 'react';
import { VAI_OPP_TYPES, VAI_ROLES, type VaiRole } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, Segmented, StatusBadge, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const rupees = (p?: number | null) => (p == null ? '—' : `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
interface Review { id: string; code: string; title: string; type: keyof typeof VAI_OPP_TYPES; proposer: string; problem: string; marketGap: string; proposedSolution: string; investmentPaise: number | null; sample: boolean;
  roles: { role: VaiRole; count: number }[]; score: { result: { score: number | null; label: string; classification: string; failedChecks: string[]; missing: string[]; evidenceQuality: number } } | null }
interface Run { id: string; agent: string; provider: string; model: string | null; status: string; error: string | null; costPaise: number | null; by: string; createdAt: string; inputTokens: number | null; outputTokens: number | null }
interface O { counts: { opportunities: number; ventures: number; members: number; ai_cost_month: number; runs_month: number }; settings: { killSwitch: boolean; monthlyBudgetPaise: number }; provider: string; review: Review[]; runs: Run[] }

/** Venture AI admin: approve opportunities into Venture Rooms, AI kill switch and budget, agent runs and cost, demonstration pilots. */
export default function VentureAiAdmin() {
  const q = useQuery<O>('/admin/venture-ai/overview');
  const [tab, setTab] = useState('review');
  const act = useMutation(async (fn: () => Promise<unknown>) => { const r = await fn(); q.reload(); return r; });
  const d = q.data;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Venture AI" description="Approve member opportunities into Venture Rooms, control AI agents (kill switch and monthly budget), review agent runs and cost, and load the demonstration pilots. Sample records are excluded from counts." />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <p className="cz-muted" style={{ margin: 0 }}>{d.counts.opportunities} opportunities · {d.counts.ventures} Venture Rooms · {d.counts.members} capability profiles · {d.counts.runs_month} agent runs this month · AI cost this month {rupees(Number(d.counts.ai_cost_month))} · provider: {d.provider === 'anthropic' ? 'Claude' : 'rules templates (no AI key connected)'}</p>
          <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'review', label: `Review (${d.review.length})` }, { value: 'ai', label: 'AI controls' }, { value: 'runs', label: `Agent runs (${d.runs.length})` }, { value: 'pilots', label: 'Pilots' }]} />
          {tab === 'review' && (!d.review.length ? <Card><EmptyState icon="verify" title="Nothing to review" /></Card> : d.review.map((o) => <ReviewCard key={o.id} o={o} act={(fn) => act.run(fn)} />))}
          {tab === 'ai' && <Controls s={d.settings} provider={d.provider} save={(b) => act.run(() => api.put('/admin/venture-ai/settings', b))} />}
          {tab === 'runs' && (!d.runs.length ? <Card><EmptyState icon="audit" title="No agent runs yet" /></Card> : (
            <Card flush><div className="vai-scroll"><table className="vai-table"><thead><tr><th>When</th><th>Agent</th><th>By</th><th>Provider</th><th>Status</th><th>Tokens</th><th>Cost</th></tr></thead>
              <tbody>{d.runs.map((r) => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString('en-IN')}</td><td>{r.agent}</td><td>{r.by}</td><td>{r.provider === 'anthropic' ? `Claude · ${r.model}` : 'Rules'}</td><td><StatusBadge status={r.status} />{r.error ? <small> {r.error}</small> : null}</td><td>{r.inputTokens != null ? `${r.inputTokens} / ${r.outputTokens}` : '—'}</td><td>{rupees(r.costPaise)}</td></tr>)}</tbody></table></div></Card>
          ))}
          {tab === 'pilots' && (
            <Card title="Demonstration pilots" subtitle="Creates six opportunities marked Sample, owned by your organisation: Solar Conveyor (with sizing), SUNORA Paints, SUNORA Furniture, Unite Solar industrial, Unite Powertek and UNITE EXIM. Their evidence is recorded as assumptions only. Running it again creates nothing new.">
              {act.data != null && typeof act.data === 'object' && 'created' in (act.data as object) && <Alert tone="success">{(act.data as { created: number }).created} pilots created.</Alert>}
              <div><Button onClick={() => act.run(() => api.post('/admin/venture-ai/pilots', {}))} loading={act.pending}>Load pilots</Button></div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ReviewCard({ o, act }: { o: Review; act: (fn: () => Promise<unknown>) => void }) {
  const r = o.score?.result;
  return (
    <Card>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{o.code} · {o.title}{o.sample ? ' (Sample)' : ''}</h3>{r && <StatusBadge status={r.classification} label={`${r.score ?? '—'} · ${r.label}`} tone={(r.classification === 'blocked' ? 'danger' : r.classification === 'priority' ? 'success' : 'warning') as never} />}</div>
      <p className="cz-muted" style={{ fontSize: 13 }}>{VAI_OPP_TYPES[o.type]} · {o.proposer} · investment {rupees(o.investmentPaise)} · evidence quality {r?.evidenceQuality ?? 0}%</p>
      <p style={{ margin: '4px 0' }}><strong>Problem:</strong> {o.problem}</p>
      <p style={{ margin: '4px 0' }}><strong>Gap:</strong> {o.marketGap}</p>
      <p style={{ margin: '4px 0' }}><strong>Solution:</strong> {o.proposedSolution}</p>
      <p className="cz-muted" style={{ fontSize: 13 }}>Roles: {o.roles.map((x) => `${VAI_ROLES[x.role]} × ${x.count}`).join(', ')}</p>
      {r?.failedChecks.length ? <Alert tone="danger">Failed mandatory check: {r.failedChecks.join(', ')} — approval is blocked.</Alert> : null}
      {r?.missing.length ? <Alert tone="warning">Missing criteria: {r.missing.join(', ')}</Alert> : null}
      <div className="cz-row" style={{ gap: 8 }}>
        <Button size="sm" variant="accent" disabled={r?.classification === 'blocked'} onClick={() => act(() => api.post(`/admin/venture-ai/opportunities/${o.id}/decide`, { decision: 'approve' }))}>Approve — open Venture Room</Button>
        <Button size="sm" variant="ghost" onClick={() => { const note = window.prompt('Reason (shown to the proposer)'); if (note) act(() => api.post(`/admin/venture-ai/opportunities/${o.id}/decide`, { decision: 'reject', note })); }}>Not approved…</Button>
      </div>
    </Card>
  );
}

function Controls({ s, provider, save }: { s: O['settings']; provider: string; save: (b: O['settings']) => void }) {
  const [kill, setKill] = useState(s.killSwitch); const [budget, setBudget] = useState(String(s.monthlyBudgetPaise / 100));
  useEffect(() => { setKill(s.killSwitch); setBudget(String(s.monthlyBudgetPaise / 100)); }, [s]);
  return (
    <Card title="AI controls" subtitle="Only a super admin can change these. Rules templates always run (no cost); Claude runs need an API key in the server’s secret settings and a monthly budget above zero.">
      <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); save({ killSwitch: kill, monthlyBudgetPaise: Math.round(Number(budget || 0) * 100) }); }}>
        <Checkbox label="Kill switch — pause all AI agents now" checked={kill} onChange={(e) => setKill(e.target.checked)} />
        <TextInput label="Monthly AI budget (₹)" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} hint={provider === 'anthropic' ? 'Runs stop when this month’s cost would exceed it.' : 'No AI key is connected yet; the budget applies once one is.'} />
        <div><Button type="submit">Save controls</Button></div>
      </form>
    </Card>
  );
}
