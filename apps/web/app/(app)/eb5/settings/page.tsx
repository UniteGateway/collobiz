'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, ButtonLink, Card, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, MfaHint, day, useEb5, usd } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface S { brand: string; consultancyEntity: string; entityJurisdiction: string; indicativeInvestmentUsd: number; consultancyFeeUsd: number; commencementPct: number; schedule: { total: number; commencement: number; balance: number };
  gates: { key: string; label: string; approved: boolean; approval: { by: string; ref: string; at: string } | null }[] }

/** Fee configuration (proposed terms) and the legal approvals that switch agreements, invoices and compensation on. */
export default function Eb5Settings() {
  const { me, has } = useEb5();
  const q = useQuery<S>('/eb5/settings');
  const [f, setF] = useState({ indicativeInvestmentUsd: '', consultancyFeeUsd: '', commencementPct: '' });
  const [refs, setRefs] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setF({ indicativeInvestmentUsd: String(q.data.indicativeInvestmentUsd), consultancyFeeUsd: String(q.data.consultancyFeeUsd), commencementPct: String(q.data.commencementPct) }); }, [q.data]);
  const save = useMutation(async () => { const r = await api.put<S>('/eb5/settings', { indicativeInvestmentUsd: Number(f.indicativeInvestmentUsd), consultancyFeeUsd: Number(f.consultancyFeeUsd), commencementPct: Number(f.commencementPct) }); q.setData(r); return r; });
  const gate = useMutation(async (key: string, approved: boolean) => { const r = await api.post<S>(`/eb5/settings/gates/${key}`, { approved, reference: refs[key] ?? '' }); q.setData(r); setRefs({ ...refs, [key]: '' }); return r; });
  const s = q.data;
  const canConfigure = has('super_admin', 'citrus_admin'); const canApprove = has('super_admin', 'compliance');
  return (
    <Screen page={{ key: 'eb5-settings', title: 'GO EB5 settings & legal approvals', access: 'authenticated' }} eyebrow="GO EB5"
      description="Proposed commercial terms for CITRUS360 LLC. They are not approved charges: agreements, invoices and partner compensation stay off until U.S. counsel's approval is recorded here."
      actions={canConfigure ? <ButtonLink href="/eb5/roles" variant="secondary">Staff roles</ButtonLink> : undefined}>
      <MfaHint me={me} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !s ? <LoadingState /> : <div className="cz-grid cz-grid-2">
        <Card title="Consultancy terms (proposed)">
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <p className="cz-muted" style={{ marginTop: 0 }}>Contracting entity: <strong>{s.consultancyEntity}</strong> ({s.entityJurisdiction}) · public brand {s.brand}</p>
          <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
            <TextInput label="Indicative EB-5 investment (USD) — separate project investment" inputMode="numeric" value={f.indicativeInvestmentUsd} onChange={(e) => setF({ ...f, indicativeInvestmentUsd: e.target.value.replace(/\D/g, '') })} disabled={!canConfigure} />
            <TextInput label="Consultancy fee (USD)" inputMode="numeric" value={f.consultancyFeeUsd} onChange={(e) => setF({ ...f, consultancyFeeUsd: e.target.value.replace(/\D/g, '') })} disabled={!canConfigure} error={save.fieldErrors.consultancyFeeUsd} />
            <TextInput label="Commencement payment (% of the fee)" inputMode="decimal" value={f.commencementPct} onChange={(e) => setF({ ...f, commencementPct: e.target.value })} disabled={!canConfigure} />
            {canConfigure && <div><Button type="submit" loading={save.pending}>Save terms</Button></div>}
          </form>
          <dl className="cz-dl" style={{ marginTop: 16 }}>
            <dt>Consultancy agreement</dt><dd>{usd(s.schedule.total)}</dd>
            <dt>Commencement ({s.commencementPct}%)</dt><dd>{usd(s.schedule.commencement)}</dd>
            <dt>Balance (milestones to agree)</dt><dd>{usd(s.schedule.balance)}</dd>
            <dt>Indicative investment</dt><dd>${s.indicativeInvestmentUsd.toLocaleString('en-US')} — paid to the project, never to COLLABIZ</dd>
          </dl>
          <p className="cz-muted" style={{ fontSize: 12.5 }}>Changing the fee or percentage withdraws the fee approval until counsel approves the new terms.</p>
        </Card>
        <Card title="Legal approvals">
          {gate.error && <Alert tone="danger">{gate.error}</Alert>}
          <ul className="cz-eb5-gates">{s.gates.map((g) => (
            <li key={g.key} data-gate={g.key}>
              <div style={{ flex: '1 1 260px' }}><strong style={{ fontSize: 14 }}>{g.label}</strong>{g.approval && <div className="cz-muted" style={{ fontSize: 12 }}>{g.approval.ref} · {day(g.approval.at)}</div>}</div>
              <Badge s={g.approved ? 'approved' : 'pending'} label={g.approved ? 'Approved' : 'Not approved'} />
              {canApprove && <div className="cz-row" style={{ gap: 6, width: '100%', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}><TextInput label="Counsel's reference" value={refs[g.key] ?? ''} onChange={(e) => setRefs({ ...refs, [g.key]: e.target.value })} /></div>
                <Button size="sm" variant={g.approved ? 'ghost' : 'primary'} onClick={() => gate.run(g.key, !g.approved)}>{g.approved ? 'Withdraw' : 'Record approval'}</Button>
              </div>}
            </li>
          ))}</ul>
        </Card>
      </div>}
    </Screen>
  );
}
