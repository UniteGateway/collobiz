'use client';
import { useState } from 'react';
import { CE_CATEGORIES } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const rupees = (p?: number | null) => (p == null ? '—' : `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
interface Settings { platformFeeBps: number; feePayer: 'company' | 'earner'; restrictedCategories: string[]; legalReviewed: boolean; guaranteeTerms: string | null; guaranteeLegalReviewed: boolean }
interface O {
  counts: { live: number; opportunities: number; samples: number; engagements: number; leads: number; paid: number; pending: number; fees: number; margins: number }; settings: Settings;
  review: { id: string; code: string; title: string; company: string; category: string; model: string; companyRateBps: number | null; companyFixedPaise: number | null; status: string; description: string; territory: string; version: number; licenceNote: string | null }[];
  disputes: { id: string; reason: string; status: string; ruling: string | null; engagementCode: string; opportunity: string; raisedByOrg: string; createdAt: string }[];
  opportunities: { id: string; code: string; title: string; category: string; status: string; company: string; model: string; rateBps: number | null; fixedPaise: number | null; featured?: boolean; uniteGuaranteed?: boolean; sample?: boolean }[];
}

/** COMEARN admin: monitoring, disputes, pausing listings, platform fee and restricted sectors. */
export default function ComearnAdmin() {
  const q = useQuery<O>('/admin/comearn/overview');
  const [tab, setTab] = useState('review');
  const act = useMutation(async (fn: () => Promise<unknown>) => { const r = await fn(); q.reload(); return r; });
  const d = q.data;
  const reqs = useQuery<{ items: { id: string; code: string; title: string; category: string; city: string; status: string; member: string; bids: number }[] }>(tab === 'reqs' ? '/admin/comearn/requirements' : null);
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <img src="/brands/comearn.png" alt="comearn — Opportunities to Earn. Powered by COLLABIZ" style={{ height: 56, width: 'auto', alignSelf: 'flex-start' }} />
      <BannerHeader title="COMEARN" description="Commission marketplace oversight: rule on disputes, pause listings that break the rules, and set the platform fee and regulated sectors. Companies pay members directly; COMEARN keeps the records." />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <p className="cz-muted" style={{ margin: 0 }}>{d.counts.live} live of {d.counts.opportunities} opportunities · {d.counts.engagements} engagements · {d.counts.leads} protected leads · commissions paid {rupees(d.counts.paid)} · pending {rupees(d.counts.pending)} · platform fees {rupees(d.counts.fees)} · Unite margins paid {rupees(Number(d.counts.margins))} · {d.counts.samples} sample listings (not counted)</p>
          <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'review', label: `Review & release (${d.review.length})` }, { value: 'disputes', label: `Disputes (${d.disputes.filter((x) => x.status === 'open').length} open)` }, { value: 'opps', label: `Opportunities (${d.opportunities.length})` }, { value: 'reqs', label: 'Customer requirements' }, { value: 'settings', label: 'Fees & sectors' }]} />
          {tab === 'review' && (!d.review.length ? <Card><EmptyState icon="verify" title="Nothing waiting for review" /></Card> : d.review.map((o) => <ReviewCard key={o.id} o={o} act={(fn) => act.run(fn)} />))}
          {tab === 'review' && <Card title="Sample listings" subtitle="Creates labelled Sample listings across Unite businesses and demo companies with illustrative commissions, for demonstrations. They are excluded from these counts. Do not use on production data.">
            <div><Button variant="secondary" onClick={() => act.run(() => api.post('/admin/comearn/samples', {}))}>Load sample listings</Button></div></Card>}
          {tab === 'disputes' && (!d.disputes.length ? <Card><EmptyState icon="verify" title="No disputes" /></Card> : d.disputes.map((x) => <DisputeCard key={x.id} x={x} act={(fn) => act.run(fn)} />))}
          {tab === 'opps' && (
            <Card flush subtitle="Featured listings are granted by COLLABIZ; paid promotion needs payments, which are not connected yet."><div className="vai-scroll"><table className="vai-table"><thead><tr><th>Opportunity</th><th>Company</th><th>Category</th><th>Commission</th><th>Status</th><th /></tr></thead>
              <tbody>{d.opportunities.map((o) => <tr key={o.id}><td>{o.code} · {o.title}{o.sample ? ' (Sample)' : ''}{o.uniteGuaranteed ? ' · Guaranteed' : ''}</td><td>{o.company}</td><td>{CE_CATEGORIES[o.category as keyof typeof CE_CATEGORIES]}</td><td>{o.model === 'fixed' ? rupees(o.fixedPaise) : `${(o.rateBps ?? 0) / 100}%`}</td><td><StatusBadge status={o.status} /></td>
                <td className="cz-row" style={{ gap: 6 }}>{o.status === 'live' && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Reason for pausing (sent to the company)'); if (reason) act.run(() => api.post(`/admin/comearn/opportunities/${o.id}/pause`, { reason })); }}>Pause…</Button>}
                  {o.status === 'live' && <Button size="sm" variant={o.uniteGuaranteed ? 'ghost' : 'secondary'} onClick={() => act.run(() => api.put(`/admin/comearn/opportunities/${o.id}/guarantee`, { on: !o.uniteGuaranteed }))}>{o.uniteGuaranteed ? 'Remove guarantee' : 'Unite Guaranteed'}</Button>}
                  {o.status === 'live' && (o.featured ? <Button size="sm" variant="ghost" onClick={() => act.run(() => api.put(`/admin/comearn/opportunities/${o.id}/feature`, { until: null }))}>Unfeature</Button>
                    : <Button size="sm" variant="secondary" onClick={() => { const until = window.prompt('Feature until (YYYY-MM-DD)', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)); if (until) act.run(() => api.put(`/admin/comearn/opportunities/${o.id}/feature`, { until })); }}>Feature…</Button>)}</td></tr>)}</tbody></table></div></Card>
          )}
          {tab === 'reqs' && (
            <Card flush title="Customer requirements" subtitle="Posted by members; customer identity is private to the member until they select an offer.">{!reqs.data ? <LoadingState /> : !reqs.data.items.length ? <EmptyState icon="verify" title="No requirements yet" /> : (
              <div className="vai-scroll"><table className="vai-table"><thead><tr><th>Requirement</th><th>Member</th><th>Category</th><th>City</th><th>Offers</th><th>Status</th></tr></thead>
                <tbody>{reqs.data.items.map((r) => <tr key={r.id}><td>{r.code} · {r.title}</td><td>{r.member}</td><td>{CE_CATEGORIES[r.category as keyof typeof CE_CATEGORIES]}</td><td>{r.city}</td><td>{r.bids}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody></table></div>)}</Card>
          )}
          {tab === 'settings' && <SettingsCard s={d.settings} save={(b) => act.run(() => api.put('/admin/comearn/settings', b))} />}
        </>
      )}
    </div>
  );
}

function DisputeCard({ x, act }: { x: O['disputes'][number]; act: (fn: () => Promise<unknown>) => void }) {
  const [ruling, setRuling] = useState(''); const [outcome, setOutcome] = useState('continue');
  return (
    <Card>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{x.opportunity} · {x.engagementCode}</h3><StatusBadge status={x.status} /></div>
      <p className="cz-muted" style={{ fontSize: 13 }}>Raised by {x.raisedByOrg} on {new Date(x.createdAt).toLocaleDateString('en-IN')}</p>
      <p>{x.reason}</p>
      {x.status === 'open' ? (
        <form className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); act(() => api.post(`/admin/comearn/disputes/${x.id}/rule`, { ruling, outcome })); }}>
          <TextInput label="Ruling (shown to both sides)" value={ruling} onChange={(e) => setRuling(e.target.value)} />
          <Select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={[{ value: 'continue', label: 'Continue — release the hold' }, { value: 'cancel_commission', label: 'Cancel the commission in dispute' }]} />
          <div><Button type="submit" size="sm" disabled={ruling.trim().length < 10}>Record ruling</Button></div>
        </form>
      ) : <p className="cz-muted">Ruling: {x.ruling}</p>}
    </Card>
  );
}

function SettingsCard({ s, save }: { s: Settings; save: (b: Settings) => void }) {
  const init = () => ({ pct: String(s.platformFeeBps / 100), feePayer: s.feePayer, restricted: s.restrictedCategories, legal: s.legalReviewed, gTerms: s.guaranteeTerms ?? '', gLegal: s.guaranteeLegalReviewed });
  // Initialised once: later data refreshes (for example after loading samples) never overwrite what the admin is typing.
  const [f, setF] = useState(init);
  return (
    <Card title="Fees and regulated sectors" subtitle="Only a super admin can change these. The platform fee stays off until legal and tax review (GST on the fee, TDS on commissions) is confirmed; it applies only to commissions verified after the change.">
      <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); save({ platformFeeBps: Math.round(Number(f.pct || 0) * 100), feePayer: f.feePayer, restrictedCategories: f.restricted, legalReviewed: f.legal, guaranteeTerms: f.gTerms.trim() || null, guaranteeLegalReviewed: f.gLegal }); }}>
        <div className="vai-grid">
          <TextInput label="Platform fee on settled commission (%)" inputMode="decimal" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} hint="0 = off" />
          <Select label="Fee paid by" value={f.feePayer} onChange={(e) => setF({ ...f, feePayer: e.target.value as Settings['feePayer'] })} options={[{ value: 'company', label: 'The paying company' }, { value: 'earner', label: 'Deducted from the member' }]} />
        </div>
        <ChipSelect legend="Regulated sectors — a licence or registration number is required to publish" options={Object.entries(CE_CATEGORIES).map(([value, label]) => ({ value, label }))} value={f.restricted} onChange={(restricted) => setF({ ...f, restricted })} />
        <Checkbox label="Legal and tax review of the platform fee is complete" checked={f.legal} onChange={(e) => setF({ ...f, legal: e.target.checked })} />
        <TextArea label="Unite Guarantee terms (shown on every Unite Guaranteed listing)" value={f.gTerms} onChange={(e) => setF({ ...f, gTerms: e.target.value })} rows={4} hint="What exactly Unite guarantees, when and up to what amount. The badge cannot be granted until these terms are written and legally reviewed." />
        <Checkbox label="Legal review of the Unite Guarantee terms is complete" checked={f.gLegal} onChange={(e) => setF({ ...f, gLegal: e.target.checked })} />
        <div><Button type="submit">Save</Button></div>
      </form>
    </Card>
  );
}

function ReviewCard({ o, act }: { o: O['review'][number]; act: (fn: () => Promise<unknown>) => void }) {
  const fixed = o.model === 'fixed';
  const offer = fixed ? (o.companyFixedPaise ?? 0) / 100 : (o.companyRateBps ?? 0) / 100;
  const [margin, setMargin] = useState(''); const [counter, setCounter] = useState(''); const [note, setNote] = useState('');
  const m = Number(margin || 0); const member = offer - m;
  return (
    <Card data-ce-review={o.title}>
      <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{o.code} · {o.title}</h3><StatusBadge status={o.status} /></div>
      <p className="cz-muted" style={{ fontSize: 13 }}>{o.company} · {CE_CATEGORIES[o.category as keyof typeof CE_CATEGORIES]} · {o.territory} · terms v{o.version}{o.licenceNote ? ` · licence: ${o.licenceNote}` : ''}</p>
      <p style={{ margin: '4px 0 10px' }}>{o.description}</p>
      <p><strong>Company offers {fixed ? rupees(o.companyFixedPaise) : `${offer}%`}</strong></p>
      {o.status === 'negotiating' ? <Alert tone="info">Waiting for the company to answer your proposal.</Alert> : (
        <div className="cz-stack" style={{ gap: 10 }}>
          <div className="cz-row" style={{ gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <TextInput label={fixed ? 'Unite margin (₹)' : 'Unite margin (%)'} inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
            <span className="cz-muted" data-ce-preview>Members will see {fixed ? rupees(Math.round(member * 100)) : `${Math.round(member * 100) / 100}%`}</span>
            <Button size="sm" variant="accent" disabled={member <= 0} onClick={() => act(() => api.post(`/admin/comearn/opportunities/${o.id}/release`, fixed ? { marginPaise: Math.round(m * 100), note: note || undefined } : { marginBps: Math.round(m * 100), note: note || undefined }))}>Release to members</Button>
          </div>
          <div className="cz-row" style={{ gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <TextInput label={fixed ? 'Propose company amount (₹)' : 'Propose company rate (%)'} inputMode="decimal" value={counter} onChange={(e) => setCounter(e.target.value)} />
            <TextInput label="Note to the company" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={!counter || note.trim().length < 5} onClick={() => act(() => api.post(`/admin/comearn/opportunities/${o.id}/counter`, fixed ? { fixedPaise: Math.round(Number(counter) * 100), note } : { rateBps: Math.round(Number(counter) * 100), note }))}>Send proposal</Button>
            <Button size="sm" variant="ghost" disabled={note.trim().length < 5} onClick={() => act(() => api.post(`/admin/comearn/opportunities/${o.id}/return`, { note }))}>Return to company</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
