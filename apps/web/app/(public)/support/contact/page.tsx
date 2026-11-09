'use client';
import { useState } from 'react';
import { Alert, Button, Select, TextArea, TextInput, Checkbox } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

const FAQ: [string, string][] = [
  ['Is joining COLLABIZ free?', 'Yes. Registration and verification are free. Commercial rewards are defined in signed agreements per opportunity.'],
  ['How is my lead protected?', 'Each registered lead receives a stable ID, a time-stamped evidence snapshot and — once verified — a protection certificate for a defined period. Disputes are decided on evidence by an independent panel.'],
  ['When do I get paid?', 'A commission becomes "earned" only when its contractual trigger occurs (for example, customer payment received). It then passes finance approval, invoicing and settlement — each visible in your earnings tracker.'],
  ['Does Unite Group own every deal I bring?', 'No. Unite Group gets a timed first review of partner-originated opportunities. If declined or released, eligible partners can collaborate where the buyer consented.'],
  ['Is COLLABIZ an investment platform?', 'No. Finance and investor modules remain disabled until legal and regulatory review is complete.'],
];

/** Screen 010 — Contact, FAQs & Support. */
export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', organization: '', topic: 'partnership', message: '', consent: false });
  const [done, setDone] = useState<string | null>(null);
  const m = useMutation(() => api.post<{ reference: string }>('/public/enquiries', form));
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="cz-container cz-section" data-screen="010">
      <h1>Contact, FAQs &amp; support</h1>
      <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <section className="cz-card">
          <h2>Send us a message</h2>
          {done ? (
            <Alert tone="success" title="Thank you.">Your enquiry reference is <strong className="cz-mono">{done}</strong>. Our partner team will respond within two business days.</Alert>
          ) : (
            <form onSubmit={async (e) => { e.preventDefault(); const r = await m.run(); if (r) setDone(r.reference); }} noValidate>
              {m.error && <Alert tone="danger">{m.error}</Alert>}
              <TextInput label="Your name" value={form.name} onChange={set('name')} error={m.fieldErrors.name} required autoComplete="name" />
              <TextInput label="Work email" type="email" value={form.email} onChange={set('email')} error={m.fieldErrors.email} required autoComplete="email" />
              <TextInput label="Organization (optional)" value={form.organization} onChange={set('organization')} error={m.fieldErrors.organization} autoComplete="organization" />
              <Select label="Topic" value={form.topic} onChange={set('topic')} options={[
                { value: 'partnership', label: 'Becoming a partner' }, { value: 'requirement', label: 'I have a business requirement' },
                { value: 'support', label: 'Account or technical support' }, { value: 'media', label: 'Media & investor relations' }, { value: 'other', label: 'Other' },
              ]} />
              <TextArea label="Message" value={form.message} onChange={set('message')} error={m.fieldErrors.message} required />
              <Checkbox label="I agree that COLLABIZ may use these details to respond to my enquiry." checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
              {m.fieldErrors.consent && <p className="cz-error-text">{m.fieldErrors.consent}</p>}
              <Button type="submit" loading={m.pending} style={{ marginTop: 12 }}>Send enquiry</Button>
            </form>
          )}
        </section>
        <section className="cz-card">
          <h2>Frequently asked questions</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} style={{ borderBottom: '1px solid var(--cz-grey-100)', padding: '10px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{q}</summary>
              <p style={{ marginTop: 8 }}>{a}</p>
            </details>
          ))}
        </section>
      </div>
    </div>
  );
}
