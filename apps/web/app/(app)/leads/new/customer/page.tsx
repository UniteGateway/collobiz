'use client';
import { useRouter } from 'next/navigation';
import { Button, Card, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { LeadSteps } from '@/components/LeadWizard';
import { useLeadDraft } from '@/lib/leadDraft';

/** Screen 044 — Customer / Company Details. Tax ID strengthens duplicate detection. */
export default function CustomerStep() {
  const router = useRouter();
  const { d, update, ready } = useLeadDraft();
  if (!ready) return <Screen id="044"><LoadingState /></Screen>;
  const c = d.customer;
  const set = (k: keyof typeof c) => (e: { target: { value: string } }) => update({ customer: { ...c, [k]: k === 'taxId' ? e.target.value.toUpperCase() : e.target.value } });
  return (
    <Screen id="044" description="Customer details are visible only to your organization and authorised Unite Group reviewers.">
      <LeadSteps />
      <Card>
        <div className="cz-grid cz-grid-2">
          <TextInput label="Customer legal name" value={c.legalName} onChange={set('legalName')} />
          <TextInput label="GSTIN / registration number (recommended)" value={c.taxId} onChange={set('taxId')} hint="Used to detect duplicate registrations fairly" />
          <TextInput label="Contact person" value={c.contactName} onChange={set('contactName')} />
          <TextInput label="Contact email" type="email" value={c.contactEmail} onChange={set('contactEmail')} />
          <TextInput label="Contact phone" type="tel" value={c.contactPhone} onChange={set('contactPhone')} />
          <TextInput label="City" value={c.city} onChange={set('city')} />
        </div>
      </Card>
      <div className="cz-row"><Button variant="secondary" onClick={() => router.push('/leads/new')}>Back</Button><Button onClick={() => router.push('/leads/new/scope')} disabled={c.legalName.length < 2 || c.contactName.length < 2 || c.city.length < 2}>Continue</Button></div>
    </Screen>
  );
}
