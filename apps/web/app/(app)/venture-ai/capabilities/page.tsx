'use client';
import { useEffect, useState } from 'react';
import { VAI_ROLES, type VaiRole } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { VaiHeader, VaiNav } from '@/components/VentureAi';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Cap { roles: VaiRole[]; categories: string[]; countries: string[]; locations: string | null; capacity: string | null; spareCapacity: string | null; machinery: string | null; technology: string | null; moq: string | null; investmentMinPaise: number | null; investmentMaxPaise: number | null; certifications: string[]; territories: string[]; languages: string[]; experience: string | null; available: boolean; contactPermission: string }
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const L = (p: number | null) => (p == null ? "" : String(p / 1e9));

/** Member capability profile — what your business can contribute to a venture. Used only for matching; contact details are never shown. */
export default function VaiCapabilities() {
  const q = useQuery<{ capability: Cap | null }>('/venture-ai/capabilities');
  type Form = { roles: string[]; available: boolean; [k: string]: string | string[] | boolean };
  const [f, setF] = useState<Form>();
  useEffect(() => {
    if (!q.data || f) return; const c = q.data.capability;
    setF({ roles: c?.roles ?? [], categories: c?.categories.join(', ') ?? '', countries: c?.countries.join(', ') ?? 'IN', locations: c?.locations ?? '', capacity: c?.capacity ?? '', spareCapacity: c?.spareCapacity ?? '', machinery: c?.machinery ?? '', technology: c?.technology ?? '', moq: c?.moq ?? '',
      invMin: L(c?.investmentMinPaise ?? null), invMax: L(c?.investmentMaxPaise ?? null), certifications: c?.certifications.join(', ') ?? '', territories: c?.territories.join(', ') ?? '', languages: c?.languages.join(', ') ?? '', experience: c?.experience ?? '', available: c?.available ?? true, contactPermission: c?.contactPermission ?? 'via_collabiz' });
  }, [q.data, f]);
  const save = useMutation(async () => {
    const v = f! as Record<string, string> & { roles: string[]; available: boolean };
    await api.put('/venture-ai/capabilities', { roles: v.roles, categories: list(v.categories), countries: list(v.countries).map((c) => c.toUpperCase()), locations: v.locations || undefined, capacity: v.capacity || undefined, spareCapacity: v.spareCapacity || undefined, machinery: v.machinery || undefined, technology: v.technology || undefined, moq: v.moq || undefined,
      investmentMinPaise: v.invMin ? Math.round(Number(v.invMin) * 1e9) : undefined, investmentMaxPaise: v.invMax ? Math.round(Number(v.invMax) * 1e9) : undefined, certifications: list(v.certifications), territories: list(v.territories), languages: list(v.languages), experience: v.experience || undefined, available: v.available, contactPermission: v.contactPermission });
    q.reload(); return true;
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f!, [k]: e.target.value });
  const s = (k: string) => (f?.[k] as string) ?? '';
  const fe = save.fieldErrors;
  return (
    <Screen page={{ key: 'venture-ai-capabilities', title: 'My capabilities', access: 'partner' }} header={false}>
      <VaiHeader title="My capabilities" lead="Tell Venture AI what your business can contribute. Venture owners see your business name, roles and why you match — never your contact details until you accept an invitation." />
      <VaiNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !f ? <Skeleton height={300} /> : (
        <form className="cz-stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          {save.data && !save.error && <Alert tone="success">Saved. You will be suggested for matching roles.</Alert>}
          <Card title="Roles you can play">
            <ChipSelect legend="Roles" options={Object.entries(VAI_ROLES).map(([value, label]) => ({ value, label }))} value={f.roles} onChange={(roles) => setF({ ...f, roles })} />
            {fe.roles && <Alert tone="danger">{fe.roles}</Alert>}
          </Card>
          <Card title="What and where">
            <div className="vai-grid">
              <TextInput label="Product categories" hint="comma separated, e.g. Conveyors, Paints" value={s('categories')} onChange={set('categories')} />
              <TextInput label="Countries (ISO codes)" value={s('countries')} onChange={set('countries')} error={fe.countries} />
              <TextInput label="Locations" value={s('locations')} onChange={set('locations')} />
              <TextInput label="Territories" hint="comma separated" value={s('territories')} onChange={set('territories')} />
              <TextInput label="Capacity" value={s('capacity')} onChange={set('capacity')} />
              <TextInput label="Spare capacity" value={s('spareCapacity')} onChange={set('spareCapacity')} />
              <TextInput label="Minimum order quantity" value={s('moq')} onChange={set('moq')} />
              <TextInput label="Certifications" hint="comma separated" value={s('certifications')} onChange={set('certifications')} />
              <TextInput label="Languages" value={s('languages')} onChange={set('languages')} />
              <TextInput label="Investment from (₹ crore)" inputMode="decimal" value={s('invMin')} onChange={set('invMin')} />
              <TextInput label="Investment up to (₹ crore)" inputMode="decimal" value={s('invMax')} onChange={set('invMax')} error={fe.investmentMaxPaise} />
            </div>
            <TextArea label="Machinery" value={s('machinery')} onChange={set('machinery')} rows={2} />
            <TextArea label="Technology" value={s('technology')} onChange={set('technology')} rows={2} />
            <TextArea label="Experience" value={s('experience')} onChange={set('experience')} rows={3} />
          </Card>
          <Card title="Availability and privacy">
            <Checkbox label="Available for new ventures" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} />
            <Select label="Contact" value={s('contactPermission')} onChange={set('contactPermission')} options={[{ value: 'via_collabiz', label: 'Only through COLLABIZ messages' }, { value: 'after_acceptance', label: 'Share contact details after I accept an invitation' }]} />
          </Card>
          <div><Button type="submit" loading={save.pending}>Save capabilities</Button></div>
        </form>
      )}
    </Screen>
  );
}
