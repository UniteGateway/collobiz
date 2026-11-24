'use client';
import { useMemo, useState } from 'react';
import { PT_BENEFIT_SOURCES, PT_BENEFIT_STATUS, commercialBenefit, type PtBenefitSource, type PtBenefitStatus } from '@collabiz/types';
import { Alert, Button, Checkbox, EmptyState, Select, Skeleton, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtHeader, PtNav, Widget, rupees, toPaise } from '@/components/Powertrade';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Benefit { id: string; source: PtBenefitSource; description: string; grossPaise: number; netPaise: number; status: PtBenefitStatus; collectedPaise: number; allocatedPaise: number; sample: boolean; createdAt: string }
interface Alloc { id: string; benefitId: string; period: string; amountPaise: number; status: string }
interface Summary { period: string; savings: { verified: number; reported: number }; sales: { purchaseOrdersPaise: number; note: string }; benefits: { anticipated: number; earned: number; verified: number; collected: number }; allocations: { requested: number; approved: number };
  powerExpense: { expensePaise: number | null; basis: string | null; approvedSupportPaise: number; netEconomicExpensePaise: number | null } }
const month = () => new Date().toISOString().slice(0, 7);

/** Energy & Business Finance: savings, the benefit ledger, allocations and the commercial-benefit calculator. */
export default function PtFinance() {
  const [period, setPeriod] = useState(month());
  const s = useQuery<Summary>('/powertrade/finance/summary', { period });
  const b = useQuery<{ items: Benefit[]; allocations: Alloc[] }>('/powertrade/benefits');
  const reload = () => { s.reload(); b.reload(); };
  return (
    <Screen page={{ key: 'powertrade-finance', title: 'Energy & Business Finance', access: 'partner' }} header={false}>
      <PtHeader title="Energy & Business Finance" lead="Savings, sales, earned benefits and cash are kept apart. A benefit supports your power expense only once it is verified, collected and approved." />
      <PtNav />
      {s.error ? <ApiErrorView error={s.error} onRetry={s.reload} /> : !s.data ? <Skeleton height={140} /> : (
        <>
          <div className="cz-row" style={{ gap: 8, alignItems: 'end' }}><TextInput label="Month" type="month" value={period} onChange={(e) => setPeriod(e.target.value || month())} /></div>
          <div className="pt-widgets">
            <Widget icon="zap" tone="indigo" label={`Power expense · ${s.data.period}`} value={rupees(s.data.powerExpense.expensePaise)} hint={s.data.powerExpense.basis ?? 'No electricity profile'} />
            <Widget icon="sun" tone="green" label="Savings (verified, all months)" value={rupees(s.data.savings.verified)} hint={`${rupees(s.data.savings.reported)} reported`} />
            <Widget icon="coins" tone="amber" label="Approved support this month" value={rupees(s.data.powerExpense.approvedSupportPaise)} />
            <Widget icon="earnings" tone="blue" label="Net economic power expense" value={rupees(s.data.powerExpense.netEconomicExpensePaise)} hint="Expense minus approved support — the bill itself is paid in full" />
          </div>
        </>
      )}
      <div className="pt-grid" style={{ marginTop: 16 }}>
        <Ledger b={b.data} error={b.error} reload={reload} />
        <div className="cz-stack" style={{ gap: 16 }}><AddBenefit onDone={reload} /><Savings onDone={reload} /></div>
      </div>
      <Calculator />
    </Screen>
  );
}

function Ledger({ b, error, reload }: { b?: { items: Benefit[]; allocations: Alloc[] }; error: unknown; reload: () => void }) {
  const [req, setReq] = useState<{ id: string; amount: string; period: string } | null>(null);
  const m = useMutation(async () => { await api.post('/powertrade/allocations', { benefitId: req!.id, period: req!.period, amountPaise: toPaise(req!.amount) }); setReq(null); reload(); return true; });
  return (
    <section className="cz-card pt-span2"><h2 style={{ marginTop: 0 }}>Benefit ledger</h2>
      {error ? <ApiErrorView error={error} /> : !b ? <Skeleton height={120} /> : !b.items.length ? <EmptyState title="No benefits recorded">Record commissions, rebates, referral fees or distribution margins you have earned. Unite finance verifies them.</EmptyState> : (
        <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Benefits</caption>
          <thead><tr><th>Benefit</th><th>Net</th><th>Status</th><th>Collected</th><th>Allocated</th><th /></tr></thead>
          <tbody>{b.items.map((x) => (
            <tr key={x.id} data-benefit={x.description}>
              <td><strong>{x.description}</strong><br /><span className="cz-muted">{PT_BENEFIT_SOURCES[x.source]}{x.sample ? ' · Sample' : ''}</span></td>
              <td>{rupees(x.netPaise)}</td><td>{PT_BENEFIT_STATUS[x.status]}</td><td>{rupees(x.collectedPaise)}</td><td>{rupees(x.allocatedPaise)}</td>
              <td>{x.status === 'collected' && x.collectedPaise > x.allocatedPaise && <Button size="sm" variant="secondary" onClick={() => setReq({ id: x.id, amount: String((x.collectedPaise - x.allocatedPaise) / 100), period: month() })}>Use for power</Button>}</td>
            </tr>
          ))}</tbody></table></div>
      )}
      {req && <form className="cz-stack" style={{ gap: 10, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-allocate">
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <div className="cz-grid cz-grid-2"><TextInput label="Amount (₹)" inputMode="decimal" value={req.amount} onChange={(e) => setReq({ ...req, amount: e.target.value })} error={m.fieldErrors.amountPaise} /><TextInput label="Power expense month" type="month" value={req.period} onChange={(e) => setReq({ ...req, period: e.target.value })} /></div>
        <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={m.pending}>Request approval</Button><Button type="button" variant="ghost" onClick={() => setReq(null)}>Cancel</Button></div>
      </form>}
      {!!b?.allocations.length && <><h3>Allocations</h3><ul className="pt-scen">{b.allocations.map((a) => <li key={a.id}><span>{a.period}</span><strong>{rupees(a.amountPaise)} · {a.status}</strong></li>)}</ul></>}
    </section>
  );
}

function AddBenefit({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ source: 'commission' as PtBenefitSource, description: '', gross: '', costs: '', taxes: '', status: 'earned', evidence: '' });
  const m = useMutation(async () => { await api.post('/powertrade/benefits', { source: f.source, description: f.description, grossPaise: toPaise(f.gross), costsPaise: toPaise(f.costs), taxesPaise: toPaise(f.taxes), status: f.status, evidence: f.evidence }); setF({ ...f, description: '', gross: '', costs: '', taxes: '', evidence: '' }); onDone(); return true; });
  return (
    <form className="cz-card cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-benefit">
      <h2 style={{ margin: 0 }}>Record a benefit</h2>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <Select label="Source" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as PtBenefitSource })} options={Object.entries(PT_BENEFIT_SOURCES).map(([value, label]) => ({ value, label }))} />
      <TextInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={m.fieldErrors.description} />
      <div className="cz-grid cz-grid-3"><TextInput label="Gross (₹)" inputMode="decimal" value={f.gross} onChange={(e) => setF({ ...f, gross: e.target.value })} error={m.fieldErrors.grossPaise} /><TextInput label="Costs (₹)" inputMode="decimal" value={f.costs} onChange={(e) => setF({ ...f, costs: e.target.value })} error={m.fieldErrors.costsPaise} /><TextInput label="Taxes (₹)" inputMode="decimal" value={f.taxes} onChange={(e) => setF({ ...f, taxes: e.target.value })} /></div>
      <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[{ value: 'earned', label: 'Earned (the trigger has happened)' }, { value: 'anticipated', label: 'Anticipated (not earned yet)' }]} />
      <TextInput label="Evidence (invoice, agreement, ledger reference)" value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} />
      <div><Button type="submit" variant="secondary" loading={m.pending}>Record</Button></div>
    </form>
  );
}

function Savings({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ period: month(), baseline: '', actual: '', evidence: '' });
  const m = useMutation(async () => { await api.post('/powertrade/savings', { period: f.period, baselinePaise: toPaise(f.baseline), actualPaise: toPaise(f.actual), evidence: f.evidence }); onDone(); return true; });
  return (
    <form className="cz-card cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-saving">
      <h2 style={{ margin: 0 }}>Record a month’s power saving</h2>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <div className="cz-grid cz-grid-3"><TextInput label="Month" type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} /><TextInput label="Bill before (₹)" inputMode="decimal" value={f.baseline} onChange={(e) => setF({ ...f, baseline: e.target.value })} /><TextInput label="Bill now (₹)" inputMode="decimal" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} /></div>
      <TextInput label="Evidence (bill numbers)" value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} error={m.fieldErrors.evidence} />
      <div><Button type="submit" variant="secondary" loading={m.pending}>Record</Button></div>
    </form>
  );
}

/** Transparent what-if calculator (runs in the browser; nothing is saved). */
function Calculator() {
  const [f, setF] = useState({ bill: '1000000', newExp: '750000', verified: true, sales: '0', margin: '12', rebates: '0', commissions: '500000', costs: '0', taxes: '0', collected: '500000', approved: '500000' });
  const r = useMemo(() => commercialBenefit({ currentBillPaise: toPaise(f.bill), newPowerExpensePaise: toPaise(f.newExp), savingsVerified: f.verified, productSalesPaise: toPaise(f.sales), productGrossMarginPct: Number(f.margin) || 0,
    rebatesPaise: toPaise(f.rebates), commissionsPaise: toPaise(f.commissions), benefitCostsPaise: toPaise(f.costs), benefitTaxesPaise: toPaise(f.taxes), collectedPaise: toPaise(f.collected), approvedAllocationPaise: toPaise(f.approved) }), [f]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="cz-card" style={{ marginTop: 16 }} data-pt-calculator>
      <h2 style={{ marginTop: 0 }}>Commercial benefit calculator <span className="pt-tag">Illustrative</span></h2>
      <div className="pt-calc">
        <div className="cz-grid cz-grid-3">
          <TextInput label="Present power bill (₹/mo)" value={f.bill} onChange={set('bill')} /><TextInput label="New power expense (₹/mo)" value={f.newExp} onChange={set('newExp')} />
          <TextInput label="Product sales (₹)" value={f.sales} onChange={set('sales')} /><TextInput label="Gross margin (%)" value={f.margin} onChange={set('margin')} />
          <TextInput label="Rebates (₹)" value={f.rebates} onChange={set('rebates')} /><TextInput label="Commissions (₹)" value={f.commissions} onChange={set('commissions')} />
          <TextInput label="Costs of earning them (₹)" value={f.costs} onChange={set('costs')} /><TextInput label="Taxes (₹)" value={f.taxes} onChange={set('taxes')} />
          <TextInput label="Collected (₹)" value={f.collected} onChange={set('collected')} /><TextInput label="Approved for power (₹)" value={f.approved} onChange={set('approved')} />
        </div>
        <Checkbox label="Savings measured from actual bills" checked={f.verified} onChange={(e) => setF({ ...f, verified: e.target.checked })} />
        <ul className="pt-scen">
          <li><span>Energy savings ({r.savingsLabel})</span><strong>{rupees(r.energySavings)}</strong></li>
          <li><span>Gross business sales (turnover)</span><strong>{rupees(r.grossBusinessSales)}</strong></li>
          <li><span>Gross profit from supply</span><strong>{rupees(r.grossProfitFromSupply)}</strong></li>
          <li><span>Net commercial benefit</span><strong>{rupees(r.netCommercialBenefit)}</strong></li>
          <li><span>Available for power support</span><strong>{rupees(r.availableForPowerSupport)}</strong></li>
          <li><span>Waiting for collection</span><strong>{rupees(r.cashTimingGap)}</strong></li>
          <li className="pt-total"><span>Residual economic power expense</span><strong data-pt-residual>{rupees(r.residualEconomicPowerExpense)}</strong></li>
        </ul>
        <ul className="pt-findings">{r.notes.map((n) => <li key={n} data-sev="info">{n}</li>)}</ul>
      </div>
    </section>
  );
}
