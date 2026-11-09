'use client';
import { useState } from 'react';
import { PROMO_CHANNELS, PROMO_CHANNEL_LABELS, PROMO_SCOPES, PROMO_SCOPE_LABELS, PROMO_STATUS_LABELS } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, Dialog, EmptyState, LoadingState, ProgressBar, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { id: string; code: string; name: string; label: string; buyQty: number; getQty: number; scope: string; sectors: string[]; itemRefs: string[]; channel: string; stores: string[]; maxFreePerOrder: number; budgetUnits: number | null; budgetValue: number | null; usedUnits: number; usedValue: number; startsAt: string; endsAt: string; terms: string; status: string; erpRuleName: string | null; vouchers: number; redeemed: number; eligibleProducts: number }
interface Res { promotions: P[]; products: { ref: string; name: string; sector: string; price: number }[]; sectors: string[]; stores: string[]; erpnext: boolean; canApprove: boolean }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = { active: 'success', draft: 'info', paused: 'warning', ended: 'neutral' };
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Promotions — buy one get one (and buy X get Y) across the online store and every Unite store and franchise. */
export default function Promotions() {
  const q = useQuery<Res>('/admin/promotions');
  const [edit, setEdit] = useState<P | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const act = useMutation(async (p: P, path: string, body?: object) => { const r = await api.post<{ name?: string; created?: boolean }>(`/admin/promotions/${p.id}/${path}`, body ?? {}); if (path === 'erpnext') setMsg(r.created ? `Sent to ERPNext as Pricing Rule ${r.name}.` : `Already in ERPNext as ${r.name}.`); q.reload(); return r; });
  const d = q.data;
  const live = d?.promotions.filter((p) => p.status === 'active') ?? [];
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Promotions" accent="BOGO" sub="Buy one get one — or buy X get Y — on all products, chosen categories or chosen products, online and in every Unite store and franchise. Each offer has dates, terms and a budget, and stops when the budget is used." chips={['Online store', 'Store vouchers', 'Budget caps', 'Finance approval']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <KpiRow tint="green" items={[['award', live.length, 'Live offers', `${d.promotions.filter((p) => p.status === 'draft').length} waiting for approval`], ['package', live.reduce((a, p) => a + p.usedUnits, 0), 'Free items given', 'on live offers'], ['value', inr(live.reduce((a, p) => a + p.usedValue, 0)), 'Value given free', 'at selling price'], ['location', d.stores.length, 'Stores', d.erpnext ? 'from ERPNext POS' : 'sample list — ERPNext not connected']]} />
          {msg && <Alert tone="success">{msg}</Alert>}
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          <Card>
            <div className="cz-ws-section-head"><h2>Offers</h2><span className="cz-row" style={{ gap: 8 }}><Button size="sm" variant="secondary" onClick={() => setRedeeming(true)}>Redeem a voucher</Button><Button size="sm" onClick={() => setEdit('new')}>New offer</Button></span></div>
            {!d.promotions.length ? <EmptyState icon="award" title="No offers yet" /> : (
              <ul className="cz-stack" style={{ gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>{d.promotions.map((p) => {
                const pct = p.budgetUnits ? (p.usedUnits / p.budgetUnits) * 100 : p.budgetValue ? (p.usedValue / p.budgetValue) * 100 : 0;
                return (
                  <li key={p.id} className="cz-card cz-lead" data-promotion={p.name}>
                    <div className="cz-lead-head"><strong>{p.name}</strong><span className="cz-offer-badge">{p.label}</span><span className="cz-muted">{p.code}</span><span style={{ marginLeft: 'auto' }}><StatusBadge status={p.status} tone={TONE[p.status]} label={PROMO_STATUS_LABELS[p.status]} /></span></div>
                    <span className="cz-muted" style={{ fontSize: 13 }}>{PROMO_SCOPE_LABELS[p.scope]}{p.scope === 'sectors' ? `: ${p.sectors.join(', ')}` : ''} ({p.eligibleProducts} products) · {PROMO_CHANNEL_LABELS[p.channel]}{p.stores.length ? ` at ${p.stores.length} stores` : ''} · {day(p.startsAt)} to {day(p.endsAt)} · up to {p.maxFreePerOrder} free per order{p.vouchers ? ` · ${p.vouchers} vouchers, ${p.redeemed} used` : ''}{p.erpRuleName ? ` · ERPNext ${p.erpRuleName}` : ''}</span>
                    <ProgressBar value={Math.min(100, pct)} label={`Budget used: ${p.usedUnits}${p.budgetUnits ? ` of ${p.budgetUnits}` : ''} items · ${inr(p.usedValue)}${p.budgetValue ? ` of ${inr(p.budgetValue)}` : ''}`} />
                    <div className="cz-row" style={{ gap: 8 }}>
                      {(p.status === 'draft' || p.status === 'paused') && (d.canApprove ? <Button size="sm" loading={act.pending} onClick={() => act.run(p, 'status', { status: 'active' })}>{p.status === 'draft' ? 'Approve and go live' : 'Resume'}</Button> : <span className="cz-muted" style={{ fontSize: 13 }}>Finance or a super admin approves this offer.</span>)}
                      {p.status === 'active' && <Button size="sm" variant="secondary" onClick={() => act.run(p, 'status', { status: 'paused' })}>Pause</Button>}
                      {(p.status === 'draft' || p.status === 'paused') && <Button size="sm" variant="secondary" onClick={() => setEdit(p)}>Edit</Button>}
                      {p.status === 'active' && p.channel !== 'online' && !p.erpRuleName && <Button size="sm" variant="ghost" onClick={() => act.run(p, 'erpnext')}>Send to store tills (ERPNext)</Button>}
                      {p.status !== 'ended' && <Button size="sm" variant="ghost" onClick={() => act.run(p, 'status', { status: 'ended' })}>End</Button>}
                    </div>
                  </li>
                );
              })}</ul>
            )}
          </Card>
          <Edit open={!!edit} p={edit === 'new' ? null : edit} d={d} onClose={() => setEdit(null)} onDone={() => { setEdit(null); q.reload(); }} />
          <Redeem open={redeeming} d={d} onClose={() => { setRedeeming(false); q.reload(); }} />
        </>
      )}
    </div>
  );
}

function Edit({ open, p, d, onClose, onDone }: { open: boolean; p: P | null; d: Res; onClose: () => void; onDone: () => void }) {
  const iso = (x: string) => x.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const blank = { name: '', buyQty: '1', getQty: '1', scope: 'all', sectors: [] as string[], itemRefs: [] as string[], channel: 'both', stores: [] as string[], maxFreePerOrder: '1', budgetUnits: '', budgetValue: '', startsAt: today, endsAt: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10), terms: '' };
  const [f, setF] = useState(blank);
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = p?.id ?? 'new';
  if (open && loaded !== key) {
    setLoaded(key);
    setF(p ? { name: p.name, buyQty: String(p.buyQty), getQty: String(p.getQty), scope: p.scope, sectors: p.sectors, itemRefs: p.itemRefs, channel: p.channel, stores: p.stores, maxFreePerOrder: String(p.maxFreePerOrder), budgetUnits: p.budgetUnits ? String(p.budgetUnits) : '', budgetValue: p.budgetValue ? String(p.budgetValue / 100) : '', startsAt: iso(p.startsAt), endsAt: iso(p.endsAt), terms: p.terms } : blank);
  }
  const save = useMutation(async () => {
    const body = { name: f.name, buyQty: Number(f.buyQty), getQty: Number(f.getQty), scope: f.scope, sectors: f.scope === 'sectors' ? f.sectors : [], itemRefs: f.scope === 'items' ? f.itemRefs : [], channel: f.channel, stores: f.channel === 'online' ? [] : f.stores, maxFreePerOrder: Number(f.maxFreePerOrder),
      budgetUnits: f.budgetUnits ? Number(f.budgetUnits) : undefined, budgetValue: f.budgetValue ? Math.round(Number(f.budgetValue) * 100) : undefined, startsAt: new Date(`${f.startsAt}T00:00:00+05:30`).toISOString(), endsAt: new Date(`${f.endsAt}T23:59:59+05:30`).toISOString(), terms: f.terms };
    const r = p ? await api.request('PATCH', `/admin/promotions/${p.id}`, body) : await api.post('/admin/promotions', body);
    setLoaded(null); onDone(); return r;
  });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={() => { setLoaded(null); onClose(); }} title={p ? `Edit ${p.name}` : 'New offer'}>
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Offer name" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} error={e.name} />
        <div className="cz-grid cz-grid-3" style={{ gap: '0 12px' }}>
          <TextInput label="Buy" inputMode="numeric" value={f.buyQty} onChange={(ev) => setF({ ...f, buyQty: ev.target.value.replace(/\D/g, '') })} />
          <TextInput label="Get free" inputMode="numeric" value={f.getQty} onChange={(ev) => setF({ ...f, getQty: ev.target.value.replace(/\D/g, '') })} />
          <TextInput label="Max free per order" inputMode="numeric" value={f.maxFreePerOrder} onChange={(ev) => setF({ ...f, maxFreePerOrder: ev.target.value.replace(/\D/g, '') })} />
        </div>
        <Select label="Applies to" value={f.scope} onChange={(ev) => setF({ ...f, scope: ev.target.value })} options={PROMO_SCOPES.map((s) => ({ value: s, label: PROMO_SCOPE_LABELS[s] }))} />
        {f.scope === 'sectors' && <ChipSelect legend="Categories" options={d.sectors.map((s) => ({ value: s, label: s }))} value={f.sectors} onChange={(v) => setF({ ...f, sectors: v })} />}
        {e.sectors && <p className="cz-error-text">{e.sectors}</p>}
        {f.scope === 'items' && <ChipSelect legend="Products" options={d.products.map((x) => ({ value: x.ref, label: x.name }))} value={f.itemRefs} onChange={(v) => setF({ ...f, itemRefs: v })} />}
        {e.itemRefs && <p className="cz-error-text">{e.itemRefs}</p>}
        <Select label="Where" value={f.channel} onChange={(ev) => setF({ ...f, channel: ev.target.value })} options={PROMO_CHANNELS.map((c) => ({ value: c, label: PROMO_CHANNEL_LABELS[c] }))} />
        {f.channel !== 'online' && <ChipSelect legend="Stores (none chosen = every store)" options={d.stores.map((s) => ({ value: s, label: s }))} value={f.stores} onChange={(v) => setF({ ...f, stores: v })} />}
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label="Starts" type="date" value={f.startsAt} onChange={(ev) => setF({ ...f, startsAt: ev.target.value })} />
          <TextInput label="Ends" type="date" value={f.endsAt} onChange={(ev) => setF({ ...f, endsAt: ev.target.value })} error={e.endsAt} />
          <TextInput label="Budget: free items (total)" inputMode="numeric" value={f.budgetUnits} onChange={(ev) => setF({ ...f, budgetUnits: ev.target.value.replace(/\D/g, '') })} error={e.budgetUnits} />
          <TextInput label="Budget: free value (₹ total)" inputMode="numeric" value={f.budgetValue} onChange={(ev) => setF({ ...f, budgetValue: ev.target.value.replace(/\D/g, '') })} />
        </div>
        <TextArea label="Terms shown to customers" rows={3} value={f.terms} onChange={(ev) => setF({ ...f, terms: ev.target.value })} error={e.terms} />
        <p className="cz-muted" style={{ margin: 0, fontSize: 12.5 }}>Saved as a draft. Finance or a super admin approves it before it goes live.</p>
        <div><Button type="submit" loading={save.pending}>{p ? 'Save changes' : 'Save draft'}</Button></div>
      </form>
    </Dialog>
  );
}

/** Store counter check: a customer's voucher, their mobile number, the product and the bill. Each voucher works once. */
function Redeem({ open, d, onClose }: { open: boolean; d: Res; onClose: () => void }) {
  const [f, setF] = useState({ code: '', phone: '', store: '', itemRef: '', billNo: '' });
  const [ok, setOk] = useState<string | null>(null);
  const run = useMutation(async () => { const r = await api.post<{ message: string }>('/store/vouchers/redeem', { ...f, store: f.store || d.stores[0] }); setOk(r.message); setF({ ...f, code: '', phone: '', billNo: '' }); return r; });
  return (
    <Dialog open={open} onClose={() => { setOk(null); onClose(); }} title="Redeem a store voucher">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); setOk(null); run.run(); }} noValidate>
        {ok && <Alert tone="success" title="Voucher accepted">{ok}</Alert>}
        {run.error && <Alert tone="danger">{run.error}</Alert>}
        <Select label="Store" value={f.store || d.stores[0] || ''} onChange={(ev) => setF({ ...f, store: ev.target.value })} options={d.stores.map((s) => ({ value: s, label: s }))} />
        <TextInput label="Voucher code" placeholder="BOGO-AB12-CD34" value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value.toUpperCase() })} error={run.fieldErrors.code} />
        <TextInput label="Customer’s mobile number" inputMode="tel" value={f.phone} onChange={(ev) => setF({ ...f, phone: ev.target.value })} error={run.fieldErrors.phone} />
        <Select label="Product bought" placeholder="Choose the product" value={f.itemRef} onChange={(ev) => setF({ ...f, itemRef: ev.target.value })} options={d.products.map((x) => ({ value: x.ref, label: `${x.name} — ${inr(x.price)}` }))} />
        <TextInput label="Bill number" value={f.billNo} onChange={(ev) => setF({ ...f, billNo: ev.target.value })} />
        <div><Button type="submit" loading={run.pending} disabled={!f.code || !f.phone || !f.itemRef || !f.billNo}>Check and redeem</Button></div>
      </form>
    </Dialog>
  );
}
