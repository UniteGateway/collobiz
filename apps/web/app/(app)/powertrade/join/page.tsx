'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { INDIA_STATES, PT_CONTRIBUTION_KINDS, PT_INTERESTS, PT_SOURCES, type PtContributionKind, type PtInterest, type PtSource } from '@collabiz/types';
import { Alert, Button, Checkbox, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PtHeader, PtNav, rupees } from '@/components/Powertrade';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Contribution { id: string; kind: PtContributionKind; title: string; keywords: string[]; capacity: string | null; locations: string | null; active: boolean }
interface ProfileResp {
  profile: { industry: string; state: string; discom: string | null; gstin: string | null; about: string | null; interests: PtInterest[]; shareProducts: boolean; shareEnergySummary: boolean } | null;
  energy: { monthlyUnits: number; tariffPaisePerKwh: number; contractDemandKva: number; voltageKv: number; consumerCategory: string; preferredSources: PtSource[]; rtcNeeded: boolean; ppaYears: number; rooftopKwp: number } | null;
  contributions: Contribution[];
}
const STEPS = ['Business identity', 'Electricity profile', 'Products & services', 'Activation'];
const num = (v: string) => Number(v.replace(/[^\d.]/g, '') || 0);

/** Join POWERTRADE: business identity, interests, electricity profile, products and services. */
export default function JoinPowertrade() {
  const q = useQuery<ProfileResp>('/powertrade/profile');
  const { me } = useSession();
  const [step, setStep] = useState(0);
  if (q.error) return <Screen page={{ key: 'powertrade-join', title: 'Join POWERTRADE', access: 'partner' }} header={false}><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  return (
    <Screen page={{ key: 'powertrade-join', title: 'Join POWERTRADE', access: 'partner' }} header={false}>
      <PtHeader title={q.data?.profile ? 'My POWERTRADE profile' : 'Join POWERTRADE'} lead={`${me?.activeOrg?.name ?? 'Your business'} · your existing COLLABIZ business identity is used — nothing new to create.`} />
      <PtNav />
      <ol className="pt-steps">{STEPS.map((s, i) => <li key={s} data-on={i === step} data-done={i < step}><button type="button" onClick={() => setStep(i)} disabled={i > 0 && !q.data?.profile}>{i + 1}. {s}</button></li>)}</ol>
      {!q.data ? <Skeleton height={300} /> : step === 0 ? <Identity d={q.data} onDone={() => { q.reload(); setStep(1); }} />
        : step === 1 ? <Energy d={q.data} onDone={() => { q.reload(); setStep(2); }} />
        : step === 2 ? <Contributions d={q.data} reload={q.reload} onNext={() => setStep(3)} />
        : <Activation d={q.data} />}
    </Screen>
  );
}

function Identity({ d, onDone }: { d: ProfileResp; onDone: () => void }) {
  const p = d.profile;
  const [f, setF] = useState({ industry: p?.industry ?? '', state: p?.state ?? 'Telangana', discom: p?.discom ?? '', gstin: p?.gstin ?? '', about: p?.about ?? '', interests: p?.interests ?? ([] as PtInterest[]), shareProducts: p?.shareProducts ?? true, shareEnergySummary: p?.shareEnergySummary ?? false });
  const m = useMutation(async () => { await api.put('/powertrade/profile', f); onDone(); return true; });
  const tog = (k: PtInterest) => setF({ ...f, interests: f.interests.includes(k) ? f.interests.filter((x) => x !== k) : [...f.interests, k] });
  return (
    <form className="cz-card cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-identity">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <div className="cz-grid cz-grid-2">
        <TextInput label="Industry" placeholder="e.g. Steel manufacturer" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} error={m.fieldErrors.industry} />
        <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={INDIA_STATES.map(([, n]) => ({ value: n, label: n }))} />
        <TextInput label="DISCOM (optional)" value={f.discom} onChange={(e) => setF({ ...f, discom: e.target.value })} />
        <TextInput label="GSTIN (optional)" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} error={m.fieldErrors.gstin} />
      </div>
      <TextArea label="About your business (optional)" rows={2} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} />
      <fieldset className="cz-fieldset"><legend>What do you want from POWERTRADE?</legend>
        <div className="pt-interests">{(Object.keys(PT_INTERESTS) as PtInterest[]).map((k) => <label key={k} className="pt-pick" data-on={f.interests.includes(k)}><input type="checkbox" checked={f.interests.includes(k)} onChange={() => tog(k)} />{PT_INTERESTS[k]}</label>)}</div>
        {m.fieldErrors.interests && <p className="cz-error-text">{m.fieldErrors.interests}</p>}
      </fieldset>
      <fieldset className="cz-fieldset"><legend>What may others see?</legend>
        <Checkbox label="Show my products and services to other members and on my business page" checked={f.shareProducts} onChange={(e) => setF({ ...f, shareProducts: e.target.checked })} />
        <Checkbox label="Show a summary of my power needs (type and size only — never bills or tariffs)" checked={f.shareEnergySummary} onChange={(e) => setF({ ...f, shareEnergySummary: e.target.checked })} />
      </fieldset>
      <div><Button type="submit" loading={m.pending}>Save and continue</Button></div>
    </form>
  );
}

function Energy({ d, onDone }: { d: ProfileResp; onDone: () => void }) {
  const e0 = d.energy;
  const [f, setF] = useState({ monthlyUnits: String(e0?.monthlyUnits ?? ''), tariff: e0 ? String(e0.tariffPaisePerKwh / 100) : '', cd: String(e0?.contractDemandKva ?? ''), kv: String(e0?.voltageKv ?? '11'), category: e0?.consumerCategory ?? 'ht_industrial', sources: e0?.preferredSources ?? (['solar'] as PtSource[]), rtc: e0?.rtcNeeded ?? false, years: String(e0?.ppaYears ?? 15), rooftop: String(e0?.rooftopKwp ?? 0) });
  const m = useMutation(async () => {
    await api.post('/powertrade/energy-needs', { monthlyUnits: Math.round(num(f.monthlyUnits)), tariffPaisePerKwh: Math.round(num(f.tariff) * 100), contractDemandKva: num(f.cd), voltageKv: num(f.kv), consumerCategory: f.category, preferredSources: f.sources, rtcNeeded: f.rtc, ppaYears: Math.round(num(f.years)), rooftopKwp: num(f.rooftop) });
    onDone(); return true;
  });
  const bill = num(f.monthlyUnits) * num(f.tariff);
  return (
    <form className="cz-card cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="pt-energy">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <p className="cz-muted" style={{ margin: 0 }}>From your electricity bill. Bills stay private — only you and the Unite team see them.</p>
      <div className="cz-grid cz-grid-3">
        <TextInput label="Monthly units (kWh)" inputMode="numeric" value={f.monthlyUnits} onChange={(e) => setF({ ...f, monthlyUnits: e.target.value })} error={m.fieldErrors.monthlyUnits} />
        <TextInput label="Average tariff (₹/kWh, all-in)" inputMode="decimal" value={f.tariff} onChange={(e) => setF({ ...f, tariff: e.target.value })} error={m.fieldErrors.tariffPaisePerKwh} />
        <TextInput label="Contract demand (kVA)" inputMode="numeric" value={f.cd} onChange={(e) => setF({ ...f, cd: e.target.value })} error={m.fieldErrors.contractDemandKva} />
        <TextInput label="Supply voltage (kV)" inputMode="decimal" value={f.kv} onChange={(e) => setF({ ...f, kv: e.target.value })} />
        <Select label="Consumer category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={[{ value: 'ht_industrial', label: 'HT industrial' }, { value: 'ht_commercial', label: 'HT commercial' }, { value: 'lt_industrial', label: 'LT industrial' }, { value: 'lt_commercial', label: 'LT commercial' }, { value: 'other', label: 'Other' }]} />
        <TextInput label="Preferred PPA length (years)" inputMode="numeric" value={f.years} onChange={(e) => setF({ ...f, years: e.target.value })} />
        <TextInput label="Rooftop solar (kWp, if any)" inputMode="numeric" value={f.rooftop} onChange={(e) => setF({ ...f, rooftop: e.target.value })} />
      </div>
      <fieldset className="cz-fieldset"><legend>Preferred sources</legend>
        <div className="pt-interests">{(Object.keys(PT_SOURCES) as PtSource[]).map((k) => <label key={k} className="pt-pick" data-on={f.sources.includes(k)}><input type="checkbox" checked={f.sources.includes(k)} onChange={() => setF({ ...f, sources: f.sources.includes(k) ? f.sources.filter((x) => x !== k) : [...f.sources, k] })} />{PT_SOURCES[k]}</label>)}</div>
      </fieldset>
      <Checkbox label="I need round-the-clock power" checked={f.rtc} onChange={(e) => setF({ ...f, rtc: e.target.checked })} />
      {bill > 0 && <p className="pt-note">Present bill ≈ <strong>{rupees(Math.round(bill * 100))}</strong> a month (units × tariff).</p>}
      <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={m.pending}>Save and continue</Button><Button type="button" variant="ghost" onClick={onDone}>Skip — I only want to do business</Button></div>
    </form>
  );
}

function Contributions({ d, reload, onNext }: { d: ProfileResp; reload: () => void; onNext: () => void }) {
  const [f, setF] = useState({ kind: 'product' as PtContributionKind, title: '', keywords: '', capacity: '', locations: '', exportCapable: false });
  const add = useMutation(async () => { await api.post('/powertrade/business-contributions', { ...f, keywords: f.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean) }); setF({ ...f, title: '', keywords: '', capacity: '' }); reload(); return true; });
  const del = useMutation(async (id: string) => { await api.delete(`/powertrade/business-contributions/${id}`); reload(); return true; });
  const list = d.contributions.filter((c) => c.active);
  return (
    <div className="cz-stack" style={{ gap: 12 }} id="contributions">
      <section className="cz-card">
        <h2 style={{ marginTop: 0 }}>What can your business contribute?</h2>
        {list.length > 0 && <ul className="cz-umeet-list">{list.map((c) => <li key={c.id} data-contribution={c.title}><div><strong>{c.title}</strong><span>{PT_CONTRIBUTION_KINDS[c.kind]}{c.capacity ? ` · ${c.capacity}` : ''}{c.locations ? ` · ${c.locations}` : ''}{c.keywords.length ? ` · ${c.keywords.join(', ')}` : ''}</span></div><Button size="sm" variant="ghost" onClick={() => del.run(c.id)}>Remove</Button></li>)}</ul>}
        <form className="cz-stack" style={{ gap: 10, marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); add.run(); }} data-form="pt-contribution">
          {add.error && <Alert tone="danger">{add.error}</Alert>}
          <div className="cz-grid cz-grid-3">
            <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PtContributionKind })} options={Object.entries(PT_CONTRIBUTION_KINDS).map(([value, label]) => ({ value, label }))} />
            <TextInput label="What it is" placeholder="e.g. Solar module mounting structures" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={add.fieldErrors.title} />
            <TextInput label="Keywords buyers search for" placeholder="steel, mounting, structure" value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} />
            <TextInput label="Capacity (optional)" placeholder="400 t/month" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
            <TextInput label="Supply locations (optional)" value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })} />
            <Checkbox label="Can export" checked={f.exportCapable} onChange={(e) => setF({ ...f, exportCapable: e.target.checked })} />
          </div>
          <div><Button type="submit" variant="secondary" loading={add.pending}>Add</Button></div>
        </form>
      </section>
      <div><Button onClick={onNext}>Continue</Button></div>
    </div>
  );
}

function Activation({ d }: { d: ProfileResp }) {
  const ok = !!d.profile;
  useEffect(() => { /* nothing to load */ }, []);
  return (
    <section className="cz-card cz-stack" style={{ gap: 10 }} data-pt-activated={ok}>
      <h2 style={{ margin: 0 }}>{ok ? 'You are on POWERTRADE' : 'Save your business identity first'}</h2>
      <ul className="pt-check">
        <li data-ok={ok}>Business identity and interests</li>
        <li data-ok={!!d.energy}>Electricity profile {d.energy ? `· ${d.energy.monthlyUnits.toLocaleString('en-IN')} units/month` : '(optional if you only want business)'}</li>
        <li data-ok={d.contributions.some((c) => c.active)}>Products, capacity or services</li>
        <li data-ok={false}>Documents — upload bills, catalogues and certificates in the <Link href="/vault">document vault</Link> and reference them in each collaboration</li>
      </ul>
      <p className="cz-muted" style={{ margin: 0 }}>Only what you allowed is shown to others. Bills, bank details and PPA terms are never published.</p>
      <div className="cz-row" style={{ gap: 8 }}><Link href="/powertrade/matches" className="cz-btn cz-btn-accent">See my matches</Link><Link href="/powertrade/power" className="cz-btn cz-btn-secondary">Compare power options</Link></div>
    </section>
  );
}
