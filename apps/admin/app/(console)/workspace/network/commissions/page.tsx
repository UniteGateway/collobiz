'use client';
import { useState } from 'react';
import { EARNING_STREAMS, STREAM_LABELS } from '@collabiz/types';
import { Alert, Button, DataTable, LoadingState, Segmented, Select, StatusBadge, TextInput, Checkbox } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE, inr, pct } from '@/components/Network';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const P = (rupees: string) => Math.round(Number(rupees || 0) * 100);
const NEXT_LABEL: Record<string, string> = { qualified: 'Qualify', approved: 'Approve', reversed: 'Reverse', pending: 'Reopen' };

/** Commission ledger — five streams, maker-checker approval, compliance holds, payment verification and settlements. */
export default function Commissions() {
  const [stream, setStream] = useState('');
  const q = useQuery<{ streams: R[]; entries: R[] }>('/admin/network/commissions', stream ? { stream } : undefined);
  const st = useQuery<R[]>('/admin/network/settlements');
  const apps = useQuery<R[]>('/admin/network/applications', { status: 'live' });
  const [form, setForm] = useState('district');
  const [f, setF] = useState<R>({});
  const reload = () => { q.reload(); st.reload(); };
  const move = useMutation(async (e: R, to: string) => { const note = to === 'reversed' ? window.prompt('Reason for reversal') ?? undefined : undefined; if (to === 'reversed' && !note) return; await api.post(`/admin/network/commissions/${e.id}/status`, { to, note }); reload(); });
  const verify = useMutation(async (e: R) => { const reference = window.prompt('Project payment reference'); if (!reference) return; await api.post(`/admin/network/commissions/${e.id}/payment-verified`, { reference }); reload(); });
  const comply = useMutation(async (e: R, decision: string) => { const note = window.prompt(`Compliance note (${decision})`); if (!note) return; await api.post(`/admin/network/commissions/${e.id}/compliance`, { decision, note }); reload(); });
  const settle = useMutation(async (orgId: string) => { await api.post('/admin/network/settlements', { orgId }, true); reload(); });
  const paid = useMutation(async (s: R) => { const reference = window.prompt(`Bank reference for ${s.number}`); if (!reference) return; await api.post(`/admin/network/settlements/${s.id}/paid`, { reference }, true); reload(); });
  const add = useMutation(async () => {
    if (form === 'district') await api.post('/admin/network/commissions/district', { unitId: f.unitId, period: f.period, revenue: P(f.revenue), directCosts: P(f.directCosts), approvedExpenses: P(f.approvedExpenses) });
    if (form === 'inter') await api.post('/admin/network/commissions/inter-franchise', { originUnitId: f.originUnitId, executingUnitId: f.executingUnitId, leadReference: f.leadReference, projectReference: f.projectReference, eligiblePool: P(f.eligiblePool), poolBasis: f.poolBasis });
    if (form === 'park') await api.post('/admin/network/commissions/solar-park', { projectReference: f.projectReference, projectName: f.projectName, eligibleValue: P(f.eligibleValue), poolBps: Number(f.poolBps), contributors: [{ orgId: f.orgId, bps: Number(f.bps), role: f.role }] });
    if (form === 'invest') await api.post('/admin/network/commissions/investment', { orgId: f.orgId, investmentReference: f.investmentReference, investor: f.investor, realised: P(f.realised), bps: Number(f.bps), legallyRestricted: !!f.legallyRestricted });
    setF({}); reload();
  });
  const live = (apps.data ?? []);
  const unitOpts = (pred: (a: R) => boolean = () => true) => live.filter(pred).map((a) => ({ value: a.id, label: `${a.partner} — ${a.pricing?.packageName} (${a.district})` }));
  const orgOpts = [...new Map(live.map((a) => [a.franchiseeOrgId, a.partner])).entries()].map(([value, label]) => ({ value, label }));
  const txt = (k: string, label: string, hint?: string) => <TextInput label={label} hint={hint} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} error={add.fieldErrors[k]} />;
  const err = move.error ?? verify.error ?? comply.error ?? settle.error ?? paid.error;
  const approvedByOrg = (q.data?.entries ?? []).filter((e) => e.status === 'approved').reduce<Record<string, { name: string; amount: number }>>((a, e) => ({ ...a, [e.beneficiaryOrgId]: { name: e.partner, amount: (a[e.beneficiaryOrgId]?.amount ?? 0) + Number(e.amount) } }), {});
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 12px' }}>Commissions & settlements</h1>
      <NetworkTabs />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <div className="cz-us-earn">{q.data.streams.map((s) => <div key={s.stream}><span className="cz-muted" style={{ fontSize: 12.5 }}>{s.label}</span><strong>{inr(s.pending + s.qualified)}</strong><span style={{ fontSize: 12 }}>pending · {inr(s.approved)} approved · {inr(s.paid)} paid</span></div>)}</div>
          <section className="cz-card" aria-label="Record earnings">
            <h2 style={{ marginTop: 0, fontSize: 17 }}>Record an earning (a second administrator approves it)</h2>
            <Segmented label="Stream" value={form} onChange={(v) => { setForm(v); setF({}); }} options={[{ value: 'district', label: 'District profit share' }, { value: 'inter', label: 'Inter-franchise' }, { value: 'park', label: 'Solar park' }, { value: 'invest', label: 'Investment' }]} />
            <form className="cz-row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
              {form === 'district' && <><Select label="District franchise" value={f.unitId ?? ''} placeholder="Choose" onChange={(e) => setF({ ...f, unitId: e.target.value })} options={unitOpts((a) => a.packageCode === 'district_franchise')} />{txt('period', 'Period (YYYY-MM)')}{txt('revenue', 'Revenue (₹)')}{txt('directCosts', 'Direct costs (₹)')}{txt('approvedExpenses', 'Approved expenses (₹)')}</>}
              {form === 'inter' && <><Select label="Originating franchise" value={f.originUnitId ?? ''} placeholder="Choose" onChange={(e) => setF({ ...f, originUnitId: e.target.value })} options={unitOpts((a) => a.packageCode?.endsWith('franchise'))} /><Select label="Executing franchise" value={f.executingUnitId ?? ''} placeholder="Choose" onChange={(e) => setF({ ...f, executingUnitId: e.target.value })} options={unitOpts((a) => a.packageCode?.endsWith('franchise'))} />{txt('leadReference', 'Protected lead ref.')}{txt('projectReference', 'Project ref.')}{txt('eligiblePool', 'Eligible pool (₹)', 'Commission/profit pool — not turnover')}{txt('poolBasis', 'How the pool was set')}</>}
              {form === 'park' && <>{txt('projectReference', 'Project ref.')}{txt('projectName', 'Project')}{txt('eligibleValue', 'Approved eligible value (₹)')}{txt('poolBps', 'Project pool (bps, ≤ 200)')}<Select label="Contributor" value={f.orgId ?? ''} placeholder="Choose" onChange={(e) => setF({ ...f, orgId: e.target.value })} options={orgOpts} />{txt('bps', 'Share (bps)')}{txt('role', 'Contribution')}</>}
              {form === 'invest' && <><Select label="Facilitating partner" value={f.orgId ?? ''} placeholder="Choose" onChange={(e) => setF({ ...f, orgId: e.target.value })} options={orgOpts} />{txt('investmentReference', 'Investment ref.')}{txt('investor', 'Investor')}{txt('realised', 'Realised (received) ₹')}{txt('bps', 'Rate (bps, ≤ 200)')}<Checkbox label="Legally restricted" checked={!!f.legallyRestricted} onChange={(e) => setF({ ...f, legallyRestricted: e.target.checked })} /></>}
              <Button type="submit" loading={add.pending}>Record</Button>
            </form>
            {add.error && <Alert tone="danger">{add.error}</Alert>}
          </section>
          {err && <Alert tone="danger">{err}</Alert>}
          <section className="cz-card" aria-label="Ledger">
            <div className="cz-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}>Ledger</h2>
              <Select label="Stream" value={stream} placeholder="All streams" onChange={(e) => setStream(e.target.value)} options={EARNING_STREAMS.map((s) => ({ value: s, label: STREAM_LABELS[s] }))} /></div>
            <DataTable caption="Commission ledger" rows={q.data.entries} columns={[
              { key: 'r', header: 'Reference', render: (e: R) => <><strong>{e.sourceRef}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{STREAM_LABELS[e.stream as keyof typeof STREAM_LABELS]} · {e.description}</span></> },
              { key: 'p', header: 'Partner', render: (e: R) => e.partner },
              { key: 'b', header: 'Base × rate', render: (e: R) => <>{inr(e.base)} × {pct(e.rateBps)}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.baseLabel}</span></> },
              { key: 'a', header: 'Amount', render: (e: R) => inr(e.amount) },
              { key: 's', header: 'Status', render: (e: R) => <StatusBadge status={e.status} tone={TONE[e.status]} label={e.statusLabel} /> },
              { key: 'x', header: '', render: (e: R) => <div className="cz-row" style={{ gap: 4, flexWrap: 'wrap' }}>
                {e.next.map((to: string) => <Button key={to} size="sm" variant={to === 'reversed' ? 'ghost' : 'secondary'} onClick={() => move.run(e, to)}>{NEXT_LABEL[to] ?? to}</Button>)}
                {e.stream === 'inter_franchise' && !e.inputs?.paymentVerified && <Button size="sm" variant="ghost" onClick={() => verify.run(e)}>Verify payment</Button>}
                {e.stream === 'investment' && e.compliance !== 'cleared' && !['paid', 'reversed'].includes(e.status) && <><Button size="sm" variant="ghost" onClick={() => comply.run(e, 'cleared')}>Compliance: clear</Button><Button size="sm" variant="ghost" onClick={() => comply.run(e, 'blocked')}>Block</Button></>}
              </div> },
            ]} />
          </section>
          <section className="cz-card" aria-label="Settlements">
            <h2 style={{ marginTop: 0, fontSize: 17 }}>Settlements</h2>
            {Object.entries(approvedByOrg).length > 0 && <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{Object.entries(approvedByOrg).map(([org, v]) => <Button key={org} size="sm" onClick={() => settle.run(org)}>Settle {v.name}: {inr(v.amount)}</Button>)}</div>}
            <DataTable caption="Settlements" rows={st.data ?? []} columns={[
              { key: 'n', header: 'Settlement', render: (s: R) => s.number }, { key: 'p', header: 'Partner', render: (s: R) => s.partner }, { key: 'a', header: 'Amount', render: (s: R) => `${inr(s.amount)} (${s.entries})` },
              { key: 's', header: 'Status', render: (s: R) => <StatusBadge status={s.status} tone={TONE[s.status]} label={s.status === 'paid' ? `Paid · ${s.paymentReference}` : 'Payable'} /> },
              { key: 'x', header: '', render: (s: R) => s.status === 'payable' ? <Button size="sm" onClick={() => paid.run(s)}>Record payout (second finance user)</Button> : null },
            ]} />
          </section>
        </div>
      )}
    </div>
  );
}
