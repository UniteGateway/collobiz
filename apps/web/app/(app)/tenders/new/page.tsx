'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, Grid, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

const LEVELS = ['registered', 'verified', 'certified', 'strategic', 'country_partner'];
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Screen 066 — Publish Tender / Work Package (creates a draft; documents & evaluators come next). */
export default function NewTender() {
  const router = useRouter();
  const [f, setF] = useState({ title: '', scope: '', sector: 'solar', workPackage: '', budget: '', closesAt: local(new Date(Date.now() + 7 * 86400_000)), minLevel: 'verified', sectors: [] as string[], certifications: '', techWeight: '70', minTechScore: '60' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation(async () => {
    const t = await api.post<any>('/tenders', {
      title: f.title, scope: f.scope, sector: f.sector, workPackage: f.workPackage || undefined, budget: toMinor(f.budget), closesAt: new Date(f.closesAt).toISOString(),
      eligibility: { minLevel: f.minLevel, sectors: f.sectors, certifications: f.certifications.split(',').map((s) => s.trim()).filter(Boolean) },
      techWeight: Number(f.techWeight), minTechScore: Number(f.minTechScore),
    });
    router.push(`/tenders/${t.id}/documents`);
    return t;
  });
  const fe = m.fieldErrors;
  return (
    <Screen id="066" description="Create a draft, then add documents and evaluators before publishing. Published tenders cannot be edited — use an addendum.">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <Card title="Tender details">
        <TextInput label="Title" value={f.title} onChange={set('title')} error={fe.title} />
        <TextArea label="Scope of work" rows={5} value={f.scope} onChange={set('scope')} error={fe.scope} hint="At least 20 characters. Detailed specifications go in the documents step." />
        <Grid cols={2}>
          <Select label="Sector" value={f.sector} onChange={set('sector')} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          <TextInput label="Work package (optional)" value={f.workPackage} onChange={set('workPackage')} />
          <TextInput label="Indicative budget (₹, optional)" inputMode="decimal" value={f.budget} onChange={set('budget')} error={fe.budget} />
          <TextInput label="Bids close at" type="datetime-local" value={f.closesAt} onChange={set('closesAt')} error={fe.closesAt} hint="At least one hour after publishing." />
        </Grid>
      </Card>
      <Card title="Eligibility">
        <Select label="Minimum membership level" value={f.minLevel} onChange={set('minLevel')} options={LEVELS.map((l) => ({ value: l, label: l.replace('_', ' ') }))} />
        <ChipSelect legend="Bidder must work in (optional)" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} value={f.sectors} onChange={(sectors) => setF({ ...f, sectors })} />
        <TextInput label="Required certifications (comma-separated, optional)" value={f.certifications} onChange={set('certifications')} />
      </Card>
      <Card title="Evaluation method">
        <Grid cols={2}>
          <TextInput label="Technical weight (%)" inputMode="numeric" value={f.techWeight} onChange={set('techWeight')} error={fe.techWeight} hint={`Commercial weight: ${100 - (Number(f.techWeight) || 0)}%`} />
          <TextInput label="Technical pass mark (0–100)" inputMode="numeric" value={f.minTechScore} onChange={set('minTechScore')} error={fe.minTechScore} hint="Bids below this never have their commercial envelope opened." />
        </Grid>
        <Button onClick={() => m.run()} loading={m.pending}>Save draft and add documents</Button>
      </Card>
    </Screen>
  );
}
