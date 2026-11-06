'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, TextArea, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useOnboarding } from '@/lib/onboarding';
import { toMinor } from '@/lib/regions';

interface Project { name: string; year: string; value: string; client: string }

/** Screen 018 — Business Profile Builder. */
export default function ProfileBuilderPage() {
  const { goNext, locked } = useOnboarding();
  const prof = useQuery<any>('/profile');
  const [f, setF] = useState({ headline: '', about: '', services: '', consentToMatch: true });
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    const p = prof.data?.profile;
    if (p) {
      setF({ headline: p.headline ?? '', about: p.about ?? '', services: (p.services ?? []).join(', '), consentToMatch: p.consentToMatch });
      setProjects((p.pastProjects ?? []).map((x: any) => ({ name: x.name, year: String(x.year), value: x.value ? String(x.value / 100) : '', client: x.client ?? '' })));
    }
  }, [prof.data]);
  const m = useMutation(async () => {
    await api.put('/onboarding/profile', {
      headline: f.headline, about: f.about, services: f.services.split(',').map((s) => s.trim()).filter(Boolean), consentToMatch: f.consentToMatch,
      pastProjects: projects.filter((p) => p.name).map((p) => ({ name: p.name, year: Number(p.year), value: toMinor(p.value), client: p.client || undefined })),
    });
    goNext('profile');
    return true;
  });
  if (prof.loading) return <Screen id="018"><LoadingState /></Screen>;
  return (
    <Screen id="018" description="Your public business profile. Reputation is earned from verified outcomes later — never from paid placement.">
      <Card>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <TextInput label="Headline" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} error={m.fieldErrors.headline} maxLength={160} />
          <TextArea label="About your business" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} error={m.fieldErrors.about} />
          <TextInput label="Services (comma-separated)" value={f.services} onChange={(e) => setF({ ...f, services: e.target.value })} />
          <fieldset className="cz-fieldset">
            <legend>Past projects (optional)</legend>
            {projects.map((p, i) => (
              <div key={i} className="cz-grid cz-grid-4" style={{ alignItems: 'end' }}>
                <TextInput label="Project" value={p.name} onChange={(e) => setProjects(projects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <TextInput label="Year" inputMode="numeric" value={p.year} onChange={(e) => setProjects(projects.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} error={m.fieldErrors[`pastProjects.${i}.year`]} />
                <TextInput label="Value ₹" inputMode="decimal" value={p.value} onChange={(e) => setProjects(projects.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button type="button" variant="ghost" onClick={() => setProjects(projects.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setProjects([...projects, { name: '', year: String(new Date().getFullYear()), value: '', client: '' }])}>Add project</Button>
          </fieldset>
          <Checkbox label="I consent to explainable AI partner/opportunity matching using this profile (you can withdraw anytime in Privacy settings)" checked={f.consentToMatch} onChange={(e) => setF({ ...f, consentToMatch: e.target.checked })} />
          <div style={{ marginTop: 12 }}><Button type="submit" loading={m.pending} disabled={locked}>Save and continue</Button></div>
        </form>
      </Card>
    </Screen>
  );
}
