'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ASSET_KINDS, ASSET_LABELS, ASSET_UNITS, NEED_KINDS, NEED_LABELS, SECTORS, type AssetKind, type NeedKind } from '@collabiz/types';
import { Alert, Button, ButtonLink, Checkbox, Dialog, EmptyState, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { OfferCard, Reasons, send, type OfferView, type Reason } from '@/components/Collab';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Asset { id: string; kind: AssetKind; title: string; description: string; city: string | null; region: string | null; capacity: number | null; sectors: string[]; visibility: string; verification: string; available: boolean }
interface Need { id: string; kind: NeedKind; description: string; sectors: string[]; regions: string[]; zeroUpfrontOnly: boolean }
interface Profile { assets: Asset[]; needs: Need[]; verified: boolean; canEdit: boolean }
interface Matches {
  empty: boolean; note: string;
  offers: { offer: OfferView; score: number; reasons: Reason[] }[];
  programs: { program: { id: string; slug: string; name: string; tagline: string; sectorName: string }; score: number; reasons: Reason[] }[];
  partners: { resource: { id: string; kindLabel: string; title: string; description: string; city: string | null; region: string | null; capacity: number | null; verification: string }; organization: string; score: number; reasons: Reason[]; forNeed: string }[];
}
const QUICK: AssetKind[] = ['store', 'office', 'team', 'factory', 'land', 'skills', 'capital', 'customers'];
const sectorOptions = SECTORS.map((s) => ({ value: s.code, label: s.name }));

/** COLLAB — the universal entry: what do you have, what do you need, and who could you work with. */
export default function Collab() {
  const p = useQuery<Profile>('/collab/profile');
  const m = useQuery<Matches>('/collab/matches');
  const [assetKind, setAssetKind] = useState<AssetKind | null>(null);
  const [needOpen, setNeedOpen] = useState(false);
  const reload = () => { p.reload(); m.reload(); };
  const archive = useMutation(async (path: string) => { await api.request('DELETE', path); reload(); return true; });
  const d = p.data;
  return (
    <Screen page={{ key: 'collab', title: 'Collab', access: 'partner' }} eyebrow="COLLAB"
      description="Your space. Your skills. Your resources. Tell COLLABIZ what you have and what you need — we show who you could work with, and why.">
      {p.error ? <ApiErrorView error={p.error} onRetry={p.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 20 }}>
          {!d.canEdit && <Alert tone="info">Only your business owner or an admin can change what it offers and needs. You can still browse matches.</Alert>}
          {archive.error && <Alert tone="danger">{archive.error}</Alert>}

          <section className="cz-collab-step" aria-labelledby="have-h">
            <header><span className="cz-collab-num">1</span><div><h2 id="have-h">What do you have?</h2><p className="cz-muted">A store, an office and team, machinery, land, skills, customers — anything you can put to work.</p></div></header>
            {d.canEdit && (
              <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Add a resource">
                {QUICK.map((k) => <button key={k} type="button" className="cz-chip" onClick={() => setAssetKind(k)}>+ {ASSET_LABELS[k]}</button>)}
                <button type="button" className="cz-chip" onClick={() => setAssetKind('machinery')}>+ Something else</button>
              </div>
            )}
            {d.assets.length ? (
              <ul className="cz-collab-items">{d.assets.map((a) => (
                <li key={a.id} data-asset={a.title}>
                  <div><strong>{a.title}</strong><span className="cz-muted"> · {ASSET_LABELS[a.kind]}{a.capacity ? ` · ${a.capacity} ${ASSET_UNITS[a.kind]}` : ''}{a.city ? ` · ${a.city}` : ''}</span>
                    <p>{a.description}</p>
                    <span className="cz-collab-meta">{a.verification === 'verified' ? 'Verified by COLLABIZ' : 'Self-declared'} · {a.visibility === 'private' ? 'Private — used for your matches only' : 'Visible to verified partners'}</span></div>
                  {d.canEdit && <Button size="sm" variant="ghost" onClick={() => archive.run(`/collab/assets/${a.id}`)} aria-label={`Remove ${a.title}`}>Remove</Button>}
                </li>
              ))}</ul>
            ) : <p className="cz-muted" style={{ margin: 0 }}>Nothing listed yet. Pick one above — it takes a minute.</p>}
          </section>

          <section className="cz-collab-step" aria-labelledby="need-h">
            <header><span className="cz-collab-num">2</span><div><h2 id="need-h">What do you need?</h2><p className="cz-muted">Customers, a partner, contracts, a franchise, suppliers, finance or extra income from what you have.</p></div>
              {d.canEdit && <Button size="sm" variant="secondary" onClick={() => setNeedOpen(true)}>Add a need</Button>}</header>
            {d.needs.length ? (
              <ul className="cz-collab-items">{d.needs.map((n) => (
                <li key={n.id} data-need={n.kind}>
                  <div><strong>{NEED_LABELS[n.kind]}</strong>{n.zeroUpfrontOnly && <span className="cz-tag" style={{ marginLeft: 8 }}>No upfront fee only</span>}<p>{n.description}</p>
                    {n.regions.length > 0 && <span className="cz-collab-meta">{n.regions.join(', ')}</span>}</div>
                  {d.canEdit && <Button size="sm" variant="ghost" onClick={() => archive.run(`/collab/needs/${n.id}`)} aria-label={`Remove ${NEED_LABELS[n.kind]}`}>Remove</Button>}
                </li>
              ))}</ul>
            ) : <p className="cz-muted" style={{ margin: 0 }}>Tell us what you are looking for to see better matches.</p>}
          </section>

          <section className="cz-collab-step" aria-labelledby="match-h">
            <header><span className="cz-collab-num">3</span><div><h2 id="match-h">Who you could work with</h2><p className="cz-muted">{m.data?.note ?? 'Matches are suggestions from the rules shown with each one.'}</p></div>
              <ButtonLink href="/business-offers" variant="secondary" size="sm">Browse all offers</ButtonLink></header>
            {m.error ? <ApiErrorView error={m.error} onRetry={m.reload} /> : !m.data ? <LoadingState /> : m.data.empty ? (
              <EmptyState icon="teams" title="Start with step 1 or 2">Add something you have or something you need and your matches appear here.</EmptyState>
            ) : (
              <div className="cz-stack" style={{ gap: 16 }}>
                <div>
                  <h3 className="cz-collab-sub">Business offers</h3>
                  {m.data.offers.length ? <div className="cz-product-grid">{m.data.offers.map((x) => <OfferCard key={x.offer.id} o={x.offer} score={x.score} reasons={x.reasons} />)}</div>
                    : <p className="cz-muted">No open offers fit yet. <Link href="/business-offers/new">Publish your own</Link> so others can find you.</p>}
                </div>
                {m.data.programs.length > 0 && (
                  <div>
                    <h3 className="cz-collab-sub">Unite Group programmes open to partners</h3>
                    <div className="cz-product-grid">{m.data.programs.map((x) => (
                      <article key={x.program.id} className="cz-product" data-program={x.program.name}>
                        <span className="cz-tag">{x.program.sectorName}</span>
                        <h3><Link href={`/ventures?focus=${x.program.slug}`}>{x.program.name}</Link></h3><p>{x.program.tagline}</p>
                        <Reasons reasons={x.reasons} score={x.score} />
                      </article>
                    ))}</div>
                  </div>
                )}
                {m.data.partners.length > 0 && (
                  <div>
                    <h3 className="cz-collab-sub">Verified partners with what you need</h3>
                    <div className="cz-product-grid">{m.data.partners.map((x) => (
                      <article key={x.resource.id} className="cz-product" data-partner-resource={x.resource.title}>
                        <span className="cz-row" style={{ gap: 6 }}><span className="cz-tag">{x.resource.kindLabel}</span><span className="cz-tag">For: {x.forNeed}</span></span>
                        <h3>{x.resource.title}</h3><p>{x.resource.description}</p>
                        <span className="cz-muted" style={{ fontSize: 13 }}>{x.organization}{x.resource.city ? ` · ${x.resource.city}` : ''} · {x.resource.verification === 'verified' ? 'Resource verified' : 'Self-declared resource'}</span>
                        <Reasons reasons={x.reasons} score={x.score} />
                      </article>
                    ))}</div>
                    <p className="cz-muted" style={{ fontSize: 13 }}>To work with one of them, publish an offer seeking what you need — they are matched to it and can apply.</p>
                  </div>
                )}
              </div>
            )}
          </section>
          <AssetDialog kind={assetKind} onClose={() => setAssetKind(null)} onDone={() => { setAssetKind(null); reload(); }} />
          <NeedDialog open={needOpen} onClose={() => setNeedOpen(false)} onDone={() => { setNeedOpen(false); reload(); }} />
        </div>
      )}
    </Screen>
  );
}

function AssetDialog({ kind, onClose, onDone }: { kind: AssetKind | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: kind ?? 'office', title: '', description: '', city: '', region: '', capacity: '', sector: '', shared: true });
  const [lastKind, setLastKind] = useState(kind);
  if (kind !== lastKind) { setLastKind(kind); if (kind) setF((x) => ({ ...x, kind })); }
  const save = useMutation(async () => {
    const r = await send('/collab/assets', { kind: f.kind, title: f.title, description: f.description, city: f.city || undefined, region: f.region || undefined, capacity: f.capacity ? Number(f.capacity) : undefined, sectors: f.sector ? [f.sector] : [], visibility: f.shared ? 'verified_partners' : 'private' });
    setF((x) => ({ ...x, title: '', description: '', capacity: '' })); onDone(); return r;
  });
  const e = save.fieldErrors;
  return (
    <Dialog open={!!kind} onClose={onClose} title="Add something you have">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="Type" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value as AssetKind })} options={ASSET_KINDS.map((k) => ({ value: k, label: ASSET_LABELS[k] }))} />
        <TextInput label="Short title" placeholder="e.g. Office with 40 workstations in Hyderabad" value={f.title} onChange={(ev) => setF({ ...f, title: ev.target.value })} error={e.title} />
        <TextArea label="Describe it" rows={3} placeholder="What it is, condition, when it is available, anything a partner should know" value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} error={e.description} />
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label={`Capacity (${ASSET_UNITS[f.kind]})`} inputMode="decimal" value={f.capacity} onChange={(ev) => setF({ ...f, capacity: ev.target.value.replace(/[^\d.]/g, '') })} error={e.capacity} />
          <TextInput label="City" value={f.city} onChange={(ev) => setF({ ...f, city: ev.target.value })} />
          <TextInput label="State / region" value={f.region} onChange={(ev) => setF({ ...f, region: ev.target.value })} />
          <Select label="Sector" placeholder="Any sector" value={f.sector} onChange={(ev) => setF({ ...f, sector: ev.target.value })} options={sectorOptions} />
        </div>
        <Checkbox label="Let verified partners see this resource so they can find me" checked={f.shared} onChange={(ev) => setF({ ...f, shared: ev.target.checked })} />
        <div><Button type="submit" loading={save.pending} disabled={!f.title || f.description.length < 10}>Save</Button></div>
      </form>
    </Dialog>
  );
}

function NeedDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: 'customers' as NeedKind, description: '', sector: '', regions: '', zero: false });
  const save = useMutation(async () => {
    const r = await send('/collab/needs', { kind: f.kind, description: f.description, sectors: f.sector ? [f.sector] : [], regions: f.regions.split(',').map((x) => x.trim()).filter(Boolean), zeroUpfrontOnly: f.zero });
    setF({ ...f, description: '' }); onDone(); return r;
  });
  return (
    <Dialog open={open} onClose={onClose} title="Add something you need">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="I need" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value as NeedKind })} options={NEED_KINDS.map((k) => ({ value: k, label: NEED_LABELS[k] }))} />
        <TextArea label="Details" rows={3} placeholder="What exactly, how much, by when" value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} error={save.fieldErrors.description} />
        <Select label="Sector" placeholder="Any sector" value={f.sector} onChange={(ev) => setF({ ...f, sector: ev.target.value })} options={sectorOptions} />
        <TextInput label="Where (states or regions, comma separated)" value={f.regions} onChange={(ev) => setF({ ...f, regions: ev.target.value })} />
        <Checkbox label="Only show opportunities with no upfront fee or capital (these are not risk-free)" checked={f.zero} onChange={(ev) => setF({ ...f, zero: ev.target.checked })} />
        <div><Button type="submit" loading={save.pending} disabled={f.description.length < 10}>Save</Button></div>
      </form>
    </Dialog>
  );
}
