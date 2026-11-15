'use client';
import { useState } from 'react';
import { Alert, Button, DataTable, Kpi, LoadingState, Segmented, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const B = '/product-sales/powertek';
const inr = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(Number(p) / 100).toLocaleString('en-IN')}`);
const pct = (bps: number) => `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { submitted: 'warning', in_discussion: 'info', quoted: 'info', won: 'success', paid: 'success', lost: 'neutral', withdrawn: 'neutral' };
const rupees = (label: string) => { const v = window.prompt(label); return v ? Math.round(Number(v.replace(/[,₹\s]/g, '')) * 100) : null; };

/** Powertek sales desk — enquiries from every seller channel, quote → win → payment, and commission rates. */
export default function ProductSales() {
  const [f, setF] = useState('open');
  const q = useQuery<R>(`${B}/admin/enquiries`);
  const rules = useQuery<R[]>(`${B}/admin/rules`);
  const [rule, setRule] = useState({ productLine: '', category: '', rate: '' });
  const reload = () => { q.reload(); rules.reload(); };
  const move = useMutation(async (e: R, to: string) => {
    const b: R = { to };
    if (to === 'quoted') { b.quoteValue = rupees(`Quoted value for ${e.code} in ₹ (excl. GST)`); if (!b.quoteValue) return; }
    if (to === 'won') { b.orderValue = rupees(`Order value for ${e.code} in ₹ (excl. GST)`); if (!b.orderValue) return; b.invoiceNumber = window.prompt('Sales order / invoice number') ?? ''; }
    if (to === 'lost') { b.lostReason = window.prompt('Why was it lost?') ?? ''; if (!b.lostReason) return; }
    if (to === 'in_discussion') b.assignedTo = window.prompt('Assign to (salesperson / desk)') ?? undefined;
    await api.post(`${B}/admin/enquiries/${e.id}/status`, b); reload();
  });
  const paid = useMutation(async (e: R) => { const paymentReference = window.prompt(`Customer payment reference for ${e.code}`); if (!paymentReference) return; await api.post(`${B}/admin/enquiries/${e.id}/paid`, { paymentReference }, true); reload(); });
  const save = useMutation(async () => { await api.post(`${B}/admin/rules`, { productLine: rule.productLine || null, category: rule.category || null, rateBps: Math.round(Number(rule.rate) * 100) }); setRule({ productLine: '', category: '', rate: '' }); rules.reload(); });
  const off = useMutation(async (id: string) => { await api.post(`${B}/admin/rules/${id}/deactivate`); rules.reload(); });
  const d = q.data;
  const rows = (d?.enquiries ?? []).filter((e: R) => (f === 'open' ? ['submitted', 'in_discussion', 'quoted', 'won'].includes(e.status) : f === 'closed' ? ['paid', 'lost', 'withdrawn'].includes(e.status) : true));
  const err = move.error ?? paid.error ?? save.error ?? off.error;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Powertek" accent="sales desk" sub="Enquiries for Unite Powertek products from franchises, stores, partners and agents. Quote, win, record payment — commission flows to the seller’s Earnings." chips={['Enquiries', 'Quotes', 'Orders', 'Commission rates']} />
      {err && <Alert tone="danger">{err}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <div className="cz-grid cz-grid-4">
            <Kpi label="Open enquiries" value={d.kpis.open} accent /><Kpi label="Won, awaiting payment" value={d.kpis.won} />
            <Kpi label="Order value (won + paid)" value={inr(d.kpis.orderValue)} /><Kpi label="Seller commission" value={inr(d.kpis.commission)} />
          </div>
          <div className="cz-grid cz-grid-3">
            {[['By seller channel', d.byChannel], ['By state', d.byState], ['By product line', d.byLine]].map(([t, g]) => (
              <section key={t as string} className="cz-card"><DataTable caption={t as string} rows={(g as R[]).map((x) => ({ ...x, id: x.key }))} columns={[{ key: 'k', header: '', render: (x: R) => x.key }, { key: 'e', header: 'Enquiries', render: (x: R) => `${x.won} won / ${x.enquiries}` }, { key: 'v', header: 'Orders', render: (x: R) => inr(x.value) }]} /></section>
            ))}
          </div>
          <Segmented label="Show" value={f} onChange={setF} options={[{ value: 'open', label: 'In progress' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
          <section className="cz-card"><DataTable caption="Enquiries" rows={rows} columns={[
            { key: 'c', header: 'Enquiry', render: (e: R) => <><strong>{e.code}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.createdAt.slice(0, 10)} · {e.seller} ({e.channelLabel})</span></> },
            { key: 'u', header: 'Customer', render: (e: R) => <>{e.customerName}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.city}, {e.state} {e.pincode}{e.customerPhone ? ` · ${e.customerPhone}` : ''}{e.customerEmail ? ` · ${e.customerEmail}` : ''}</span></> },
            { key: 'p', header: 'Products & requirement', render: (e: R) => <>{e.lines.map((l: R) => `${l.qty} × ${l.name}`).join(', ')}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.requirement}</span></> },
            { key: 'v', header: 'Value', render: (e: R) => (e.orderValue ? `Order ${inr(e.orderValue)}` : e.quoteValue ? `Quote ${inr(e.quoteValue)}` : '—') },
            { key: 'm', header: 'Commission', render: (e: R) => (e.commission != null ? `${inr(e.commission)} (${pct(e.rateBps)})` : '—') },
            { key: 's', header: 'Status', render: (e: R) => <StatusBadge status={e.status} tone={TONE[e.status]} label={e.statusLabel} /> },
            { key: 'a', header: '', render: (e: R) => <div className="cz-row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {e.next.filter((n: string) => n !== 'paid').map((n: string) => <Button key={n} size="sm" variant={n === 'lost' ? 'ghost' : 'secondary'} onClick={() => move.run(e, n)}>{{ in_discussion: 'Discussing', quoted: 'Quote', won: 'Won', lost: 'Lost' }[n] ?? n}</Button>)}
              {e.status === 'won' && <Button size="sm" onClick={() => paid.run(e)}>Payment received (finance)</Button>}
            </div> },
          ]} /></section>
          <section className="cz-card" aria-label="Commission rates">
            <h2 style={{ marginTop: 0, fontSize: 17 }}>Commission rates (max 10%)</h2>
            <p className="cz-muted" style={{ fontSize: 13 }}>The most specific active rate applies: product line + category, then product line, then the default. A mixed order earns the lowest rate among its products. Rates are frozen when an order is won.</p>
            {rules.data && <DataTable caption="Rates" rows={rules.data} columns={[
              { key: 'l', header: 'Product line', render: (r: R) => r.productLine ?? 'Default (all products)' }, { key: 'c', header: 'Category', render: (r: R) => r.category ?? '—' },
              { key: 'r', header: 'Rate', render: (r: R) => pct(r.rateBps) }, { key: 's', header: 'Status', render: (r: R) => (r.active ? 'Active' : 'Off') },
              { key: 'a', header: '', render: (r: R) => (r.active ? <Button size="sm" variant="ghost" onClick={() => off.run(r.id)}>Turn off</Button> : null) },
            ]} />}
            <form className="cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
              <TextInput label="Product line (blank = default)" value={rule.productLine} onChange={(e) => setRule({ ...rule, productLine: e.target.value })} placeholder="e.g. POWERTEK SOLAR" />
              <TextInput label="Category (optional)" value={rule.category} onChange={(e) => setRule({ ...rule, category: e.target.value })} placeholder="e.g. PV Modules" />
              <TextInput label="Rate %" inputMode="decimal" value={rule.rate} onChange={(e) => setRule({ ...rule, rate: e.target.value.replace(/[^\d.]/g, '') })} />
              <Button type="submit" loading={save.pending} disabled={!rule.rate}>Save rate</Button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
