'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Grid, LoadingState, Select, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { inDays, inr, TradingTabs } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

export default function NewPoPage() {
  return <Suspense fallback={<LoadingState />}><NewPo /></Suspense>;
}

/** Screen 090 — Purchase Order Creation (from a quotation, or direct to a verified supplier). */
function NewPo() {
  const params = useSearchParams();
  const router = useRouter();
  const quotationId = params.get('quotation');
  const suppliers = useQuery<any[]>(quotationId ? null : '/trading/suppliers');
  const [f, setF] = useState({ supplierOrgId: '', deliveryAddress: '', deliveryBy: inDays(14), paymentTerms: '30 days from delivery' });
  const [lines, setLines] = useState([{ item: '', quantity: '', unit: 'nos', unitPrice: '' }]);
  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const m = useMutation(async () => {
    const po = await api.post<any>('/trading/purchase-orders', { ...f, quotationId: quotationId ?? undefined, supplierOrgId: quotationId ? undefined : f.supplierOrgId, lines: quotationId ? undefined : lines.filter((l) => l.item).map((l) => ({ item: l.item, quantity: Number(l.quantity) || 0, unit: l.unit, unitPrice: toMinor(l.unitPrice) ?? 0 })) });
    router.push(`/trading/orders?id=${po.id}`);
    return po;
  });
  return (
    <Screen id="090" description="The order is created as a draft. Once you issue it, its lines, totals and parties are locked and every change is recorded in the order history.">
      <TradingTabs />
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {quotationId ? <Alert tone="info">Lines, prices and tax come from the selected quotation; the other quotations for the requirement will be declined.</Alert> : (
        <Card title="Supplier and lines">
          <Select label="Supplier" value={f.supplierOrgId} onChange={(e) => setF({ ...f, supplierOrgId: e.target.value })} placeholder="Choose a verified supplier" options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} error={m.fieldErrors.supplierOrgId} />
          {lines.map((l, ix) => (
            <div key={ix} className="cz-row" style={{ alignItems: 'flex-end' }}>
              <TextInput label={`Line ${ix + 1} item`} value={l.item} onChange={(e) => setLines(lines.map((x, j) => (j === ix ? { ...x, item: e.target.value } : x)))} />
              <TextInput label={`Line ${ix + 1} quantity`} inputMode="decimal" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === ix ? { ...x, quantity: e.target.value } : x)))} />
              <TextInput label={`Line ${ix + 1} unit`} value={l.unit} onChange={(e) => setLines(lines.map((x, j) => (j === ix ? { ...x, unit: e.target.value } : x)))} />
              <TextInput label={`Line ${ix + 1} unit price (₹)`} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === ix ? { ...x, unitPrice: e.target.value } : x)))} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLines([...lines, { item: '', quantity: '', unit: 'nos', unitPrice: '' }])}>Add line</Button>
          <p>Subtotal: <strong>{inr(Math.round(total * 100))}</strong> + 18% GST</p>
        </Card>
      )}
      <Card title="Delivery and payment">
        <Grid cols={2}>
          <TextInput label="Delivery address" value={f.deliveryAddress} onChange={(e) => setF({ ...f, deliveryAddress: e.target.value })} error={m.fieldErrors.deliveryAddress} />
          <TextInput label="Deliver by" type="date" value={f.deliveryBy} onChange={(e) => setF({ ...f, deliveryBy: e.target.value })} error={m.fieldErrors.deliveryBy} />
          <TextInput label="Payment terms" value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} />
        </Grid>
        <Button onClick={() => m.run()} loading={m.pending}>Create draft order</Button>
      </Card>
    </Screen>
  );
}
