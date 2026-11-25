'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CE_CATEGORIES, CE_TRIGGERS, type CeCategory, type CeTrigger } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, Checkbox, EmptyState, Select, Skeleton, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, RepLine, rupees, toPaise, type CeRep } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Bid { id: string; company: string; model: 'percent' | 'fixed'; rateBps: number | null; fixedPaise: number | null; trigger: CeTrigger; paymentDays: number; proposal: string; status: string; commissionPaise: number | null; reputation: { asEarner: CeRep | null; asCompany: CeRep | null; verified: boolean } }
interface Req {
  id: string; code: string; title: string; category: CeCategory; description: string; city: string; estimatedValuePaise: number | null; closesOn: string; status: string; owner: boolean;
  customer: { customerName: string; customerCompany: string | null; contactName: string; phone: string | null; email: string | null } | null; engagementId?: string | null; bids?: Bid[]; note?: string;
  myBid?: { id: string; model: string; rateBps: number | null; fixedPaise: number | null; proposal: string; status: string } | null; canBid?: boolean;
}
const rate = (b: { model: string; rateBps: number | null; fixedPaise: number | null }) => (b.model === 'fixed' ? rupees(b.fixedPaise) : `${(b.rateBps ?? 0) / 100}%`);

/** Requirement — the member compares sealed commission offers; a company submits or updates its own offer. */
export default function ComearnRequirement() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Req>(`/comearn/requirements/${id}`);
  const r = q.data;
  return (
    <Screen page={{ key: 'comearn-requirement', title: 'Customer requirement', access: 'partner' }} header={false}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !r ? <Skeleton height={300} /> : (
        <>
          <CeHeader title={r.title} lead={<>{CE_CATEGORIES[r.category]} · {r.city}{r.estimatedValuePaise ? ` · estimated value ${rupees(r.estimatedValuePaise)}` : ''} · offers close {r.closesOn}</>} />
          <CeNav />
          <Card title="Requirement"><p className="ce-pre">{r.description}</p>
            {r.customer && <p className="ce-muted">Customer (private to you until you select an offer): <strong>{r.customer.customerName}</strong>{r.customer.customerCompany ? `, ${r.customer.customerCompany}` : ''} · {r.customer.contactName}</p>}
          </Card>
          {r.owner ? <OwnerView r={r} reload={q.reload} /> : <BidForm r={r} reload={q.reload} />}
        </>
      )}
    </Screen>
  );
}

function OwnerView({ r, reload }: { r: Req; reload: () => void }) {
  const router = useRouter();
  const [pick, setPick] = useState<string | null>(null); const [ok, setOk] = useState(false);
  const select = useMutation(async () => { const x = await api.post<{ engagementId: string }>(`/comearn/requirements/${r.id}/select`, { bidId: pick, confirm: ok }); router.push(`/comearn/engagements/${x.engagementId}`); return true; });
  const close = useMutation(async () => { await api.post(`/comearn/requirements/${r.id}/close`, {}); reload(); return true; });
  const bids = (r.bids ?? []).filter((b) => b.status !== 'withdrawn');
  if (r.status === 'awarded') return <Card><p>You selected an offer. <ButtonLink href={`/comearn/engagements/${r.engagementId}`}>Open the commission tracker</ButtonLink></p></Card>;
  return (
    <Card title={`Commission offers (${bids.length})`} subtitle={r.note} actions={r.status === 'open' ? <Button size="sm" variant="ghost" onClick={() => close.run()}>Close requirement</Button> : undefined}>
      {select.error && <Alert tone="danger">{select.error}</Alert>}
      {!bids.length ? <EmptyState icon="coins" title="No offers yet">Verified businesses in this category will see your requirement and offer a commission.</EmptyState> : (
        <div className="ce-bids">{bids.map((b) => (
          <label key={b.id} className="ce-bid" data-ce-bid={b.company} data-picked={pick === b.id || undefined}>
            <input type="radio" name="bid" checked={pick === b.id} onChange={() => setPick(b.id)} disabled={r.status !== 'open'} />
            <span className="ce-bid-main"><strong>{b.company}</strong><RepLine rep={b.reputation} as="company" /><span className="ce-muted">{b.proposal}</span><small className="ce-muted">Paid on: {CE_TRIGGERS[b.trigger]} · within {b.paymentDays} days</small></span>
            <span className="ce-bid-amt"><strong>{rate(b)}</strong>{b.commissionPaise != null && <small>{rupees(b.commissionPaise)}{b.model === 'percent' ? ' on the estimate' : ''}</small>}</span>
          </label>))}</div>
      )}
      {pick && (
        <div className="cz-stack" style={{ gap: 8, marginTop: 12 }}>
          <Checkbox label="I accept this company’s commission terms and agree to share the customer’s details with them" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          <div><Button onClick={() => select.run()} disabled={!ok} loading={select.pending}>Select this offer</Button></div>
        </div>
      )}
    </Card>
  );
}

function BidForm({ r, reload }: { r: Req; reload: () => void }) {
  const b0 = r.myBid;
  const [f, setF] = useState({ model: (b0?.model as 'percent' | 'fixed') ?? 'percent', pct: b0?.rateBps ? String(b0.rateBps / 100) : '', fixed: b0?.fixedPaise ? String(b0.fixedPaise / 100) : '', trigger: 'customer_payment' as CeTrigger, paymentDays: '30', proposal: b0?.proposal ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation(async () => { await api.post(`/comearn/requirements/${r.id}/bids`, { model: f.model, rateBps: f.model === 'percent' && f.pct ? Math.round(Number(f.pct) * 100) : undefined, fixedPaise: f.model === 'fixed' && f.fixed ? toPaise(f.fixed) : undefined, trigger: f.trigger, paymentDays: Number(f.paymentDays || 30), proposal: f.proposal }); reload(); return true; });
  const withdraw = useMutation(async () => { await api.post(`/comearn/bids/${b0!.id}/withdraw`, {}); reload(); return true; });
  const fe = save.fieldErrors;
  const est = f.model === 'fixed' ? (f.fixed ? toPaise(f.fixed) : null) : r.estimatedValuePaise && f.pct ? Math.round((r.estimatedValuePaise * Number(f.pct)) / 100) : null;
  if (!r.canBid) return <Alert tone="info">Only verified businesses can offer commissions. Complete your business verification to bid.</Alert>;
  return (
    <Card title={b0 ? `Your offer (${b0.status})` : 'Offer a commission'} subtitle="Offers are sealed: other businesses cannot see yours. The member sees your proposal, commission and COMEARN track record.">
      <form className="cz-stack" style={{ gap: 8 }} data-form="ce-bid" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <div className="vai-grid">
          <Select label="Commission type" value={f.model} onChange={set('model')} options={[{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }]} />
          {f.model === 'percent' ? <TextInput label="Commission %" inputMode="decimal" value={f.pct} onChange={set('pct')} error={fe.rateBps} /> : <TextInput label="Commission (₹)" inputMode="decimal" value={f.fixed} onChange={set('fixed')} error={fe.fixedPaise} />}
          <Select label="Paid on" value={f.trigger} onChange={set('trigger')} options={Object.entries(CE_TRIGGERS).map(([value, label]) => ({ value, label }))} />
          <TextInput label="Pay within (days)" inputMode="numeric" value={f.paymentDays} onChange={set('paymentDays')} />
        </div>
        <TextArea label="Your proposal for the customer" value={f.proposal} onChange={set('proposal')} error={fe.proposal} rows={3} hint="What you would deliver, warranty, timeline — the member compares this, not only the commission." />
        {est != null && <p className="ce-muted">About {rupees(est)} to the member on the estimated value.</p>}
        <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending}>{b0 ? 'Update offer' : 'Submit offer'}</Button>{b0?.status === 'submitted' && <Button type="button" variant="ghost" onClick={() => withdraw.run()}>Withdraw</Button>}</div>
      </form>
    </Card>
  );
}
