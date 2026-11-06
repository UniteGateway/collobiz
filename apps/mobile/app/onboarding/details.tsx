import { useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { Button, Field, Notice, ScreenView } from '@/components/ui';
import { api } from '@/api';
import { useAction, nextRoute, toMinor } from '@/hooks';
import { useSession } from '@/session';

/** Screens 014 (individual) / 015 (company) — native registration details. */
export default function Details() {
  const router = useRouter();
  const { me } = useSession();
  const individual = me?.activeOrg?.type === 'partner_individual';
  const [f, setF] = useState<Record<string, string>>({ country: 'IN' });
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const a = useAction(async () => {
    if (individual) await api.put('/onboarding/individual', { displayName: f.displayName, profession: f.profession, city: f.city, country: f.country, yearsExperience: Number(f.yearsExperience || 0), pan: f.pan || undefined });
    else await api.put('/onboarding/company', { legalName: f.legalName, tradeName: f.tradeName || undefined, registrationNumber: f.registrationNumber, gstin: f.gstin || undefined, country: f.country, city: f.city, employees: f.employees ? Number(f.employees) : undefined, annualTurnover: toMinor(f.annualTurnover ?? '') });
    router.push(nextRoute('details'));
  });
  const e = a.fieldErrors;
  return (
    <ScreenView id={individual ? '014' : '015'} footer={<Button title="Save and continue" onPress={() => a.run()} loading={a.busy} />}>
      <Stack.Screen options={{ title: individual ? 'Your details' : 'Company details' }} />
      {a.error && <Notice tone="danger">{a.error}</Notice>}
      {individual ? (
        <>
          <Field label="Name shown to partners" value={f.displayName} onChangeText={set('displayName')} error={e.displayName} />
          <Field label="Profession" value={f.profession} onChangeText={set('profession')} error={e.profession} />
          <Field label="Years of experience" value={f.yearsExperience} onChangeText={set('yearsExperience')} keyboardType="number-pad" error={e.yearsExperience} />
          <Field label="PAN (optional)" value={f.pan} onChangeText={(v) => setF({ ...f, pan: v.toUpperCase() })} autoCapitalize="characters" error={e.pan} hint="Encrypted; only last 4 shown" />
        </>
      ) : (
        <>
          <Field label="Registered legal name" value={f.legalName} onChangeText={set('legalName')} error={e.legalName} />
          <Field label="Trade name (optional)" value={f.tradeName} onChangeText={set('tradeName')} />
          <Field label="Registration number (CIN / LLPIN)" value={f.registrationNumber} onChangeText={set('registrationNumber')} error={e.registrationNumber} autoCapitalize="characters" />
          <Field label="GSTIN (optional)" value={f.gstin} onChangeText={(v) => setF({ ...f, gstin: v.toUpperCase() })} error={e.gstin} autoCapitalize="characters" />
          <Field label="Employees (optional)" value={f.employees} onChangeText={set('employees')} keyboardType="number-pad" />
          <Field label="Annual turnover ₹ (optional)" value={f.annualTurnover} onChangeText={set('annualTurnover')} keyboardType="decimal-pad" />
        </>
      )}
      <Field label="City" value={f.city} onChangeText={set('city')} error={e.city} />
      <Field label="Country (ISO code)" value={f.country} onChangeText={(v) => setF({ ...f, country: v.toUpperCase() })} maxLength={2} error={e.country} />
    </ScreenView>
  );
}
