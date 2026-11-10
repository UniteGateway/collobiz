'use client';
import Link from 'next/link';
import { useState } from 'react';
import { GST_RATES, GST_STATE_CODES } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EarningsTabs, inr } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface SrcLine { description: string; qty: number; unit: string; unitPrice: number; isService: boolean }
interface Item { source: 'project_invoice' | 'purchase_order'; id: string; number: string; date: string; buyer: string; buyerProfile: boolean; taxable: number; gstRate?: number; kind: 'services' | 'goods'; description: string; lines: SrcLine[]; einvoice: { id: string; ready: boolean } | null; ewaybill: { id: string; ready: boolean } | null }
interface Sources { profileReady: boolean; einvoiceApplicable: boolean; filing: { connected: boolean; note: string }; items: Item[] }
interface Result { id: string; ready: boolean; issues: { field: string; message: string }[]; totals: { taxable: number; cgst: number; sgst: number; igst: number; total: number; interState: boolean; placeOfSupply: string }; validityDays?: number; belowThreshold?: boolean; filing: { connected: boolean; note: string } }

async function download(id: string, name: string) {
  const json = await api.get(`/gst/documents/${id}/json`);
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

/** GST documents — e-invoice and e-way bill JSON from your COLLABIZ invoices and orders, checked against the portal rules. */
export default function GstDocuments() {
  const q = useQuery<Sources>('/gst/sources');
  const [open, setOpen] = useState<{ item: Item; kind: 'einvoice' | 'ewaybill' } | null>(null);
  const d = q.data;
  return (
    <Screen page={{ key: 'gst-documents', title: 'GST documents', access: 'partner' }} description="Prepare GST e-invoices and e-way bills from your invoices and purchase orders. COLLABIZ checks them against the portals’ rules; you download the JSON and upload it on the government portal.">
      <EarningsTabs />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          {!d.profileReady && <Alert tone="warning" title="Add your tax profile first">Your GSTIN and registered address go on every document. <Link href="/settings/tax">Open tax profile</Link></Alert>}
          <Alert tone="info">{d.filing.connected ? 'Filing is connected.' : <>Direct filing is <strong>not connected</strong> yet — {d.filing.note} The IRN and e-way bill number come only from the government system.</>}</Alert>
          <Card>
            {!d.items.length ? <EmptyState icon="documents" title="No invoices or orders to prepare yet" /> : (
              <ul className="cz-ws-list">{d.items.map((i) => (
                <li key={i.id} data-gst={i.number} style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <span style={{ flex: '1 1 320px' }}><strong>{i.number}</strong> · {i.source === 'project_invoice' ? 'Project invoice (services)' : 'Purchase order (goods)'} · to {i.buyer}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{i.description} · {inr(i.taxable)} before GST · {new Date(i.date).toLocaleDateString('en-IN')}</span></span>
                  <span className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {i.einvoice && <StatusBadge status={i.einvoice.ready ? 'ready' : 'issues'} tone={i.einvoice.ready ? 'success' : 'warning'} label={i.einvoice.ready ? 'E-invoice JSON ready' : 'E-invoice has problems'} />}
                    {i.einvoice?.ready && <Button size="sm" variant="ghost" onClick={() => download(i.einvoice!.id, `einvoice-${i.number}.json`)}>Download</Button>}
                    <Button size="sm" variant="secondary" disabled={!d.profileReady} onClick={() => setOpen({ item: i, kind: 'einvoice' })}>{i.einvoice ? 'Prepare again' : 'Prepare e-invoice'}</Button>
                    {i.kind === 'goods' && <Button size="sm" variant="secondary" disabled={!d.profileReady} onClick={() => setOpen({ item: i, kind: 'ewaybill' })}>{i.ewaybill ? 'E-way bill again' : 'Prepare e-way bill'}</Button>}
                  </span>
                </li>
              ))}</ul>
            )}
          </Card>
          <Prepare target={open} onClose={() => setOpen(null)} onDone={() => q.reload()} />
        </>
      )}
    </Screen>
  );
}

function Prepare({ target, onClose, onDone }: { target: { item: Item; kind: 'einvoice' | 'ewaybill' } | null; onClose: () => void; onDone: () => void }) {
  const item = target?.item;
  const [lines, setLines] = useState<{ hsn: string; gstRate: string; isService: boolean }[]>([]);
  const [buyer, setBuyer] = useState({ address1: '', city: '', pincode: '' });
  const [tr, setTr] = useState({ distanceKm: '', vehicleNo: '', transporterGstin: '' });
  const [res, setRes] = useState<Result | null>(null);
  const [key, setKey] = useState('');
  const k = target ? `${target.item.id}-${target.kind}` : '';
  if (target && key !== k) { setKey(k); setRes(null); setLines(target.item.lines.map((l) => ({ hsn: '', gstRate: String(target.item.gstRate ?? 18), isService: l.isService }))); }
  const go = useMutation(async () => {
    const r = await api.post<Result>('/gst/prepare', {
      kind: target!.kind, source: item!.source, sourceId: item!.id,
      lines: item!.lines.map((l, i) => ({ description: l.description.slice(0, 300), qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, hsn: lines[i]?.hsn ?? '', gstRate: Number(lines[i]?.gstRate ?? 18), isService: lines[i]?.isService ?? l.isService })),
      ...(item!.buyerProfile ? {} : { buyer }),
      ...(target!.kind === 'ewaybill' ? { transport: { mode: 1, distanceKm: Number(tr.distanceKm), ...(tr.vehicleNo ? { vehicleNo: tr.vehicleNo } : {}), ...(tr.transporterGstin ? { transporterGstin: tr.transporterGstin } : {}) } } : {}),
    });
    setRes(r); onDone(); return r;
  });
  return (
    <Dialog open={!!target} onClose={onClose} title={target ? `${target.kind === 'einvoice' ? 'E-invoice' : 'E-way bill'} for ${target.item.number}` : 'GST document'}>
      {item && (
        <div className="cz-stack" style={{ gap: 10 }}>
          {item.lines.map((l, i) => (
            <div key={i} className="cz-stack" style={{ gap: 2, paddingBottom: 6, borderBottom: '1px solid var(--cz-hairline)' }} data-gst-line={i + 1}>
              <strong style={{ fontSize: 14 }}>{l.description}</strong>
              <span className="cz-muted" style={{ fontSize: 13 }}>{l.qty}{l.unit === 'OTH' ? '' : ` ${l.unit}`} × {inr(l.unitPrice)}</span>
              <div className="cz-grid cz-grid-2">
                <TextInput label={l.isService ? 'SAC code' : 'HSN code'} inputMode="numeric" maxLength={8} value={lines[i]?.hsn ?? ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, hsn: e.target.value.replace(/\D/g, '') } : x)))} hint={l.isService ? 'Services start with 99, e.g. 995461' : '4, 6 or 8 digits'} />
                <Select label="GST rate" value={lines[i]?.gstRate ?? '18'} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, gstRate: e.target.value } : x)))} options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))} />
              </div>
            </div>
          ))}
          {!item.buyerProfile && (
            <>
              <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>{item.buyer} has no tax profile on COLLABIZ — give their billing address.</p>
              <TextInput label="Buyer address" value={buyer.address1} onChange={(e) => setBuyer({ ...buyer, address1: e.target.value })} />
              <div className="cz-grid cz-grid-2"><TextInput label="Buyer city" value={buyer.city} onChange={(e) => setBuyer({ ...buyer, city: e.target.value })} /><TextInput label="Buyer PIN code" inputMode="numeric" maxLength={6} value={buyer.pincode} onChange={(e) => setBuyer({ ...buyer, pincode: e.target.value.replace(/\D/g, '') })} /></div>
            </>
          )}
          {target!.kind === 'ewaybill' && (
            <div className="cz-grid cz-grid-2">
              <TextInput label="Distance (km)" inputMode="numeric" value={tr.distanceKm} onChange={(e) => setTr({ ...tr, distanceKm: e.target.value.replace(/\D/g, '') })} />
              <TextInput label="Vehicle number" value={tr.vehicleNo} onChange={(e) => setTr({ ...tr, vehicleNo: e.target.value.toUpperCase() })} hint="Or leave blank and give the transporter’s GSTIN" />
              <TextInput label="Transporter GSTIN (optional)" value={tr.transporterGstin} onChange={(e) => setTr({ ...tr, transporterGstin: e.target.value.toUpperCase() })} />
            </div>
          )}
          {go.error && <Alert tone="danger">{go.error}</Alert>}
          {res && (res.ready ? (
            <Alert tone="success" title="Ready to upload">
              {inr(res.totals.taxable)} + {res.totals.interState ? `IGST ${inr(res.totals.igst)}` : `CGST ${inr(res.totals.cgst)} + SGST ${inr(res.totals.sgst)}`} = <strong>{inr(res.totals.total)}</strong> · place of supply {GST_STATE_CODES[res.totals.placeOfSupply]}
              {res.validityDays ? ` · valid ${res.validityDays} day${res.validityDays > 1 ? 's' : ''}` : ''}{res.belowThreshold ? ' · below ₹50,000, so an e-way bill may not be required' : ''}
            </Alert>
          ) : (
            <Alert tone="warning" title="The portal would reject this">
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{res.issues.map((x, i) => <li key={i} data-gst-issue={x.field}><strong>{x.field}:</strong> {x.message}</li>)}</ul>
            </Alert>
          ))}
          <div className="cz-row" style={{ gap: 8 }}>
            <Button onClick={() => go.run()} loading={go.pending} disabled={lines.some((l) => !l.hsn) || (target!.kind === 'ewaybill' && !tr.distanceKm)}>Check and prepare</Button>
            {res?.ready && <Button variant="secondary" onClick={() => download(res.id, `${target!.kind}-${item.number}.json`)}>Download JSON</Button>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
