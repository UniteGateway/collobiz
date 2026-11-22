'use client';
import { useState } from 'react';
import { BannerHeader } from '@/components/Banner';
import { useParams } from 'next/navigation';
import { FRANCHISE_FORMAT_LABELS, FRANCHISE_STATUS_LABELS, INDIA_STATES, ORDER_NEXT, ORDER_STATUS_LABELS, STATEMENT_STATUS_LABELS } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, DescriptionList, Kpi, LoadingState, StatusBadge, TextInput } from '@collabiz/ui';
import { Bars, ORDER_TONE, STATEMENT_TONE, monthShort, rupees } from '@/components/Franchise';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav, inr, webUrl } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Unit { id: string; code: string; brand: string; franchisee: string; format: string; city: string; region: string; message: string; status: string; fee: number | null; royaltyBps: number | null; monthlyTarget: number | null; decisionNote: string | null; openedAt: string | null; createdAt: string; next: string[]; checklist: { key: string; label: string; doneAt: string | null }[]; reports: { month: string; sales: number; orders: number; royalty: number }[] }
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function FranchiseUnit() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Unit>(`/admin/franchise/${id}`);
  const [f, setF] = useState({ note: '', fee: '', royalty: '', target: '' });
  const act = useMutation(async (body: Record<string, unknown>, path = 'status') => { const r = await api.post(`/admin/franchise/${id}/${path}`, body); q.reload(); return r; });
  const dash = useQuery<Record<string, any>>(`/franchise/${id}/dashboard`);
  const reloadAll = () => { q.reload(); dash.reload(); };
  const [ag, setAg] = useState({ termYears: '5', territory: '', exclusive: false, startDate: new Date().toISOString().slice(0, 10), noticeDays: '90' });
  const draft = useMutation(async () => { const r = await api.request('POST', `/admin/franchise/${id}/agreement`, { termYears: Number(ag.termYears), territory: ag.territory, exclusive: ag.exclusive, startDate: ag.startDate, noticeDays: Number(ag.noticeDays) }, { idempotent: true }); reloadAll(); return r; });
  const ops = useMutation(async (path: string, body: Record<string, unknown> = {}) => { await api.request('POST', path, body, { idempotent: true }); reloadAll(); return true; });
  const [ref, setRef] = useState('');
  const u = q.data, dd = dash.data;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!u) return <LoadingState />;
  const toPaise = (v: string) => (v ? Math.round(Number(v) * 100) : undefined);
  const decide = (status: string) => act.run({ status, note: f.note || undefined, ...(status === 'approved' ? { fee: toPaise(f.fee), royaltyBps: f.royalty ? Math.round(Number(f.royalty) * 100) : undefined, monthlyTarget: toPaise(f.target) } : {}) });
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <BannerHeader title={`${u.brand} — ${u.city}`} breadcrumb="Franchise network" description={`${u.franchisee} · ${FRANCHISE_FORMAT_LABELS[u.format]} · ${u.code}`} actions={<StatusBadge status={u.status} label={FRANCHISE_STATUS_LABELS[u.status]} />} />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      <div className="cz-ws-cols">
        <div className="cz-ws">
          <Card title="Application">
            <DescriptionList items={[['Franchisee', u.franchisee], ['Where', `${u.city}, ${INDIA_STATES.find(([c]) => c === u.region)?.[1] ?? u.region}`], ['Applied', day(u.createdAt)], ['What they wrote', u.message],
              ['Fee', u.fee != null ? inr(u.fee) : 'Not set'], ['Royalty', u.royaltyBps != null ? `${u.royaltyBps / 100}% of sales` : 'Not set'], ['Monthly target', u.monthlyTarget != null ? inr(u.monthlyTarget) : 'Not set'], ['Opened', day(u.openedAt)], ...(u.decisionNote ? [['Last note', u.decisionNote] as [string, string]] : [])]} />
          </Card>
          {dd && ['live', 'suspended'].includes(u.status) && (
            <Card title="Performance" subtitle="Net of GST; dashed line is the monthly target">
              <div className="cz-fr-kpis" style={{ marginBottom: 12 }}>
                <Kpi label="Sales this month" value={rupees(dd.kpis.salesMtd)} hint={`${dd.kpis.ordersMtd} orders`} />
                <Kpi label="This FY" value={rupees(dd.kpis.salesYtd)} />
                <Kpi label="Last month vs target" value={dd.kpis.lastMonthTargetPct == null ? '—' : `${Math.round(dd.kpis.lastMonthTargetPct * 100)}%`} />
                <Kpi label="Royalty outstanding" value={rupees(dd.kpis.royaltyOutstanding)} hint={dd.kpis.royaltyOverdue ? `${rupees(dd.kpis.royaltyOverdue)} overdue` : undefined} />
              </div>
              <Bars label="Monthly sales" data={dd.series.map((s: Record<string, any>) => ({ key: s.month, label: monthShort(s.month), value: s.sales, target: s.target, muted: !s.closed }))} />
            </Card>
          )}
          {dd && dd.statements.length > 0 && (
            <Card title="Royalty statements" subtitle="Invoice when a month is closed; record payment when it reaches the bank">
              {ops.error && <Alert tone="danger">{ops.error}</Alert>}
              <TextInput label="Payment reference (UTR) for recording a payment" value={ref} onChange={(e) => setRef(e.target.value)} />
              <ul className="cz-ws-list" style={{ marginTop: 8 }}>{dd.statements.map((s: Record<string, any>) => (
                <li key={s.id} data-statement={s.month}><span>{monthShort(s.month)} · net {rupees(s.netSales)} · royalty {rupees(s.royalty)} + GST = <strong>{rupees(s.total)}</strong>{s.invoiceNumber ? ` · ${s.invoiceNumber}` : ''}{s.disputeReason ? <><br /><span className="cz-muted" style={{ fontSize: 12 }}>Disputed: {s.disputeReason}</span></> : null}</span>
                  <StatusBadge status={s.status} tone={STATEMENT_TONE[s.status]} label={STATEMENT_STATUS_LABELS[s.status]} />
                  {s.status === 'due' && s.total > 0 && <Button size="sm" onClick={() => ops.run(`/admin/franchise/statements/${s.id}/invoice`)}>Invoice</Button>}
                  {s.status === 'invoiced' && <Button size="sm" variant="secondary" disabled={ref.length < 4} onClick={() => ops.run(`/admin/franchise/statements/${s.id}/paid`, { paymentReference: ref })}>Record payment</Button>}</li>
              ))}</ul>
            </Card>
          )}
          {dd && dd.orders.length > 0 && (
            <Card title="Orders" subtitle="Purchase orders are confirmed and dispatched by the brand; customer sales are the franchisee’s">
              <ul className="cz-ws-list">{dd.orders.slice(0, 40).map((o: Record<string, any>) => {
                const next = (ORDER_NEXT[o.kind as 'sale' | 'purchase'][o.status] ?? []).filter((x) => x.by === 'brand');
                return (
                  <li key={o.id} data-order={o.number}><span><strong>{o.number}</strong> · {o.kind === 'sale' ? o.customerName : 'Purchase'} · {o.orderDate}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{rupees(o.total)} incl. GST · {o.lines.map((l: Record<string, any>) => l.item).join(', ').slice(0, 70)}</span></span>
                    <StatusBadge status={o.status} tone={ORDER_TONE[o.status]} label={ORDER_STATUS_LABELS[o.status]} />
                    {[...new Set(next.map((x) => x.to))].map((to) => <Button key={to} size="sm" variant={to === 'cancelled' ? 'ghost' : 'secondary'} onClick={() => ops.run(`/franchise/${id}/orders/${o.id}/status`, { status: to })}>{to === 'cancelled' ? 'Cancel' : ORDER_STATUS_LABELS[to]}</Button>)}</li>
                );
              })}</ul>
            </Card>
          )}
          <Card title="Monthly sales">
            {!u.reports.length ? <p className="cz-muted" style={{ margin: 0 }}>No sales reported yet.</p> : (
              <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Monthly sales</caption>
                <thead><tr><th scope="col">Month</th><th scope="col" style={{ textAlign: 'right' }}>Sales</th><th scope="col" style={{ textAlign: 'right' }}>Orders</th><th scope="col" style={{ textAlign: 'right' }}>Royalty</th></tr></thead>
                <tbody>{u.reports.map((r) => <tr key={r.month}><td>{r.month}</td><td style={{ textAlign: 'right' }}>{inr(r.sales)}</td><td style={{ textAlign: 'right' }}>{r.orders}</td><td style={{ textAlign: 'right' }}>{inr(r.royalty)}</td></tr>)}</tbody>
              </table></div>
            )}
          </Card>
        </div>
        <aside className="cz-ws-side">
          {dd && (u.status === 'approved' || dd.agreement) && (
            <Card title="Franchise agreement">
              {draft.error && <Alert tone="danger">{draft.error}</Alert>}
              {dd.agreement ? (
                <div className="cz-stack" style={{ gap: 8 }}>
                  <p style={{ margin: 0 }}><strong>{dd.agreement.code}</strong> · {dd.agreement.status === 'executed' ? 'signed by both' : dd.agreement.status.replace(/_/g, ' ')}</p>
                  <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>{dd.unit.termYears} years to {dd.unit.agreementEnds} · {dd.unit.territory} ({dd.unit.exclusive ? 'exclusive' : 'non-exclusive'})</p>
                  <a className="cz-btn cz-btn-secondary cz-btn-sm" href={webUrl(`/vault?contract=${dd.agreement.id}`)}>Open in Contracts</a>
                  {dd.agreement.status !== 'executed' && <p className="cz-muted" style={{ margin: 0, fontSize: 12.5 }}>Submit for review, have a second approver approve it, then both parties sign. The unit moves to “Agreement signed” automatically.</p>}
                </div>
              ) : (
                <form className="cz-stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); draft.run(); }} noValidate>
                  <TextInput label="Territory" value={ag.territory} onChange={(e) => setAg({ ...ag, territory: e.target.value })} hint="e.g. Pune city and Pimpri-Chinchwad" />
                  <Checkbox label="Exclusive territory" checked={ag.exclusive} onChange={(e) => setAg({ ...ag, exclusive: e.target.checked })} />
                  <TextInput label="Term (years)" inputMode="numeric" value={ag.termYears} onChange={(e) => setAg({ ...ag, termYears: e.target.value.replace(/\D/g, '') })} />
                  <TextInput label="Start date" type="date" value={ag.startDate} onChange={(e) => setAg({ ...ag, startDate: e.target.value })} />
                  <TextInput label="Notice period (days)" inputMode="numeric" value={ag.noticeDays} onChange={(e) => setAg({ ...ag, noticeDays: e.target.value.replace(/\D/g, '') })} />
                  <Button type="submit" loading={draft.pending} disabled={ag.territory.length < 3}>Draft agreement</Button>
                  <p className="cz-muted" style={{ margin: 0, fontSize: 12.5 }}>Uses the agreed fee and royalty. The template is a draft for counsel (legal review pack Q25).</p>
                </form>
              )}
            </Card>
          )}
          {u.next.length > 0 && (
            <Card title="Next step">
              <div className="cz-stack" style={{ gap: 10 }}>
                {u.next.includes('approved') && (
                  <>
                    <TextInput label="Franchise fee (₹)" inputMode="numeric" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value.replace(/[^\d.]/g, '') })} />
                    <TextInput label="Royalty (% of sales)" inputMode="decimal" value={f.royalty} onChange={(e) => setF({ ...f, royalty: e.target.value.replace(/[^\d.]/g, '') })} error={act.fieldErrors.royaltyBps} />
                    <TextInput label="Monthly sales target (₹, optional)" inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.replace(/[^\d.]/g, '') })} />
                  </>
                )}
                <TextInput label="Note to the franchisee (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                <div className="cz-row" style={{ gap: 8 }}>{u.next.map((s) => <Button key={s} size="sm" variant={['rejected', 'closed', 'suspended'].includes(s) ? 'secondary' : 'primary'} loading={act.pending} onClick={() => decide(s)}>{s === 'approved' ? 'Approve' : s === 'rejected' ? 'Decline' : s === 'live' ? 'Go live' : FRANCHISE_STATUS_LABELS[s]}</Button>)}</div>
              </div>
            </Card>
          )}
          {!['applied', 'rejected', 'closed'].includes(u.status) && (
            <Card title="Set-up checklist">
              <ul className="cz-ws-list">{u.checklist.map((c) => (
                <li key={c.key}><span>{c.label}{c.doneAt ? <><br /><span className="cz-muted" style={{ fontSize: 12 }}>Done {day(c.doneAt)}</span></> : null}</span>
                  <button type="button" role="switch" aria-checked={!!c.doneAt} aria-label={c.label} className="cz-switch" data-on={c.doneAt ? true : undefined} onClick={() => act.run({ key: c.key, done: !c.doneAt }, 'checklist')}><span /></button></li>
              ))}</ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
