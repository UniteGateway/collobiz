'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, ButtonLink, Card, DataTable, EmptyState, Grid, LoadingState, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inDays, inr, TradingTabs, when } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

export default function QuotationsPage() {
  return <Suspense fallback={<LoadingState />}><Quotations /></Suspense>;
}

/** Screen 089 — Supplier Quotation Comparison (buyer) and quotation submission (supplier). */
function Quotations() {
  const params = useSearchParams();
  const [reqId, setReqId] = useState<string | null>(params.get('requirement'));
  const mine = useQuery<any[]>('/trading/requirements');
  const myQuotes = useQuery<any[]>('/trading/quotations');
  const req = useQuery<any>(reqId ? `/trading/requirements/${reqId}` : null);
  const cmp = useQuery<any>(req.data?.side === 'buyer' ? `/trading/requirements/${reqId}/quotations` : null);
  const [lines, setLines] = useState<any[]>([]);
  const [meta, setMeta] = useState({ deliveryDays: '7', validUntil: inDays(20), terms: '' });
  useEffect(() => { if (req.data?.side === 'supplier') setLines(req.data.items.map((i: any) => ({ item: i.item, quantity: String(i.quantity), unit: i.unit, unitPrice: '' }))); }, [req.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = useMutation(async () => { await api.post('/trading/quotations', { requirementId: reqId, lines: lines.map((l) => ({ item: l.item, quantity: Number(l.quantity) || 0, unit: l.unit, unitPrice: toMinor(l.unitPrice) ?? 0 })), deliveryDays: Number(meta.deliveryDays) || 0, validUntil: meta.validUntil, terms: meta.terms || undefined }); req.reload(); myQuotes.reload(); return true; });
  const withdraw = useMutation(async (id: string) => { await api.post(`/trading/quotations/${id}/withdraw`); req.reload(); myQuotes.reload(); return true; });
  const r = req.data;
  const activeMine = r?.myQuotations?.find((q: any) => q.status === 'submitted');
  return (
    <Screen id="089">
      <TradingTabs />
      {r && (
        <Card title={`${r.code} — ${r.title}`} actions={<StatusBadge status={r.status} />}>
          <p className="cz-muted">{r.buyer} · deliver to {r.deliveryLocation} · closes {when(r.closesAt)}</p>
          {r.side === 'buyer' ? (cmp.loading ? <LoadingState /> : cmp.error ? <ApiErrorView error={cmp.error} onRetry={cmp.reload} /> : (
            <>
              <DataTable caption="Quotation comparison" rows={cmp.data.quotations} empty={<EmptyState title="No quotations yet" />} columns={[
                { key: 'rank', header: '#' },
                { key: 'supplier', header: 'Supplier', render: (q: any) => <>{q.supplier}<div className="cz-muted" style={{ fontSize: 12 }}>{q.code} · {q.supplierLevel}</div></> },
                { key: 'lines', header: 'Unit prices', render: (q: any) => q.lines.map((l: any) => <div key={l.item}>{l.item}: <strong style={l.best ? { color: 'var(--cz-green-800)' } : undefined}>{inr(l.unitPrice)}</strong>{l.best ? ' (best)' : ''}</div>) },
                { key: 'total', header: 'Total incl. tax', render: (q: any) => <>{inr(q.total)}{q.lowest && <> <StatusBadge status="lowest" tone="success" label="Lowest" /></>}</> },
                { key: 'deliveryDays', header: 'Delivery', render: (q: any) => <>{q.deliveryDays} days{q.fastest && <> <StatusBadge status="fastest" tone="success" label="Fastest" /></>}</> },
                { key: 'validUntil', header: 'Valid until', render: (q: any) => <>{when(q.validUntil)}{q.expired && <> <StatusBadge status="expired" tone="danger" /></>}</> },
                { key: 'status', header: 'Status', render: (q: any) => <StatusBadge status={q.status} /> },
                { key: 'po', header: 'Order', render: (q: any) => (q.status === 'submitted' && !q.expired && r.status === 'open' ? <ButtonLink href={`/trading/po/new?quotation=${q.id}`} size="sm">Create PO</ButtonLink> : null) },
              ]} />
              <p className="cz-muted" style={{ fontSize: 13 }}>Suppliers never see each other’s prices. Choosing a quotation rejects the others and marks the requirement awarded.</p>
            </>
          )) : (
            <>
              <DataTable caption="Requested items" rows={r.items.map((i: any, ix: number) => ({ ...i, id: String(ix) }))} columns={[{ key: 'item', header: 'Item' }, { key: 'spec', header: 'Specification', render: (i: any) => i.spec ?? '—' }, { key: 'quantity', header: 'Quantity', render: (i: any) => `${i.quantity} ${i.unit}` }]} />
              {submit.error && <Alert tone="danger">{submit.error}</Alert>}
              {activeMine ? (
                <Alert tone="success" title={`Your quotation ${activeMine.code}`}>Total {inr(activeMine.total)} · {activeMine.deliveryDays} days · valid until {when(activeMine.validUntil)} <Button size="sm" variant="ghost" onClick={() => withdraw.run(activeMine.id)}>Withdraw</Button></Alert>
              ) : r.open && (
                <section aria-label="Submit quotation">
                  {lines.map((l, ix) => <TextInput key={l.item} label={`Unit price for ${l.item} (₹ per ${l.unit})`} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === ix ? { ...x, unitPrice: e.target.value } : x)))} />)}
                  <Grid cols={2}>
                    <TextInput label="Delivery (days)" inputMode="numeric" value={meta.deliveryDays} onChange={(e) => setMeta({ ...meta, deliveryDays: e.target.value })} />
                    <TextInput label="Valid until" type="date" value={meta.validUntil} onChange={(e) => setMeta({ ...meta, validUntil: e.target.value })} />
                  </Grid>
                  <TextArea label="Terms (optional)" rows={2} value={meta.terms} onChange={(e) => setMeta({ ...meta, terms: e.target.value })} />
                  <Button onClick={() => submit.run()} loading={submit.pending}>Submit quotation</Button>
                </section>
              )}
            </>
          )}
        </Card>
      )}
      <Card title="My requirements (as buyer)" actions={<ButtonLink href="/trading/requirements/new" size="sm" variant="secondary">Post a requirement</ButtonLink>}>
        <DataTable caption="My requirements" rows={mine.data ?? []} empty={<EmptyState title="No requirements posted" />} columns={[
          { key: 'title', header: 'Requirement', render: (x: any) => <><Button size="sm" variant="ghost" onClick={() => setReqId(x.id)} aria-label={`Compare ${x.code}`}>{x.title}</Button><div className="cz-mono cz-muted">{x.code}</div></> },
          { key: 'quotes', header: 'Quotations' }, { key: 'closesAt', header: 'Closes', render: (x: any) => when(x.closesAt) }, { key: 'status', header: 'Status', render: (x: any) => <StatusBadge status={x.status} /> },
        ]} />
      </Card>
      {(myQuotes.data ?? []).length > 0 && (
        <Card title="My quotations (as supplier)">
          <DataTable caption="My quotations" rows={myQuotes.data ?? []} columns={[
            { key: 'code', header: 'Quotation', render: (q: any) => <span className="cz-mono">{q.code}</span> },
            { key: 'buyer', header: 'Buyer' }, { key: 'requirement', header: 'For', render: (q: any) => (q.requirementId ? <Link href={`/trading/quotations?requirement=${q.requirementId}`} onClick={() => setReqId(q.requirementId)}>{q.requirement}</Link> : 'Enquiry') },
            { key: 'total', header: 'Total', render: (q: any) => inr(q.total) }, { key: 'status', header: 'Status', render: (q: any) => <StatusBadge status={q.status} /> },
          ]} />
        </Card>
      )}
    </Screen>
  );
}
