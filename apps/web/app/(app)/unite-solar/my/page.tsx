'use client';
import { useState } from 'react';
import { Alert, Button, ButtonLink, DescriptionList, Kpi, Select, Skeleton, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { DISCLAIMER, PartnerGate, STATUS_TONE, inr, lakhs, pct, usePartner, type Pkg, type UnitSummary } from '@/components/UniteSolar';

interface Dash {
  unit: UnitSummary & { agreementContractId: string | null; paymentReference: string | null; openedAt: string | null; agreementEnds: string | null }; package: Pkg;
  steps: { key: string; label: string; done: boolean }[];
  territory: { name: string; level: string; district: string; state: string; pincodes: string[]; status: string; exclusive: boolean; expiresOn: string | null } | null;
  catchment: { pincode: string; note: string } | null;
  leadDna: { entitled: boolean; source: string | null; validTo: string | null; offered: string };
  sales: { orders: number; value: number; fromStock: number; viaUnite: number; awaitingAcceptance: number; margin: number };
  inventory: { skus: number; units: number; value: number; lowStock: number } | null;
  earnings: { stream: string; label: string; pending: number; approved: number; paid: number }[];
  demo: { open: number; held: number }; service: { open: number; total: number }; disclaimer: string;
}

/** My franchise — the partner's record end to end: application progress, payment, territory, LeadDNA, sales, stock and earnings. */
export default function MyFranchise() {
  const p = usePartner();
  return (
    <Screen page={{ key: 'unite-solar-my', title: 'My Unite Solar partnership', access: 'partner' }} actions={<ButtonLink href="/unite-solar" variant="secondary">Partner plans</ButtonLink>}>
      <PartnerGate p={p}>{(u) => <Dashboard key={u.id} id={u.id} onChange={p.reload} />}</PartnerGate>
    </Screen>
  );
}

function Dashboard({ id, onChange }: { id: string; onChange: () => void }) {
  const q = useQuery<Dash>(`/network/units/${id}/dashboard`);
  const ld = useQuery<{ entitled: boolean; connection: string; message: string }>('/network/leaddna');
  const [pay, setPay] = useState({ method: 'bank_transfer', reference: '' });
  const payM = useMutation(async () => { await api.post(`/network/units/${id}/payment`, { ...pay, amount: q.data!.unit.pricing.total }, true); q.reload(); onChange(); });
  const submit = useMutation(async () => { await api.post(`/network/applications/${id}/submit`); q.reload(); onChange(); });
  const open = useMutation(async () => api.post('/network/leaddna/session'));
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!q.data) return <Skeleton height={420} />;
  const d = q.data, u = d.unit;
  const current = d.steps.findIndex((s) => !s.done);
  const canPay = ['approved', 'agreement_signed', 'setup'].includes(u.status) && ['unpaid', 'rejected'].includes(u.paymentStatus);
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <section className="cz-card" aria-label="Partnership">
        <div className="cz-row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div><h2 style={{ margin: 0, fontSize: 19 }}>{d.package.name} — {u.city}</h2><span className="cz-muted" style={{ fontSize: 13 }}>{u.code} · {u.district}, {u.state} · plan version {u.pricing.packageVersion}</span></div>
          <StatusBadge status={u.status} tone={STATUS_TONE[u.status] ?? 'neutral'} label={u.statusLabel} />
        </div>
        {u.decisionNote && <Alert tone={u.status === 'draft' ? 'warning' : 'info'} title="Note from Unite">{u.decisionNote}</Alert>}
        <ol className="cz-us-steps" aria-label="Progress">{d.steps.map((s, i) => <li key={s.key} data-done={s.done || undefined} data-current={i === current || undefined}>{s.done ? '✓' : i + 1}. {s.label}</li>)}</ol>
        {u.status === 'draft' && <div className="cz-row" style={{ gap: 8 }}><ButtonLink href={`/unite-solar/apply?id=${u.id}`} variant="secondary">Edit application</ButtonLink><Button onClick={() => submit.run()} loading={submit.pending}>Submit application</Button></div>}
        {submit.error && <Alert tone="danger">{submit.error}</Alert>}
        {u.agreementContractId && <p style={{ fontSize: 14 }}>Agreement: <a href={`/contracts/${u.agreementContractId}`}>open in Contracts to review and sign</a></p>}
      </section>

      {(canPay || u.paymentStatus !== 'unpaid') && (
        <section className="cz-card" aria-label="Payment">
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Payment</h2>
          <DescriptionList items={[['Plan', inr(u.pricing.package)], ['LeadDNA add-on', u.pricing.leadDnaAddon ? inr(u.pricing.leadDnaAddon) : '—'], ['GST', inr(u.pricing.gst)], ['Total', <strong key="t">{inr(u.pricing.total)}</strong>], ['Status', <StatusBadge key="s" status={u.paymentStatus} tone={STATUS_TONE[u.paymentStatus]} label={{ unpaid: 'Not paid', submitted: 'Awaiting verification by Unite finance', verified: 'Verified', rejected: 'Could not be verified — please check and resubmit' }[u.paymentStatus]} />], ['Reference', u.paymentReference]]} />
          {canPay && (
            <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); payM.run(); }} noValidate>
              <Select label="Paid by" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={[{ value: 'bank_transfer', label: 'Bank transfer (NEFT/RTGS)' }, { value: 'upi', label: 'UPI' }, { value: 'cheque', label: 'Cheque' }]} />
              <TextInput label="UTR / transaction reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} error={payM.fieldErrors.reference} />
              <Button type="submit" loading={payM.pending} disabled={pay.reference.trim().length < 4}>Record payment of {inr(u.pricing.total)}</Button>
            </form>
          )}
          {payM.error && <Alert tone="danger">{payM.error}</Alert>}
          <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Your rights are activated only after the agreement is signed and Unite’s finance team verifies the payment against its bank account.</p>
        </section>
      )}

      <div className="cz-grid cz-grid-2">
        <section className="cz-card" aria-label="Territory">
          <h2 style={{ marginTop: 0, fontSize: 17 }}>{d.territory ? 'Territory' : 'Catchment area'}</h2>
          {d.territory ? <DescriptionList items={[['Territory', d.territory.name], ['Level', d.territory.level], ['District', `${d.territory.district}, ${d.territory.state}`], ['PIN codes', d.territory.pincodes.join(', ') || 'Whole district'], ['Exclusive', d.territory.exclusive ? 'Yes' : 'No'], ['Status', d.territory.status], ['Valid until', d.territory.expiresOn]]} />
            : <p style={{ fontSize: 14 }}>PIN {d.catchment?.pincode}. {d.catchment?.note}</p>}
        </section>
        <section className="cz-card" aria-label="LeadDNA">
          <h2 style={{ marginTop: 0, fontSize: 17 }}>LeadDNA</h2>
          <p style={{ fontSize: 14 }}>{ld.data?.message ?? '…'}</p>
          {ld.data?.entitled && <><p className="cz-muted" style={{ fontSize: 13 }}>Licence: {d.leadDna.source === 'package' ? 'included with your plan' : d.leadDna.source === 'addon' ? 'paid add-on' : 'granted by Unite'}{d.leadDna.validTo ? ` · valid until ${d.leadDna.validTo}` : ''}</p>
            <Button variant="secondary" onClick={() => open.run()} loading={open.pending}>Open LeadDNA</Button>{open.error && <Alert tone="info">{open.error}</Alert>}</>}
          {!ld.data?.entitled && <ButtonLink href="/my/leads" variant="secondary">Register a lead in COLLABIZ</ButtonLink>}
        </section>
      </div>

      {u.status === 'live' && (
        <>
          <div className="cz-grid cz-grid-4">
            <Kpi label="Sales (excl. GST)" value={inr(d.sales.value)} hint={`${d.sales.orders} orders · ${d.sales.fromStock} from stock · ${d.sales.viaUnite} via Unite`} href="/unite-solar/sales" />
            <Kpi label="Awaiting customer acceptance" value={d.sales.awaitingAcceptance} href="/unite-solar/sales" />
            {d.inventory ? <Kpi label="Stock on hand" value={inr(d.inventory.value)} hint={`${d.inventory.units} units · ${d.inventory.lowStock} low`} href="/unite-solar/inventory" /> : <Kpi label="Stock" value="Fulfilled by Unite" hint="No inventory held" />}
            <Kpi label="Resale margin (own stock)" value={inr(d.sales.margin)} />
          </div>
          <section className="cz-card" aria-label="Earnings summary">
            <div className="cz-row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 17 }}>Earnings</h2><ButtonLink href="/unite-solar/earnings" size="sm" variant="secondary">Details</ButtonLink></div>
            <div className="cz-us-earn">{d.earnings.map((e) => <div key={e.stream}><span className="cz-muted" style={{ fontSize: 12.5 }}>{e.label}</span><strong>{inr(e.paid)}</strong><span style={{ fontSize: 12 }}>paid · {inr(e.approved)} approved · {inr(e.pending)} pending</span></div>)}</div>
            <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{DISCLAIMER}</p>
          </section>
        </>
      )}
      <section className="cz-card" aria-label="Plan">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Your plan</h2>
        <DescriptionList items={[['Plan', `${d.package.name} — ${lakhs(d.package.price)}`], ['Product commission', `up to ${pct(d.package.maxProductCommissionBps)}`], ...(d.package.districtProfitShareBps ? [['District profit share', pct(d.package.districtProfitShareBps)] as [string, string]] : []), ...(d.package.interFranchiseBps ? [['Inter-franchise', `${pct(d.package.interFranchiseBps)} of eligible pool`] as [string, string]] : []), ['Term', `${d.package.termYears} years${u.agreementEnds ? ` (until ${u.agreementEnds})` : ''}`], ['Demo materials', `${d.demo.held} held · ${d.demo.open} in progress`], ['Service requests', `${d.service.open} open of ${d.service.total}`]]} />
      </section>
    </div>
  );
}
