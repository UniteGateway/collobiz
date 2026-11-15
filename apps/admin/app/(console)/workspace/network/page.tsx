'use client';
import { useState } from 'react';
import { PACKAGE_KINDS } from '@collabiz/types';
import { DataTable, Kpi, LoadingState, Select, StatusBadge, TextInput, Button } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE, inr } from '@/components/Network';
import { useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const NAMES: Record<string, string> = { basic_franchise: 'Basic Franchise', master_franchise: 'Master Franchise', district_franchise: 'District Franchise', store_with_stock: 'Store — with stock', store_without_stock: 'Store — without stock' };

/** Admin Control Centre — network KPIs and reports by state, district, PIN code, partner type, partner and date. */
export default function NetworkOverview() {
  const [f, setF] = useState({ state: '', district: '', pincode: '', type: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const q = useQuery<R>('/admin/network/dashboard', Object.fromEntries(Object.entries(applied).filter(([, v]) => v)));
  const [by, setBy] = useState('byState');
  const d = q.data;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Unite Solar" accent="network" sub="Franchises and store partners — applications, territories, stock, sales and the five earning streams, with every step verified and audited." chips={['Applications', 'Territories', 'Inventory', 'Commissions', 'Settlements']} />
      <NetworkTabs />
      <form className="cz-card cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); setApplied(f); }} aria-label="Report filters">
        <TextInput label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} placeholder="e.g. Telangana" />
        <TextInput label="District" value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
        <TextInput label="PIN code" value={f.pincode} inputMode="numeric" onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        <Select label="Partner type" value={f.type} placeholder="All" onChange={(e) => setF({ ...f, type: e.target.value })} options={PACKAGE_KINDS.map((k) => ({ value: k, label: NAMES[k] }))} />
        <TextInput label="Sales from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <TextInput label="to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <Button type="submit">Apply filters</Button>
      </form>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <div className="cz-grid cz-grid-4">
            <Kpi label="Active partners" value={d.kpis.active} hint={`${d.kpis.partners} records`} accent />
            <Kpi label="Applications to review" value={d.kpis.applications} hint={`${d.kpis.awaitingAgreement} awaiting agreement`} href="/workspace/network/applications" />
            <Kpi label="Payments to verify" value={d.kpis.paymentsToVerify} href="/workspace/network/applications" />
            <Kpi label="Package revenue (verified)" value={inr(d.kpis.packageRevenue)} />
            <Kpi label="Partner sales (excl. GST)" value={inr(d.kpis.sales)} hint={`${d.kpis.orders} orders`} />
            <Kpi label="Awaiting fulfilment / acceptance" value={d.kpis.pendingFulfilment} href="/workspace/network/orders" />
            <Kpi label="Stock held by stores" value={inr(d.kpis.stockValue)} hint={`${d.kpis.lowStock} low-stock lines`} />
            <Kpi label="Commission pending approval" value={inr(d.commissions.reduce((a: number, c: R) => a + c.pending, 0))} href="/workspace/network/commissions" />
          </div>
          <section className="cz-card" aria-label="Plans"><DataTable caption="By plan" rows={d.byPackage.map((p: R) => ({ ...p, id: p.code }))} columns={[
            { key: 'n', header: 'Plan', render: (p: R) => p.name }, { key: 'p', header: 'Price', render: (p: R) => inr(p.price) }, { key: 'c', header: 'Partners', render: (p: R) => `${p.active} active / ${p.partners}` }, { key: 's', header: 'Sales', render: (p: R) => inr(p.sales) },
          ]} /></section>
          <section className="cz-card" aria-label="Earning streams"><DataTable caption="Earning streams (all partners in view)" rows={d.commissions.map((c: R) => ({ ...c, id: c.stream }))} columns={[
            { key: 'l', header: 'Stream', render: (c: R) => c.label }, { key: 'p', header: 'Pending', render: (c: R) => inr(c.pending) }, { key: 'a', header: 'Approved', render: (c: R) => inr(c.approved) },
            { key: 'y', header: 'Payable', render: (c: R) => inr(c.payable) }, { key: 'd', header: 'Paid', render: (c: R) => inr(c.paid) }, { key: 'r', header: 'Reversed / blocked', render: (c: R) => `${inr(c.reversed)} / ${inr(c.blocked)}` },
          ]} /></section>
          <section className="cz-card" aria-label="Reports">
            <div className="cz-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>Report</h2>
              <Select label="Group by" value={by} onChange={(e) => setBy(e.target.value)} options={[{ value: 'byState', label: 'State' }, { value: 'byDistrict', label: 'District' }, { value: 'byPincode', label: 'PIN code' }, { value: 'byPartner', label: 'Partner' }]} />
            </div>
            {by === 'byPartner' ? <DataTable caption="By partner" rows={d.byPartner} columns={[
              { key: 'p', header: 'Partner', render: (u: R) => <a href={`/workspace/network/applications/${u.id}`}><strong>{u.partner}</strong></a> }, { key: 'k', header: 'Plan', render: (u: R) => NAMES[u.packageCode] },
              { key: 'l', header: 'Location', render: (u: R) => `${u.district ?? '—'}, ${u.state} · ${u.pincode ?? ''}` }, { key: 's', header: 'Status', render: (u: R) => <StatusBadge status={u.status} tone={TONE[u.status]} label={u.status.replace('_', ' ')} /> },
              { key: 'v', header: 'Sales', render: (u: R) => `${inr(u.sales)} (${u.orders})` },
            ]} /> : <DataTable caption="Report" rows={d[by].map((g: R) => ({ ...g, id: g.key }))} columns={[
              { key: 'k', header: by === 'byState' ? 'State' : by === 'byDistrict' ? 'District' : 'PIN code', render: (g: R) => g.key }, { key: 'p', header: 'Partners', render: (g: R) => `${g.active} active / ${g.partners}` },
              { key: 'o', header: 'Orders', render: (g: R) => g.orders }, { key: 's', header: 'Sales', render: (g: R) => inr(g.sales) },
            ]} />}
          </section>
        </div>
      )}
    </div>
  );
}
