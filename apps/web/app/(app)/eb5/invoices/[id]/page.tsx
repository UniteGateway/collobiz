'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ButtonLink, Card, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ReceiptSheet } from '@/components/Eb5Docs';
import { Badge, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type Inv = Parameters<typeof ReceiptSheet>[0]['inv'] & { id: string; ledger: string; isClient: boolean };

/** One invoice: the client reports the transfer, finance verifies cleared funds, then the receipt is issued. */
export default function Eb5Invoice() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<Inv>(`/eb5/invoices/${id}`);
  const [ref, setRef] = useState(''); const [ver, setVer] = useState({ bankReference: '', clearedOn: new Date().toISOString().slice(0, 10) });
  const report = useMutation(async () => { await api.post(`/eb5/invoices/${id}/report-payment`, { reference: ref }); q.reload(); return true; });
  const verify = useMutation(async () => { await api.post(`/eb5/invoices/${id}/verify`, ver); q.reload(); return true; });
  const i = q.data;
  return (
    <Screen page={{ key: 'eb5-invoice', title: i ? `Invoice ${i.number}` : 'Invoice', access: 'authenticated' }} eyebrow="GO EB5 · CITRUS360 LLC"
      actions={i ? <ButtonLink href={`/eb5/invoices/${id}/receipt`} variant="secondary">{i.status === 'verified' ? 'Receipt (A4)' : 'Invoice (A4)'}</ButtonLink> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !i ? <LoadingState /> : <>
        <p>Status <Badge s={i.status} /></p>
        {i.status === 'issued' && i.ledger === 'consultancy' && (i.isClient || has('citrus_admin')) && (
          <Card title="I have paid">
            <Alert tone="info">Pay only through the billing instructions CITRUS360 LLC sends you directly. COLLABIZ never shows bank details and never collects payment.</Alert>
            {report.error && <Alert tone="danger">{report.error}</Alert>}
            <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); report.run(); }}>
              <div style={{ flex: 1, minWidth: 220 }}><TextInput label="Bank transfer reference (SWIFT / UTR)" value={ref} onChange={(e) => setRef(e.target.value)} error={report.fieldErrors.reference} /></div>
              <Button type="submit" loading={report.pending}>Report payment</Button>
            </form>
          </Card>
        )}
        {i.status === 'payment_reported' && has('finance') && (
          <Card title="Verify cleared funds">
            <p style={{ marginTop: 0 }}>Reported reference: <strong>{i.paymentReference}</strong>. Confirm against the CITRUS360 LLC bank account before verifying.</p>
            {verify.error && <Alert tone="danger">{verify.error}</Alert>}
            <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); verify.run(); }}>
              <div style={{ flex: 1, minWidth: 200 }}><TextInput label="Bank statement reference" value={ver.bankReference} onChange={(e) => setVer({ ...ver, bankReference: e.target.value })} /></div>
              <div style={{ minWidth: 160 }}><TextInput label="Cleared on" type="date" value={ver.clearedOn} onChange={(e) => setVer({ ...ver, clearedOn: e.target.value })} /></div>
              <Button type="submit" loading={verify.pending}>Verify and issue receipt</Button>
            </form>
          </Card>
        )}
        {i.status === 'payment_reported' && !has('finance') && <Alert tone="info">Payment reported — waiting for finance to confirm cleared funds.</Alert>}
        <div className="cz-mt"><ReceiptSheet inv={i} /></div>
      </>}
    </Screen>
  );
}
