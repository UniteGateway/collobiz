'use client';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Select, TextArea, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { LeadSteps } from '@/components/LeadWizard';
import { useLeadDraft } from '@/lib/leadDraft';

/** Screen 043 — Register New Business Lead: buyer consent provenance and evidence come first (§2.2 consent check). */
export default function NewLeadPage() {
  const router = useRouter();
  const { d, update, ready } = useLeadDraft();
  if (!ready) return <Screen id="043"><LoadingState /></Screen>;
  const c = d.consent;
  const ok = c.method && c.obtainedAt && d.evidenceSummary.trim().length >= 10;
  return (
    <Screen id="043" description="Registering a lead time-stamps your introduction, seals an evidence snapshot and — once verified — protects it for a defined period. Unite Group gets a timed first review; you receive a tracking ID and certificate.">
      <LeadSteps />
      <Alert tone="info">Only register buyers who asked for or agreed to the introduction. Leads without consent are rejected, and false claims can lead to suspension.</Alert>
      <Card title="Buyer consent">
        <div className="cz-grid cz-grid-3">
          <Select label="How was consent given?" value={c.method} onChange={(e) => update({ consent: { ...c, method: e.target.value } })} options={[{ value: 'written_email', label: 'Written email' }, { value: 'signed_letter', label: 'Signed letter of authority' }, { value: 'recorded_call', label: 'Recorded call' }, { value: 'meeting_minutes', label: 'Meeting minutes' }, { value: 'platform_rfq', label: 'Platform RFQ' }]} />
          <TextInput label="Date consent obtained" type="datetime-local" value={c.obtainedAt} max={new Date().toISOString().slice(0, 16)} onChange={(e) => update({ consent: { ...c, obtainedAt: e.target.value } })} />
          <Select label="Buyer allows sharing with" value={c.disclosureScope} onChange={(e) => update({ consent: { ...c, disclosureScope: e.target.value } })} options={[{ value: 'unite_and_approved_partners', label: 'Unite Group and approved partners' }, { value: 'unite_only', label: 'Unite Group only' }, { value: 'restricted', label: 'Restricted — no onward disclosure' }]} />
        </div>
        <TextArea label="Evidence of introduction" hint="Date, source and what proves your introduction (you can attach files after registration)" value={d.evidenceSummary} onChange={(e) => update({ evidenceSummary: e.target.value })} />
      </Card>
      <Button onClick={() => router.push('/leads/new/customer')} disabled={!ok}>Continue to customer details</Button>
    </Screen>
  );
}
