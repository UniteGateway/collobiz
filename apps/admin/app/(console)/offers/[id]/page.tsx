'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { OFFER_KIND_LABELS, OFFER_PRICING_LABELS, REWARD_LABELS, levelLabel, regionLabel, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, EmptyState, Icon, Kpi, LoadingState, PageHeader, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Resp { id: string; partner: string; city: string | null; level: string; mode: string; price: number | null; priceUnit: string | null; rewardText: string; manpower: number | null; hasOffice: boolean; officeLocation: string | null; startDate: string | null; message: string; status: string; version: number; termsHash: string | null; decisionNote: string | null; idleManpower: number | null; submittedAt: string }
interface Detail { id: string; code: string; title: string; summary: string; issuer: string; kind: string; sector: string; regions: string[]; pricing: string; unitePrice: number | null; priceUnit: string | null; uniteReward: { text: string } | null; rewardModels: string[]; needsOffice: boolean; minManpower: number | null; exclusive: boolean; places: number; deadline: string; status: string; open: boolean; agreementNote: string | null; targetMode: string; recipients: { organizationId: string; name: string; status: string; declineReason: string | null }[]; responses: Resp[] }
const rupees = (p: number | null, unit?: string | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`);
const REC: Record<string, string> = { sent: 'Not opened', viewed: 'Opened', responded: 'Responded', declined: 'Declined', selected: 'Selected', not_selected: 'Not selected' };

/** One direct offer: who received it, every response side by side, and selection. */
export default function OfferAdmin() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Detail>(`/admin/offers/${id}`);
  const [closing, setClosing] = useState<'close' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const close = useMutation(async () => { await api.post(`/admin/offers/${id}/close`, { reason, withdraw: closing === 'withdraw' }); setClosing(null); q.reload(); return true; });
  if (q.loading) return <LoadingState />;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  const o = q.data!;
  const count = (s: string) => o.recipients.filter((r) => r.status === s).length;
  const selected = o.responses.filter((r) => r.status === 'selected').length;
  const live = o.responses.filter((r) => r.status === 'submitted');
  return (
    <div>
      <PageHeader title={o.title} breadcrumb="Unite Group Administration / Direct offers"
        description={<><span className="cz-mono">{o.code}</span> · {o.issuer} · {OFFER_KIND_LABELS[o.kind]} · {sectorName(o.sector)} · {o.regions.length ? o.regions.map(regionLabel).join(', ') : 'Anywhere'}</>}
        actions={<div className="cz-row"><StatusBadge status={o.status} label={o.open ? 'Open' : o.status === 'open' ? 'Past deadline' : undefined} />{o.status === 'open' && <><Button size="sm" variant="secondary" onClick={() => setClosing('close')}>Close</Button><Button size="sm" variant="ghost" onClick={() => setClosing('withdraw')}>Withdraw</Button></>}</div>} />
      <p style={{ marginTop: -6 }}><Link href="/offers" className="cz-back"><Icon name="prev" size={14} />All offers</Link></p>
      {closing && (
        <Card title={closing === 'withdraw' ? 'Withdraw offer' : 'Close offer'}>
          {close.error && <Alert tone="danger">{close.error}</Alert>}
          <p className="cz-muted" style={{ marginTop: 0 }}>{closing === 'withdraw' ? 'Partners will no longer see the offer.' : 'Partners can see it but can no longer respond.'} Everyone who received it is told why.</p>
          <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="cz-row"><Button variant="danger" loading={close.pending} disabled={reason.trim().length < 5} onClick={() => close.run()}>{closing === 'withdraw' ? 'Withdraw' : 'Close'}</Button><Button variant="secondary" onClick={() => setClosing(null)}>Cancel</Button></div>
        </Card>
      )}
      <div className="cz-grid cz-grid-4" style={{ marginBottom: 20 }}>
        <Kpi label="Sent to" value={o.recipients.length} hint={o.targetMode === 'all' ? 'All verified partners' : o.targetMode === 'selected' ? 'Chosen partners' : 'Filtered group'} />
        <Kpi label="Opened" value={o.recipients.length - count('sent')} />
        <Kpi label="Responses" value={o.responses.length} hint={`${count('declined')} declined`} />
        <Kpi label="Selected" value={`${selected} of ${o.places}`} accent hint={o.exclusive ? 'Exclusive' : undefined} />
      </div>
      <Card title="Terms offered">
        <DescriptionList items={[
          ['Pricing', OFFER_PRICING_LABELS[o.pricing]],
          ...(o.pricing !== 'partner_quote' ? [['Your terms', [o.unitePrice != null ? rupees(o.unitePrice, o.priceUnit) : null, o.uniteReward?.text].filter(Boolean).join(' · ')] as [string, React.ReactNode]] : []),
          ['Partners may propose', o.rewardModels.map((m) => REWARD_LABELS[m]).join(', ')],
          ['Requirements', [o.needsOffice ? 'Existing office or setup' : null, o.minManpower ? `At least ${o.minManpower} people` : null].filter(Boolean).join(' · ') || 'None'],
          ['Responses close', new Date(o.deadline).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })],
        ]} />
        {o.agreementNote && <Alert tone="info">{o.agreementNote}</Alert>}
      </Card>
      <Card title={`Responses${live.length ? ` · ${live.length} to decide` : ''}`} subtitle="Only you see these. Partners never see each other's responses.">
        {!o.responses.length ? <EmptyState icon="inbox" title="No responses yet" /> : (
          <ul className="cz-review-list">{o.responses.map((r) => <ResponseItem key={r.id} r={r} offerId={o.id} canSelect={o.status === 'open' && selected < o.places} onDone={q.reload} />)}</ul>
        )}
      </Card>
      <Card title="Who received it">
        <ul className="cz-pick-list" aria-label="Recipients">
          {o.recipients.map((r) => <li key={r.organizationId} className="cz-row" style={{ justifyContent: 'space-between' }}><span>{r.name}{r.declineReason ? <span className="cz-muted"> — {r.declineReason}</span> : null}</span><StatusBadge status={r.status === 'sent' ? 'pending' : r.status} label={REC[r.status]} /></li>)}
        </ul>
      </Card>
    </div>
  );
}

function ResponseItem({ r, offerId, canSelect, onDone }: { r: Resp; offerId: string; canSelect: boolean; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const m = useMutation(async (action: 'select' | 'reject') => { await api.post(`/admin/offers/${offerId}/responses/${r.id}/${action}`, { note }); setDeciding(false); setNote(''); onDone(); return action; });
  return (
    <li className="cz-card cz-review" data-response={r.partner}>
      <div className="cz-review-head"><div><strong>{r.partner}</strong> <span className="cz-muted" style={{ fontSize: 13 }}>· {levelLabel(r.level)}{r.city ? ` · ${r.city}` : ''}</span></div>
        <StatusBadge status={r.status} label={r.status === 'submitted' ? (r.mode === 'accept_terms' ? 'Accepted your terms' : 'Proposal') : undefined} /></div>
      <dl className="cz-sheet-facts">
        <div><dt>Price</dt><dd>{rupees(r.price, r.priceUnit)}</dd></div>
        <div><dt>Reward</dt><dd>{r.rewardText}</dd></div>
        <div><dt>People</dt><dd>{r.manpower ?? '—'}{r.idleManpower != null ? <span className="cz-muted"> ({r.idleManpower} free declared)</span> : null}</dd></div>
        <div><dt>Office</dt><dd>{r.hasOffice ? r.officeLocation ?? 'Yes' : 'No'}</dd></div>
        <div><dt>Can start</dt><dd>{r.startDate ? new Date(r.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd></div>
        <div><dt>Received</dt><dd>{new Date(r.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
      </dl>
      <p style={{ margin: '4px 0', whiteSpace: 'pre-line' }}>{r.message}</p>
      {r.version > 1 && <span className="cz-muted" style={{ fontSize: 12.5 }}>Updated {r.version - 1} time{r.version > 2 ? 's' : ''}</span>}
      {r.status === 'selected' && <Alert tone="success">Selected{r.decisionNote ? ` — ${r.decisionNote}` : ''}. Terms record <span className="cz-mono">{r.termsHash?.slice(0, 16)}…</span></Alert>}
      {r.status === 'not_selected' && r.decisionNote && <p className="cz-muted" style={{ margin: 0 }}>Not selected — {r.decisionNote}</p>}
      {r.status === 'submitted' && (deciding ? (
        <div className="cz-inset">
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <TextInput label="Note to the partner (reason)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="cz-row">
            <Button variant="accent" disabled={!canSelect || note.trim().length < 5} loading={m.pending} onClick={() => m.run('select')}>Select {r.partner}</Button>
            <Button variant="secondary" disabled={note.trim().length < 5} onClick={() => m.run('reject')}>Not selected</Button>
            <Button variant="ghost" onClick={() => setDeciding(false)}>Cancel</Button>
          </div>
          {!canSelect && <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>All places are filled or the offer is closed.</p>}
        </div>
      ) : <div><Button size="sm" onClick={() => setDeciding(true)}>Decide</Button></div>)}
    </li>
  );
}
