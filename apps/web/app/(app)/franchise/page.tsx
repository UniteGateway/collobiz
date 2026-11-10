'use client';
import { useState } from 'react';
import { FRANCHISE_FORMATS, FRANCHISE_FORMAT_LABELS, FRANCHISE_STATUS_LABELS, INDIA_STATES } from '@collabiz/types';
import { Alert, Button, Dialog, EmptyState, Select, Skeleton, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Unit { id: string; code: string; brand: string; format: string; city: string; region: string; status: string; fee: number | null; royaltyBps: number | null; monthlyTarget: number | null; decisionNote: string | null; checklist: { key: string; label: string; doneAt: string | null }[]; reports: { month: string; sales: number; orders: number; royalty: number }[]; salesThisMonth: number }
const rupees = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { live: 'success', applied: 'info', approved: 'info', agreement_signed: 'info', setup: 'warning', suspended: 'warning' };
const monthLabel = (m: string) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** Franchise — run a Unite brand franchise (e.g. Unite Solar store): apply, follow set-up, report monthly sales. */
export default function FranchisePage() {
  const q = useQuery<Unit[]>('/franchise/mine');
  const [applying, setApplying] = useState(false);
  return (
    <Screen page={{ key: 'franchise', title: 'Franchise', access: 'verified-partner' }}
      description="Run a Unite brand in your city — a store, experience centre, kiosk or service point. Apply, follow the set-up checklist with Unite, then report your monthly sales."
      actions={<Button onClick={() => setApplying(true)}>Apply for a franchise</Button>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : !q.data.length ? (
        <div className="cz-card"><EmptyState icon="location" title="You don’t run a Unite franchise yet" action={<Button onClick={() => setApplying(true)}>Apply for a franchise</Button>}>Unite reviews every application and agrees the fee, royalty and targets with you before anything is signed.</EmptyState></div>
      ) : (
        <div className="cz-stack" style={{ gap: 14 }}>{q.data.map((u) => <UnitCard key={u.id} u={u} onChange={q.reload} />)}</div>
      )}
      <Apply open={applying} onClose={() => setApplying(false)} onDone={() => { setApplying(false); q.reload(); }} />
    </Screen>
  );
}

function UnitCard({ u, onChange }: { u: Unit; onChange: () => void }) {
  const done = u.checklist.filter((c) => c.doneAt).length;
  const now = new Date().toISOString().slice(0, 7);
  const [f, setF] = useState({ month: now, sales: '', orders: '' });
  const rep = useMutation(async () => { const r = await api.post<{ royalty: number }>(`/franchise/${u.id}/reports`, { month: f.month, sales: Math.round(Number(f.sales) * 100), orders: Number(f.orders || 0) }); setF({ ...f, sales: '', orders: '' }); onChange(); return r; });
  return (
    <section className="cz-card" aria-label={`${u.brand} ${u.city}`} data-franchise={u.city}>
      <div className="cz-row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <div><h2 style={{ margin: 0, fontSize: 18 }}>{u.brand} — {u.city}</h2><span className="cz-muted" style={{ fontSize: 13 }}>{u.code} · {FRANCHISE_FORMAT_LABELS[u.format]}</span></div>
        <StatusBadge status={u.status} tone={TONE[u.status] ?? 'neutral'} label={FRANCHISE_STATUS_LABELS[u.status]} />
      </div>
      {u.decisionNote && <p className="cz-muted" style={{ fontSize: 13.5 }}>Unite: “{u.decisionNote}”</p>}
      {u.fee != null && <p style={{ fontSize: 14 }}>Franchise fee {rupees(u.fee)} · royalty {(u.royaltyBps ?? 0) / 100}% of sales{u.monthlyTarget ? ` · monthly target ${rupees(u.monthlyTarget)}` : ''}</p>}
      {!['applied', 'rejected', 'closed'].includes(u.status) && (
        <>
          <p style={{ margin: '8px 0 4px', fontWeight: 600, fontSize: 14 }}>Set-up checklist — {done} of {u.checklist.length} done</p>
          <ul className="cz-check-list" style={{ marginBottom: 12 }}>{u.checklist.map((c) => <li key={c.key} style={{ color: c.doneAt ? undefined : 'var(--cz-grey-600)' }}>{c.doneAt ? '✓' : '○'} {c.label}</li>)}</ul>
        </>
      )}
      {u.status === 'live' && (
        <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); rep.run(); }} noValidate>
          <TextInput label="Month" type="month" value={f.month} max={now} onChange={(e) => setF({ ...f, month: e.target.value })} error={rep.fieldErrors.month} />
          <TextInput label="Sales (₹)" inputMode="numeric" value={f.sales} onChange={(e) => setF({ ...f, sales: e.target.value.replace(/[^\d.]/g, '') })} />
          <TextInput label="Orders" inputMode="numeric" value={f.orders} onChange={(e) => setF({ ...f, orders: e.target.value.replace(/\D/g, '') })} />
          <Button type="submit" loading={rep.pending} disabled={!f.sales}>Report sales</Button>
        </form>
      )}
      {rep.error && <Alert tone="danger">{rep.error}</Alert>}
      {rep.data && <Alert tone="success">Reported. Royalty due for the month: {rupees(rep.data.royalty)}.</Alert>}
      {u.reports.length > 0 && (
        <div className="cz-table-wrap" style={{ marginTop: 12 }}><table className="cz-table"><caption className="cz-sr-only">Monthly sales</caption>
          <thead><tr><th scope="col">Month</th><th scope="col" style={{ textAlign: 'right' }}>Sales</th><th scope="col" style={{ textAlign: 'right' }}>Orders</th><th scope="col" style={{ textAlign: 'right' }}>Royalty</th></tr></thead>
          <tbody>{u.reports.map((r) => <tr key={r.month}><td>{monthLabel(r.month)}</td><td style={{ textAlign: 'right' }}>{rupees(r.sales)}</td><td style={{ textAlign: 'right' }}>{r.orders}</td><td style={{ textAlign: 'right' }}>{rupees(r.royalty)}</td></tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}

function Apply({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const brands = useQuery<{ id: string; name: string; description: string | null }[]>(open ? '/franchise/brands' : null);
  const [f, setF] = useState({ brandOrgId: '', format: 'store', city: '', region: '', message: '' });
  const save = useMutation(async () => { const r = await api.post('/franchise/applications', { ...f, brandOrgId: f.brandOrgId || brands.data?.[0]?.id }); onDone(); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Apply for a franchise">
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        {brands.data && !brands.data.length ? <Alert tone="info">No Unite brand is taking franchise applications right now.</Alert> : (
          <>
            <Select label="Brand" value={f.brandOrgId || brands.data?.[0]?.id || ''} onChange={(ev) => setF({ ...f, brandOrgId: ev.target.value })} options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
            <Select label="Format" value={f.format} onChange={(ev) => setF({ ...f, format: ev.target.value })} options={FRANCHISE_FORMATS.map((x) => ({ value: x, label: FRANCHISE_FORMAT_LABELS[x] }))} />
            <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} error={e.city} />
            <Select label="State" value={f.region} placeholder="Choose a state" onChange={(ev) => setF({ ...f, region: ev.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} error={e.region} />
            <TextArea label="Your location, team and experience" rows={4} value={f.message} onChange={(ev) => setF({ ...f, message: ev.target.value })} error={e.message} />
            <Button type="submit" loading={save.pending} disabled={!f.city || !f.region}>Send application</Button>
          </>
        )}
      </form>
    </Dialog>
  );
}
