'use client';
import { useMemo, useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, DataTable, EmptyState, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EarningsTabs, inr } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 099 — Invoice / Payout Request (approved commission only, against your own tax invoice number). */
export default function PayoutRequest() {
  const q = useQuery<any>('/earnings');
  const [pick, setPick] = useState<string[]>([]);
  const [inv, setInv] = useState('');
  const key = useMemo(newIdempotencyKey, [pick.join(','), inv]);
  const req = useMutation(async () => { const p = await api.request<any>('POST', '/payouts', { entryIds: pick, partnerInvoiceNo: inv }, { idempotencyKey: key }); setPick([]); setInv(''); q.reload(); return p; });
  const ready = (q.data?.lines ?? []).filter((l: any) => l.status === 'approved' && !l.payoutId);
  const sel = ready.filter((l: any) => pick.includes(l.id));
  const sum = (k: string) => sel.reduce((s: number, l: any) => s + l[k], 0);
  return (
    <Screen id="099" description="Only commission that is earned and approved by finance can be requested. Raise your own tax invoice for the taxable value and enter its number here.">
      <EarningsTabs />
      {req.error && <Alert tone="danger">{req.error}</Alert>}
      {req.data && <Alert tone="success">Payout {req.data.code} requested for {inr(req.data.payable)}. Track it under Payments.</Alert>}
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <Card title="Approved commission">
          <DataTable caption="Approved commission" rows={ready} empty={<EmptyState title="Nothing ready to request">Commission becomes requestable after the customer pays and finance approves.</EmptyState>} columns={[
            { key: 'pick', header: 'Include', render: (l: any) => <Checkbox label={`Include ${l.description}`} checked={pick.includes(l.id)} onChange={(e) => setPick(e.target.checked ? [...pick, l.id] : pick.filter((x) => x !== l.id))} /> },
            { key: 'description', header: 'Line', render: (l: any) => <>{l.description}<div className="cz-muted" style={{ fontSize: 12 }}>{l.project}</div></> },
            { key: 'taxable', header: 'Taxable', render: (l: any) => inr(l.taxable) }, { key: 'gst', header: 'GST', render: (l: any) => inr(l.gst) }, { key: 'tds', header: 'TDS', render: (l: any) => inr(l.tds) }, { key: 'payable', header: 'Net', render: (l: any) => inr(l.payable) },
          ]} />
          {sel.length > 0 && <p>Invoice value: <strong>{inr(sum('taxable') + sum('gst'))}</strong> (taxable {inr(sum('taxable'))} + GST {inr(sum('gst'))}) · TDS withheld {inr(sum('tds'))} · you receive <strong>{inr(sum('payable'))}</strong></p>}
          <TextInput label="Your invoice number" value={inv} onChange={(e) => setInv(e.target.value)} error={req.fieldErrors.partnerInvoiceNo} />
          <Button onClick={() => req.run()} disabled={!pick.length || inv.trim().length < 3} loading={req.pending}>Request payout</Button>
        </Card>
      )}
    </Screen>
  );
}
