'use client';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Plan { code: string; name: string; description: string; priceMonthly: number | null; priceYearly: number | null; yearlySavingPct: number | null; features: string[]; limits: Record<string, number | null> }
interface Usage { key: string; label: string; used: number; limit: number | null; pct: number | null; state: string }
interface B { subscription: { plan: string; planName: string; status: string; requestedPlan: string | null; requestedCycle: string | null; cycle: string | null; periodEnd: string | null }; usage: Usage[]; plans: Plan[]; comingSoon: { code: string; name: string; description: string }[]; canRequest: boolean; payments: { connected: boolean; note: string }; note: string }
const rupees = (p: number) => (p === 0 ? 'Free' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
const TONE: Record<string, string> = { ok: 'var(--cz-green-700)', near: 'var(--cz-warning)', over: 'var(--cz-danger)', unlimited: 'var(--cz-green-700)' };

/** Your COLLABIZ plan — what you use against your plan, the plans on offer, and how to upgrade (bank transfer for now). */
export default function PlanPage() {
  const q = useQuery<B>('/billing');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const req = useMutation(async (plan: string) => { const r = await api.post('/billing/request', { plan, cycle }); q.reload(); return r; });
  const b = q.data;
  return (
    <Screen page={{ key: 'plan', title: 'Plan', access: 'partner' }} description="Your COLLABIZ plan and what you have used this month.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !b ? <LoadingState /> : (
        <>
          <Card title={`Current plan: ${b.subscription.planName}`} actions={<StatusBadge status={b.subscription.status} tone={b.subscription.status === 'requested' ? 'warning' : 'success'} label={b.subscription.status === 'requested' ? `Upgrade to ${b.subscription.requestedPlan} requested` : 'Active'} />}>
            {b.subscription.periodEnd && <p style={{ margin: '0 0 10px', fontSize: 14 }}>Paid {b.subscription.cycle} until {new Date(b.subscription.periodEnd).toLocaleDateString('en-IN')}.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>{b.usage.map((u) => (
              <li key={u.key} data-usage={u.key}>
                <div className="cz-row" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>{u.label}</span><strong>{u.used}{u.limit == null ? ' · unlimited' : ` of ${u.limit}`}</strong></div>
                {u.limit != null && <div aria-hidden style={{ height: 6, borderRadius: 3, background: 'var(--cz-hairline)', marginTop: 4 }}><div style={{ height: 6, borderRadius: 3, width: `${Math.min(100, u.pct ?? 0)}%`, background: TONE[u.state] }} /></div>}
              </li>
            ))}</ul>
            <p className="cz-muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>{b.note}</p>
          </Card>
          {b.subscription.status === 'requested' && <Alert tone="info" title="Upgrade requested">Unite will send an invoice for the {b.subscription.requestedPlan} plan ({b.subscription.requestedCycle}). Pay by bank transfer; the plan starts when Unite records the payment. {b.payments.connected ? '' : 'Online payment is not available yet.'}</Alert>}
          {req.error && <Alert tone="danger">{req.error}</Alert>}
          <div className="cz-row" style={{ gap: 8 }} role="group" aria-label="Billing cycle">
            <Button size="sm" variant={cycle === 'monthly' ? 'primary' : 'secondary'} aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>Monthly</Button>
            <Button size="sm" variant={cycle === 'yearly' ? 'primary' : 'secondary'} aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>Yearly</Button>
          </div>
          <div className="cz-choice-grid">
            {b.plans.map((p) => {
              const price = cycle === 'yearly' ? p.priceYearly : p.priceMonthly;
              const current = p.code === b.subscription.plan;
              return (
                <div key={p.code} className="cz-card" data-plan={p.code} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <strong style={{ fontSize: 18 }}>{p.name}</strong>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{price == null ? '—' : rupees(price)}{price ? <small className="cz-muted" style={{ fontSize: 13, fontWeight: 400 }}> / {cycle === 'yearly' ? 'year' : 'month'} + GST</small> : null}</span>
                  {cycle === 'yearly' && p.yearlySavingPct && <span style={{ fontSize: 13, color: 'var(--cz-green-700)' }}>Save {p.yearlySavingPct}% with yearly</span>}
                  <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>{p.description}</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                  <div style={{ marginTop: 'auto' }}>{current ? <StatusBadge status="current" tone="success" label="Your plan" /> : b.canRequest && price != null && price > 0 ? <Button size="sm" onClick={() => req.run(p.code)} loading={req.pending} disabled={b.subscription.status === 'requested'}>Request {p.name}</Button> : null}</div>
                </div>
              );
            })}
          </div>
          {b.comingSoon.length > 0 && <p className="cz-muted" style={{ fontSize: 13.5 }}>Coming soon: {b.comingSoon.map((c) => c.name).join(', ')} — prices are being finalised.</p>}
        </>
      )}
    </Screen>
  );
}
