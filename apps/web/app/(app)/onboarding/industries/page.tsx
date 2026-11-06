'use client';
import { useEffect, useState } from 'react';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useOnboarding } from '@/lib/onboarding';
import { fromMinor, toMinor } from '@/lib/regions';

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Screen 016 — Partner Industry & Skills Selection (feeds explainable matching). */
export default function IndustriesPage() {
  const { goNext, locked } = useOnboarding();
  const prof = useQuery<any>('/profile');
  const [sectors, setSectors] = useState<string[]>([]);
  const [skills, setSkills] = useState('');
  const [certs, setCerts] = useState('');
  const [capacity, setCapacity] = useState('');
  useEffect(() => {
    const p = prof.data?.profile;
    if (p) { setSectors(p.sectors ?? []); setSkills((p.skills ?? []).join(', ')); setCerts((p.certifications ?? []).join(', ')); setCapacity(fromMinor(p.capacityMax)); }
  }, [prof.data]);
  const m = useMutation(async () => { await api.put('/onboarding/industries', { sectors, skills: list(skills), certifications: list(certs), capacityMax: toMinor(capacity) }); goNext('industries'); return true; });
  if (prof.loading) return <Screen id="016"><LoadingState /></Screen>;
  return (
    <Screen id="016" description="Sectors, skills, certifications and capacity are used for opportunity eligibility and explainable partner matching (only with your consent).">
      <Card>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <ChipSelect legend="Sectors (priority sectors listed first)" value={sectors} onChange={setSectors} options={[...SECTORS].sort((a, b) => Number(b.priority) - Number(a.priority)).map((s) => ({ value: s.code, label: s.name }))} />
          {m.fieldErrors.sectors && <p className="cz-error-text">{m.fieldErrors.sectors}</p>}
          <TextInput label="Skills (comma-separated)" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Rooftop solar, HT substations, Tender advisory" />
          <TextInput label="Certifications (comma-separated)" value={certs} onChange={(e) => setCerts(e.target.value)} placeholder="ISO9001, MNRE-Empanelled" />
          <TextInput label="Maximum project value you can execute, ₹ (optional)" inputMode="decimal" value={capacity} onChange={(e) => setCapacity(e.target.value)} error={m.fieldErrors.capacityMax} />
          <Button type="submit" loading={m.pending} disabled={locked}>Save and continue</Button>
        </form>
      </Card>
    </Screen>
  );
}
