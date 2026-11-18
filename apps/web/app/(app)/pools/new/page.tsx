'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { POOL_UNITS } from '@collabiz/types';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { STATE_OPTIONS, addDays, toNum } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

export default function NewPool() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', spec: '', unit: 'units', state: 'TG', targetQty: '', myQty: '', joinBy: addDays(14), neededBy: '' });
  const save = useMutation(async () => { const r = await api.post<{ id: string }>('/pools', { ...f, targetQty: toNum(f.targetQty), myQty: toNum(f.myQty), neededBy: f.neededBy || undefined }); router.push(`/pools/${r.id}`); return r; });
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'pools-new', title: 'Start a demand pool', access: 'partner' }} eyebrow="Demand pools" description="Describe exactly what you need. Other verified buyers join with their quantities; suppliers quote on the combined total.">
      <Card>
        <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }}>
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <TextInput label="What are you buying?" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} placeholder="e.g. Copper armoured cable 4C × 16 sq mm" />
          <TextArea label="Specification" rows={4} value={f.spec} onChange={(ev) => setF({ ...f, spec: ev.target.value })} error={e.spec} hint="Standard, grade, certification, packing, delivery locations — enough for a supplier to quote." />
          <div className="cz-grid cz-grid-2">
            <Select label="Unit" value={f.unit} onChange={(ev) => setF({ ...f, unit: ev.target.value })} options={POOL_UNITS.map((u) => ({ value: u, label: u }))} />
            <Select label="Delivery state" value={f.state} onChange={(ev) => setF({ ...f, state: ev.target.value })} options={STATE_OPTIONS} />
            <TextInput label="Pool target quantity" hint="The combined quantity you want to reach" inputMode="decimal" value={f.targetQty} onChange={(ev) => setF({ ...f, targetQty: ev.target.value })} error={e.targetQty} />
            <TextInput label="Your own quantity" inputMode="decimal" value={f.myQty} onChange={(ev) => setF({ ...f, myQty: ev.target.value })} error={e.myQty} />
            <TextInput label="Joining closes on" type="date" value={f.joinBy} onChange={(ev) => setF({ ...f, joinBy: ev.target.value })} error={e.joinBy} />
            <TextInput label="Needed by (optional)" type="date" value={f.neededBy} onChange={(ev) => setF({ ...f, neededBy: ev.target.value })} error={e.neededBy} />
          </div>
          <Alert tone="info">Each buyer accepts a quote for itself and gets its own contract with the supplier. You are never responsible for another buyer’s order or payment.</Alert>
          <div><Button type="submit" loading={save.pending}>Open the pool</Button></div>
        </form>
      </Card>
    </Screen>
  );
}
