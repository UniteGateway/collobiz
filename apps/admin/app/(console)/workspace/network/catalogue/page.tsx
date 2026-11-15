'use client';
import { useState } from 'react';
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from '@collabiz/types';
import { Alert, Button, DataTable, Dialog, LoadingState, Select, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, inr, pct } from '@/components/Network';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const rs = (p: number) => String(Math.round(Number(p) / 100));
const blank = { sku: '', name: '', category: 'rooftop_kit', brand: 'Unite Solar', hsn: '', gstBps: '1200', specification: '', warrantyMonths: '60', mrp: '', customerPrice: '', partnerPrice: '', commissionBps: '800', reorderLevel: '0', serialised: false };

/** Plans (versioned packages) and the product catalogue with prices, GST/HSN and commission rates (≤ 10%). */
export default function Catalogue() {
  const pk = useQuery<R[]>('/admin/network/packages');
  const pr = useQuery<{ products: R[] }>('/network/products');
  const [edit, setEdit] = useState<R | null>(null);
  const [pe, setPe] = useState<{ code: string; price: string; leadDnaAddonPrice: string; maxProductCommissionBps: string } | null>(null);
  const savePkg = useMutation(async () => { const b: R = { price: Math.round(Number(pe!.price) * 100), maxProductCommissionBps: Number(pe!.maxProductCommissionBps) }; if (pe!.leadDnaAddonPrice) b.leadDnaAddonPrice = Math.round(Number(pe!.leadDnaAddonPrice) * 100); await api.post(`/admin/network/packages/${pe!.code}`, b); setPe(null); pk.reload(); });
  const save = useMutation(async () => {
    const e = edit!; const b = { ...e, gstBps: Number(e.gstBps), warrantyMonths: Number(e.warrantyMonths), mrp: Number(e.mrp) * 100, customerPrice: Number(e.customerPrice) * 100, partnerPrice: Number(e.partnerPrice) * 100, commissionBps: Number(e.commissionBps), reorderLevel: Number(e.reorderLevel) };
    delete (b as R).id; await (e.id ? api.post(`/admin/network/products/${e.id}`, b) : api.post('/admin/network/products', b)); setEdit(null); pr.reload();
  });
  const active = (pk.data ?? []).filter((p) => p.active);
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 12px' }}>Plans & catalogue</h1>
      <NetworkTabs />
      {pk.error ? <ApiErrorView error={pk.error} onRetry={pk.reload} /> : !pk.data ? <LoadingState /> : (
        <section className="cz-card" style={{ marginBottom: 16 }}><DataTable caption="Partner plans (editing creates a new version; existing applications keep theirs)" rows={active.map((p) => ({ ...p, id: p.code }))} columns={[
          { key: 'n', header: 'Plan', render: (p: R) => <><strong>{p.config.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>version {p.version}</span></> },
          { key: 'p', header: 'Price', render: (p: R) => `${inr(p.config.price)} ${p.config.gstMode === 'extra' ? '+ GST' : 'incl. GST'}` },
          { key: 'l', header: 'LeadDNA', render: (p: R) => (p.config.leadDnaIncluded ? 'Included' : p.config.leadDnaAddonPrice ? `Add-on ${inr(p.config.leadDnaAddonPrice)}` : '—') },
          { key: 's', header: 'Stock / territory', render: (p: R) => `${p.config.stockAllocation ? `${inr(p.config.stockAllocation)} stock · ` : ''}${p.config.territoryLevel ?? '—'}${p.config.exclusive ? ' (exclusive)' : ''}` },
          { key: 'c', header: 'Commission cap', render: (p: R) => pct(p.config.maxProductCommissionBps) },
          { key: 'a', header: '', render: (p: R) => <Button size="sm" variant="ghost" onClick={() => setPe({ code: p.code, price: rs(p.config.price), leadDnaAddonPrice: p.config.leadDnaAddonPrice ? rs(p.config.leadDnaAddonPrice) : '', maxProductCommissionBps: String(p.config.maxProductCommissionBps) })}>Edit</Button> },
        ]} /></section>
      )}
      <div className="cz-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}>Products</h2><Button onClick={() => setEdit({ ...blank })}>Add product</Button></div>
      {pr.error ? <ApiErrorView error={pr.error} onRetry={pr.reload} /> : !pr.data ? <LoadingState /> : (
        <section className="cz-card"><DataTable caption="Products" rows={pr.data.products} columns={[
          { key: 'n', header: 'Product', render: (p: R) => <><strong>{p.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{p.sku} · {PRODUCT_CATEGORY_LABELS[p.category]} · HSN {p.hsn} · GST {pct(p.gstBps)}</span></> },
          { key: 'm', header: 'MRP / customer / partner', render: (p: R) => `${inr(p.mrp)} / ${inr(p.customerPrice)} / ${inr(p.partnerPrice)}` },
          { key: 'c', header: 'Commission', render: (p: R) => pct(p.commissionBps) }, { key: 'r', header: 'Reorder at', render: (p: R) => p.reorderLevel },
          { key: 'a', header: '', render: (p: R) => <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p, gstBps: String(p.gstBps), warrantyMonths: String(p.warrantyMonths), mrp: rs(p.mrp), customerPrice: rs(p.customerPrice), partnerPrice: rs(p.partnerPrice), commissionBps: String(p.commissionBps), reorderLevel: String(p.reorderLevel), model: p.model ?? undefined, imageUrl: p.imageUrl ?? '', datasheetUrl: p.datasheetUrl ?? '', installation: p.installation ?? undefined, status: undefined, kitId: undefined, updatedBy: undefined, createdAt: undefined, updatedAt: undefined })}>Edit</Button> },
        ]} /></section>
      )}
      <Dialog open={!!pe} onClose={() => setPe(null)} title={`Edit plan ${pe?.code.replace(/_/g, ' ')}`}>
        {pe && <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); savePkg.run(); }}>
          <TextInput label="Price (₹, excl. GST)" value={pe.price} onChange={(e) => setPe({ ...pe, price: e.target.value.replace(/\D/g, '') })} />
          <TextInput label="LeadDNA add-on (₹, blank if not offered)" value={pe.leadDnaAddonPrice} onChange={(e) => setPe({ ...pe, leadDnaAddonPrice: e.target.value.replace(/\D/g, '') })} />
          <TextInput label="Max product commission (basis points, ≤ 1000)" value={pe.maxProductCommissionBps} onChange={(e) => setPe({ ...pe, maxProductCommissionBps: e.target.value.replace(/\D/g, '') })} />
          {savePkg.error && <Alert tone="danger">{savePkg.error}</Alert>}<Button type="submit" loading={savePkg.pending}>Save as new version</Button>
        </form>}
      </Dialog>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit product' : 'Add product'}>
        {edit && <form className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          <div className="cz-grid cz-grid-2">
            <TextInput label="SKU" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} error={save.fieldErrors.sku} />
            <Select label="Category" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: PRODUCT_CATEGORY_LABELS[c] }))} />
          </div>
          <TextInput label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={save.fieldErrors.name} />
          <TextInput label="Specification" value={edit.specification} onChange={(e) => setEdit({ ...edit, specification: e.target.value })} error={save.fieldErrors.specification} />
          <div className="cz-grid cz-grid-2">
            <TextInput label="Brand" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />
            <TextInput label="HSN" value={edit.hsn} onChange={(e) => setEdit({ ...edit, hsn: e.target.value })} error={save.fieldErrors.hsn} />
            <Select label="GST" value={edit.gstBps} onChange={(e) => setEdit({ ...edit, gstBps: e.target.value })} options={['0', '500', '1200', '1800', '2800'].map((g) => ({ value: g, label: `${Number(g) / 100}%` }))} />
            <TextInput label="Warranty (months)" value={edit.warrantyMonths} onChange={(e) => setEdit({ ...edit, warrantyMonths: e.target.value.replace(/\D/g, '') })} />
            <TextInput label="MRP (₹)" value={edit.mrp} onChange={(e) => setEdit({ ...edit, mrp: e.target.value.replace(/\D/g, '') })} />
            <TextInput label="Customer price (₹)" value={edit.customerPrice} onChange={(e) => setEdit({ ...edit, customerPrice: e.target.value.replace(/\D/g, '') })} error={save.fieldErrors.customerPrice} />
            <TextInput label="Partner price (₹)" value={edit.partnerPrice} onChange={(e) => setEdit({ ...edit, partnerPrice: e.target.value.replace(/\D/g, '') })} error={save.fieldErrors.partnerPrice} />
            <TextInput label="Commission (bps, ≤ 1000)" value={edit.commissionBps} onChange={(e) => setEdit({ ...edit, commissionBps: e.target.value.replace(/\D/g, '') })} error={save.fieldErrors.commissionBps} />
            <TextInput label="Reorder level" value={edit.reorderLevel} onChange={(e) => setEdit({ ...edit, reorderLevel: e.target.value.replace(/\D/g, '') })} />
          </div>
          {save.error && <Alert tone="danger">{save.error}</Alert>}<Button type="submit" loading={save.pending}>Save product</Button>
        </form>}
      </Dialog>
    </div>
  );
}
