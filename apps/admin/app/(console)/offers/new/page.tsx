'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { COUNTRIES, LOOKING_FOR, LOOKING_FOR_LABELS, OFFER_KINDS, OFFER_KIND_LABELS, OFFER_PRICING, OFFER_PRICING_LABELS, PARTNER_TYPES, PARTNER_TYPE_LABELS, PERCENT_REWARDS, PRICE_UNITS, REWARD_LABELS, REWARD_MODELS, SECTORS, newIdempotencyKey, regionLabel } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, PageHeader, SearchInput, Segmented, Select, Tag, TextArea, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { INDIA_STATES, toMinor } from '@/lib/regions';

interface Partner { id: string; name: string; city: string | null; country: string; level: string; partnerTypes: string[]; sectors: string[]; regions: string[]; capacity: { hasOffice: boolean; officeLocations: string[]; totalManpower: number; idleManpower: number; lookingFor: string[] } | null }
const ABROAD = COUNTRIES.filter(([c]) => c !== 'IN');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const inTwoWeeks = () => { const d = new Date(Date.now() + 14 * 86400_000); d.setHours(18, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

/** New direct offer: what, who receives it, price and reward, requirements. */
function NewOfferForm() {
  const router = useRouter();
  const { me } = useSession();
  const params = useSearchParams();
  const ventures = useQuery<{ id: string; name: string; sector: string; open: boolean; promoters: number }[]>('/admin/ventures');
  const openVentures = (ventures.data ?? []).filter((v) => v.open);
  const [ventureId, setVentureId] = useState(params.get('venture') ?? '');
  const venture = openVentures.find((v) => v.id === ventureId);
  const companies = (me?.memberships ?? []).filter((m) => m.orgType === 'group_company');
  const [gc, setGc] = useState('');
  const [f, setF] = useState({ title: '', summary: '', kind: 'sell_products', sector: 'solar', states: [] as string[], countries: [] as string[], pricing: 'unite_price', price: '', priceUnit: 'per unit', model: 'commission', value: '', allowed: ['commission'] as string[], needsOffice: false, minManpower: '', exclusive: false, places: '1', deadline: inTwoWeeks() });
  const [mode, setMode] = useState('all');
  const [chosen, setChosen] = useState<string[]>([]);
  const [flt, setFlt] = useState({ sectors: [] as string[], states: [] as string[], types: [] as string[], hasOffice: false, minIdle: '', lookingFor: [] as string[] });
  const [search, setSearch] = useState('');
  const partners = useQuery<Partner[]>(mode === 'selected' ? '/admin/offers/partners' : null);
  const target = useMemo(() => (mode === 'all' || mode === 'promoters' ? { mode } : mode === 'selected' ? { mode, organizationIds: chosen } : { mode, sectors: flt.sectors, regions: flt.states, partnerTypes: flt.types, hasOffice: flt.hasOffice || undefined, minIdleManpower: flt.minIdle ? Number(flt.minIdle) : undefined, lookingFor: flt.lookingFor }), [mode, chosen, flt]);
  const [aud, setAud] = useState<{ count: number; partners: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    if (mode === 'selected' && !chosen.length) { setAud({ count: 0, partners: [] }); return; }
    const t = setTimeout(() => { api.post<{ count: number; partners: { id: string; name: string }[] }>('/admin/offers/audience', { target, ventureId: ventureId || undefined }).then(setAud).catch(() => setAud(null)); }, 250);
    return () => clearTimeout(t);
  }, [target, mode, chosen.length]);
  useEffect(() => { if (f.pricing !== 'partner_quote' && !f.allowed.includes(f.model)) setF((x) => ({ ...x, allowed: [...x.allowed, x.model] })); }, [f.model, f.pricing]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = useMemo(newIdempotencyKey, []);
  const pct = PERCENT_REWARDS.has(f.model);
  const create = useMutation(async () => {
    const o = await api.request<{ id: string }>('POST', '/admin/offers', {
      groupCompanyId: gc || companies[0]?.organizationId, ventureId: ventureId || undefined, title: f.title, summary: f.summary, kind: f.kind, sector: f.sector, regions: [...f.states, ...f.countries], target,
      pricing: f.pricing, ...(f.pricing !== 'partner_quote' ? { unitePrice: toMinor(f.price), priceUnit: f.price ? f.priceUnit : undefined, uniteReward: { model: f.model, ...(pct ? { bps: Math.round(Number(f.value) * 100) } : { amount: toMinor(f.value) }) } } : {}),
      rewardModels: f.allowed, needsOffice: f.needsOffice, minManpower: f.minManpower ? Number(f.minManpower) : undefined, exclusive: f.exclusive, maxSelections: f.exclusive ? 1 : Number(f.places || 1),
      deadline: new Date(f.deadline).toISOString(),
    }, { idempotencyKey: key });
    router.push(`/offers/${o.id}`); return true;
  });
  const e = create.fieldErrors;
  const shown = (partners.data ?? []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <PageHeader title="New direct offer" breadcrumb="Unite Group Administration / Direct offers" description="Partners see this in their dashboard and on the app. Only you see their responses." />
      <form noValidate onSubmit={(ev) => { ev.preventDefault(); create.run(); }} className="cz-stack">
        {create.error && <Alert tone="danger">{create.error}</Alert>}
        <Card title="1. What you are offering">
          <Select label="Unite business (optional)" value={ventureId} onChange={(ev) => { setVentureId(ev.target.value); const v = openVentures.find((x) => x.id === ev.target.value); if (v) setF((x) => ({ ...x, sector: v.sector })); }} placeholder="Not for a specific business" options={openVentures.map((v) => ({ value: v.id, label: v.name }))} hint="Partners see which Unite business the offer is for; its approved promoters can receive it directly." />
          {companies.length > 1 && <Select label="Sent by" value={gc} onChange={(ev) => setGc(ev.target.value)} options={companies.map((c) => ({ value: c.organizationId, label: c.orgName }))} />}
          <TextInput label="Title" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} hint="e.g. Sell rooftop solar packages to factories in your region" />
          <TextArea label="What you need and what the partner gets" value={f.summary} onChange={(ev) => setF({ ...f, summary: ev.target.value })} error={e.summary} hint="At least 30 characters" />
          <div className="cz-grid cz-grid-2">
            <Select label="Type of offer" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value })} options={OFFER_KINDS.map((k) => ({ value: k, label: OFFER_KIND_LABELS[k] }))} />
            <Select label="Sector" value={f.sector} onChange={(ev) => setF({ ...f, sector: ev.target.value })} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          </div>
          <ChipSelect legend="Indian states (leave empty for anywhere)" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} value={f.states} onChange={(states) => setF({ ...f, states })} />
          <ChipSelect legend="Countries" options={ABROAD.map(([v, l]) => ({ value: v, label: l }))} value={f.countries} onChange={(countries) => setF({ ...f, countries })} />
        </Card>

        <Card title="2. Who receives it">
          <div style={{ marginBottom: 14 }}><Segmented label="Audience" value={mode} onChange={setMode} options={[...(venture ? [{ value: 'promoters', label: `${venture.name} promoters (${venture.promoters})` }] : []), { value: 'all', label: 'All verified partners' }, { value: 'selected', label: 'Choose partners' }, { value: 'filtered', label: 'Filter by capacity' }]} /></div>
          {mode === 'selected' && (
            <>
              <SearchInput label="Search partners" value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Company name" />
              <ul className="cz-pick-list" aria-label="Verified partners">
                {shown.map((p) => (
                  <li key={p.id}>
                    <Checkbox label={<span><strong>{p.name}</strong> <span className="cz-muted">· {[p.city, p.partnerTypes.map((t) => PARTNER_TYPE_LABELS[t] ?? t).join(', ')].filter(Boolean).join(' · ')}</span>
                      <span className="cz-pick-meta">{p.capacity ? <>{p.capacity.hasOffice ? <Tag>Office: {p.capacity.officeLocations.join(', ')}</Tag> : <Tag>No office</Tag>} <Tag>{p.capacity.idleManpower} of {p.capacity.totalManpower} people free</Tag></> : <span className="cz-muted">Capacity not declared</span>}</span></span>}
                      checked={chosen.includes(p.id)} onChange={(ev) => setChosen(ev.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {mode === 'filtered' && (
            <>
              <ChipSelect legend="Works in sectors" options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} value={flt.sectors} onChange={(sectors) => setFlt({ ...flt, sectors })} />
              <ChipSelect legend="Covers states" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} value={flt.states} onChange={(states) => setFlt({ ...flt, states })} />
              <ChipSelect legend="Business type" options={PARTNER_TYPES.map((t) => ({ value: t, label: PARTNER_TYPE_LABELS[t] ?? t }))} value={flt.types} onChange={(types) => setFlt({ ...flt, types })} />
              <ChipSelect legend="Looking for" options={LOOKING_FOR.map((k) => ({ value: k, label: LOOKING_FOR_LABELS[k] }))} value={flt.lookingFor} onChange={(lookingFor) => setFlt({ ...flt, lookingFor })} />
              <div className="cz-grid cz-grid-2" style={{ alignItems: 'end' }}>
                <Checkbox label="Has an existing office or setup" checked={flt.hasOffice} onChange={(ev) => setFlt({ ...flt, hasOffice: ev.target.checked })} />
                <TextInput label="At least this many people free" inputMode="numeric" value={flt.minIdle} onChange={(ev) => setFlt({ ...flt, minIdle: ev.target.value })} />
              </div>
            </>
          )}
          <div className="cz-audience" role="status" aria-live="polite">
            {aud ? <><strong>{aud.count} verified partner{aud.count === 1 ? '' : 's'}</strong> will receive this{aud.partners.length ? `: ${aud.partners.slice(0, 8).map((p) => p.name).join(', ')}${aud.count > 8 ? ' …' : ''}` : ''}</> : 'Checking audience…'}
          </div>
          {e.target && <Alert tone="warning">{e.target}</Alert>}
        </Card>

        <Card title="3. Price and reward">
          <Select label="Pricing" value={f.pricing} onChange={(ev) => setF({ ...f, pricing: ev.target.value })} options={OFFER_PRICING.map((p) => ({ value: p, label: OFFER_PRICING_LABELS[p] }))} hint={f.pricing === 'unite_price' ? 'Partners accept your terms or decline.' : f.pricing === 'partner_quote' ? 'Partners must quote; you compare and choose.' : 'Partners can accept your terms or propose their own.'} />
          {f.pricing !== 'partner_quote' && (
            <div className="cz-grid cz-grid-2">
              <TextInput label="Your price (₹, optional)" inputMode="decimal" value={f.price} onChange={(ev) => setF({ ...f, price: ev.target.value })} error={e.unitePrice} hint="Selling price or budget" />
              <Select label="Price is" value={f.priceUnit} onChange={(ev) => setF({ ...f, priceUnit: ev.target.value })} options={PRICE_UNITS.map((u) => ({ value: u, label: cap(u) }))} error={e.priceUnit} />
              <Select label="Partner reward" value={f.model} onChange={(ev) => setF({ ...f, model: ev.target.value, value: '' })} options={REWARD_MODELS.map((m) => ({ value: m, label: REWARD_LABELS[m] }))} />
              <TextInput label={pct ? 'Reward (%)' : 'Reward (₹)'} inputMode="decimal" value={f.value} onChange={(ev) => setF({ ...f, value: ev.target.value })} error={e.uniteReward ?? e['uniteReward.bps']} />
            </div>
          )}
          <ChipSelect legend="Rewards partners may propose" options={REWARD_MODELS.map((m) => ({ value: m, label: REWARD_LABELS[m] }))} value={f.allowed} onChange={(allowed) => setF({ ...f, allowed })} />
          {e.rewardModels && <Alert tone="warning">{e.rewardModels}</Alert>}
          {f.allowed.some((m) => m === 'profit_share' || m === 'equity') && <Alert tone="info">Profit share and equity are shown to partners as indicative. They become binding only through an agreement drafted and signed in Contracts.</Alert>}
        </Card>

        <Card title="4. Requirements and places">
          <div className="cz-grid cz-grid-2" style={{ alignItems: 'end' }}>
            <Checkbox label="Partner must have an existing office or setup" checked={f.needsOffice} onChange={(ev) => setF({ ...f, needsOffice: ev.target.checked })} />
            <TextInput label="Minimum people (optional)" inputMode="numeric" value={f.minManpower} onChange={(ev) => setF({ ...f, minManpower: ev.target.value })} error={e.minManpower} />
            <Checkbox label="Exclusive — one partner only" checked={f.exclusive} onChange={(ev) => setF({ ...f, exclusive: ev.target.checked })} />
            {!f.exclusive && <TextInput label="How many partners you will select" inputMode="numeric" value={f.places} onChange={(ev) => setF({ ...f, places: ev.target.value })} error={e.maxSelections} />}
            <TextInput label="Responses close" type="datetime-local" value={f.deadline} onChange={(ev) => setF({ ...f, deadline: ev.target.value })} error={e.deadline} />
          </div>
        </Card>
        <div className="cz-row"><Button type="submit" loading={create.pending} disabled={!aud?.count}>Send to {aud?.count ?? 0} partner{aud?.count === 1 ? '' : 's'}</Button><Button type="button" variant="secondary" onClick={() => router.push('/offers')}>Cancel</Button></div>
        {[...f.states, ...f.countries].length > 0 && <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Regions: {[...f.states, ...f.countries].map(regionLabel).join(', ')}</p>}
      </form>
    </div>
  );
}

export default function NewOffer() {
  return <Suspense><NewOfferForm /></Suspense>;
}
