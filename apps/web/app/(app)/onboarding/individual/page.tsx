'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useOnboarding } from '@/lib/onboarding';

/** Screen 014 — Individual Partner Registration. */
export default function IndividualPage() {
  const { goNext, locked } = useOnboarding();
  const prof = useQuery<any>('/profile');
  const [f, setF] = useState({ displayName: '', profession: '', city: '', country: 'IN', yearsExperience: '', pan: '' });
  useEffect(() => {
    const p = prof.data;
    if (p) setF((x) => ({ ...x, displayName: p.organization.displayName ?? '', profession: p.profile.profession ?? '', city: p.organization.city ?? '', country: p.organization.country ?? 'IN', yearsExperience: p.profile.yearsExperience?.toString() ?? '' }));
  }, [prof.data]);
  const m = useMutation(async () => { await api.put('/onboarding/individual', { ...f, yearsExperience: Number(f.yearsExperience || 0), pan: f.pan || undefined }); goNext('details'); return true; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (prof.loading) return <Screen id="014"><LoadingState /></Screen>;
  return (
    <Screen id="014">
      <Card>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <div className="cz-grid cz-grid-2">
            <TextInput label="Name shown to partners" value={f.displayName} onChange={set('displayName')} error={m.fieldErrors.displayName} />
            <TextInput label="Profession" value={f.profession} onChange={set('profession')} error={m.fieldErrors.profession} placeholder="e.g. Solar consultant" />
            <TextInput label="City" value={f.city} onChange={set('city')} error={m.fieldErrors.city} />
            <TextInput label="Country (ISO code)" value={f.country} onChange={set('country')} error={m.fieldErrors.country} maxLength={2} />
            <TextInput label="Years of experience" inputMode="numeric" value={f.yearsExperience} onChange={set('yearsExperience')} error={m.fieldErrors.yearsExperience} />
            <TextInput label="PAN (optional now, required for payouts)" value={f.pan} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} error={m.fieldErrors.pan} hint="Stored encrypted; only the last 4 characters are ever shown" />
          </div>
          <Button type="submit" loading={m.pending} disabled={locked}>Save and continue</Button>
        </form>
      </Card>
    </Screen>
  );
}
