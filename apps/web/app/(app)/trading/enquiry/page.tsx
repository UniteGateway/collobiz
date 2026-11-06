'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Card, DataTable, EmptyState, Grid, LoadingState, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { inDays, inr, TradingTabs, when } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

export default function EnquiryPage() {
  return <Suspense fallback={<LoadingState />}><EnquiryDesk /></Suspense>;
}

/** Screen 088 — Product Enquiry & Price Request desk (sent and received, threaded, with quotations). */
function EnquiryDesk() {
  const params = useSearchParams();
  const product = params.get('product');
  const catalog = params.get('catalog');
  const list = useQuery<any[]>('/trading/enquiries');
  const [sel, setSel] = useState<string | null>(params.get('id'));
  const th = useQuery<any>(sel ? `/trading/enquiries/${sel}` : null);
  const [f, setF] = useState({ quantity: '', message: '' });
  const [reply, setReply] = useState('');
  const [quote, setQuote] = useState({ item: '', quantity: '', unit: 'nos', unitPrice: '', deliveryDays: '7', validUntil: inDays(15) });
  useEffect(() => { if (th.data && !quote.item) setQuote((q) => ({ ...q, item: th.data.subject })); }, [th.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useMutation(async () => { const e = await api.post<any>('/trading/enquiries', { supplierProductId: product ?? undefined, catalogItemId: catalog ?? undefined, quantity: f.quantity, message: f.message }); list.reload(); setSel(e.id); return e; });
  const post = useMutation(async () => { await api.post(`/trading/enquiries/${sel}/messages`, { body: reply }); setReply(''); th.reload(); return true; });
  const quoteM = useMutation(async () => { await api.post('/trading/quotations', { enquiryId: sel, lines: [{ item: quote.item, quantity: Number(quote.quantity) || 0, unit: quote.unit, unitPrice: toMinor(quote.unitPrice) ?? 0 }], deliveryDays: Number(quote.deliveryDays) || 0, validUntil: quote.validUntil }); th.reload(); list.reload(); return true; });
  return (
    <Screen id="088">
      <TradingTabs />
      {(product || catalog) && !send.data && (
        <Card title="New enquiry">
          {send.error && <Alert tone="danger">{send.error}</Alert>}
          <TextInput label="Quantity" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} error={send.fieldErrors.quantity} />
          <TextArea label="Message to the supplier" rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={send.fieldErrors.message} />
          <Button onClick={() => send.run()} loading={send.pending}>Send enquiry</Button>
        </Card>
      )}
      {send.data?.routedToDistributor && <Alert tone="info">Your enquiry was routed to the supplier’s authorised distributor for your region.</Alert>}
      <Card title="Enquiries">
        {list.loading ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : (
          <DataTable caption="Enquiries" rows={list.data ?? []} empty={<EmptyState title="No enquiries yet" />} columns={[
            { key: 'subject', header: 'Enquiry', render: (e: any) => <><Button size="sm" variant="ghost" onClick={() => setSel(e.id)} aria-label={`Open ${e.code}`}>{e.subject}</Button><div className="cz-mono cz-muted">{e.code}</div></> },
            { key: 'direction', header: 'Direction', render: (e: any) => <StatusBadge status={e.direction} tone="brand" /> },
            { key: 'party', header: 'With', render: (e: any) => <>{e.direction === 'sent' ? e.supplier : e.buyer}{e.intendedSupplier && <div className="cz-muted" style={{ fontSize: 12 }}>authorised distributor for {e.intendedSupplier}</div>}</> },
            { key: 'quantity', header: 'Quantity' }, { key: 'status', header: 'Status', render: (e: any) => <StatusBadge status={e.status} /> },
            { key: 'updatedAt', header: 'Updated', render: (e: any) => when(e.updatedAt) },
          ]} />
        )}
      </Card>
      {sel && (th.loading ? <LoadingState /> : th.error ? <ApiErrorView error={th.error} onRetry={th.reload} /> : th.data && (
        <Card title={`${th.data.code} — ${th.data.subject}`} actions={<StatusBadge status={th.data.status} />}>
          <ol className="cz-thread" aria-label="Enquiry messages">
            {th.data.messages.map((m: any) => <li key={m.id} data-mine={m.mine}><div className="cz-muted" style={{ fontSize: 12 }}>{m.org} · {m.author} · {when(m.createdAt)}</div><p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{m.body}</p></li>)}
          </ol>
          {th.data.quotations.map((q: any) => <Alert key={q.id} tone="success" title={`Quotation ${q.code}`}>{q.lines.map((l: any) => `${l.item} × ${l.quantity} ${l.unit} @ ${inr(l.unitPrice)}`).join('; ')} · total {inr(q.total)} incl. {q.taxPct}% tax · {q.deliveryDays} days · valid until {when(q.validUntil)} · <StatusBadge status={q.status} />{th.data.side === 'buyer' && q.status === 'submitted' && <> · <a href={`/trading/po/new?quotation=${q.id}`}>Create purchase order</a></>}</Alert>)}
          {th.data.status !== 'closed' && (
            <>
              {post.error && <Alert tone="danger">{post.error}</Alert>}
              <TextArea label="Reply" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button variant="secondary" onClick={() => post.run()} disabled={reply.trim().length < 2} loading={post.pending}>Send reply</Button>
            </>
          )}
          {th.data.side === 'supplier' && th.data.status !== 'closed' && (
            <section aria-label="Send quotation" style={{ marginTop: 16 }}>
              <h3>Send a quotation</h3>
              {quoteM.error && <Alert tone="danger">{quoteM.error}</Alert>}
              <Grid cols={3}>
                <TextInput label="Item" value={quote.item} onChange={(e) => setQuote({ ...quote, item: e.target.value })} />
                <TextInput label="Quantity" inputMode="decimal" value={quote.quantity} onChange={(e) => setQuote({ ...quote, quantity: e.target.value })} />
                <TextInput label="Unit" value={quote.unit} onChange={(e) => setQuote({ ...quote, unit: e.target.value })} />
                <TextInput label="Unit price (₹)" inputMode="decimal" value={quote.unitPrice} onChange={(e) => setQuote({ ...quote, unitPrice: e.target.value })} />
                <TextInput label="Delivery (days)" inputMode="numeric" value={quote.deliveryDays} onChange={(e) => setQuote({ ...quote, deliveryDays: e.target.value })} />
                <TextInput label="Valid until" type="date" value={quote.validUntil} onChange={(e) => setQuote({ ...quote, validUntil: e.target.value })} />
              </Grid>
              <Button onClick={() => quoteM.run()} loading={quoteM.pending}>Send quotation</Button>
            </section>
          )}
        </Card>
      ))}
    </Screen>
  );
}
