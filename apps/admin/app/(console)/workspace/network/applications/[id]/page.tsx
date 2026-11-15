'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, ButtonLink, DataTable, DescriptionList, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE, inr, pct } from '@/components/Network';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;

/** One application end to end: review → agreement → payment verification → stock allocation → activation. */
export default function Application() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<{ application: R; dashboard: R; allocations: R[] }>(`/admin/network/applications/${id}`);
  const products = useQuery<{ products: R[] }>('/network/products');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ productId: string; qty: string; serials: string }[]>([{ productId: '', qty: '1', serials: '' }]);
  const done = () => { setNote(''); q.reload(); };
  const decide = useMutation(async (decision: string) => { await api.post(`/admin/network/applications/${id}/decision`, { decision, note: note || undefined }); done(); });
  const verify = useMutation(async (decision: string) => { await api.post(`/admin/network/units/${id}/payment`, { decision, note: note || undefined }, true); done(); });
  const activate = useMutation(async () => { await api.post(`/admin/network/units/${id}/activate`); done(); });
  const allocate = useMutation(async () => { await api.post(`/admin/network/units/${id}/allocations`, { lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: Number(l.qty), serials: l.serials.trim() ? l.serials.split(/[\s,]+/).filter(Boolean) : undefined })) }, true); setLines([{ productId: '', qty: '1', serials: '' }]); q.reload(); });
  const grant = useMutation(async () => { await api.post('/admin/network/entitlements', { orgId: q.data!.application.franchiseeOrgId, product: 'leaddna', note: note || 'Granted by Unite' }); done(); });
  if (q.error) return <div className="cz-ws"><WorkspaceNav /><ApiErrorView error={q.error} onRetry={q.reload} /></div>;
  if (!q.data) return <div className="cz-ws"><WorkspaceNav /><LoadingState /></div>;
  const { application: a, dashboard: d, allocations } = q.data;
  const pkg = d.package;
  const err = decide.error ?? verify.error ?? activate.error ?? allocate.error ?? grant.error;
  const value = lines.reduce((s, l) => s + (products.data?.products.find((p) => p.id === l.productId)?.partnerPrice ?? 0) * Number(l.qty || 0), 0);
  const allocated = allocations.filter((x) => x.status !== 'cancelled').reduce((s, x) => s + Number(x.value), 0);
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 4px' }}>{a.partner ?? d.unit.code}</h1>
      <p className="cz-muted" style={{ marginTop: 0 }}>{pkg.name} · {d.unit.code} · {d.unit.city}, {d.unit.district}, {d.unit.state}</p>
      <NetworkTabs />
      <div className="cz-stack" style={{ gap: 16 }}>
        <section className="cz-card" aria-label="Progress">
          <ol className="cz-us-steps">{d.steps.map((s: R) => <li key={s.key} data-done={s.done || undefined}>{s.done ? '✓' : '○'} {s.label}</li>)}</ol>
          <DescriptionList items={[
            ['Status', <StatusBadge key="s" status={d.unit.status} tone={TONE[d.unit.status]} label={d.unit.statusLabel} />], ['Plan', `${pkg.name} (v${d.unit.pricing.packageVersion})${d.unit.leadDnaAddon ? ' + LeadDNA add-on' : ''}`],
            ['Price', `${inr(d.unit.pricing.subtotal)} + GST ${inr(d.unit.pricing.gst)} = ${inr(d.unit.pricing.total)}`], ['Territory', d.territory ? `${d.territory.name} (${d.territory.level}) — ${d.territory.status}` : d.unit.territory],
            ['Business verified', a.verified ? 'Yes' : 'No'], ['About', a.message], ['Payment', <span key="p"><StatusBadge status={d.unit.paymentStatus} tone={TONE[d.unit.paymentStatus]} label={d.unit.paymentStatus} /> {d.unit.paymentReference ?? ''}</span>],
            ['LeadDNA', d.leadDna.entitled ? `Entitled (${d.leadDna.source})` : `Not entitled — ${d.leadDna.offered}`], ['Commission cap', pct(pkg.maxProductCommissionBps)],
          ]} />
        </section>
        <section className="cz-card" aria-label="Actions">
          <h2 style={{ marginTop: 0, fontSize: 17 }}>Actions</h2>
          <TextArea label="Note to the partner (required to return or reject)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {d.unit.status === 'applied' && <><Button onClick={() => decide.run('approve')} loading={decide.pending}>Approve{pkg.exclusive ? ' and reserve territory' : ''}</Button><Button variant="secondary" onClick={() => decide.run('return')}>Return for changes</Button><Button variant="danger" onClick={() => decide.run('reject')}>Reject</Button></>}
            {d.unit.status === 'approved' && <ButtonLink variant="secondary" href={`/workspace/franchise/${id}`}>Draft the agreement (Franchise Management)</ButtonLink>}
            {d.unit.paymentStatus === 'submitted' && <><Button onClick={() => verify.run('verify')} loading={verify.pending}>Verify payment (finance)</Button><Button variant="secondary" onClick={() => verify.run('reject')}>Payment not received</Button></>}
            {['approved', 'agreement_signed', 'setup'].includes(d.unit.status) && <Button onClick={() => activate.run()} loading={activate.pending}>Activate partnership</Button>}
            {!d.leadDna.entitled && d.unit.status === 'live' && <Button variant="ghost" onClick={() => grant.run()}>Grant LeadDNA (admin)</Button>}
          </div>
          {err && <Alert tone="danger">{err}</Alert>}
          <p className="cz-muted" style={{ fontSize: 12.5 }}>Activation needs the agreement signed by both parties, the payment verified by finance{pkg.inventoryEnabled ? ', and the store’s confirmation that its opening stock arrived' : ''}.</p>
        </section>
        {pkg.inventoryEnabled && (
          <section className="cz-card" aria-label="Opening stock">
            <h2 style={{ marginTop: 0, fontSize: 17 }}>Opening stock — {inr(allocated)} of {inr(pkg.stockAllocation)} allocated</h2>
            <DataTable caption="Allocations" rows={allocations} columns={[
              { key: 'n', header: 'Allocation', render: (x: R) => <>{x.number}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{x.invoiceNumber}</span></> }, { key: 'v', header: 'Value', render: (x: R) => `${inr(x.value)} + GST ${inr(x.gst)}` },
              { key: 'l', header: 'Items', render: (x: R) => x.lines.map((l: R) => `${l.qty} × ${l.sku}`).join(', ') }, { key: 's', header: 'Status', render: (x: R) => <StatusBadge status={x.status} tone={TONE[x.status]} label={x.status} /> },
            ]} />
            {d.unit.paymentStatus === 'verified' && allocated < pkg.stockAllocation && (
              <form className="cz-stack" style={{ gap: 8, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); allocate.run(); }}>
                {lines.map((l, i) => (
                  <div key={i} className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 280 }}><Select label="Product" value={l.productId} placeholder="Choose" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))} options={(products.data?.products ?? []).map((p) => ({ value: p.id, label: `${p.name} — ${inr(p.partnerPrice)}${p.serialised ? ' (serials)' : ''}` }))} /></div>
                    <div style={{ width: 80 }}><TextInput label="Qty" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} /></div>
                    <div style={{ flex: 1, minWidth: 200 }}><TextInput label="Serial numbers (if tracked)" value={l.serials} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, serials: e.target.value } : x)))} /></div>
                  </div>
                ))}
                <div className="cz-row" style={{ gap: 8 }}><Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { productId: '', qty: '1', serials: '' }])}>Add line</Button>
                  <Button type="submit" loading={allocate.pending}>Dispatch {inr(value)} at partner price</Button></div>
              </form>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
