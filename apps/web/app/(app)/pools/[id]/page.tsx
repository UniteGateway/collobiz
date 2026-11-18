'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, DescriptionList, Skeleton, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Meter, POOL_STATUS, addDays, dt, num, rs, toNum, type Pool } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Quote { id: string; supplier: string; unitPriceRs: number; minQty: number; validUntil: string; terms: string; applies: boolean; expired: boolean }
interface Detail extends Pool { quotes: Quote[]; quoteCount: number; canQuote: boolean; myQuote: (Quote & { acceptedBuyers: { org: string; qty: number; at: string }[] }) | null }

export default function PoolDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Detail>(`/pools/${id}`);
  const [qty, setQty] = useState('');
  const [qf, setQf] = useState({ unitPriceRs: '', minQty: '', validUntil: addDays(14), terms: '' });
  const act = useMutation(async (path: string, b: object = {}) => { await api.post(`/pools/${id}/${path}`, b); q.reload(); return true; });
  const p = q.data;
  const joinable = p?.status === 'open';
  return (
    <Screen page={{ key: 'pools-detail', title: p?.title ?? 'Demand pool', access: 'partner' }} eyebrow={p ? `${p.code} · ${POOL_STATUS[p.status] ?? p.status}` : 'Demand pools'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <Skeleton height={300} /> : <>
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        <div className="cz-grid cz-grid-2">
          <Card title="Specification">
            <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{p.spec}</p>
            <DescriptionList items={[['Delivery state', p.stateName], ['Joining closes', dt(p.joinBy)], ['Needed by', dt(p.neededBy)], ['Buyers', String(p.buyers)]]} />
          </Card>
          <Card title="Combined demand">
            <p style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 700 }}>{num(p.committed)} <span style={{ fontSize: 15, fontWeight: 500 }} className="cz-muted">of {num(p.targetQty)} {p.unit}</span></p>
            <Meter value={p.committed} max={p.targetQty} label="Committed against target" />
            <p className="cz-muted" style={{ fontSize: 13 }}>Suppliers see only this total — never who the buyers are.</p>
            {p.myQty != null ? <>
              <p>You: <strong>{num(p.myQty)} {p.unit}</strong>{p.myAcceptedQuoteId ? ' · quote accepted' : ''}</p>
              {!p.myAcceptedQuoteId && joinable && <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); act.run('join', { qty: toNum(qty) }); setQty(''); }}>
                <div style={{ flex: 1, minWidth: 160 }}><TextInput label={`Change my quantity (${p.unit})`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={act.fieldErrors.qty} /></div>
                <Button type="submit" variant="secondary">Update</Button>{!p.isStarter && <Button type="button" variant="ghost" onClick={() => act.run('leave')}>Leave pool</Button>}</form>}
            </> : joinable && !p.myQuote && (
              <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); act.run('join', { qty: toNum(qty) }); setQty(''); }}>
                <div style={{ flex: 1, minWidth: 160 }}><TextInput label={`My quantity (${p.unit})`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={act.fieldErrors.qty} /></div>
                <Button type="submit">Join the pool</Button></form>
            )}
          </Card>
        </div>

        {p.myQty != null && (
          <Card title={`Quotes (${p.quotes.length})`} className="cz-mt">
            <DataTable rows={p.quotes} caption="Supplier quotes" empty={<p className="cz-muted">No quotes yet. Suppliers are notified as the pool grows.</p>} columns={[
              { key: 's', header: 'Supplier', render: (x) => x.supplier }, { key: 'p', header: 'Price', render: (x) => <strong>{rs(x.unitPriceRs)} / {p.unit}</strong> },
              { key: 'm', header: 'Needs pool of', render: (x) => `${num(x.minQty)} ${p.unit}` }, { key: 'v', header: 'Valid until', render: (x) => dt(x.validUntil) }, { key: 't', header: 'Terms', render: (x) => x.terms },
              { key: 'a', header: '', render: (x) => p.myAcceptedQuoteId === x.id ? <StatusBadge status="accepted" label="You accepted" /> : p.myAcceptedQuoteId ? null : x.expired ? <span className="cz-muted">Expired</span>
                : x.applies ? <Button size="sm" onClick={() => act.run(`quotes/${x.id}/accept`)}>Accept for my {num(p.myQty)} {p.unit}</Button> : <span className="cz-muted">Pool below minimum</span> },
            ]} />
          </Card>
        )}

        {p.myQuote && (
          <Card title="Your quote" className="cz-mt">
            <p style={{ marginTop: 0 }}>{rs(p.myQuote.unitPriceRs)} / {p.unit} from {num(p.myQuote.minQty)} {p.unit} · valid until {dt(p.myQuote.validUntil)} · {p.myQuote.applies ? 'the pool has reached your minimum' : 'the pool is below your minimum'}</p>
            <h3 style={{ fontSize: 15 }}>Buyers who accepted ({p.myQuote.acceptedBuyers.length})</h3>
            {p.myQuote.acceptedBuyers.length ? <ul className="cz-ws-list">{p.myQuote.acceptedBuyers.map((b) => <li key={b.org}><span>{b.org}</span><span>{num(b.qty)} {p.unit} · {dt(b.at)}</span></li>)}</ul>
              : <p className="cz-muted">None yet. You learn a buyer’s name only when it accepts your quote; then contract and invoice it directly.</p>}
          </Card>
        )}

        {p.canQuote && (
          <Card title={`Quote as a supplier${p.quoteCount ? ` · ${p.quoteCount} quote${p.quoteCount > 1 ? 's' : ''} so far` : ''}`} className="cz-mt">
            <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); act.run('quotes', { unitPriceRs: toNum(qf.unitPriceRs), minQty: toNum(qf.minQty), validUntil: qf.validUntil, terms: qf.terms }); }}>
              <div className="cz-grid cz-grid-2">
                <TextInput label={`Price per ${p.unit.replace(/s$/, '')} (₹)`} inputMode="decimal" value={qf.unitPriceRs} onChange={(e) => setQf({ ...qf, unitPriceRs: e.target.value })} error={act.fieldErrors.unitPriceRs} />
                <TextInput label={`Applies when the pool reaches (${p.unit})`} inputMode="decimal" value={qf.minQty} onChange={(e) => setQf({ ...qf, minQty: e.target.value })} error={act.fieldErrors.minQty} />
                <TextInput label="Valid until" type="date" value={qf.validUntil} onChange={(e) => setQf({ ...qf, validUntil: e.target.value })} error={act.fieldErrors.validUntil} />
              </div>
              <TextArea label="Terms (delivery, payment, warranty)" rows={3} value={qf.terms} onChange={(e) => setQf({ ...qf, terms: e.target.value })} error={act.fieldErrors.terms} />
              <div><Button type="submit" loading={act.pending}>Send quote</Button></div>
            </form>
          </Card>
        )}
        {p.demo && <p className="cz-muted" style={{ fontSize: 12 }}>Demo — sample data for testing.</p>}
      </>}
    </Screen>
  );
}
