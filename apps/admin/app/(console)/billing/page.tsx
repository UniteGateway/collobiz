'use client';
import { useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, PageHeader, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Plan { code: string; name: string; description: string; priceMonthly: number | null; priceYearly: number | null; limits: Record<string, number | null>; features: string[]; status: string; priced: boolean }
interface A { plans: Plan[]; requests: { orgId: string; organization: string; current: string; requested: string; cycle: string; at: string }[]; paid: { orgId: string; organization: string; plan: string; cycle: string; periodEnd: string; paymentReference: string }[]; canEditPlans: boolean }
const rupees = (p: number | null) => (p == null ? 'Not set' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
const LIMITS: [string, string][] = [['leadsPerMonth', 'Leads / month'], ['teamMembers', 'Team members'], ['gstDocsPerMonth', 'GST documents / month'], ['importsPerMonth', 'Imports / month']];

/** Plans & billing — Unite sets prices and limits, publishes plans, and activates upgrades when a bank payment arrives. */
export default function Billing() {
  const q = useQuery<A>('/admin/billing');
  const [edit, setEdit] = useState<Plan | null>(null);
  const [act, setAct] = useState<A['requests'][number] | null>(null);
  const publish = useMutation(async (code: string) => { await api.post(`/admin/billing/plans/${code}/publish`); q.reload(); return true; });
  const d = q.data;
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Plans & billing" breadcrumb="Finance" description="COLLABIZ’s own plans. Prices are decided by Unite — a plan is offered only after a super admin sets its price and publishes it. Payments arrive by bank transfer until a payment gateway is connected." />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          {publish.error && <Alert tone="danger">{publish.error}</Alert>}
          <Card title="Plans">
            <ul className="cz-ws-list">{d.plans.map((p) => (
              <li key={p.code} data-plan={p.code} style={{ alignItems: 'flex-start' }}>
                <span><strong>{p.name}</strong> · {rupees(p.priceMonthly)} / month · {rupees(p.priceYearly)} / year<br /><span className="cz-muted" style={{ fontSize: 13 }}>{LIMITS.map(([k, l]) => `${l}: ${p.limits[k] == null ? 'unlimited' : p.limits[k]}`).join(' · ')}</span></span>
                <span className="cz-row" style={{ gap: 8 }}><StatusBadge status={p.status} tone={p.status === 'published' ? 'success' : 'neutral'} label={p.status === 'published' ? 'Offered' : 'Draft'} />
                  {d.canEditPlans && <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>Edit</Button>}
                  {d.canEditPlans && p.status === 'draft' && <Button size="sm" disabled={!p.priced} onClick={() => publish.run(p.code)}>Publish</Button>}</span>
              </li>
            ))}</ul>
          </Card>
          <Card title="Upgrade requests">{!d.requests.length ? <EmptyState icon="earnings" title="No requests waiting" /> : (
            <ul className="cz-ws-list">{d.requests.map((r) => (
              <li key={r.orgId} data-request={r.organization}><span><strong>{r.organization}</strong> · {r.current} → <strong>{r.requested}</strong> ({r.cycle})<br /><span className="cz-muted" style={{ fontSize: 13 }}>Requested {new Date(r.at).toLocaleDateString('en-IN')} — send Unite’s invoice, then activate when paid</span></span>
                <Button size="sm" onClick={() => setAct(r)}>Record payment and activate</Button></li>
            ))}</ul>
          )}</Card>
          <Card title="Paid companies">{!d.paid.length ? <EmptyState icon="building" title="No paid plans yet" /> : (
            <ul className="cz-ws-list">{d.paid.map((p) => <li key={p.orgId}><span><strong>{p.organization}</strong> · {p.plan} ({p.cycle})<br /><span className="cz-muted" style={{ fontSize: 13 }}>Paid until {new Date(p.periodEnd).toLocaleDateString('en-IN')} · ref {p.paymentReference}</span></span></li>)}</ul>
          )}</Card>
          <EditPlan plan={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); q.reload(); }} />
          <Activate r={act} onClose={() => setAct(null)} onDone={() => { setAct(null); q.reload(); }} />
        </>
      )}
    </div>
  );
}

function EditPlan({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [key, setKey] = useState('');
  if (plan && key !== plan.code) {
    setKey(plan.code);
    setF({ name: plan.name, description: plan.description, priceMonthly: plan.priceMonthly == null ? '' : String(plan.priceMonthly / 100), priceYearly: plan.priceYearly == null ? '' : String(plan.priceYearly / 100), features: plan.features.join('\n'),
      ...Object.fromEntries(LIMITS.map(([k]) => [k, plan.limits[k] == null ? '' : String(plan.limits[k])])) });
  }
  const num = (v: string) => (v.trim() === '' ? null : Math.round(Number(v)));
  const save = useMutation(async () => {
    await api.put(`/admin/billing/plans/${plan!.code}`, { name: f.name, description: f.description, priceMonthly: f.priceMonthly === '' ? null : Math.round(Number(f.priceMonthly) * 100), priceYearly: f.priceYearly === '' ? null : Math.round(Number(f.priceYearly) * 100),
      limits: Object.fromEntries(LIMITS.map(([k]) => [k, num(f[k] ?? '')])), features: (f.features ?? '').split('\n').map((x) => x.trim()).filter(Boolean) });
    onDone(); return true;
  });
  return (
    <Dialog open={!!plan} onClose={onClose} title={plan ? `Edit ${plan.name}` : 'Edit plan'}>
      <div className="cz-stack" style={{ gap: 4 }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Name" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextInput label="Description" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="cz-grid cz-grid-2">
          <TextInput label="Price per month (₹, excl. GST)" inputMode="numeric" value={f.priceMonthly ?? ''} onChange={(e) => setF({ ...f, priceMonthly: e.target.value.replace(/[^\d]/g, '') })} hint="Leave blank until decided" />
          <TextInput label="Price per year (₹, excl. GST)" inputMode="numeric" value={f.priceYearly ?? ''} onChange={(e) => setF({ ...f, priceYearly: e.target.value.replace(/[^\d]/g, '') })} />
          {LIMITS.map(([k, l]) => <TextInput key={k} label={l} inputMode="numeric" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/[^\d]/g, '') })} hint="Blank = unlimited" />)}
        </div>
        <TextArea label="Features (one per line)" rows={4} value={f.features ?? ''} onChange={(e) => setF({ ...f, features: e.target.value })} />
        <div><Button onClick={() => save.run()} loading={save.pending}>Save</Button></div>
      </div>
    </Dialog>
  );
}

function Activate({ r, onClose, onDone }: { r: A['requests'][number] | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ paymentReference: '', periodEnd: '' });
  const go = useMutation(async () => { await api.post(`/admin/billing/requests/${r!.orgId}/activate`, f); setF({ paymentReference: '', periodEnd: '' }); onDone(); return true; });
  return (
    <Dialog open={!!r} onClose={onClose} title={r ? `Activate ${r.requested} for ${r.organization}` : 'Activate'}>
      <div className="cz-stack" style={{ gap: 4 }}>
        {go.error && <Alert tone="danger">{go.error}</Alert>}
        <TextInput label="Bank / UTR reference of the payment" value={f.paymentReference} onChange={(e) => setF({ ...f, paymentReference: e.target.value })} />
        <TextInput label="Paid until" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
        <div><Button onClick={() => go.run()} loading={go.pending} disabled={f.paymentReference.length < 4 || !f.periodEnd}>Activate plan</Button></div>
      </div>
    </Dialog>
  );
}
