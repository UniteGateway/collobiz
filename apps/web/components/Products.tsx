'use client';
/** Public Unite product pages (/businesses): directory tiles, "works with" integrations and the enquiry form. */
import Link from 'next/link';
import { useState } from 'react';
import { appBrand, sectorName } from '@collabiz/types';
import { Alert, Button, TextArea, TextInput } from '@collabiz/ui';
import { VentureMark, type Venture } from '@/components/Ventures';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

export type Product = Omit<Venture, 'roles' | 'rewardNote'>;

/** Directory order: the groups people look for first. */
export const PRODUCT_GROUP_ORDER = ['solar', 'ev', 'power_equipment', 'infrastructure', 'real_estate', 'local_commerce', 'technology', 'financial_services', 'employment', 'education', 'media', 'social_impact', 'agri_food', 'consulting'];

/** Short public status. Only "Operating" businesses are presented as available today. */
export function stagePill(stage: string): { label: string; tone: 'live' | 'pilot' | 'soon' } {
  if (stage === 'live') return { label: 'Available', tone: 'live' };
  if (stage === 'pilot') return { label: 'Pilot', tone: 'pilot' };
  return { label: stage === 'building' ? 'In development' : 'Coming soon', tone: 'soon' };
}

export function ProductTile({ p }: { p: Pick<Product, 'slug' | 'name' | 'sector' | 'tagline' | 'stage'> }) {
  const s = stagePill(p.stage);
  return (
    <Link href={`/businesses/${p.slug}`} className="cz-gp-tile" data-product={p.slug}>
      <VentureMark name={p.name} sector={p.sector} slug={p.slug} size={56} />
      <strong>{p.name}</strong>
      <span className="cz-gp-tile-tag">{p.tagline}</span>
      {s.tone !== 'live' && <span className={`cz-gp-pill cz-gp-pill-${s.tone}`}>{s.label}</span>}
    </Link>
  );
}

/** COLLABIZ modules a business is wired into today. Only links that exist in this codebase. */
const MODULE_LINKS: Record<string, { title: string; text: string; icon: string }> = {
  solar: { title: 'Unite Solar sales desk', text: 'Partners quote rooftop kits, EPC and PPA projects, and bills turn into quotes automatically.', icon: '☀' },
  powertek: { title: 'Powertek products', text: 'Any verified partner can sell Powertek equipment; enquiries reach the brand team.', icon: '⚙' },
  property: { title: 'Property sales', text: 'Listings, site visits and buyer enquiries run through the COLLABIZ property desk.', icon: '⌂' },
  energy: { title: 'Energy · Green Park', text: 'Energy deals and project participation listed on the Green Park marketplace.', icon: '⚡' },
  store: { title: 'COLLABIZ store & BOGO offers', text: 'Promotions and in-store vouchers come from the shared promotions engine.', icon: '%' },
};
const MODULE_FOR: Record<string, string> = {
  sunite: 'solar', sungate: 'solar', sunx: 'solar', solcart: 'solar', 'solar-village-mission': 'solar', sunglow: 'solar',
  'unite-powertek': 'powertek', roofz: 'property', 'real-bricks': 'property', prodeal: 'property',
  'green-wallet': 'energy', 'power-partner': 'energy', powerbank: 'energy', '99offers': 'store',
};

export function worksWith(p: Product): { title: string; text: string; icon: string; status: 'connected' | 'link_only' | 'not_connected' }[] {
  const list: ReturnType<typeof worksWith> = [
    { title: 'COLLABIZ enquiries', text: `Messages from this page go straight to the ${p.name} team in COLLABIZ, with a reference number for you.`, icon: '✉', status: 'connected' },
    { title: 'COLLABIZ partner network', text: p.open ? `Verified businesses can ask to promote ${p.name} and receive its offers.` : `Partners can promote ${p.name} once it opens to partners.`, icon: '⇄', status: p.open ? 'connected' : 'not_connected' },
  ];
  const m = MODULE_FOR[p.slug];
  if (m) list.push({ ...MODULE_LINKS[m], status: 'connected' });
  const b = appBrand(p.slug);
  if (b?.integration) list.push({ title: `${p.name} platform`, text: b.integration.text, icon: '↗', status: b.integration.status });
  return list;
}
export const STATUS_LABEL = { connected: 'Connected', link_only: 'Link only', not_connected: 'Not yet' } as const;

export function ProductEnquiry({ p }: { p: Product }) {
  const kinds: { k: 'customer' | 'partner' | 'interest'; label: string }[] = p.stage === 'live' || p.stage === 'pilot'
    ? [{ k: 'customer', label: 'I want to use it' }, { k: 'partner', label: 'I want to partner' }]
    : [{ k: 'interest', label: 'Notify me at launch' }, { k: 'partner', label: 'I want to partner' }];
  const [f, setF] = useState({ kind: kinds[0].k as string, name: '', email: '', phone: '', city: '', organization: '', message: '', consent: false });
  const [hp, setHp] = useState('');
  const [ref, setRef] = useState<string | null>(null);
  const send = useMutation(async () => { const r = await api.post<{ reference: string }>(`/public/products/${p.slug}/enquiries`, { ...f, website: hp || undefined }); setRef(r.reference); return r; });
  if (ref) return <Alert tone="success" title={`Thank you — reference ${ref}`}>The {p.name} team has your message and will reply by email. A confirmation is on its way to {f.email}.</Alert>;
  return (
    <form noValidate className="cz-gp-form" onSubmit={(e) => { e.preventDefault(); send.run(); }}>
      {send.error && <Alert tone="danger" title={send.error}>{Object.keys(send.fieldErrors).length ? 'Please check the highlighted fields.' : null}</Alert>}
      <fieldset className="cz-gp-seg"><legend className="cz-sr-only">What would you like?</legend>
        {kinds.map((x) => <label key={x.k} className={f.kind === x.k ? 'is-on' : ''}><input type="radio" name="kind" value={x.k} checked={f.kind === x.k} onChange={() => setF({ ...f, kind: x.k })} />{x.label}</label>)}
      </fieldset>
      <div className="cz-grid cz-grid-2">
        <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={send.fieldErrors.name} />
        <TextInput label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={send.fieldErrors.email} />
        <TextInput label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={send.fieldErrors.phone} />
        <TextInput label="City (optional)" autoComplete="address-level2" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </div>
      {f.kind === 'partner' && <TextInput label="Company (optional)" autoComplete="organization" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} />}
      <TextArea label="How can we help?" rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={send.fieldErrors.message} />
      <label className="cz-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      <label className="cz-gp-consent"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />I agree that Unite Group may contact me about this request. <Link href="/settings/privacy">Privacy</Link></label>
      {send.fieldErrors.consent && <p className="cz-error-text">{send.fieldErrors.consent}</p>}
      <div><Button type="submit" loading={send.pending}>Send</Button></div>
    </form>
  );
}

export const groupName = (s: string) => sectorName(s);
