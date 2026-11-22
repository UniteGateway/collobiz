'use client';
/** Prospect details with consent — used by partners in the app and by prospects on a partner's public link. */
import { useState } from 'react';
import { EB5_CONTACT, EB5_READINESS, EB5_TIMELINES } from '@collabiz/types';
import { Alert, Button, Checkbox, Select, TextArea, TextInput } from '@collabiz/ui';

export interface LeadInput { fullName: string; country: string; city: string; email: string; phone: string; familyMembers: string; readiness: string; timeline: string; contactPreference: string; notes: string; consent: boolean }
export const EMPTY_LEAD: LeadInput = { fullName: '', country: 'India', city: '', email: '', phone: '', familyMembers: '', readiness: EB5_READINESS[0], timeline: EB5_TIMELINES[2], contactPreference: EB5_CONTACT[0], notes: '', consent: false };
export const leadBody = (f: LeadInput) => ({ ...f, city: f.city || undefined, email: f.email || undefined, phone: f.phone || undefined, familyMembers: f.familyMembers || undefined, notes: f.notes || undefined, consent: f.consent || undefined });

export function Eb5LeadForm({ self, onSubmit, pending, error, fieldErrors, submitLabel }: { self?: boolean; onSubmit: (f: LeadInput) => void; pending: boolean; error: string | null; fieldErrors: Record<string, string>; submitLabel: string }) {
  const [f, setF] = useState<LeadInput>(EMPTY_LEAD);
  const e = fieldErrors;
  return (
    <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(ev) => { ev.preventDefault(); onSubmit(f); }}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="cz-grid cz-grid-2">
        <TextInput label={self ? 'Your full name' : 'Prospect full name'} value={f.fullName} onChange={(ev) => setF({ ...f, fullName: ev.target.value })} error={e.fullName} autoComplete="name" />
        <TextInput label="Country" value={f.country} onChange={(ev) => setF({ ...f, country: ev.target.value })} error={e.country} />
        <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} />
        <TextInput label="Email" type="email" value={f.email} onChange={(ev) => setF({ ...f, email: ev.target.value })} error={e.email} autoComplete="email" />
        <TextInput label="Phone" type="tel" value={f.phone} onChange={(ev) => setF({ ...f, phone: ev.target.value })} error={e.phone} autoComplete="tel" />
        <TextInput label="Family members interested (optional)" value={f.familyMembers} onChange={(ev) => setF({ ...f, familyMembers: ev.target.value })} placeholder="e.g. spouse and two children" />
        <Select label="Investment readiness" value={f.readiness} onChange={(ev) => setF({ ...f, readiness: ev.target.value })} options={EB5_READINESS.map((x) => ({ value: x, label: x }))} />
        <Select label="Expected timeline" value={f.timeline} onChange={(ev) => setF({ ...f, timeline: ev.target.value })} options={EB5_TIMELINES.map((x) => ({ value: x, label: x }))} />
        <Select label="Preferred contact" value={f.contactPreference} onChange={(ev) => setF({ ...f, contactPreference: ev.target.value })} options={EB5_CONTACT.map((x) => ({ value: x, label: x }))} />
      </div>
      <TextArea label="Notes (optional)" rows={3} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} />
      <Checkbox label={self ? 'I agree that GO EB5 (CITRUS360 LLC) may contact me about EB-5 consultancy services.' : 'The prospect has agreed to be contacted by GO EB5 (CITRUS360 LLC) about EB-5 consultancy services.'} checked={f.consent} onChange={(ev) => setF({ ...f, consent: ev.target.checked })} />
      {e.consent && <p className="cz-error-text">{e.consent}</p>}
      <div><Button type="submit" loading={pending}>{submitLabel}</Button></div>
    </form>
  );
}
