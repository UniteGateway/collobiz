'use client';
/** Public Unite product pages (/businesses): directory tiles, "works with" integrations and the enquiry form. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BIOFIX_FEEDSTOCKS, BIOFIX_SCHEMES, PAGE_INTENTS, INDIA_STATES, SOLAR_LEAD_SOURCES, SOLAR_SITE_TYPES, MICRO_SOURCES, appBrand, sectorName } from '@collabiz/types';
import { Alert, Button, Select, TextArea, TextInput } from '@collabiz/ui';
import { VentureMark, type Venture } from '@/components/Ventures';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

export type Product = Omit<Venture, 'roles' | 'rewardNote'>;
export interface ConnectorItem { id: string; type: string; title: string; subtitle: string }
export interface ConnectorView { kind: string; module: string; text: string; itemPrompt: string | null; member: { label: string; href: string }; stats: { label: string; value: number }[]; items: ConnectorItem[] }

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
      {appBrand(p.slug)?.logo ? <span className="cz-gp-tile-logo" aria-hidden><img src={appBrand(p.slug)!.logo} alt="" loading="lazy" /></span> : <VentureMark name={p.name} sector={p.sector} slug={p.slug} size={56} />}
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

/**
 * Integration roadmap: the COLLABIZ module each business plugs into next (docs/unite-products.md has the waves).
 * Shown as "Next" — planned, not live. Regulated businesses have none until regulatory clearance.
 */
export const NEXT_INTEGRATION: Record<string, { title: string; text: string }> = {
  bizo: { title: 'Single sign-on and automatic sync', text: 'When BIZO’s public API launches (listed by BIZO as planned). Until then leads move by file.' },
  wakin: { title: 'Teams & Capacity', text: 'Employer verification and interview scheduling from the partner network.' },
  socpost: { title: 'AI Growth Desk', text: 'Approved social posts and campaigns from the Growth Desk.' },
  vidplay: { title: 'AI Growth Desk & Commissions', text: 'Creator campaigns with budget caps and payout reconciliation.' },
  ibrain: { title: 'ACTION OS', text: 'Captured commitments become follow-ups on the action board.' },
  'u-meet': { title: 'Meetings', text: 'Waiting rooms and host controls inside COLLABIZ meetings.' },
  'ev-saathi': { title: 'Capacity bookings', text: 'Vehicle availability, handover checklists and settlement records.' },
  elwin: { title: 'Capacity & Store', text: 'Charger availability and fleet enquiries.' },
  'green-wallet': { title: 'Data room', text: 'Permission-based project data rooms and EOI tracking.' },
  'power-partner': { title: 'Data room & Payment assurance', text: 'PPA document room and payment reconciliation.' },
  '99offers': { title: 'Business offers', text: 'Counteroffer comparison and merchant attribution.' },
  'nano-bazar': { title: 'Store & Business QR', text: 'Shop storefronts with a Business QR for each seller.' },
  weekend: { title: 'Announcements', text: 'Edition archive and advertiser reporting.' },
  'help-today': { title: 'Community', text: 'Request triage and outcome updates in COLLABIZ community.' },
  'goodtime-live': { title: 'Community', text: 'Community events and volunteer sign-ups.' },
  'unite-aqua': { title: 'Powertek products', text: 'Specification sheets and demonstration booking.' },
  '99films': { title: 'Data room & Contracts', text: 'Rights ledger and milestone approvals.' },
  'moveon-video': { title: 'Contracts', text: 'Rights catalogue and revenue statements.' },
  withme: { title: 'Capacity bookings', text: 'Availability calendar, identity checks and booking scope.' },
  freeticket: { title: 'Business offers', text: 'Published allocation rules and claim-expiry notifications.' },
  ugrow: { title: 'Launch', text: 'Entrepreneur launches backed by the partner network.' },
};

export function worksWith(p: Product & { showcase?: { kind: string } | null; connector?: ConnectorView | null }): { title: string; text: string; icon: string; status: 'connected' | 'link_only' | 'not_connected' | 'next'; href?: string }[] {
  const list: ReturnType<typeof worksWith> = [
    { title: 'COLLABIZ enquiries', text: `Messages from this page go straight to the ${p.name} team in COLLABIZ, with a reference number for you.`, icon: '✉', status: 'connected' },
    { title: 'COLLABIZ partner network', text: p.open ? `Verified businesses can ask to promote ${p.name} and receive its offers.` : `Partners can promote ${p.name} once it opens to partners.`, icon: '⇄', status: p.open ? 'connected' : 'not_connected' },
  ];
  list.push({ title: 'COLLABIZ CRM hand-off', text: `The ${p.name} team can move an enquiry into its sales pipeline in one step, keeping the message and who introduced it.`, icon: '▤', status: 'connected' });
  if (p.open) list.push({ title: 'Partner links', text: `Each partner gets a personal ${p.name} link; enquiries through it are recorded as introduced by that partner.`, icon: '🔗', status: 'connected' });
  if ((SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug)) list.push({ title: 'Unite Solar referrals', text: 'Your solar request, bill and roof photo go straight to the Unite Solar desk, with duplicate checks.', icon: '☀', status: 'connected' });
  if ((MICRO_SOURCES as readonly string[]).includes(p.slug)) list.push({ title: 'COLLABIZ micro-contracts', text: `Work posted through ${p.name} becomes a fixed-price micro-contract that verified businesses can apply for.`, icon: '⚒', status: 'connected' });
  if (p.showcase?.kind === 'property') list.push({ title: 'Unite property projects', text: 'Projects on this page come live from the COLLABIZ property desk; site-visit requests reach the sales team.', icon: '⌂', status: 'connected' });
  if (p.showcase?.kind === 'courses') list.push({ title: 'COLLABIZ learning', text: 'Courses on this page are the published COLLABIZ courses, with certificates on completion.', icon: '🎓', status: 'connected' });
  const m = MODULE_FOR[p.slug];
  if (m && !(SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug) && !(m === 'property' && p.showcase)) list.push({ ...MODULE_LINKS[m], status: 'connected' });
  if (p.connector && p.connector.kind !== 'micro') list.push({ title: `COLLABIZ ${p.connector.module}`, text: p.connector.text, icon: '⇆', status: 'connected', href: p.connector.member.href });
  const ml = p.connector ? undefined : MEMBER_LINKS[p.slug];
  if (ml && !list.some((x) => x.title === ml.title)) list.push({ title: ml.title, text: ml.text, icon: '↗', status: 'link_only', href: ml.href });
  const b = appBrand(p.slug);
  if (b?.integration) list.push({ title: `${p.name} platform`, text: b.integration.text, icon: '↗', status: b.integration.status });
  const n = p.connector ? undefined : NEXT_INTEGRATION[p.slug];
  if (n && !list.some((x) => x.title === n.title)) list.push({ ...n, icon: '→', status: 'next' });
  return list;
}
/**
 * Members-only COLLABIZ modules a product runs on: shown as "Link only" (the link opens the module after sign-in; no data
 * is exchanged with the product yet).
 */
export const MEMBER_LINKS: Record<string, { title: string; href: string; text: string }> = {
  socpost: { title: 'COLLABIZ Business offers', href: '/business-offers', text: 'Members publish and track offers that SOCPOST campaigns promote.' },
  vidplay: { title: 'COLLABIZ Business offers', href: '/business-offers', text: 'Advertisers publish the offers that creators promote.' },
  ibrain: { title: 'ACTION OS', href: '/action-os', text: 'Commitments and follow-ups for members live on the COLLABIZ action board.' },
  'u-meet': { title: 'COLLABIZ Meetings', href: '/meetings', text: 'Members schedule and join meetings inside COLLABIZ.' },
  'ev-saathi': { title: 'Capacity calendar', href: '/capacity', text: 'Members publish vehicle and driver availability as bookable capacity.' },
  elwin: { title: 'Capacity calendar', href: '/capacity', text: 'Charger and service availability published as bookable capacity.' },
  withme: { title: 'Capacity calendar', href: '/capacity', text: 'Availability and bookings for companions run on the capacity calendar.' },
  '99offers': { title: 'COLLABIZ Store & BOGO offers', href: '/store', text: 'Promotions and in-store vouchers run on the shared offers engine.' },
  'nano-bazar': { title: 'Business QR', href: '/business-qr', text: 'Each shop gets a Business QR that opens its COLLABIZ storefront.' },
  'goodtime-live': { title: 'COLLABIZ Community', href: '/community', text: 'Community posts and events for members.' },
  'help-today': { title: 'COLLABIZ Community', href: '/community', text: 'Help requests and updates in the members community.' },
  weekend: { title: 'Announcements', href: '/announcements', text: 'Editions and notices published to members.' },
  '99films': { title: 'Data room & Contracts', href: '/data-room', text: 'Project documents and rights records for members.' },
  'moveon-video': { title: 'Contracts', href: '/contracts', text: 'Distribution agreements managed in COLLABIZ contracts.' },
  'unite-aqua': { title: 'Powertek products', href: '/powertek', text: 'Equipment and consumables sold through the Powertek desk.' },
  startsmart: { title: 'Launch', href: '/launch', text: 'Members turn an idea into a launch plan with partners.' },
  sunite: { title: 'Unite Solar desk', href: '/unite-solar', text: 'Partners quote, track and install solar projects.' },
  wakin: { title: 'Teams & partners', href: '/partners', text: 'Members find and invite delivery teams.' },
  prizo: { title: 'Business offers', href: '/business-offers', text: 'Deals and negotiated offers for members.' },
  leaddna: { title: 'Leads & CRM', href: '/crm', text: 'Qualified leads in the members sales pipeline.' },
  'digital-seed': { title: 'Commissions', href: '/commissions', text: 'Referral commissions under signed agreements.' },
};

export const STATUS_LABEL = { connected: 'Connected', link_only: 'Link only', not_connected: 'Not yet', next: 'Next' } as const;

export interface ShowProject { id: string; name: string; kind: string; city: string; region: string; reraNumber: string | null; available: number; priceFrom: number | null; priceTo: number | null }
export interface ShowCourse { id: string; title: string; summary: string; level: string; minutes: number; modules: number }

export function ProductEnquiry({ p, refCode, projects, projectId, items, itemId, dealers }: { p: Product; refCode?: string; projects?: ShowProject[]; projectId?: string; items?: ConnectorItem[]; itemId?: string; dealers?: boolean }) {
  const intents = PAGE_INTENTS[p.slug];
  const kinds: { k: 'customer' | 'partner' | 'interest'; label: string }[] = dealers ? [{ k: 'customer', label: 'I want to buy' }, { k: 'partner', label: 'I want to sell it' }] : p.stage === 'live' || p.stage === 'pilot'
    ? [{ k: 'customer', label: 'I want to use it' }, { k: 'partner', label: 'I want to partner' }]
    : [{ k: 'interest', label: 'Notify me at launch' }, { k: 'partner', label: 'I want to partner' }];
  const [f, setF] = useState({ kind: kinds[0].k as string, name: '', email: '', phone: '', city: '', organization: '', message: '', consent: false, projectId: projectId ?? '', visitDate: '', itemId: itemId ?? '', intent: intents?.[0]?.code ?? '', quantity: '', feedstock: '', state: '' });
  useEffect(() => { if (projectId) setF((x) => ({ ...x, projectId })); }, [projectId]);
  useEffect(() => { if (itemId) setF((x) => ({ ...x, itemId })); }, [itemId]);
  const [hp, setHp] = useState('');
  const [ref, setRef] = useState<string | null>(null);
  const [dealer, setDealer] = useState<string | null>(null);
  const send = useMutation(async () => { const r = await api.post<{ reference: string; dealer?: string | null }>(`/public/products/${p.slug}/enquiries`, { ...f, kind: intents ? (f.intent === 'partner' ? 'partner' : 'customer') : f.kind, projectId: f.projectId || undefined, visitDate: f.visitDate || undefined, itemId: f.itemId || undefined, intent: f.intent || undefined, quantity: f.quantity ? Number(f.quantity) : undefined, feedstock: f.feedstock || undefined, state: f.state || undefined, website: hp || undefined, ref: refCode }); setRef(r.reference); setDealer(r.dealer ?? null); return r; });
  if (ref) return <Alert tone="success" title={`Thank you — reference ${ref}`}>{dealer ? `Your local ${p.name} partner, ${dealer}, has your request and will contact you.` : `The ${p.name} team has your message and will reply by email.`} A confirmation is on its way to {f.email}.</Alert>;
  return (
    <form noValidate className="cz-gp-form" onSubmit={(e) => { e.preventDefault(); send.run(); }}>
      {send.error && <Alert tone="danger" title={send.error}>{Object.keys(send.fieldErrors).length ? 'Please check the highlighted fields.' : null}</Alert>}
      {intents ? (() => { const it = intents.find((x) => x.code === f.intent); return (
        <div className="cz-stack" style={{ gap: 12 }} data-intents>
          <fieldset className="cz-fieldset"><legend>What would you like to do?</legend>
            <div className="cz-intent-grid">{intents.map((x) => <label key={x.code} className={f.intent === x.code ? 'is-on' : ''}><input type="radio" name="intent" value={x.code} checked={f.intent === x.code} onChange={() => setF({ ...f, intent: x.code })} />{x.label}</label>)}</div>
          </fieldset>
          <div className="cz-grid cz-grid-2">
            {it?.needsFeedstock && <Select label="Type of feedstock" value={f.feedstock} onChange={(e) => setF({ ...f, feedstock: e.target.value })} options={[{ value: '', label: 'Choose' }, ...BIOFIX_FEEDSTOCKS.map((x) => ({ value: x, label: x }))]} error={send.fieldErrors.feedstock} />}
            {it?.unit && <TextInput label={`${it.quantityLabel ?? 'Quantity'} (${it.unit})`} inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} error={send.fieldErrors.quantity} />}
            <Select label="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={[{ value: '', label: 'Choose (optional)' }, ...INDIA_STATES.map(([, n]) => ({ value: n, label: n })), { value: 'Outside India', label: 'Outside India' }]} />
          </div>
        </div>
      ); })() : <fieldset className="cz-gp-seg"><legend className="cz-sr-only">What would you like?</legend>
        {kinds.map((x) => <label key={x.k} className={f.kind === x.k ? 'is-on' : ''}><input type="radio" name="kind" value={x.k} checked={f.kind === x.k} onChange={() => setF({ ...f, kind: x.k })} />{x.label}</label>)}
      </fieldset>}
      <div className="cz-grid cz-grid-2">
        <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={send.fieldErrors.name} />
        <TextInput label="Email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={send.fieldErrors.email} />
        <TextInput label="Phone (optional)" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={send.fieldErrors.phone} />
        <TextInput label="City (optional)" autoComplete="address-level2" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
      </div>
      {projects?.length ? <div className="cz-grid cz-grid-2">
        <Select label="Project (optional)" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} options={[{ value: '', label: 'Not sure yet' }, ...projects.map((x) => ({ value: x.id, label: `${x.name} — ${x.city}` }))]} error={send.fieldErrors.projectId} />
        <TextInput label="Preferred site-visit date (optional)" type="date" value={f.visitDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, visitDate: e.target.value })} disabled={!f.projectId} error={send.fieldErrors.visitDate} />
      </div> : null}
      {dealers && !intents ? <Select label="State (to find your nearest partner)" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={[{ value: '', label: 'Choose (optional)' }, ...INDIA_STATES.map(([, n]) => ({ value: n, label: n }))]} /> : null}
      {items?.length ? <Select label="About (optional)" value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })} options={[{ value: '', label: 'General enquiry' }, ...items.map((x) => ({ value: x.id, label: x.title }))]} error={send.fieldErrors.itemId} /> : null}
      {f.kind === 'partner' && <TextInput label="Company (optional)" autoComplete="organization" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} />}
      <TextArea label="How can we help?" rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} error={send.fieldErrors.message} />
      <label className="cz-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      <label className="cz-gp-consent"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />{dealers ? 'I agree that Unite Group and its authorised partner for my area may contact me about this request.' : 'I agree that Unite Group may contact me about this request.'} <Link href="/settings/privacy">Privacy</Link></label>
      {send.fieldErrors.consent && <p className="cz-error-text">{send.fieldErrors.consent}</p>}
      <div><Button type="submit" loading={send.pending}>Send</Button></div>
    </form>
  );
}

export const groupName = (s: string) => sectorName(s);

/** Solar quote request (SunX, SUNGATE, Solar Village Mission, SOLCART) — creates a Unite Solar referral. */
export function SolarLeadForm({ p, refCode }: { p: Product; refCode?: string }) {
  const defaultSite = p.slug === 'sungate' ? 'Apartment / housing society' : p.slug === 'solar-village-mission' ? 'Village household' : 'Independent house';
  const [f, setF] = useState({ name: '', phone: '', city: '', region: 'IN-AP', segment: 'residential', siteType: defaultSite as string, monthlyBill: '', note: '', consent: false, intent: p.slug === 'roofz' ? 'lease_roof' : '', roofAreaSqft: '' });
  const [bill, setBill] = useState<File | null>(null);
  const [roof, setRoof] = useState<File | null>(null);
  const [hp, setHp] = useState('');
  const [done, setDone] = useState<{ reference: string; message: string; billRead: string[] | null } | null>(null);
  const send = useMutation(async () => {
    const fd = new FormData();
    fd.set('source', p.slug); if (refCode) fd.set('ref', refCode);
    for (const [k, v] of Object.entries(f)) fd.set(k, String(v));
    if (hp) fd.set('website', hp);
    if (bill) fd.set('bill', bill); if (roof) fd.set('roof', roof);
    const r = await api.upload<{ reference: string; message: string; billRead: string[] | null }>('/public/solar/leads', fd);
    setDone(r); return r;
  });
  if (done) return <Alert tone="success" title={`Request received — ${done.reference}`}>{done.message}{done.billRead?.length ? ` We read ${done.billRead.join(', ')} from your bill.` : ''}</Alert>;
  return (
    <form noValidate className="cz-gp-form" onSubmit={(e) => { e.preventDefault(); send.run(); }} data-form="solar-lead">
      {send.error && <Alert tone="danger" title={send.error}>{Object.keys(send.fieldErrors).length ? 'Please check the highlighted fields.' : null}</Alert>}
      {p.slug === 'roofz' && <fieldset className="cz-gp-seg"><legend className="cz-sr-only">What would you like?</legend>
        {[['lease_roof', 'Lease my roof for solar'], ['solar_for_building', 'Solar for my building']].map(([k, l]) => <label key={k} className={f.intent === k ? 'is-on' : ''}><input type="radio" name="intent" value={k} checked={f.intent === k} onChange={() => setF({ ...f, intent: k })} />{l}</label>)}
      </fieldset>}
      <div className="cz-grid cz-grid-2">
        <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={send.fieldErrors.name} />
        <TextInput label="Mobile number" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={send.fieldErrors.phone} />
        <TextInput label="City or village" autoComplete="address-level2" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} error={send.fieldErrors.city} />
        <Select label="State" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
        <Select label="Where is the system for?" value={f.siteType} onChange={(e) => { const st = e.target.value; setF({ ...f, siteType: st, segment: st === 'Factory or warehouse' ? 'industrial' : st === 'Shop or office' || st === 'Farm / pump' ? 'commercial' : 'residential' }); }} options={SOLAR_SITE_TYPES.map((x) => ({ value: x, label: x }))} />
        {p.slug === 'roofz' && <TextInput label="Roof area (sq ft, optional)" inputMode="numeric" value={f.roofAreaSqft} onChange={(e) => setF({ ...f, roofAreaSqft: e.target.value.replace(/\D/g, '') })} error={send.fieldErrors.roofAreaSqft} />}
        <TextInput label="Monthly electricity bill (₹, optional)" inputMode="numeric" value={f.monthlyBill} onChange={(e) => setF({ ...f, monthlyBill: e.target.value.replace(/\D/g, '') })} error={send.fieldErrors.monthlyBill} />
      </div>
      <div className="cz-grid cz-grid-2">
        <label className="cz-gp-file"><span>Electricity bill (PDF or photo, optional)</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setBill(e.target.files?.[0] ?? null)} /></label>
        <label className="cz-gp-file"><span>Roof photo (optional)</span><input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={(e) => setRoof(e.target.files?.[0] ?? null)} /></label>
      </div>
      <TextArea label="Anything we should know? (optional)" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <label className="cz-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      <label className="cz-gp-consent"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />I agree that Unite Solar may call me about solar and use my bill and roof photo to prepare a quote. Files are deleted after 90 days.</label>
      {send.fieldErrors.consent && <p className="cz-error-text">{send.fieldErrors.consent}</p>}
      <div><Button type="submit" loading={send.pending}>{f.intent === 'lease_roof' ? 'Offer my roof' : 'Request a solar quote'}</Button></div>
    </form>
  );
}

/** Post or find work through XPERT, Partimer or ZUPPO — both lead into COLLABIZ micro-contracts. */
export function WorkPanel({ p, work }: { p: Product; work: { open: number; done: number } }) {
  return (
    <div className="cz-gp-work" data-panel="work">
      <div><strong>{work.open}</strong><span>open jobs posted through {p.name}</span></div>
      <div><strong>{work.done}</strong><span>completed and accepted</span></div>
      <div className="cz-row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <Link className="cz-btn cz-btn-primary" href={`/micro/new?source=${p.slug}`}>Post a job</Link>
        <Link className="cz-btn cz-btn-secondary" href="/micro">Find work</Link>
      </div>
      <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Posting and applying need a verified COLLABIZ business account. You pay the worker directly; COLLABIZ never holds the money.</p>
    </div>
  );
}

const inrShort = (paise: number) => { const r = paise / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(r >= 1e8 ? 0 : 2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(0)} L` : `₹${r.toLocaleString('en-IN')}`; };
const KIND: Record<string, string> = { industrial_park: 'Industrial park', residential: 'Residential', commercial: 'Commercial', plots: 'Plots' };

/** Live Unite property projects (from the COLLABIZ property desk) with a "book a site visit" action. */
export function ProjectShowcase({ items, onVisit }: { items: ShowProject[]; onVisit: (id: string) => void }) {
  if (!items.length) return <p className="cz-muted">No projects are open right now. Leave your details below and the team will tell you when one opens.</p>;
  return (
    <ul className="cz-gp-cards">{items.map((x) => (
      <li key={x.id} data-project={x.name}>
        <span className="cz-gp-pill cz-gp-pill-pilot">{KIND[x.kind] ?? x.kind}</span>
        <strong>{x.name}</strong>
        <span className="cz-muted">{x.city}</span>
        <span>{x.available} unit{x.available === 1 ? '' : 's'} available{x.priceFrom ? ` · ${inrShort(x.priceFrom)}${x.priceTo && x.priceTo !== x.priceFrom ? ` – ${inrShort(x.priceTo)}` : ''}` : ''}</span>
        <span className="cz-muted" style={{ fontSize: 12.5 }}>{x.reraNumber ? `RERA ${x.reraNumber}` : x.kind === 'industrial_park' ? 'Industrial project — RERA not applicable' : 'RERA number on request'}</span>
        <button type="button" className="cz-btn cz-btn-secondary cz-btn-sm" onClick={() => onVisit(x.id)}>Book a site visit</button>
      </li>
    ))}</ul>
  );
}

/** Published COLLABIZ courses; opening one needs a COLLABIZ account (certificates are issued there). */
export function CourseShowcase({ items }: { items: ShowCourse[] }) {
  if (!items.length) return <p className="cz-muted">New courses are being prepared.</p>;
  return (
    <ul className="cz-gp-cards">{items.map((c) => (
      <li key={c.id} data-course={c.title}>
        <span className="cz-gp-pill cz-gp-pill-pilot">{c.level[0].toUpperCase() + c.level.slice(1)}</span>
        <strong>{c.title}</strong>
        <span className="cz-muted">{c.summary}</span>
        <span>{c.modules} modules · {c.minutes} min · certificate</span>
        <Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/learning/assessments/${c.id}`}>Start learning</Link>
      </li>
    ))}</ul>
  );
}

/** Wave 3: live data from the COLLABIZ module a business runs on, with "ask about this" on listed items. */
export function ConnectorPanel({ c, onAsk }: { c: ConnectorView; onAsk: (id: string) => void }) {
  return (
    <div className="cz-stack" style={{ gap: 12 }} data-connector={c.kind}>
      <p className="cz-muted" style={{ margin: 0 }}>{c.text}</p>
      <div className="cz-gp-stats">{c.stats.map((s) => <div key={s.label}><strong>{s.value.toLocaleString('en-IN')}</strong><span>{s.label}</span></div>)}</div>
      {c.items.length > 0 ? (
        <ul className="cz-gp-list">{c.items.map((i) => (
          <li key={i.id} data-connector-item={i.id}>
            <div><strong>{i.title}</strong><p>{i.subtitle}</p></div>
            <Button size="sm" variant="secondary" onClick={() => onAsk(i.id)}>{c.itemPrompt ?? 'Ask about this'}</Button>
          </li>
        ))}</ul>
      ) : ['capacity', 'offers', 'energy', 'powertek'].includes(c.kind) ? <p className="cz-muted">Nothing is listed right now. New listings appear here as members publish them.</p> : null}
      <p style={{ margin: 0 }}><a href={c.member.href}>{c.member.label} (members) →</a></p>
    </div>
  );
}

/** Unite Biofix: public programmes to check (facts only, no promise of eligibility). */
export function BiofixSchemes() {
  return (
    <div className="cz-stack" style={{ gap: 12 }}>
      <ul className="cz-gp-list">{BIOFIX_SCHEMES.map((x) => <li key={x.name}><div><strong>{x.name}</strong><p>{x.by}. {x.text}</p></div></li>)}</ul>
      <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>Eligibility, prices and incentives are set by each programme’s official guidelines and can change. Unite Biofix helps you check them; it does not promise any subsidy, price or return.</p>
    </div>
  );
}
