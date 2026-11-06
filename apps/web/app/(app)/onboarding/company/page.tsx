'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, TextInput, LoadingState } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useOnboarding } from '@/lib/onboarding';
import { fromMinor, toMinor } from '@/lib/regions';

/** Screen 015 — Company Partner Registration. */
export default function CompanyPage() {
  const { goNext, locked } = useOnboarding();
  const prof = useQuery<any>('/profile');
  const [f, setF] = useState({ legalName: '', tradeName: '', registrationNumber: '', gstin: '', country: 'IN', city: '', website: '', employees: '', annualTurnover: '' });
  useEffect(() => {
    const p = prof.data;
    if (p) setF({ legalName: p.organization.legalName?.includes('pending details') ? '' : p.organization.legalName, tradeName: p.profile.tradeName ?? '', registrationNumber: p.profile.registrationNumber ?? '', gstin: p.profile.gstin ?? '', country: p.organization.country ?? 'IN', city: p.organization.city ?? '', website: p.profile.website ?? '', employees: p.profile.employees?.toString() ?? '', annualTurnover: fromMinor(p.profile.annualTurnover) });
  }, [prof.data]);
  const m = useMutation(async () => {
    await api.put('/onboarding/company', { legalName: f.legalName, tradeName: f.tradeName || undefined, registrationNumber: f.registrationNumber, gstin: f.gstin || undefined, country: f.country, city: f.city, website: f.website || undefined, employees: f.employees ? Number(f.employees) : undefined, annualTurnover: toMinor(f.annualTurnover) });
    goNext('details');
    return true;
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  if (prof.loading) return <Screen id="015"><LoadingState /></Screen>;
  return (
    <Screen id="015" description="Enter details exactly as they appear on your incorporation and tax certificates — they are checked during KYB.">
      <Card>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <div className="cz-grid cz-grid-2">
            <TextInput label="Registered legal name" value={f.legalName} onChange={set('legalName')} error={m.fieldErrors.legalName} />
            <TextInput label="Trade / brand name (optional)" value={f.tradeName} onChange={set('tradeName')} error={m.fieldErrors.tradeName} />
            <TextInput label="Registration number (CIN / LLPIN)" value={f.registrationNumber} onChange={set('registrationNumber')} error={m.fieldErrors.registrationNumber} />
            <TextInput label="GSTIN (optional)" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} error={m.fieldErrors.gstin} />
            <TextInput label="City" value={f.city} onChange={set('city')} error={m.fieldErrors.city} />
            <TextInput label="Country (ISO code)" value={f.country} onChange={set('country')} error={m.fieldErrors.country} maxLength={2} />
            <TextInput label="Website (optional)" type="url" value={f.website} onChange={set('website')} error={m.fieldErrors.website} placeholder="https://" />
            <TextInput label="Employees (optional)" inputMode="numeric" value={f.employees} onChange={set('employees')} error={m.fieldErrors.employees} />
            <TextInput label="Annual turnover, ₹ (optional)" inputMode="decimal" value={f.annualTurnover} onChange={set('annualTurnover')} error={m.fieldErrors.annualTurnover} />
          </div>
          <Button type="submit" loading={m.pending} disabled={locked}>Save and continue</Button>
        </form>
      </Card>
    </Screen>
  );
}
