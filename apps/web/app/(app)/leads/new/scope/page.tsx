'use client';
import { useRouter } from 'next/navigation';
import { SECTORS } from '@collabiz/types';
import { Button, Card, Select, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { LeadSteps } from '@/components/LeadWizard';
import { useLeadDraft } from '@/lib/leadDraft';

/** Screen 045 — Select Products or Project Type (sector determines which Unite company reviews first). */
export default function ScopeStep() {
  const router = useRouter();
  const { d, update, ready } = useLeadDraft();
  if (!ready) return <Screen id="045"><LoadingState /></Screen>;
  return (
    <Screen id="045" description="The sector routes the lead to the matching Unite Group company for its timed first review.">
      <LeadSteps />
      <Card>
        <div className="cz-grid cz-grid-2">
          <Select label="Sector" value={d.sector} onChange={(e) => update({ sector: e.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          <TextInput label="Product, service or project" value={d.productOrProject} onChange={(e) => update({ productOrProject: e.target.value })} placeholder="e.g. 1 MW rooftop solar" />
          <TextInput label="Quantity / capacity (optional)" value={d.quantityOrCapacity} onChange={(e) => update({ quantityOrCapacity: e.target.value })} />
        </div>
      </Card>
      <div className="cz-row"><Button variant="secondary" onClick={() => router.push('/leads/new/customer')}>Back</Button><Button onClick={() => router.push('/leads/new/value')} disabled={d.productOrProject.length < 3}>Continue</Button></div>
    </Screen>
  );
}
