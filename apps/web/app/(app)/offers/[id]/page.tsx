'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PRICE_UNITS, newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, DescriptionList, Icon, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MY_STATUS, dueText, isPercent, kindLabel, placesText, priceText, pricingLabel, rewardLabel, type Offer, type OfferSale } from '@/components/Offers';
import { PartnerPapers, PartnerSales, type Papers } from '@/components/OfferSales';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

interface MyResponse { id: string; mode: string; price: number | null; priceUnit: string | null; rewardModel: string; rewardBps: number | null; rewardAmount: number | null; rewardText: string; manpower: number | null; hasOffice: boolean; officeLocation: string | null; startDate: string | null; message: string; status: string; version: number; termsHash: string | null; decisionNote: string | null }
type Detail = Offer & { myStatus: string; declineReason: string | null; myResponse: MyResponse | null; myCapacity: { hasOffice: boolean; officeLocations: string[]; idleManpower: number } | null; papers: Papers | null; sales: OfferSale[] };
const PAGE = { key: 'offer', title: 'Offer', access: 'verified-partner' as const };

/** One direct offer: what Unite Group is asking for, its terms, and your response. */
export default function OfferDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Detail>(`/offers/${id}`);
  if (q.loading) return <Screen page={PAGE}><LoadingState /></Screen>;
  if (q.error) return <Screen page={PAGE}><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const o = q.data!;
  const [label, tone] = MY_STATUS[o.myStatus] ?? [o.myStatus, 'neutral'];
  const decided = ['selected', 'not_selected'].includes(o.myStatus);
  return (
    <Screen page={{ ...PAGE, title: o.title }} eyebrow={o.venture ? `${o.venture.name} · offer from ${o.issuer}` : `Offer from ${o.issuer}`} actions={<StatusBadge status={o.myStatus} tone={tone} label={label} />}>
      <p style={{ marginTop: -6 }}><Link href="/offers" className="cz-back"><Icon name="prev" size={14} />All offers</Link></p>
      <dl className="cz-od-facts" style={{ marginBottom: 20 }}>
        <div><dt>What</dt><dd>{kindLabel(o.kind)}</dd></div>
        <div><dt>Where</dt><dd>{placesText(o)}</dd></div>
        <div><dt>Pricing</dt><dd>{pricingLabel(o.pricing)}</dd></div>
        <div><dt>Responses close</dt><dd>{o.open ? dueText(o.deadline) : 'Closed'}</dd></div>
      </dl>
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <div className="cz-stack">
          <Card title="About this offer">
            <p style={{ whiteSpace: 'pre-line', marginTop: 0 }}>{o.summary}</p>
            <DescriptionList items={[
              ['Offer', <span key="c" className="cz-mono">{o.code}</span>],
              ...(o.pricing !== 'partner_quote' ? [['Unite Group terms', [priceText(o.unitePrice, o.priceUnit), o.uniteReward?.text].filter(Boolean).join(' · ') || '—'] as [string, React.ReactNode]] : []),
              ['Rewards you may propose', o.rewardModels.map(rewardLabel).join(', ')],
              ['Places', o.exclusive ? 'One partner, exclusive' : `${o.places} partner${o.places === 1 ? '' : 's'}`],
              ['You need', [o.needsOffice ? 'An existing office or setup' : null, o.minManpower ? `At least ${o.minManpower} people` : null].filter(Boolean).join(' · ') || 'No minimum'],
            ]} />
            {o.agreementNote && <Alert tone="info" title="Profit share and equity.">{o.agreementNote}</Alert>}
          </Card>
        </div>
        <div className="cz-stack">
          {o.myStatus === 'selected' && o.myResponse && (
            <Card title="You were selected">
              <Alert tone="success">Agreed terms: {o.myResponse.rewardText}{o.myResponse.price != null ? ` · ${priceText(o.myResponse.price, o.myResponse.priceUnit)}` : ''}.</Alert>
              <PartnerPapers papers={o.papers} />
              {o.myResponse.decisionNote && <p className="cz-muted">{o.myResponse.decisionNote}</p>}
              <p className="cz-muted" style={{ fontSize: 12.5 }}>Terms record <span className="cz-mono">{o.myResponse.termsHash?.slice(0, 16)}…</span> — kept unchanged for both sides.</p>
            </Card>
          )}
          {o.myStatus === 'not_selected' && <Card title="Not selected"><p style={{ margin: 0 }}>{o.myResponse?.decisionNote ?? 'Another partner was chosen for this offer.'}</p></Card>}
          {o.myStatus === 'declined' && <Card title="You declined"><p style={{ margin: 0 }}>{o.declineReason}</p></Card>}
          {!decided && o.myStatus !== 'declined' && (o.open ? <Respond o={o} onDone={q.reload} /> : <Card title="Closed"><p style={{ margin: 0 }}>This offer is no longer taking responses.</p></Card>)}
        </div>
      </div>
      {o.myStatus === 'selected' && <div style={{ marginTop: 20 }}><PartnerSales offerId={o.id} sales={o.sales ?? []} signed={o.papers?.contract?.status === 'executed'} hasCommission={!!o.papers?.agreement} onChange={q.reload} /></div>}
    </Screen>
  );
}

function Respond({ o, onDone }: { o: Detail; onDone: () => void }) {
  const r = o.myResponse;
  const canAccept = o.pricing !== 'partner_quote';
  const canPropose = o.pricing !== 'unite_price';
  const [editing, setEditing] = useState(!r || r.status === 'withdrawn');
  const [mode, setMode] = useState(r?.mode ?? (canAccept ? 'accept_terms' : 'proposal'));
  const [f, setF] = useState({ price: '', priceUnit: o.priceUnit ?? 'per month', model: o.rewardModels[0], value: '', manpower: '', hasOffice: o.needsOffice || !!o.myCapacity?.hasOffice, office: o.myCapacity?.officeLocations[0] ?? '', start: '', message: '' });
  useEffect(() => {
    if (!r) return;
    setF({ price: r.price != null ? String(r.price / 100) : '', priceUnit: r.priceUnit ?? o.priceUnit ?? 'per month', model: r.rewardModel, value: r.rewardBps != null ? String(r.rewardBps / 100) : r.rewardAmount != null ? String(r.rewardAmount / 100) : '', manpower: r.manpower != null ? String(r.manpower) : '', hasOffice: r.hasOffice, office: r.officeLocation ?? '', start: r.startDate ?? '', message: r.message });
  }, [r?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = useMemo(newIdempotencyKey, [editing, mode]);
  const send = useMutation(async () => {
    const pct = isPercent(f.model);
    await api.request('POST', `/offers/${o.id}/respond`, {
      mode, message: f.message, hasOffice: f.hasOffice, officeLocation: f.hasOffice && f.office ? f.office : undefined, manpower: f.manpower ? Number(f.manpower) : undefined, startDate: f.start || undefined,
      ...(mode === 'proposal' ? { price: toMinor(f.price), priceUnit: f.price ? f.priceUnit : undefined, reward: { model: f.model, ...(pct ? { bps: Math.round(Number(f.value) * 100) } : { amount: toMinor(f.value) }) } } : {}),
    }, { idempotencyKey: key });
    setEditing(false); onDone(); return true;
  });
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const decline = useMutation(async () => { await api.post(`/offers/${o.id}/decline`, { reason }); onDone(); return true; });
  const e = send.fieldErrors;
  if (r && r.status === 'submitted' && !editing) {
    return (
      <Card title="Your response" actions={<StatusBadge status="submitted" tone="info" label={`Sent · version ${r.version}`} />}>
        <DescriptionList items={[
          ['You', r.mode === 'accept_terms' ? 'Accepted Unite Group’s terms' : 'Proposed your own terms'],
          ...(r.price != null ? [['Price', priceText(r.price, r.priceUnit)] as [string, React.ReactNode]] : []),
          ['Reward', r.rewardText],
          ['People', r.manpower != null ? String(r.manpower) : '—'],
          ['Office', r.hasOffice ? r.officeLocation ?? 'Yes' : 'No'],
        ]} />
        <p style={{ whiteSpace: 'pre-line' }}>{r.message}</p>
        <div className="cz-row"><Button variant="secondary" onClick={() => setEditing(true)}>Change response</Button><Button variant="ghost" onClick={() => setDeclining(true)}>Withdraw and decline</Button></div>
        {declining && <DeclineBox reason={reason} setReason={setReason} run={() => decline.run()} pending={decline.pending} error={decline.error} cancel={() => setDeclining(false)} />}
      </Card>
    );
  }
  return (
    <Card title="Respond">
      <form noValidate onSubmit={(ev) => { ev.preventDefault(); send.run(); }}>
        {send.error && <Alert tone="danger">{send.error}</Alert>}
        {canAccept && canPropose && <div style={{ marginBottom: 14 }}><Segmented label="Response type" value={mode} onChange={setMode} options={[{ value: 'accept_terms', label: 'Accept our terms' }, { value: 'proposal', label: 'Propose your terms' }]} /></div>}
        {mode === 'accept_terms' ? (
          <Alert tone="info">You accept {[priceText(o.unitePrice, o.priceUnit), o.uniteReward?.text].filter(Boolean).join(' · ')}.</Alert>
        ) : (
          <>
            <div className="cz-grid cz-grid-2">
              <TextInput label={o.pricing === 'partner_quote' ? 'Your price (₹)' : 'Your price (₹, optional)'} inputMode="decimal" value={f.price} onChange={(ev) => setF({ ...f, price: ev.target.value })} error={e.price} />
              <Select label="Price is" value={f.priceUnit} onChange={(ev) => setF({ ...f, priceUnit: ev.target.value })} options={PRICE_UNITS.map((u) => ({ value: u, label: u.charAt(0).toUpperCase() + u.slice(1) }))} error={e.priceUnit} />
              <Select label="Reward you want" value={f.model} onChange={(ev) => setF({ ...f, model: ev.target.value, value: '' })} options={o.rewardModels.map((m) => ({ value: m, label: rewardLabel(m) }))} error={e.reward} />
              <TextInput label={isPercent(f.model) ? `${rewardLabel(f.model)} (%)` : `${rewardLabel(f.model)} (₹)`} inputMode="decimal" value={f.value} onChange={(ev) => setF({ ...f, value: ev.target.value })} error={e['reward.bps'] ?? e['reward.amount']} />
            </div>
            {['profit_share', 'equity'].includes(f.model) && <Alert tone="info">{rewardLabel(f.model)} is indicative here and becomes binding only through a signed agreement in Contracts.</Alert>}
          </>
        )}
        <div className="cz-grid cz-grid-2">
          <TextInput label={o.minManpower ? `People you will commit (min ${o.minManpower})` : 'People you will commit (optional)'} inputMode="numeric" value={f.manpower} onChange={(ev) => setF({ ...f, manpower: ev.target.value })} error={e.manpower} hint={o.myCapacity ? `You declared ${o.myCapacity.idleManpower} people available` : undefined} />
          <TextInput label="Can start from (optional)" type="date" value={f.start} onChange={(ev) => setF({ ...f, start: ev.target.value })} />
        </div>
        <Checkbox label={o.needsOffice ? 'We have an existing office or setup in this market (required)' : 'We have an existing office or setup in this market'} checked={f.hasOffice} onChange={(ev) => setF({ ...f, hasOffice: ev.target.checked })} />
        {f.hasOffice && <TextInput label="Office location" value={f.office} onChange={(ev) => setF({ ...f, office: ev.target.value })} error={e.officeLocation} />}
        <TextArea label="Why your company (team, experience, how you will deliver)" value={f.message} onChange={(ev) => setF({ ...f, message: ev.target.value })} error={e.message} hint="At least 20 characters. Only Unite Group sees your response." />
        <div className="cz-row">
          <Button type="submit" variant="accent" loading={send.pending} disabled={f.message.trim().length < 20}>{r ? 'Send updated response' : mode === 'accept_terms' ? 'Accept and send' : 'Send proposal'}</Button>
          {r && <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
          {!r && <Button type="button" variant="ghost" onClick={() => setDeclining(true)}>Decline</Button>}
        </div>
      </form>
      {declining && <DeclineBox reason={reason} setReason={setReason} run={() => decline.run()} pending={decline.pending} error={decline.error} cancel={() => setDeclining(false)} />}
      <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Amounts in ₹. You can change your response until the deadline or until Unite Group decides.</p>
    </Card>
  );
}

function DeclineBox({ reason, setReason, run, pending, error, cancel }: { reason: string; setReason: (v: string) => void; run: () => void; pending: boolean; error: string | null; cancel: () => void }) {
  return (
    <div className="cz-inset" style={{ marginTop: 14 }}>
      {error && <Alert tone="danger">{error}</Alert>}
      <TextInput label="Reason for declining" value={reason} onChange={(e) => setReason(e.target.value)} hint="Helps Unite Group send you better offers" />
      <div className="cz-row"><Button variant="danger" onClick={run} loading={pending} disabled={reason.trim().length < 5}>Decline offer</Button><Button variant="secondary" onClick={cancel}>Keep it</Button></div>
    </div>
  );
}
