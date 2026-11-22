'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERRAL_STATUS_LABELS, SOLAR_MODEL_LABELS, SOLAR_QUOTE_STATUS_LABELS, SOLAR_SEGMENT_LABELS, SOLAR_SYSTEMS, SOLAR_SYSTEM_LABELS, type SolarConfig } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Q { id: string; code: string; customer: string; city: string; partner: string | null; model: string; system: string; capacityKw: number; total: number; commission: number; status: string; createdAt: string }
interface R { id: string; name: string; phone: string; city: string; segment: string; status: string; reward: number | null; by: string; code: string; createdAt: string; quoteId: string | null; source: string | null; siteType: string | null; hasBill: boolean; hasRoofPhoto: boolean; solbid: { ref: string; status: string; outcome: { project?: { code?: string; bids?: number; status?: string } | null; contractValue?: number | null } | null } | null }
interface K { id: string; code: string; name: string; system: string; capacityKw: number; price: number; batteryKwh: number | null; status: string }
interface Res { totals: { quotes: number; open: number; openValue: number; won: number; wonKw: number; wonValue: number; commission: number; referrals: number; rewardsDue: number }; quotes: Q[]; referrals: R[]; kits: K[]; config: SolarConfig; canEditMoney: boolean }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { draft: 'neutral', sent: 'info', accepted: 'info', won: 'success', installed: 'success', paid: 'success', declined: 'danger', expired: 'warning', new: 'info', quoted: 'info', rewarded: 'success', lost: 'neutral' };
const rs = (p: string) => Math.round(Number(p || 0) * 100);

/** Unite Solar desk (admin) — every quote from partners and Unite, referrals and rewards, the kit range, and pricing/commission settings. */
export default function SolarAdmin() {
  const q = useQuery<Res>('/admin/solar');
  const [tab, setTab] = useState('quotes');
  // Notification links open a section directly (e.g. ?tab=referrals).
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab'); if (t && ['quotes', 'referrals', 'kits', 'settings'].includes(t)) setTab(t); }, []);
  const [f, setF] = useState('open');
  const d = q.data;
  const ref = useMutation(async (id: string, action: string) => { await api.post(`/admin/solar/referrals/${id}/${action}`, {}); q.reload(); return true; });
  const quotes = (d?.quotes ?? []).filter((x) => (f === 'open' ? ['draft', 'sent', 'accepted'].includes(x.status) : f === 'won' ? ['won', 'installed', 'paid'].includes(x.status) : true));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Unite Solar" accent="desk" sub="Quotes from partners and the Unite team — kits, EPC projects and PPAs — with bill-based sizing, subsidy, savings, commission and referrals." chips={['Auto-quote from bills', 'Kit / EPC / PPA', 'Commission ledger', 'Referral rewards']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <KpiRow tint="amber" items={[['documents', d.totals.open, 'Open quotes', inr(d.totals.openValue)], ['check', d.totals.won, 'Orders won', `${d.totals.wonKw.toLocaleString('en-IN')} kW · ${inr(d.totals.wonValue)}`], ['earnings', inr(d.totals.commission), 'Partner commission', 'on won orders'], ['users', d.totals.referrals, 'Referrals', d.totals.rewardsDue ? `${inr(d.totals.rewardsDue)} rewards due` : 'no rewards due']]} />
          <Card>
            <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}>
              <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'quotes', label: 'Quotes' }, { value: 'referrals', label: 'Referrals' }, { value: 'kits', label: 'Kits' }, { value: 'settings', label: 'Prices and commission' }]} />
              {tab === 'quotes' && <Segmented label="Show" value={f} onChange={setF} options={[{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'all', label: 'All' }]} />}
            </div>
            {tab === 'quotes' && (!quotes.length ? <EmptyState icon="documents" title="No quotes here" /> : (
              <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>{quotes.map((x) => (
                <li key={x.id} className="cz-card cz-lead" data-quote={x.customer}>
                  <div className="cz-lead-head"><Link href={`/workspace/solar/quotes/${x.id}`}><strong>{x.customer} — {x.capacityKw} kW</strong></Link><span className="cz-muted">{SOLAR_MODEL_LABELS[x.model]} · {x.city} · {x.partner ?? 'Unite Solar'} · {x.code}</span>
                    <span style={{ marginLeft: 'auto' }}><StatusBadge status={x.status} tone={TONE[x.status]} label={SOLAR_QUOTE_STATUS_LABELS[x.status]} /></span></div>
                  <span className="cz-muted" style={{ fontSize: 13 }}>{x.model === 'ppa' ? 'PPA — no sale price' : inr(x.total)}{x.commission ? ` · partner commission ${inr(x.commission)}` : ''}</span>
                </li>
              ))}</ul>
            ))}
            {tab === 'referrals' && (
              <>
                <SolbidBoard />
                {ref.error && <Alert tone="danger">{ref.error}</Alert>}
                {!d.referrals.length ? <EmptyState icon="users" title="No referrals yet" /> : (
                  <ul className="cz-ws-list">{d.referrals.map((r) => (
                    <li key={r.id} data-referral={r.name}><span><strong>{r.name}</strong> · {r.city}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{SOLAR_SEGMENT_LABELS[r.segment]} · {r.phone} · {refLine(r)}{r.siteType ? ` · ${r.siteType}` : ''}{r.hasBill ? ' · bill attached' : ''}{r.hasRoofPhoto ? ' · roof photo' : ''}{r.reward ? ` · reward ${inr(r.reward)}` : ''}</span></span>
                      <StatusBadge status={r.status} tone={TONE[r.status]} label={REFERRAL_STATUS_LABELS[r.status]} />
                      {r.status === 'installed' && d.canEditMoney && <Button size="sm" onClick={() => ref.run(r.id, 'rewarded')}>Reward paid</Button>}
                      {['new', 'quoted'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => ref.run(r.id, 'lost')}>Not going ahead</Button>}
                      <SolbidCell r={r} onDone={q.reload} />
                    </li>
                  ))}</ul>
                )}
              </>
            )}
            {tab === 'kits' && <Kits kits={d.kits} onChange={q.reload} />}
            {tab === 'settings' && <Settings cfg={d.config} canEdit={d.canEditMoney} onChange={q.reload} />}
          </Card>
        </>
      )}
    </div>
  );
}

function Kits({ kits, onChange }: { kits: K[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [price, setPrice] = useState<Record<string, string>>({});
  const act = useMutation(async (id: string, body: object) => { await api.request('PATCH', `/admin/solar/kits/${id}`, body); onChange(); return true; });
  return (
    <>
      <div className="cz-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><span className="cz-muted">{kits.filter((k) => k.status === 'active').length} kits on sale · prices include GST</span><Button size="sm" onClick={() => setAdding(true)}>Add kit</Button></div>
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Solar kits</caption>
        <thead><tr><th scope="col">Kit</th><th scope="col">Type</th><th scope="col" style={{ textAlign: 'right' }}>Price</th><th scope="col">Change price</th><th scope="col"><span className="cz-sr-only">Actions</span></th></tr></thead>
        <tbody>{kits.map((k) => (
          <tr key={k.id} data-kit={k.code} style={k.status === 'retired' ? { opacity: 0.55 } : undefined}>
            <td data-label="Kit"><strong>{k.name}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{k.code}{k.batteryKwh ? ` · ${k.batteryKwh} kWh battery` : ''}</span></td>
            <td data-label="Type">{SOLAR_SYSTEM_LABELS[k.system]}</td>
            <td data-label="Price" style={{ textAlign: 'right' }}>{inr(k.price)}</td>
            <td data-label="Change price"><span className="cz-row" style={{ gap: 6, flexWrap: 'nowrap' }}><input className="cz-input" style={{ width: 120, minHeight: 34 }} inputMode="numeric" aria-label={`New price for ${k.name} (₹)`} placeholder="₹" value={price[k.id] ?? ''} onChange={(e) => setPrice({ ...price, [k.id]: e.target.value.replace(/\D/g, '') })} />
              <Button size="sm" variant="secondary" disabled={!price[k.id]} onClick={async () => { await act.run(k.id, { price: rs(price[k.id]) }); setPrice({ ...price, [k.id]: '' }); }}>Save</Button></span></td>
            <td data-label="">{k.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => act.run(k.id, { status: 'retired' })}>Stop selling</Button> : <Button size="sm" variant="ghost" onClick={() => act.run(k.id, { status: 'active' })}>Sell again</Button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <AddKit open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); onChange(); }} />
    </>
  );
}

function AddKit({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', system: 'on_grid', capacityKw: '', panelW: '550', inverterKw: '', batteryKwh: '', phase: '1', price: '', warrantyYears: '25', includes: 'ALMM-listed panels\nInverter\nMounting structure\nCables, ACDB/DCDB, earthing\nInstallation and 5-year service', description: '' });
  const save = useMutation(async () => { const r = await api.post('/admin/solar/kits', { name: f.name, system: f.system, capacityKw: Number(f.capacityKw), panelW: Number(f.panelW), inverterKw: Number(f.inverterKw || f.capacityKw), batteryKwh: f.batteryKwh ? Number(f.batteryKwh) : undefined, phase: Number(f.phase), price: rs(f.price), warrantyYears: Number(f.warrantyYears), includes: f.includes.split('\n').map((x) => x.trim()).filter(Boolean), description: f.description }); onDone(); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Add a solar kit">
      <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Name" value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} error={e.name} />
        <Select label="Type" value={f.system} onChange={(ev) => setF({ ...f, system: ev.target.value })} options={SOLAR_SYSTEMS.map((s) => ({ value: s, label: SOLAR_SYSTEM_LABELS[s] }))} />
        <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
          <TextInput label="Capacity (kW)" inputMode="decimal" value={f.capacityKw} onChange={(ev) => setF({ ...f, capacityKw: ev.target.value })} error={e.capacityKw} />
          <TextInput label="Price incl. GST (₹)" inputMode="numeric" value={f.price} onChange={(ev) => setF({ ...f, price: ev.target.value.replace(/\D/g, '') })} error={e.price} />
          <TextInput label="Panel (W)" inputMode="numeric" value={f.panelW} onChange={(ev) => setF({ ...f, panelW: ev.target.value })} />
          <TextInput label="Inverter (kW)" inputMode="decimal" value={f.inverterKw} onChange={(ev) => setF({ ...f, inverterKw: ev.target.value })} />
          <TextInput label="Battery (kWh, if any)" inputMode="decimal" value={f.batteryKwh} onChange={(ev) => setF({ ...f, batteryKwh: ev.target.value })} />
          <Select label="Phase" value={f.phase} onChange={(ev) => setF({ ...f, phase: ev.target.value })} options={[{ value: '1', label: 'Single phase' }, { value: '3', label: 'Three phase' }]} />
        </div>
        <TextArea label="What is included (one per line)" rows={4} value={f.includes} onChange={(ev) => setF({ ...f, includes: ev.target.value })} />
        <TextArea label="Description" rows={2} value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} error={e.description} />
        <div><Button type="submit" loading={save.pending}>Add kit</Button></div>
      </form>
    </Dialog>
  );
}

function Settings({ cfg, canEdit, onChange }: { cfg: SolarConfig; canEdit: boolean; onChange: () => void }) {
  const r = (p: number) => String(p / 100);
  const [f, setF] = useState({ kitPerKw: r(cfg.commission.kitPerKw), kitMin: r(cfg.commission.kitMin), epc1: String(cfg.commission.epcTiers[0].rateBps / 100), epcUpTo: r(cfg.commission.epcTiers[0].upTo ?? 0), epc2: String((cfg.commission.epcTiers[1] ?? cfg.commission.epcTiers[0]).rateBps / 100), ppaPerKw: r(cfg.commission.ppaPerKw),
    refHome: r(cfg.referral.residentialFlat), refPerKw: r(cfg.referral.businessPerKw), refCap: r(cfg.referral.businessCap), ppaTariff: r(cfg.ppa.tariff), ppaMin: String(cfg.ppa.minKw), ppaYears: String(cfg.ppa.termYears), gst: String(cfg.gstBps / 100) });
  const [ok, setOk] = useState(false);
  const save = useMutation(async () => {
    const r2 = await api.request('PATCH', '/admin/solar/config', {
      gstBps: Math.round(Number(f.gst) * 100),
      commission: { kitPerKw: rs(f.kitPerKw), kitMin: rs(f.kitMin), epcTiers: [{ upTo: rs(f.epcUpTo), rateBps: Math.round(Number(f.epc1) * 100) }, { upTo: null, rateBps: Math.round(Number(f.epc2) * 100) }], ppaPerKw: rs(f.ppaPerKw) },
      referral: { residentialFlat: rs(f.refHome), businessPerKw: rs(f.refPerKw), businessCap: rs(f.refCap) },
      ppa: { ...cfg.ppa, tariff: rs(f.ppaTariff), minKw: Number(f.ppaMin), termYears: Number(f.ppaYears) },
    });
    setOk(true); onChange(); return r2;
  });
  const T = (k: keyof typeof f, label: string) => <TextInput label={label} inputMode="decimal" value={f[k]} disabled={!canEdit} onChange={(ev) => { setOk(false); setF({ ...f, [k]: ev.target.value.replace(/[^\d.]/g, '') }); }} />;
  return (
    <form className="cz-stack" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }}>
      {!canEdit && <Alert tone="info">Only super admins and finance change prices, commission and rewards. You can see the current settings.</Alert>}
      {save.error && <Alert tone="danger">{save.error}</Alert>}
      {ok && <Alert tone="success">Saved. New quotes use these settings; existing quotes keep their figures.</Alert>}
      <h3>Partner commission</h3>
      <div className="cz-grid cz-grid-3" style={{ gap: '0 12px' }}>{T('kitPerKw', 'Kits: ₹ per kW')}{T('kitMin', 'Kits: minimum ₹ per order')}{T('ppaPerKw', 'PPA: ₹ per kWp')}{T('epc1', 'EPC: % up to the limit')}{T('epcUpTo', 'EPC: limit (₹)')}{T('epc2', 'EPC: % above the limit')}</div>
      <h3>Referral rewards</h3>
      <div className="cz-grid cz-grid-3" style={{ gap: '0 12px' }}>{T('refHome', 'Home: ₹ per installation')}{T('refPerKw', 'Business: ₹ per kW')}{T('refCap', 'Business: maximum ₹')}</div>
      <h3>PPA and tax</h3>
      <div className="cz-grid cz-grid-3" style={{ gap: '0 12px' }}>{T('ppaTariff', 'PPA tariff (₹ per unit)')}{T('ppaMin', 'PPA minimum size (kW)')}{T('ppaYears', 'PPA term (years)')}{T('gst', 'Composite GST on systems (%)')}</div>
      {canEdit && <div><Button type="submit" loading={save.pending}>Save settings</Button></div>}
    </form>
  );
}

const HOUSE = ['SUNX', 'SUNGATE', 'SOLARVM', 'SOLCART'];
/** Where a referral came from: a partner link, a Unite product page, or both. */
function refLine(r: R) {
  if (!r.source) return `referred by ${r.by} (${r.code})`;
  return HOUSE.includes(r.code) ? `from the ${r.by} page` : `from the ${r.source} page via ${r.by}'s link (${r.code})`;
}

const SOLBID_LABEL: Record<string, string> = { invited: 'Invited on SOLBID', confirmed: 'Live on SOLBID', awarded: 'Awarded on SOLBID', completed: 'Completed on SOLBID' };
/** Hand a referral to SOLBID for sealed bids (customer's agreement recorded), or show where it is on SOLBID. */
function SolbidCell({ r, onDone }: { r: R; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ capacityKw: '', model: 'EPC', consentNote: '' });
  const send = useMutation(async () => { await api.post(`/admin/solbid/referrals/${r.id}`, { capacityKw: Number(f.capacityKw), model: f.model, consentNote: f.consentNote }); setOpen(false); onDone(); return true; });
  const refresh = useMutation(async () => { await api.get(`/admin/solbid/referrals/${r.id}`); onDone(); return true; });
  if (r.solbid) {
    const pj = r.solbid.outcome?.project;
    return <span className="cz-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }} data-solbid={r.solbid.ref}>
      <StatusBadge status={r.solbid.status} tone={r.solbid.status === 'awarded' || r.solbid.status === 'completed' ? 'success' : 'info'} label={SOLBID_LABEL[r.solbid.status] ?? r.solbid.status} />
      <span className="cz-muted" style={{ fontSize: 12.5 }}>{r.solbid.ref}{pj?.code ? ` · ${pj.code}` : ''}{pj?.bids !== undefined ? ` · ${pj.bids} bid${pj.bids === 1 ? '' : 's'}` : ''}{r.solbid.outcome?.contractValue ? ` · contract ₹${Math.round(r.solbid.outcome.contractValue).toLocaleString('en-IN')}` : ''}</span>
      <Button size="sm" variant="ghost" loading={refresh.pending} onClick={() => refresh.run()}>Refresh</Button>
      {refresh.error && <span className="cz-error-text">{refresh.error}</span>}
    </span>;
  }
  if (!['new', 'quoted'].includes(r.status)) return null;
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Send to SOLBID</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title={`Get sealed bids for ${r.name} on SOLBID`}>
      <p className="cz-muted" style={{ marginTop: 0 }}>SOLBID receives the name, mobile, city and the requirement — never the bill or roof photo. It invites the customer, who confirms in their own SOLBID account before any vendor sees it.</p>
      {send.error && <Alert tone="danger">{send.error}</Alert>}
      <div className="cz-grid cz-grid-2">
        <TextInput label="System size (kW)" inputMode="decimal" value={f.capacityKw} onChange={(e) => setF({ ...f, capacityKw: e.target.value.replace(/[^\d.]/g, '') })} error={send.fieldErrors.capacityKw} />
        <Select label="Model" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} options={[{ value: 'EPC', label: 'EPC — customer buys the plant' }, { value: 'PPA', label: 'PPA — developer owns, customer pays per unit' }]} />
      </div>
      <TextArea label="How and when did the customer agree to receive bids on SOLBID?" rows={3} value={f.consentNote} onChange={(e) => setF({ ...f, consentNote: e.target.value })} error={send.fieldErrors.consentNote} />
      <div className="cz-row" style={{ gap: 8, marginTop: 12 }}><Button loading={send.pending} onClick={() => send.run()}>Send to SOLBID</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </Dialog>
  </>;
}

/** SOLBID's anonymised public board (open requirements and capacity), when SOLBID is connected. */
function SolbidBoard() {
  const b = useQuery<{ connected: boolean; available?: boolean; openProjects?: number; openCapacityKw?: number; verifiedVendors?: number; bidsSubmitted?: number }>('/public/solbid/board');
  if (!b.data?.connected) return <p className="cz-muted" style={{ fontSize: 13 }}>SOLBID is not connected yet. Set SOLBID_API_URL and SOLBID_SHARED_SECRET to hand referrals over for sealed bids.</p>;
  if (!b.data.available) return <p className="cz-muted" style={{ fontSize: 13 }}>SOLBID is connected, but its public board did not answer just now.</p>;
  return <Card title="SOLBID live board" className="cz-mt">
    <p style={{ margin: 0 }}>{b.data.openProjects ?? 0} open requirements · {(b.data.openCapacityKw ?? 0).toLocaleString('en-IN')} kW open for bids{b.data.verifiedVendors !== undefined ? ` · ${b.data.verifiedVendors} verified vendors` : ''}{b.data.bidsSubmitted !== undefined ? ` · ${b.data.bidsSubmitted} bids placed` : ''}</p>
  </Card>;
}
