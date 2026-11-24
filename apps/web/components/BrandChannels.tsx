'use client';
/** Unite brand products — the matching agent and the channel-partner application form (microsites, home, /partner-with-unite). */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BUSINESS_TYPES, CHANNEL_ROLES, INDIA_STATES, channelRoleLabel, type ChannelMatch } from '@collabiz/types';
import { Alert, Button, Select, TextArea, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

export interface BrandProductItem { slug: string; subdomain: string; name: string; tagline: string; roles: string[]; buyers: string; oem: { status: string; partner: string | null } | null }
/** Published Unite brand products (added by Unite admins). */
export const useBrandProducts = () => useQuery<{ items: BrandProductItem[] }>('/public/brand-products');

const num = (v: string) => (v.trim() ? Math.max(0, Math.round(Number(v))) : undefined);

/** "Which Unite product fits me?" — rules-based, with the reason for every suggestion. */
export function ChannelMatcher({ onPick }: { onPick?: (slug: string, role: string, businessType: string, sizes: { warehouse: string; showroom: string }) => void }) {
  const [f, setF] = useState({ businessType: 'building_materials_dealer', role: '', warehouse: '', showroom: '' });
  const [res, setRes] = useState<ChannelMatch[] | null>(null);
  const m = useMutation(async () => {
    const r = await api.post<{ items: ChannelMatch[] }>('/public/brand-products/match', { businessType: f.businessType, role: f.role || undefined, warehouseSqft: num(f.warehouse), showroomSqft: num(f.showroom) });
    setRes(r.items); return true;
  });
  return (
    <div className="cz-stack" style={{ gap: 12 }} data-matcher>
      <div className="cz-grid cz-grid-2">
        <Select label="What does your business do today?" value={f.businessType} onChange={(e) => setF({ ...f, businessType: e.target.value })} options={BUSINESS_TYPES.map((b) => ({ value: b.code, label: b.label }))} />
        <Select label="Role you want (optional)" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: '', label: 'Suggest one for me' }, ...CHANNEL_ROLES.map((r) => ({ value: r.code, label: r.label }))]} />
        <TextInput label="Warehouse or godown (sq ft, optional)" inputMode="numeric" value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} />
        <TextInput label="Showroom (sq ft, optional)" inputMode="numeric" value={f.showroom} onChange={(e) => setF({ ...f, showroom: e.target.value })} />
      </div>
      <div><Button onClick={() => m.run()} loading={m.pending}>Find my fit</Button></div>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {res && (res.length ? (
        <ul className="cz-gp-list" aria-label="Recommendations">{res.map((r) => (
          <li key={r.slug} data-match={r.slug}>
            <div><strong>{r.name} — {channelRoleLabel(r.role)}</strong> <span className="cz-match-score">{r.score}% fit</span><p>{r.reasons.join(' · ')}</p></div>
            {onPick ? <Button size="sm" variant="secondary" onClick={() => onPick(r.slug, r.role, f.businessType, { warehouse: f.warehouse, showroom: f.showroom })}>Apply for {r.name}</Button>
              : <Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/partner-with-unite?product=${r.slug}&role=${r.role}&type=${f.businessType}`}>Apply</Link>}
          </li>
        ))}</ul>
      ) : <p className="cz-muted">No Unite brand product is an obvious fit for this business yet. You can still apply below, and Unite will review it.</p>)}
      <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Matching agent: suggestions come from the rules shown with each one — your business, your space and the role you want. Unite decides every application.</p>
    </div>
  );
}

export function ChannelApplyForm({ product, role, businessType, sizes, fixedProduct }: { product?: string; role?: string; businessType?: string; sizes?: { warehouse: string; showroom: string }; fixedProduct?: boolean }) {
  const list = useBrandProducts().data?.items ?? [];
  const first = product ?? '';
  const [f, setF] = useState({ productSlug: first, role: role ?? 'dealer', businessType: businessType ?? 'building_materials_dealer', name: '', email: '', phone: '', company: '', state: 'Telangana', district: '', city: '', territory: '', currentBrands: '', experienceYears: '', warehouse: sizes?.warehouse ?? '', showroom: sizes?.showroom ?? '', capacity: '', message: '', consent: false });
  useEffect(() => { if (!f.productSlug && list.length) setF((x) => ({ ...x, productSlug: list[0].slug })); }, [list, f.productSlug]);
  useEffect(() => { setF((x) => ({ ...x, ...(product ? { productSlug: product } : {}), ...(role ? { role } : {}), ...(businessType ? { businessType } : {}), ...(sizes ? { warehouse: sizes.warehouse, showroom: sizes.showroom } : {}) })); }, [product, role, businessType, sizes]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const p = list.find((x) => x.slug === f.productSlug);
  const roles = CHANNEL_ROLES.filter((r) => p?.roles.includes(r.code));
  const [done, setDone] = useState<{ code: string; alsoFits: ChannelMatch[] } | null>(null);
  const [hp, setHp] = useState('');
  const m = useMutation(async () => {
    const r = await api.post<{ code: string; alsoFits: ChannelMatch[] }>('/public/brand-products/applications', {
      productSlug: f.productSlug, role: roles.some((x) => x.code === f.role) ? f.role : roles[0]?.code, businessType: f.businessType, name: f.name, email: f.email, phone: f.phone, company: f.company, state: f.state, district: f.district, city: f.city,
      territory: f.territory, currentBrands: f.currentBrands, experienceYears: num(f.experienceYears), warehouseSqft: num(f.warehouse), showroomSqft: num(f.showroom), capacity: f.capacity, message: f.message, consent: f.consent, website: hp || undefined,
    });
    setDone(r); return true;
  });
  const fe = m.fieldErrors;
  if (done) return (
    <Alert tone="success" title={`Application ${done.code} received`}>
      Unite will contact you. To follow it and get your dealer dashboard, <Link href="/signup">create a free COLLABIZ business account</Link> with the same email.
      {done.alsoFits.length > 0 && <> Your business may also suit: {done.alsoFits.map((x) => `${x.name} (${channelRoleLabel(x.role).toLowerCase()})`).join(', ')}.</>}
    </Alert>
  );
  return (
    <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="channel-apply">
      {m.error && <Alert tone="danger" title={m.error}>{Object.keys(fe).length ? 'Please check the highlighted fields.' : null}</Alert>}
      <div className="cz-grid cz-grid-2">
        {!fixedProduct && <Select label="Unite product" value={f.productSlug} onChange={set('productSlug')} options={list.map((x) => ({ value: x.slug, label: x.name }))} />}
        <Select label="I want to be a" value={roles.some((x) => x.code === f.role) ? f.role : roles[0]?.code ?? ''} onChange={set('role')} options={roles.map((r) => ({ value: r.code, label: r.label }))} error={fe.role} />
        <Select label="My business today" value={f.businessType} onChange={set('businessType')} options={BUSINESS_TYPES.map((b) => ({ value: b.code, label: b.label }))} />
        <TextInput label="Your name" autoComplete="name" value={f.name} onChange={set('name')} error={fe.name} />
        <TextInput label="Email" type="email" autoComplete="email" value={f.email} onChange={set('email')} error={fe.email} />
        <TextInput label="Mobile" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} error={fe.phone} />
        <TextInput label="Business name (optional)" autoComplete="organization" value={f.company} onChange={set('company')} />
        <Select label="State" value={f.state} onChange={set('state')} options={INDIA_STATES.map(([, n]) => ({ value: n, label: n }))} error={fe.state} />
        <TextInput label="District (optional)" value={f.district} onChange={set('district')} />
        <TextInput label="Town or city" value={f.city} onChange={set('city')} error={fe.city} />
        <TextInput label="Area you want to cover (optional)" value={f.territory} onChange={set('territory')} />
        <TextInput label="Brands you sell today (optional)" value={f.currentBrands} onChange={set('currentBrands')} />
        <TextInput label="Years in business (optional)" inputMode="numeric" value={f.experienceYears} onChange={set('experienceYears')} />
        <TextInput label="Warehouse or godown (sq ft, optional)" inputMode="numeric" value={f.warehouse} onChange={set('warehouse')} />
        <TextInput label="Showroom (sq ft, optional)" inputMode="numeric" value={f.showroom} onChange={set('showroom')} />
      </div>
      {f.role === 'manufacturer' && <TextArea label="Production capacity and certifications" rows={2} value={f.capacity} onChange={set('capacity')} error={fe.capacity} />}
      <TextArea label="Anything else (optional)" rows={2} value={f.message} onChange={set('message')} />
      <label className="cz-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      <label className="cz-gp-consent"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />I agree that Unite Group may contact me about this application. <Link href="/settings/privacy">Privacy</Link></label>
      {fe.consent && <p className="cz-error-text">{fe.consent}</p>}
      <div><Button type="submit" loading={m.pending}>Apply</Button></div>
    </form>
  );
}
