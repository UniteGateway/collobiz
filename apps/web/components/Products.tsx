'use client';
/** Public Unite product pages (/businesses): directory tiles, "works with" integrations and the enquiry form. */
import Link from 'next/link';
import { useState } from 'react';
import { INDIA_STATES, SOLAR_LEAD_SOURCES, SOLAR_SITE_TYPES, MICRO_SOURCES, appBrand, sectorName } from '@collabiz/types';
import { Alert, Button, Select, TextArea, TextInput } from '@collabiz/ui';
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
  wakin: { title: 'Teams & Capacity', text: 'Employer verification and interview scheduling from the partner network.' },
  socpost: { title: 'AI Growth Desk', text: 'Approved social posts and campaigns from the Growth Desk.' },
  vidplay: { title: 'AI Growth Desk & Commissions', text: 'Creator campaigns with budget caps and payout reconciliation.' },
  ibrain: { title: 'ACTION OS', text: 'Captured commitments become follow-ups on the action board.' },
  'u-meet': { title: 'Meetings', text: 'Waiting rooms and host controls inside COLLABIZ meetings.' },
  'ev-saathi': { title: 'Capacity bookings', text: 'Vehicle availability, handover checklists and settlement records.' },
  elwin: { title: 'Capacity & Store', text: 'Charger availability and fleet enquiries.' },
  'green-wallet': { title: 'Data room', text: 'Permission-based project data rooms and EOI tracking.' },
  'power-partner': { title: 'Data room & Payment assurance', text: 'PPA document room and payment reconciliation.' },
  unitif: { title: 'Opportunities & Data room', text: 'Industry requirement forms and an investor data room.' },
  'real-bricks': { title: 'Property sales', text: 'Development proposals and document access permissions.' },
  prodeal: { title: 'Property sales', text: 'Price evidence, title checklist and bid history.' },
  'unite-learning': { title: 'Learning', text: 'Course catalogue and verified outcome tracking in COLLABIZ learning.' },
  startsmart: { title: 'Learning & Launch', text: 'Idea submissions, mentor matching and demo-day scheduling.' },
  'ai-teacher': { title: 'Learning', text: 'Mastery records alongside COLLABIZ learning.' },
  '99offers': { title: 'Business offers', text: 'Counteroffer comparison and merchant attribution.' },
  'nano-bazar': { title: 'Store & Business QR', text: 'Shop storefronts with a Business QR for each seller.' },
  weekend: { title: 'Announcements', text: 'Edition archive and advertiser reporting.' },
  'help-today': { title: 'Community', text: 'Request triage and outcome updates in COLLABIZ community.' },
  'goodtime-live': { title: 'Community', text: 'Community events and volunteer sign-ups.' },
  'unite-biofix': { title: 'Data room & Projects', text: 'Site data room and offtake tracking.' },
  'unite-aqua': { title: 'Powertek products', text: 'Specification sheets and demonstration booking.' },
  '99films': { title: 'Data room & Contracts', text: 'Rights ledger and milestone approvals.' },
  'moveon-video': { title: 'Contracts', text: 'Rights catalogue and revenue statements.' },
  withme: { title: 'Capacity bookings', text: 'Availability calendar, identity checks and booking scope.' },
  freeticket: { title: 'Business offers', text: 'Published allocation rules and claim-expiry notifications.' },
  ugrow: { title: 'Launch', text: 'Entrepreneur launches backed by the partner network.' },
  roofz: { title: 'Energy · Green Park', text: 'Rooftop space offered for solar projects.' },
};

export function worksWith(p: Product): { title: string; text: string; icon: string; status: 'connected' | 'link_only' | 'not_connected' | 'next' }[] {
  const list: ReturnType<typeof worksWith> = [
    { title: 'COLLABIZ enquiries', text: `Messages from this page go straight to the ${p.name} team in COLLABIZ, with a reference number for you.`, icon: '✉', status: 'connected' },
    { title: 'COLLABIZ partner network', text: p.open ? `Verified businesses can ask to promote ${p.name} and receive its offers.` : `Partners can promote ${p.name} once it opens to partners.`, icon: '⇄', status: p.open ? 'connected' : 'not_connected' },
  ];
  list.push({ title: 'COLLABIZ CRM hand-off', text: `The ${p.name} team can move an enquiry into its sales pipeline in one step, keeping the message and who introduced it.`, icon: '▤', status: 'connected' });
  if (p.open) list.push({ title: 'Partner links', text: `Each partner gets a personal ${p.name} link; enquiries through it are recorded as introduced by that partner.`, icon: '🔗', status: 'connected' });
  if ((SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug)) list.push({ title: 'Unite Solar referrals', text: 'Your solar request, bill and roof photo go straight to the Unite Solar desk, with duplicate checks.', icon: '☀', status: 'connected' });
  if ((MICRO_SOURCES as readonly string[]).includes(p.slug)) list.push({ title: 'COLLABIZ micro-contracts', text: `Work posted through ${p.name} becomes a fixed-price micro-contract that verified businesses can apply for.`, icon: '⚒', status: 'connected' });
  const m = MODULE_FOR[p.slug];
  if (m && !(SOLAR_LEAD_SOURCES as readonly string[]).includes(p.slug)) list.push({ ...MODULE_LINKS[m], status: 'connected' });
  const b = appBrand(p.slug);
  if (b?.integration) list.push({ title: `${p.name} platform`, text: b.integration.text, icon: '↗', status: b.integration.status });
  const n = NEXT_INTEGRATION[p.slug];
  if (n && !list.some((x) => x.title === n.title)) list.push({ ...n, icon: '→', status: 'next' });
  return list;
}
export const STATUS_LABEL = { connected: 'Connected', link_only: 'Link only', not_connected: 'Not yet', next: 'Next' } as const;

export function ProductEnquiry({ p, refCode }: { p: Product; refCode?: string }) {
  const kinds: { k: 'customer' | 'partner' | 'interest'; label: string }[] = p.stage === 'live' || p.stage === 'pilot'
    ? [{ k: 'customer', label: 'I want to use it' }, { k: 'partner', label: 'I want to partner' }]
    : [{ k: 'interest', label: 'Notify me at launch' }, { k: 'partner', label: 'I want to partner' }];
  const [f, setF] = useState({ kind: kinds[0].k as string, name: '', email: '', phone: '', city: '', organization: '', message: '', consent: false });
  const [hp, setHp] = useState('');
  const [ref, setRef] = useState<string | null>(null);
  const send = useMutation(async () => { const r = await api.post<{ reference: string }>(`/public/products/${p.slug}/enquiries`, { ...f, website: hp || undefined, ref: refCode }); setRef(r.reference); return r; });
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

/** Solar quote request (SunX, SUNGATE, Solar Village Mission, SOLCART) — creates a Unite Solar referral. */
export function SolarLeadForm({ p, refCode }: { p: Product; refCode?: string }) {
  const defaultSite = p.slug === 'sungate' ? 'Apartment / housing society' : p.slug === 'solar-village-mission' ? 'Village household' : 'Independent house';
  const [f, setF] = useState({ name: '', phone: '', city: '', region: 'IN-AP', segment: 'residential', siteType: defaultSite as string, monthlyBill: '', note: '', consent: false });
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
      <div className="cz-grid cz-grid-2">
        <TextInput label="Your name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={send.fieldErrors.name} />
        <TextInput label="Mobile number" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={send.fieldErrors.phone} />
        <TextInput label="City or village" autoComplete="address-level2" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} error={send.fieldErrors.city} />
        <Select label="State" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />
        <Select label="Where is the system for?" value={f.siteType} onChange={(e) => { const st = e.target.value; setF({ ...f, siteType: st, segment: st === 'Factory or warehouse' ? 'industrial' : st === 'Shop or office' || st === 'Farm / pump' ? 'commercial' : 'residential' }); }} options={SOLAR_SITE_TYPES.map((x) => ({ value: x, label: x }))} />
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
      <div><Button type="submit" loading={send.pending}>Request a solar quote</Button></div>
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
