'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ENERGY_CATEGORIES, ENERGY_MODELS, ENERGY_MODEL_LABELS, ENERGY_STATES } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, Segmented, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { Disclaimer } from '@/components/Energy';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const states = ENERGY_STATES.map((s) => ({ value: s.code, label: s.name }));
const SOURCES = [{ value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'bess', label: 'Battery storage' }, { value: 'any', label: 'Any renewable' }];

function Register() {
  const router = useRouter();
  const [side, setSide] = useState<'plant' | 'buyer'>(useSearchParams().get('side') === 'buyer' ? 'buyer' : 'plant');
  const [p, setP] = useState({ category: 'solar_available', title: '', state: 'AP', district: '', source: 'solar', stage: 'operational', capacityMw: '', availableMw: '', tariffRsKwh: '', ppaYears: '', voltageKv: '', models: ['open_access'] as string[], description: '', confidential: false });
  const [b, setB] = useState({ title: '', company: '', industry: '', state: 'AP', district: '', discom: '', consumerCategory: '', contractDemandMva: '', voltageKv: '', monthlyMwh: '', requiredMw: '', source: 'solar', currentTariffRsKwh: '', targetRsKwh: '', ppaYears: '15', startBy: '', models: ['open_access'] as string[], openAccessEligible: true, storageRequired: false, description: '' });
  const save = useMutation(async () => {
    const body = side === 'plant'
      ? { side, ...p, capacityMw: num(p.capacityMw), availableMw: num(p.availableMw), tariffRsKwh: num(p.tariffRsKwh), ppaYears: num(p.ppaYears), voltageKv: num(p.voltageKv) }
      : { side, category: 'solar_required', ...b, contractDemandMva: num(b.contractDemandMva), voltageKv: num(b.voltageKv), monthlyMwh: num(b.monthlyMwh), requiredMw: num(b.requiredMw), currentTariffRsKwh: num(b.currentTariffRsKwh), targetRsKwh: num(b.targetRsKwh), ppaYears: num(b.ppaYears), startBy: b.startBy || undefined };
    const r = await api.post<{ id: string }>('/energy/listings', body);
    router.push(`/energy/listings/${r.id}`); return true;
  });
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'energy-register', title: 'Register on the energy marketplace', access: 'partner' }} eyebrow="Unite Green Park"
      description="Your listing is checked by COLLABIZ before anyone else sees it. Buyer details stay confidential until you accept an introduction.">
      <Segmented label="I am registering" value={side} onChange={(v) => setSide(v as 'plant' | 'buyer')} options={[{ value: 'plant', label: 'A plant / capacity' }, { value: 'buyer', label: 'Power demand (buyer)' }]} />
      {save.error && <Alert tone="danger">{save.error}</Alert>}
      <form noValidate onSubmit={(ev) => { ev.preventDefault(); save.run(); }} className="cz-stack" style={{ gap: 16, marginTop: 12 }}>
        {side === 'plant' ? <>
          <Card title="Plant">
            <div className="cz-grid cz-grid-2">
              <Select label="Listing type" value={p.category} onChange={(ev) => setP({ ...p, category: ev.target.value })} options={ENERGY_CATEGORIES.filter((c) => c.side === 'plant').map((c) => ({ value: c.code, label: c.label }))} />
              <TextInput label="Plant name / headline" value={p.title} onChange={(ev) => setP({ ...p, title: ev.target.value })} error={e.title} placeholder="e.g. 40 MW solar power available — Andhra Pradesh" />
              <Select label="State" value={p.state} onChange={(ev) => setP({ ...p, state: ev.target.value })} options={states} />
              <TextInput label="District" value={p.district} onChange={(ev) => setP({ ...p, district: ev.target.value })} error={e.district} />
              <Select label="Technology" value={p.source} onChange={(ev) => setP({ ...p, source: ev.target.value })} options={SOURCES.slice(0, 4)} />
              <Select label="Stage" value={p.stage} onChange={(ev) => setP({ ...p, stage: ev.target.value })} options={[{ value: 'planned', label: 'Planned' }, { value: 'construction', label: 'Under construction' }, { value: 'operational', label: 'Operational' }]} />
              <TextInput label="Capacity (MW)" inputMode="decimal" value={p.capacityMw} onChange={(ev) => setP({ ...p, capacityMw: ev.target.value })} error={e.capacityMw} />
              <TextInput label="Available for sale (MW, optional)" inputMode="decimal" value={p.availableMw} onChange={(ev) => setP({ ...p, availableMw: ev.target.value })} error={e.availableMw} />
              <TextInput label="Indicative tariff (₹/kWh, optional)" inputMode="decimal" value={p.tariffRsKwh} onChange={(ev) => setP({ ...p, tariffRsKwh: ev.target.value })} />
              <TextInput label="PPA term (years, optional)" inputMode="numeric" value={p.ppaYears} onChange={(ev) => setP({ ...p, ppaYears: ev.target.value })} />
              <TextInput label="Evacuation voltage (kV, optional)" inputMode="decimal" value={p.voltageKv} onChange={(ev) => setP({ ...p, voltageKv: ev.target.value })} />
            </div>
            <ChipSelect legend="Offtake models" options={ENERGY_MODELS.map((m) => ({ value: m, label: ENERGY_MODEL_LABELS[m] }))} value={p.models} onChange={(models) => setP({ ...p, models })} />
            <TextArea label="Description" rows={4} value={p.description} onChange={(ev) => setP({ ...p, description: ev.target.value })} error={e.description} hint="Connectivity, CUF, land, approvals, what you are looking for (at least 20 characters)" />
            <Checkbox label="Keep my business name confidential until I accept an introduction" checked={p.confidential} onChange={(ev) => setP({ ...p, confidential: ev.target.checked })} />
          </Card>
        </> : <>
          <Alert tone="info">Your company name, district and consumption stay confidential. Sellers see the state, MW, tenure and tariff band until you accept an introduction.</Alert>
          <Card title="Buyer">
            <div className="cz-grid cz-grid-2">
              <TextInput label="Headline" value={b.title} onChange={(ev) => setB({ ...b, title: ev.target.value })} error={e.title} placeholder="e.g. 15 MW solar power required — Telangana" />
              <TextInput label="Company / factory" value={b.company} onChange={(ev) => setB({ ...b, company: ev.target.value })} error={e.company} />
              <TextInput label="Industry sector" value={b.industry} onChange={(ev) => setB({ ...b, industry: ev.target.value })} error={e.industry} />
              <Select label="State" value={b.state} onChange={(ev) => setB({ ...b, state: ev.target.value })} options={states} />
              <TextInput label="District" value={b.district} onChange={(ev) => setB({ ...b, district: ev.target.value })} error={e.district} />
              <TextInput label="Distribution company (DISCOM)" value={b.discom} onChange={(ev) => setB({ ...b, discom: ev.target.value })} error={e.discom} />
              <TextInput label="Consumer category" placeholder="e.g. HT-I industrial" value={b.consumerCategory} onChange={(ev) => setB({ ...b, consumerCategory: ev.target.value })} error={e.consumerCategory} />
              <TextInput label="Contract demand (MVA, optional)" inputMode="decimal" value={b.contractDemandMva} onChange={(ev) => setB({ ...b, contractDemandMva: ev.target.value })} />
              <TextInput label="Supply voltage (kV, optional)" inputMode="decimal" value={b.voltageKv} onChange={(ev) => setB({ ...b, voltageKv: ev.target.value })} />
              <TextInput label="Monthly consumption (MWh, optional)" inputMode="decimal" value={b.monthlyMwh} onChange={(ev) => setB({ ...b, monthlyMwh: ev.target.value })} />
            </div>
          </Card>
          <Card title="Requirement">
            <div className="cz-grid cz-grid-2">
              <TextInput label="Renewable power required (MW)" inputMode="decimal" value={b.requiredMw} onChange={(ev) => setB({ ...b, requiredMw: ev.target.value })} error={e.requiredMw} />
              <Select label="Preference" value={b.source} onChange={(ev) => setB({ ...b, source: ev.target.value })} options={SOURCES.filter((s) => s.value !== 'bess')} />
              <TextInput label="Current energy tariff (₹/kWh)" inputMode="decimal" value={b.currentTariffRsKwh} onChange={(ev) => setB({ ...b, currentTariffRsKwh: ev.target.value })} error={e.currentTariffRsKwh} />
              <TextInput label="Target delivered cost (₹/kWh, optional)" inputMode="decimal" value={b.targetRsKwh} onChange={(ev) => setB({ ...b, targetRsKwh: ev.target.value })} />
              <TextInput label="PPA duration (years)" inputMode="numeric" value={b.ppaYears} onChange={(ev) => setB({ ...b, ppaYears: ev.target.value })} error={e.ppaYears} />
              <TextInput label="Expected start (optional)" type="date" value={b.startBy} onChange={(ev) => setB({ ...b, startBy: ev.target.value })} />
            </div>
            <ChipSelect legend="Acceptable structures" options={ENERGY_MODELS.map((m) => ({ value: m, label: ENERGY_MODEL_LABELS[m] }))} value={b.models} onChange={(models) => setB({ ...b, models })} />
            <Checkbox label="We are eligible for open access" checked={b.openAccessEligible} onChange={(ev) => setB({ ...b, openAccessEligible: ev.target.checked })} />
            <Checkbox label="Battery storage required" checked={b.storageRequired} onChange={(ev) => setB({ ...b, storageRequired: ev.target.checked })} />
            <TextArea label="Description" rows={4} value={b.description} onChange={(ev) => setB({ ...b, description: ev.target.value })} error={e.description} hint="Load profile, supply hours, payment security you can offer (at least 20 characters)" />
          </Card>
        </>}
        <div><Button type="submit" variant="accent" loading={save.pending}>Submit for verification</Button></div>
      </form>
      <Disclaimer />
    </Screen>
  );
}
export default function RegisterPage() { return <Suspense fallback={null}><Register /></Suspense>; }
