'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MICRO_KINDS, MICRO_MAX_RS, MICRO_MIN_RS } from '@collabiz/types';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { STATE_OPTIONS, addDays, toNum } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

export default function PostMicro() {
  const router = useRouter();
  const [f, setF] = useState({ kind: 'calling', state: '', title: '', scope: '', acceptance: '', quantity: '', unit: '', priceRs: '', due: addDays(7) });
  const save = useMutation(async () => { const r = await api.post<{ id: string }>('/micro', { ...f, state: f.state || null, quantity: toNum(f.quantity), priceRs: toNum(f.priceRs) }); router.push(`/micro/${r.id}`); return r; });
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'micro-new', title: 'Post a micro-contract', access: 'partner' }} eyebrow="Micro-contracts"
      description={`A small, clearly scoped job with a fixed price (₹${MICRO_MIN_RS} – ₹${MICRO_MAX_RS.toLocaleString('en-IN')}). Say exactly how you will accept the work.`}>
      <Card>
        <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }}>
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <div className="cz-grid cz-grid-2">
            <Select label="Type of work" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value })} options={MICRO_KINDS.map((k) => ({ value: k.code, label: k.label }))} />
            <Select label="State (optional)" value={f.state} onChange={(ev) => setF({ ...f, state: ev.target.value })} options={[{ value: '', label: 'Remote / anywhere' }, ...STATE_OPTIONS]} />
          </div>
          <TextInput label="Title" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} placeholder="e.g. Rooftop survey of 4 warehouses in Chakan" />
          <TextArea label="What needs doing" rows={4} value={f.scope} onChange={(ev) => setF({ ...f, scope: ev.target.value })} error={e.scope} />
          <TextArea label="How you will accept it" rows={2} value={f.acceptance} onChange={(ev) => setF({ ...f, acceptance: ev.target.value })} error={e.acceptance} hint="e.g. photos from four corners, measurements and a one-page note per site" />
          <div className="cz-grid cz-grid-2">
            <TextInput label="Quantity" inputMode="numeric" value={f.quantity} onChange={(ev) => setF({ ...f, quantity: ev.target.value.replace(/\D/g, '') })} error={e.quantity} />
            <TextInput label="Unit" value={f.unit} onChange={(ev) => setF({ ...f, unit: ev.target.value })} error={e.unit} placeholder="calls, sites, designs…" />
            <TextInput label="Fixed price for the whole job (₹)" inputMode="numeric" value={f.priceRs} onChange={(ev) => setF({ ...f, priceRs: ev.target.value.replace(/\D/g, '') })} error={e.priceRs} />
            <TextInput label="Due date" type="date" value={f.due} onChange={(ev) => setF({ ...f, due: ev.target.value })} error={e.due} />
          </div>
          <Alert tone="info">You pay the business directly once you accept the work, then record your payment reference here. COLLABIZ does not hold or move the money.</Alert>
          <div><Button type="submit" loading={save.pending}>Post micro-contract</Button></div>
        </form>
      </Card>
    </Screen>
  );
}
