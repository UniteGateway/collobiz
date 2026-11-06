'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, Card, Grid, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { TradingTabs } from '@/components/Trading';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Screen 087 — Buyer Requirement Posting (goods RFQ to verified suppliers in the sector, or invited suppliers only). */
export default function NewRequirement() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', sector: 'power_equipment', description: '', deliveryLocation: '', neededBy: '', closesAt: local(new Date(Date.now() + 5 * 86400_000)) });
  const [items, setItems] = useState([{ item: '', spec: '', quantity: '', unit: 'nos' }]);
  const m = useMutation(async () => {
    const r = await api.post<any>('/trading/requirements', { ...f, description: f.description || undefined, neededBy: f.neededBy || undefined, closesAt: new Date(f.closesAt).toISOString(), items: items.filter((i) => i.item).map((i) => ({ item: i.item, spec: i.spec || undefined, quantity: Number(i.quantity) || 0, unit: i.unit })) });
    router.push(`/trading/quotations?requirement=${r.id}`);
    return r;
  });
  const setItem = (ix: number, k: string, v: string) => setItems(items.map((x, j) => (j === ix ? { ...x, [k]: v } : x)));
  return (
    <Screen id="087" description="Verified suppliers working in the sector see your requirement and quote privately. Only you can compare quotations.">
      <TradingTabs />
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <Card title="Requirement">
        <Grid cols={2}>
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={m.fieldErrors.title} />
          <Select label="Sector" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          <TextInput label="Delivery location" value={f.deliveryLocation} onChange={(e) => setF({ ...f, deliveryLocation: e.target.value })} error={m.fieldErrors.deliveryLocation} />
          <TextInput label="Needed by" type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} />
          <TextInput label="Quotations close at" type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} error={m.fieldErrors.closesAt} />
        </Grid>
        <TextArea label="Notes for suppliers (optional)" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Card>
      <Card title="Items">
        {items.map((it, ix) => (
          <div key={ix} className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label={`Item ${ix + 1}`} value={it.item} onChange={(e) => setItem(ix, 'item', e.target.value)} />
            <TextInput label={`Specification ${ix + 1}`} value={it.spec} onChange={(e) => setItem(ix, 'spec', e.target.value)} />
            <TextInput label={`Quantity ${ix + 1}`} inputMode="decimal" value={it.quantity} onChange={(e) => setItem(ix, 'quantity', e.target.value)} />
            <TextInput label={`Unit ${ix + 1}`} value={it.unit} onChange={(e) => setItem(ix, 'unit', e.target.value)} />
          </div>
        ))}
        {m.fieldErrors.items && <p className="cz-error-text">{m.fieldErrors.items}</p>}
        <div className="cz-row">
          <Button variant="secondary" onClick={() => setItems([...items, { item: '', spec: '', quantity: '', unit: 'nos' }])}>Add item</Button>
          <Button onClick={() => m.run()} loading={m.pending}>Post requirement</Button>
        </div>
      </Card>
    </Screen>
  );
}
