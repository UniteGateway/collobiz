'use client';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { newIdempotencyKey, sectorName } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, DescriptionList, TextArea, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { LeadSteps } from '@/components/LeadWizard';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { clearDraft, useLeadDraft } from '@/lib/leadDraft';
import { toMinor } from '@/lib/regions';

/** Screen 046 — Opportunity Value & Requirements, review and submit (idempotent). */
export default function ValueStep() {
  const router = useRouter();
  const { d, update, ready } = useLeadDraft();
  const key = useMemo(newIdempotencyKey, []);
  const m = useMutation(async () => {
    const r = await api.request<any>('POST', '/leads', {
      customer: { ...d.customer, taxId: d.customer.taxId || undefined, contactEmail: d.customer.contactEmail || undefined, contactPhone: d.customer.contactPhone || undefined },
      sector: d.sector, productOrProject: d.productOrProject, quantityOrCapacity: d.quantityOrCapacity || undefined, estimatedValue: toMinor(d.estimatedValue) ?? 0,
      requirements: d.requirements, expectedCloseDate: d.expectedCloseDate ? new Date(d.expectedCloseDate).toISOString() : undefined, urgent: d.urgent,
      consent: { method: d.consent.method, obtainedAt: d.consent.obtainedAt ? new Date(d.consent.obtainedAt).toISOString() : undefined, disclosureScope: d.consent.disclosureScope, notes: d.consent.notes || undefined },
      evidenceSummary: d.evidenceSummary,
    }, { idempotencyKey: key });
    clearDraft();
    router.push(`/leads/${r.claim.id}/confirmation`);
    return r;
  });
  if (!ready) return <Screen id="046"><LoadingState /></Screen>;
  return (
    <Screen id="046">
      <LeadSteps />
      {m.error && <Alert tone="danger">{m.error}{Object.keys(m.fieldErrors).length > 0 && <ul>{Object.entries(m.fieldErrors).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}</Alert>}
      <Card title="Value & requirements">
        <div className="cz-grid cz-grid-2">
          <TextInput label="Estimated value ₹" inputMode="decimal" value={d.estimatedValue} onChange={(e) => update({ estimatedValue: e.target.value })} />
          <TextInput label="Expected close (optional)" type="date" value={d.expectedCloseDate} onChange={(e) => update({ expectedCloseDate: e.target.value })} />
        </div>
        <TextArea label="Buyer requirements" value={d.requirements} onChange={(e) => update({ requirements: e.target.value })} />
        <Checkbox label="Urgent tender / deadline (shortened review window — exception workflow)" checked={d.urgent} onChange={(e) => update({ urgent: e.target.checked })} />
      </Card>
      <Card title="Review">
        <DescriptionList items={[['Customer', `${d.customer.legalName} · ${d.customer.city}`], ['Sector', sectorName(d.sector)], ['Scope', d.productOrProject], ['Consent', `${d.consent.method.replace('_', ' ')} · sharing: ${d.consent.disclosureScope.replace(/_/g, ' ')}`], ['Evidence', d.evidenceSummary]]} />
        <p className="cz-muted" style={{ fontSize: 13 }}>Submitting seals an evidence snapshot (SHA-256) and time-stamps your registration. You can add supporting documents afterwards but cannot change the sealed details.</p>
      </Card>
      <div className="cz-row"><Button variant="secondary" onClick={() => router.push('/leads/new/scope')}>Back</Button><Button variant="accent" onClick={() => m.run()} loading={m.pending} disabled={d.requirements.trim().length < 20}>Register protected lead</Button></div>
    </Screen>
  );
}
