'use client';
import { useState } from 'react';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, Checkbox, Select, TextArea, TextInput } from '@collabiz/ui';
import { PublicScreen } from '@/components/PublicScreen';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { toMinor } from '@/lib/regions';

/** Screen 040 — Submit Requirement / RFQ. Goes to Unite Group first review; never listed publicly with buyer details. */
export default function RfqPage() {
  const { me } = useSession();
  const [f, setF] = useState({ title: '', description: '', sector: 'solar', quantity: '', city: '', budget: '', neededBy: '', contactName: me?.fullName ?? '', contactEmail: me?.email ?? '', contactPhone: '', consentToShare: false });
  const [done, setDone] = useState<{ reference: string; code: string } | null>(null);
  const m = useMutation(async () => {
    const r = await api.post<{ reference: string; code: string }>('/public/rfq', { ...f, quantity: f.quantity || undefined, city: f.city || undefined, contactPhone: f.contactPhone || undefined, budget: toMinor(f.budget), neededBy: f.neededBy ? new Date(f.neededBy).toISOString() : undefined });
    setDone(r);
    return r;
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <PublicScreen id="040" description="Tell us what you need. A Unite Group company reviews it first; with your consent, approved partners may then be invited. Your contact details are never published.">
      <section className="cz-card" style={{ maxWidth: 820 }}>
        {done ? <Alert tone="success" title="Requirement received.">Reference <strong className="cz-mono">{done.reference}</strong> (tracking ID {done.code}). We will contact you after review.</Alert> : (
          <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
            {m.error && <Alert tone="danger">{m.error}</Alert>}
            <TextInput label="What do you need?" value={f.title} onChange={set('title')} error={m.fieldErrors.title} placeholder="e.g. 300 kW rooftop solar for a school" />
            <TextArea label="Details" value={f.description} onChange={set('description')} error={m.fieldErrors.description} />
            <div className="cz-grid cz-grid-2">
              <Select label="Sector" value={f.sector} onChange={set('sector')} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
              <TextInput label="Quantity / capacity (optional)" value={f.quantity} onChange={set('quantity')} />
              <TextInput label="City (optional)" value={f.city} onChange={set('city')} />
              <TextInput label="Indicative budget ₹ (optional)" inputMode="decimal" value={f.budget} onChange={set('budget')} error={m.fieldErrors.budget} />
              <TextInput label="Needed by (optional)" type="date" value={f.neededBy} onChange={set('neededBy')} />
            </div>
            <h3>Your contact details</h3>
            <div className="cz-grid cz-grid-3">
              <TextInput label="Name" value={f.contactName} onChange={set('contactName')} error={m.fieldErrors.contactName} autoComplete="name" />
              <TextInput label="Email" type="email" value={f.contactEmail} onChange={set('contactEmail')} error={m.fieldErrors.contactEmail} autoComplete="email" />
              <TextInput label="Phone (optional)" type="tel" value={f.contactPhone} onChange={set('contactPhone')} autoComplete="tel" />
            </div>
            <Checkbox label="I consent to Unite Group reviewing this requirement and, if appropriate, sharing the anonymised scope with approved COLLABIZ partners." checked={f.consentToShare} onChange={(e) => setF({ ...f, consentToShare: e.target.checked })} />
            {m.fieldErrors.consentToShare && <p className="cz-error-text">{m.fieldErrors.consentToShare}</p>}
            <div style={{ marginTop: 12 }}><Button type="submit" loading={m.pending}>Submit requirement</Button></div>
          </form>
        )}
      </section>
    </PublicScreen>
  );
}
