'use client';
import { useState } from 'react';
import { Alert, Button, Card, Select, Skeleton, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Ctx { stores: string[]; products: { ref: string; name: string; price: number; sector: string }[] }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Store counter: redeem a customer's BOGO voucher against a bill (Unite store staff and live franchise stores). */
export default function RedeemVoucher() {
  const q = useQuery<Ctx>('/store/redeem');
  const [f, setF] = useState({ code: '', phone: '', store: '', itemRef: '', billNo: '' });
  const [ok, setOk] = useState<string | null>(null);
  const redeem = useMutation(async () => {
    const r = await api.post<{ message: string }>('/store/vouchers/redeem', { ...f, store: f.store || q.data!.stores[0] });
    setOk(r.message); setF({ code: '', phone: '', store: f.store, itemRef: '', billNo: '' }); return r;
  });
  const e = redeem.fieldErrors;
  return (
    <Screen page={{ key: 'store-redeem', title: 'Redeem a store voucher', access: 'authenticated' }} description="When a customer shows a COLLABIZ offer voucher, check it here before giving the free item. Each voucher works once.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={260} /> : (
        <Card>
          <form className="cz-stack" style={{ gap: 4, maxWidth: 560 }} onSubmit={(ev) => { ev.preventDefault(); setOk(null); redeem.run(); }} noValidate>
            {ok && <Alert tone="success" title="Voucher accepted">{ok}</Alert>}
            {redeem.error && <Alert tone="danger">{redeem.error}</Alert>}
            {q.data.stores.length > 1 ? <Select label="Store" value={f.store || q.data.stores[0]} onChange={(ev) => setF({ ...f, store: ev.target.value })} options={q.data.stores.map((s) => ({ value: s, label: s }))} /> : <p style={{ margin: '0 0 12px' }}>Store: <strong>{q.data.stores[0]}</strong></p>}
            <TextInput label="Voucher code" placeholder="BOGO-AB12-CD34" value={f.code} onChange={(ev) => setF({ ...f, code: ev.target.value.toUpperCase() })} error={e.code} />
            <TextInput label="Customer’s mobile number" inputMode="tel" value={f.phone} onChange={(ev) => setF({ ...f, phone: ev.target.value })} error={e.phone} />
            <Select label="Product bought" placeholder="Choose the product" value={f.itemRef} onChange={(ev) => setF({ ...f, itemRef: ev.target.value })} options={q.data.products.map((p) => ({ value: p.ref, label: `${p.name} — ${rupees(p.price)}` }))} error={e.itemRef} />
            <TextInput label="Bill number" value={f.billNo} onChange={(ev) => setF({ ...f, billNo: ev.target.value })} error={e.billNo} />
            <div style={{ marginTop: 8 }}><Button type="submit" loading={redeem.pending} disabled={!f.code || !f.phone || !f.itemRef || !f.billNo}>Check and redeem</Button></div>
          </form>
        </Card>
      )}
    </Screen>
  );
}
