'use client';
import { useEffect, useState } from 'react';
import { CE_CATEGORIES } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, EmptyState, LoadingState, Segmented, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const rupees = (p?: number | null) => (p == null ? '—' : `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
interface Settings { platformFeeBps: number; feePayer: 'company' | 'earner'; restrictedCategories: string[]; legalReviewed: boolean }
interface O {
  counts: { live: number; opportunities: number; engagements: number; leads: number; paid: number; pending: number; fees: number }; settings: Settings;
  disputes: { id: string; reason: string; status: string; ruling: string | null; engagementCode: string; opportunity: string; raisedByOrg: string; createdAt: string }[];
  opportunities: { id: string; code: string; title: string; category: string; status: string; company: string; model: string; rateBps: number | null; fixedPaise: number | null }[];
}

/** COMEARN admin: monitoring, disputes, pausing listings, platform fee and restricted sectors. */
export default function ComearnAdmin() {
  const q = useQuery<O>('/admin/comearn/overview');
  const [tab, setTab] = useState('disputes');
  const act = useMutation(async (fn: () => Promise<unknown>) => { const r = await fn(); q.reload(); return r; });
  const d = q.data;
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="COMEARN" description="Commission marketplace oversight: rule on disputes, pause listings that break the rules, and set the platform fee and regulated sectors. Companies pay members directly; COMEARN keeps the records." />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <p className="cz-muted" style={{ margin: 0 }}>{d.counts.live} live of {d.counts.opportunities} opportunities · {d.counts.engagements} engagements · {d.counts.leads} protected leads · commissions paid {rupees(d.counts.paid)} · pending {rupees(d.counts.pending)} · platform fees {rupees(d.counts.fees)}</p>
          <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'disputes', label: `Disputes (${d.disputes.filter((x) => x.status === 'open').length} open)` }, { value: 'opps', label: `Opportunities (${d.opportunities.length})` }, { value: 'settings', label: 'Fees & sectors' }]} />
          {tab === 'disputes' && (!d.disputes.length ? <Card><EmptyState icon="verify" title="No disputes" /></Card> : d.disputes.map((x) => <DisputeCard key={x.id} x={x} act={(fn) => act.run(fn)} />))}
          {tab === 'opps' && (
            <Card flush><div className="vai-scroll"><table className="vai-table"><thead><tr><th>Opportunity</th><th>Company</th><th>Category</th><th>Commission</th><th>Status</th><th /></tr></thead>
              <tbody>{d.opportunities.map((o) => <tr key={o.id}><td>{o.code} · {o.title}</td><td>{o.company}</td><td>{CE_CATEGORIES[o.category as keyof typeof CE_CATEGORIES]}</td><td>{o.model === 'fixed' ? rupees(o.fixedPaise) : `${(o.rateBps ?? 0) / 100}%`}</td><td><StatusBadge status={o.status} /></td>
                <td>{o.status === 'live' && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Reason for pausing (sent to the company)'); if (reason) act.run(() => api.post(`/admin/comearn/opportunities/${o.id}/pause`, { reason })); }}>Pause…</Button>}</td></tr>)}</tbody></table></div></Card>
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
  const [f, setF] = useState({ pct: String(s.platformFeeBps / 100), feePayer: s.feePayer, restricted: s.restrictedCategories, legal: s.legalReviewed });
  useEffect(() => setF({ pct: String(s.platformFeeBps / 100), feePayer: s.feePayer, restricted: s.restrictedCategories, legal: s.legalReviewed }), [s]);
  return (
    <Card title="Fees and regulated sectors" subtitle="Only a super admin can change these. The platform fee stays off until legal and tax review (GST on the fee, TDS on commissions) is confirmed; it applies only to commissions verified after the change.">
      <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); save({ platformFeeBps: Math.round(Number(f.pct || 0) * 100), feePayer: f.feePayer, restrictedCategories: f.restricted, legalReviewed: f.legal }); }}>
        <div className="vai-grid">
          <TextInput label="Platform fee on settled commission (%)" inputMode="decimal" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} hint="0 = off" />
          <Select label="Fee paid by" value={f.feePayer} onChange={(e) => setF({ ...f, feePayer: e.target.value as Settings['feePayer'] })} options={[{ value: 'company', label: 'The paying company' }, { value: 'earner', label: 'Deducted from the member' }]} />
        </div>
        <ChipSelect legend="Regulated sectors — a licence or registration number is required to publish" options={Object.entries(CE_CATEGORIES).map(([value, label]) => ({ value, label }))} value={f.restricted} onChange={(restricted) => setF({ ...f, restricted })} />
        <Checkbox label="Legal and tax review of the platform fee is complete" checked={f.legal} onChange={(e) => setF({ ...f, legal: e.target.checked })} />
        <div><Button type="submit">Save</Button></div>
      </form>
    </Card>
  );
}
