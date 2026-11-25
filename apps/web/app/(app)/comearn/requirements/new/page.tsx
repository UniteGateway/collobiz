'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CE_CATEGORIES, type CeCategory } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { CeHeader, CeNav, toPaise } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Post a customer requirement — businesses compete with commission offers. The customer's identity stays private until you select one. */
export default function ComearnNewRequirement() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', category: 'solar' as CeCategory, description: '', city: '', value: '', closesOn: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), customerName: '', customerCompany: '', contactName: '', phone: '', email: '', gstin: '' });
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation(async () => {
    const r = await api.post<{ id: string }>('/comearn/requirements', { title: f.title, category: f.category, description: f.description, city: f.city, estimatedValuePaise: f.value ? toPaise(f.value) : undefined, closesOn: f.closesOn,
      customerName: f.customerName, customerCompany: f.customerCompany || undefined, contactName: f.contactName, phone: f.phone || undefined, email: f.email || undefined, gstin: f.gstin || undefined, consent });
    router.push(`/comearn/requirements/${r.id}`); return true;
  });
  const fe = save.fieldErrors;
  return (
    <Screen page={{ key: 'comearn-requirement-new', title: 'Post a customer requirement', access: 'partner' }} header={false}>
      <CeHeader title="Post a customer requirement" lead="Have a genuine customer need? Businesses on COLLABIZ offer you a commission to serve it. You choose — on commission, proposal and track record." />
      <CeNav />
      <form className="cz-stack" style={{ gap: 16 }} data-form="ce-requirement" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Card title="What the customer needs" subtitle="Businesses see this part, without the customer’s name or contact details.">
          <TextInput label="Requirement" value={f.title} onChange={set('title')} error={fe.title} hint="e.g. Factory requires a 1 MW solar power plant" />
          <div className="vai-grid">
            <Select label="Category" value={f.category} onChange={set('category')} options={Object.entries(CE_CATEGORIES).map(([value, label]) => ({ value, label }))} />
            <TextInput label="Location" value={f.city} onChange={set('city')} error={fe.city} />
            <TextInput label="Estimated value (₹)" inputMode="decimal" value={f.value} onChange={set('value')} />
            <TextInput label="Offers close on" type="date" value={f.closesOn} onChange={set('closesOn')} error={fe.closesOn} />
          </div>
          <TextArea label="Details" value={f.description} onChange={set('description')} error={fe.description} rows={3} />
        </Card>
        <Card title="Customer (private)" subtitle="Shared only with the business you select. Registering a customer here also protects your introduction.">
          <div className="vai-grid">
            <TextInput label="Customer name" value={f.customerName} onChange={set('customerName')} error={fe.customerName} />
            <TextInput label="Company (optional)" value={f.customerCompany} onChange={set('customerCompany')} />
            <TextInput label="Contact person" value={f.contactName} onChange={set('contactName')} error={fe.contactName} />
            <TextInput label="Phone" value={f.phone} onChange={set('phone')} error={fe.phone} />
            <TextInput label="Email" value={f.email} onChange={set('email')} error={fe.email} />
            <TextInput label="GSTIN (optional)" value={f.gstin} onChange={set('gstin')} error={fe.gstin} />
          </div>
          <Checkbox label="The customer agreed to receive offers from businesses through me" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          {fe.consent && <Alert tone="danger">{fe.consent}</Alert>}
        </Card>
        <div><Button type="submit" loading={save.pending}>Post requirement</Button></div>
      </form>
    </Screen>
  );
}
