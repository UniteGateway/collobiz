'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FRANCHISE_FORMAT_LABELS, FRANCHISE_STATUS_LABELS, ORDER_NEXT, ORDER_STATUS_LABELS, STATEMENT_STATUS_LABELS, orderTotals } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, EmptyState, Kpi, LoadingState, Segmented, Select, StatusBadge, Stepper, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { Bars, ORDER_TONE, STATEMENT_TONE, UNIT_TONE, monthShort, rupees } from '@/components/Franchise';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const LIFECYCLE = ['applied', 'approved', 'agreement_signed', 'setup', 'live'];
const send = (p: string, b: unknown = {}) => api.request('POST', p, b, { idempotent: true });

/** Franchise dashboard for one unit: status, sales against target, orders, revenue and royalty, and the agreement. */
export default function FranchiseUnit() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<R>(`/franchise/${id}/dashboard`);
  const [tab, setTab] = useState('overview');
  const d = q.data, u = d?.unit;
  return (
    <Screen page={{ key: 'franchise-unit', title: u ? `${u.brand} — ${u.city}` : 'Franchise', access: 'partner' }} eyebrow="Franchise"
      description={u ? `${u.code} · ${FRANCHISE_FORMAT_LABELS[u.format]}${u.territory ? ` · ${u.territory}` : ''}` : undefined}
      actions={u ? <StatusBadge status={u.status} tone={UNIT_TONE[u.status]} label={FRANCHISE_STATUS_LABELS[u.status]} /> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          {['suspended', 'rejected', 'closed'].includes(u.status) ? <Alert tone="warning">This franchise is {FRANCHISE_STATUS_LABELS[u.status].toLowerCase()}.</Alert> : <Stepper steps={['Applied', 'Approved', 'Agreement signed', 'Setting up', 'Live']} current={Math.max(0, LIFECYCLE.indexOf(u.status))} />}
          {d.flags.length > 0 && <div className="cz-fr-flags">{d.flags.map((f: R) => <StatusBadge key={f.key} status={f.key} tone={f.tone === 'danger' ? 'danger' : f.tone === 'warning' ? 'warning' : 'info'} label={f.label} />)}</div>}
          <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'orders', label: `Orders (${d.orders.length})` }, { value: 'revenue', label: 'Revenue & royalty' }, { value: 'agreement', label: 'Agreement & set-up' }]} />
          {tab === 'overview' && <Overview d={d} />}
          {tab === 'orders' && <Orders d={d} id={id} reload={q.reload} />}
          {tab === 'revenue' && <Revenue d={d} id={id} reload={q.reload} />}
          {tab === 'agreement' && <AgreementTab d={d} />}
        </div>
      )}
    </Screen>
  );
}

function Overview({ d }: { d: R }) {
  const k = d.kpis, u = d.unit;
  return (
    <>
      <div className="cz-fr-kpis">
        <Kpi label="Sales this month" value={rupees(k.salesMtd)} hint={`${k.ordersMtd} order${k.ordersMtd === 1 ? '' : 's'}, net of GST`} accent />
        <Kpi label="Sales this financial year" value={rupees(k.salesYtd)} hint="from April" />
        <Kpi label="Last month vs target" value={k.lastMonthTargetPct == null ? rupees(k.lastMonthSales) : `${Math.round(k.lastMonthTargetPct * 100)}%`} hint={u.monthlyTarget ? `${rupees(k.lastMonthSales)} of ${rupees(u.monthlyTarget)}` : 'no target set'} />
        <Kpi label="Average order" value={rupees(k.avgOrderValue)} hint="delivered and paid" />
        <Kpi label="To collect from customers" value={rupees(k.receivables)} hint={`${k.openSaleOrders} order${k.openSaleOrders === 1 ? '' : 's'} still to deliver`} />
        <Kpi label="Royalty outstanding" value={rupees(k.royaltyOutstanding)} hint={k.royaltyOverdue ? `${rupees(k.royaltyOverdue)} overdue` : `paid this FY ${rupees(k.royaltyPaidYtd)}`} />
        <Kpi label="Stock bought this FY" value={rupees(k.purchasesYtd)} hint={`${k.openPurchaseOrders} purchase order${k.openPurchaseOrders === 1 ? '' : 's'} open`} />
        <Kpi label="Set-up checklist" value={`${d.checklistDone}/${d.checklistTotal}`} hint={u.openedAt ? `opened ${new Date(u.openedAt).toLocaleDateString('en-IN')}` : 'not yet open'} />
      </div>
      <Card title="Monthly sales" subtitle="Net of GST. Grey bars are months not yet closed; dashed green line is the monthly target.">
        <Bars label="Monthly sales" data={d.series.map((s: R) => ({ key: s.month, label: monthShort(s.month), value: s.sales, target: s.target, muted: !s.closed }))} />
      </Card>
      <ul className="cz-muted" style={{ fontSize: 12.5, margin: 0, paddingLeft: 18 }}>{d.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>
    </>
  );
}

function Orders({ d, id, reload }: { d: R; id: string; reload: () => void }) {
  const isUnit = d.side === 'franchisee';
  const [kind, setKind] = useState<'sale' | 'purchase'>(d.unit.status === 'live' ? 'sale' : 'purchase');
  const [show, setShow] = useState('all');
  const [f, setF] = useState({ customerName: '', orderDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [lines, setLines] = useState([{ item: '', qty: '1', unitPrice: '', gstBps: '1200' }]);
  const parsed = lines.filter((l) => l.item && l.unitPrice).map((l) => ({ item: l.item, qty: Number(l.qty), unitPrice: Math.round(Number(l.unitPrice) * 100), gstBps: Number(l.gstBps) }));
  const t = orderTotals(parsed);
  const create = useMutation(async () => { const r = await send(`/franchise/${id}/orders`, { kind, ...f, customerName: kind === 'sale' ? f.customerName : undefined, notes: f.notes || undefined, lines: parsed }); setLines([{ item: '', qty: '1', unitPrice: '', gstBps: '1200' }]); setF({ ...f, customerName: '', notes: '' }); reload(); return r; });
  const move = useMutation(async (oid: string, status: string) => { await send(`/franchise/${id}/orders/${oid}/status`, { status }); reload(); return true; });
  const list = d.orders.filter((o: R) => show === 'all' || o.kind === show);
  const canCreate = isUnit && (kind === 'sale' ? d.unit.status === 'live' : ['setup', 'live'].includes(d.unit.status));
  return (
    <>
      {isUnit && (
        <Card title="New order">
          <form className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); create.run(); }} noValidate>
            {create.error && <Alert tone="danger">{create.error}</Alert>}
            <Segmented label="Order type" value={kind} onChange={(v) => setKind(v as 'sale' | 'purchase')} options={[{ value: 'sale', label: 'Customer sale' }, { value: 'purchase', label: 'Stock from the brand' }]} />
            {!canCreate && <Alert tone="info">{kind === 'sale' ? 'Customer sales are recorded once the franchise is live.' : 'Stock can be ordered from set-up onwards.'}</Alert>}
            <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
              {kind === 'sale' && <TextInput label="Customer" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} error={create.fieldErrors.customerName} />}
              <TextInput label="Order date" type="date" value={f.orderDate} onChange={(e) => setF({ ...f, orderDate: e.target.value })} />
            </div>
            {lines.map((l, i) => (
              <div key={i} className="cz-fr-lines">
                <TextInput label={i === 0 ? 'Item' : `Item ${i + 1}`} value={l.item} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
                <TextInput label="Qty" inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
                <TextInput label="Unit price (₹)" inputMode="decimal" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
                <Select label="GST" value={l.gstBps} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, gstBps: e.target.value } : x)))} options={[0, 500, 1200, 1800, 2800].map((g) => ({ value: String(g), label: `${g / 100}%` }))} />
                {lines.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>Remove</Button> : <span />}
              </div>
            ))}
            <div className="cz-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Button type="button" size="sm" variant="secondary" onClick={() => setLines([...lines, { item: '', qty: '1', unitPrice: '', gstBps: '1200' }])}>Add line</Button>
              <span style={{ fontSize: 14 }}>Net {rupees(t.subtotal)} + GST {rupees(t.gst)} = <strong>{rupees(t.total)}</strong></span>
            </div>
            <div><Button type="submit" loading={create.pending} disabled={!canCreate || !parsed.length}>{kind === 'sale' ? 'Record sale' : 'Place purchase order'}</Button></div>
          </form>
        </Card>
      )}
      <Card title="Orders" actions={<Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'sale', label: 'Sales' }, { value: 'purchase', label: 'Purchases' }]} />}>
        {move.error && <Alert tone="danger">{move.error}</Alert>}
        {!list.length ? <EmptyState icon="package" title="No orders yet" /> : (
          <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Orders</caption>
            <thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Customer / supplier</th><th scope="col" style={{ textAlign: 'right' }}>Net</th><th scope="col" style={{ textAlign: 'right' }}>Total</th><th scope="col">Status</th><th scope="col"><span className="cz-sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map((o: R) => {
              const next = (ORDER_NEXT[o.kind as 'sale' | 'purchase'][o.status] ?? []).filter((x) => x.by === (isUnit ? 'unit' : 'brand'));
              return (
                <tr key={o.id} data-order={o.number}>
                  <td><strong>{o.number}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{o.kind === 'sale' ? 'Sale' : 'Purchase'} · {o.lines.map((l: R) => l.item).join(', ').slice(0, 60)}</span></td>
                  <td>{o.orderDate}</td><td>{o.kind === 'sale' ? o.customerName : d.unit.brand}</td>
                  <td style={{ textAlign: 'right' }}>{rupees(o.subtotal)}</td><td style={{ textAlign: 'right' }}>{rupees(o.total)}</td>
                  <td><StatusBadge status={o.status} tone={ORDER_TONE[o.status]} label={ORDER_STATUS_LABELS[o.status]} /></td>
                  <td><div className="cz-row" style={{ gap: 4 }}>{[...new Set(next.map((x) => x.to))].map((to) => <Button key={to} size="sm" variant={to === 'cancelled' ? 'ghost' : 'secondary'} onClick={() => move.run(o.id, to)}>{to === 'cancelled' ? 'Cancel' : `Mark ${ORDER_STATUS_LABELS[to].toLowerCase()}`}</Button>)}</div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}

function Revenue({ d, id, reload }: { d: R; id: string; reload: () => void }) {
  const isUnit = d.side === 'franchisee';
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
  const [m, setM] = useState(prev.toISOString().slice(0, 7));
  const close = useMutation(async () => { const r = await send(`/franchise/${id}/close-month`, { month: m }); reload(); return r; });
  const [dispute, setDispute] = useState<{ id: string; reason: string } | null>(null);
  const disp = useMutation(async () => { await send(`/franchise/statements/${dispute!.id}/dispute`, { reason: dispute!.reason }); setDispute(null); reload(); return true; });
  return (
    <>
      {isUnit && ['live', 'suspended'].includes(d.unit.status) && (
        <Card title="Close a month" subtitle="Totals delivered and paid customer orders (net of GST) and creates the royalty statement. Settle or cancel confirmed orders first.">
          <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); close.run(); }} noValidate>
            <TextInput label="Month" type="month" value={m} max={prev.toISOString().slice(0, 7)} onChange={(e) => setM(e.target.value)} />
            <Button type="submit" loading={close.pending}>Close month</Button>
          </form>
          {close.error && <Alert tone="danger">{close.error}</Alert>}
          {close.data != null && <Alert tone="success">Closed. Royalty statement created.</Alert>}
        </Card>
      )}
      <Card title="Royalty statements" subtitle={`Royalty ${(d.unit.royaltyBps ?? 0) / 100}% of net sales + GST on royalty (18% — confirm with your CA). TDS is deducted by you when paying.`}>
        {disp.error && <Alert tone="danger">{disp.error}</Alert>}
        {!d.statements.length ? <EmptyState icon="earnings" title="No statements yet">Statements appear when a month is closed.</EmptyState> : (
          <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Royalty statements</caption>
            <thead><tr><th scope="col">Month</th><th scope="col" style={{ textAlign: 'right' }}>Net sales</th><th scope="col" style={{ textAlign: 'right' }}>Orders</th><th scope="col" style={{ textAlign: 'right' }}>Royalty</th><th scope="col" style={{ textAlign: 'right' }}>GST</th><th scope="col" style={{ textAlign: 'right' }}>Total</th><th scope="col">Status</th><th scope="col"><span className="cz-sr-only">Actions</span></th></tr></thead>
            <tbody>{d.statements.map((s: R) => (
              <tr key={s.id} data-statement={s.month}>
                <td>{monthShort(s.month)}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{s.source === 'orders' ? 'from orders' : 'reported total'}{s.invoiceNumber ? ` · ${s.invoiceNumber}` : ''}</span></td>
                <td style={{ textAlign: 'right' }}>{rupees(s.netSales)}</td><td style={{ textAlign: 'right' }}>{s.orders}</td><td style={{ textAlign: 'right' }}>{rupees(s.royalty)}</td><td style={{ textAlign: 'right' }}>{rupees(s.gst)}</td><td style={{ textAlign: 'right' }}><strong>{rupees(s.total)}</strong></td>
                <td><StatusBadge status={s.status} tone={STATEMENT_TONE[s.status]} label={STATEMENT_STATUS_LABELS[s.status]} />{s.dueDate && s.status === 'invoiced' && <><br /><span className="cz-muted" style={{ fontSize: 12 }}>due {s.dueDate}</span></>}{s.disputeReason && <><br /><span className="cz-muted" style={{ fontSize: 12 }}>{s.disputeReason}</span></>}</td>
                <td>{isUnit && ['due', 'invoiced'].includes(s.status) && <Button size="sm" variant="ghost" onClick={() => setDispute({ id: s.id, reason: '' })}>Dispute</Button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {dispute && (
          <form className="cz-row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); disp.run(); }}>
            <div style={{ flex: 1 }}><TextInput label="Why do you dispute this statement?" value={dispute.reason} onChange={(e) => setDispute({ ...dispute, reason: e.target.value })} /></div>
            <Button type="submit" loading={disp.pending} disabled={dispute.reason.length < 10}>Send</Button><Button type="button" variant="ghost" onClick={() => setDispute(null)}>Cancel</Button>
          </form>
        )}
      </Card>
    </>
  );
}

function AgreementTab({ d }: { d: R }) {
  const u = d.unit, a = d.agreement;
  return (
    <div className="cz-grid cz-grid-2">
      <Card title="Franchise agreement">
        {!a ? <p className="cz-muted" style={{ margin: 0 }}>Unite prepares the agreement after approving your application. You will review and sign it in Documents.</p> : (
          <div className="cz-stack" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}><strong>{a.code}</strong> · <StatusBadge status={a.status} tone={a.status === 'executed' ? 'success' : 'warning'} label={a.status === 'executed' ? 'Signed by both' : a.status === 'approved' || a.status === 'partially_signed' ? 'Ready to sign' : 'Being prepared by Unite'} /></p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li>Term {u.termYears} years: {u.agreementStarts} to {u.agreementEnds}</li>
              <li>Territory: {u.territory} ({u.exclusive ? 'exclusive' : 'non-exclusive'})</li>
              <li>Fee {rupees(u.fee)} + GST · royalty {(u.royaltyBps ?? 0) / 100}% of net monthly sales</li>
            </ul>
            <ButtonLink href={`/vault?contract=${a.id}`}>{a.status === 'executed' ? 'View agreement' : 'Review and sign'}</ButtonLink>
            <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>The text is a draft template under legal review until Unite’s counsel approves it.</p>
          </div>
        )}
      </Card>
      <Card title="Set-up checklist" subtitle="Unite ticks each step; the franchise goes live when all are done.">
        <ul className="cz-check-list" style={{ margin: 0 }}>{u.checklist.map((c: R) => <li key={c.key} style={{ color: c.doneAt ? undefined : 'var(--cz-grey-600)' }}>{c.doneAt ? '✓' : '○'} {c.label}{c.doneAt ? <span className="cz-muted" style={{ fontSize: 12 }}> · {new Date(c.doneAt).toLocaleDateString('en-IN')}</span> : null}</li>)}</ul>
      </Card>
      <p className="cz-muted" style={{ fontSize: 13 }}><Link href="/franchise">← All my franchises</Link></p>
    </div>
  );
}
