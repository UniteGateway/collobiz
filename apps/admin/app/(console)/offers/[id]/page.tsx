'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { COMMISSION_STATE_LABELS, OFFER_KIND_LABELS, OFFER_PRICING_LABELS, REWARD_LABELS, levelLabel, regionLabel, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, EmptyState, Icon, Kpi, LoadingState, PageHeader, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Resp { id: string; partner: string; city: string | null; level: string; mode: string; price: number | null; priceUnit: string | null; rewardText: string; manpower: number | null; hasOffice: boolean; officeLocation: string | null; startDate: string | null; message: string; status: string; version: number; termsHash: string | null; decisionNote: string | null; idleManpower: number | null; submittedAt: string }
interface Detail { id: string; code: string; title: string; summary: string; issuer: string; kind: string; sector: string; regions: string[]; pricing: string; unitePrice: number | null; priceUnit: string | null; uniteReward: { text: string } | null; rewardModels: string[]; needsOffice: boolean; minManpower: number | null; exclusive: boolean; places: number; deadline: string; status: string; open: boolean; agreementNote: string | null; targetMode: string; recipients: { organizationId: string; name: string; status: string; declineReason: string | null }[]; responses: Resp[];
  papers: { responseId: string; partner: string; contract: { id: string; code: string; status: string } | null; agreement: { id: string; code: string } | null }[];
  sales: Sale[]; results: { partner: string; leads: number; open: number; won: number; paid: number; lost: number; wonValue: number; paidValue: number; commission: number }[] }
interface Sale { id: string; code: string; partner: string; buyerName: string; buyerCity: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null; description: string; estimatedValue: number | null; status: string; saleValue: number | null; paymentReference: string | null; lostReason: string | null; createdAt: string; commission: { status: string; payable: number } | null }
const SALE: Record<string, [string, 'info' | 'success' | 'warning' | 'neutral']> = { registered: ['Registered', 'info'], in_discussion: ['In discussion', 'info'], quoted: ['Quoted', 'warning'], won: ['Won — awaiting payment', 'success'], paid: ['Customer paid', 'success'], lost: ['Lost', 'neutral'], withdrawn: ['Withdrawn', 'neutral'] };
const CONTRACT: Record<string, string> = { draft: 'Draft — submit for approval', in_review: 'Awaiting second approver', approved: 'Ready for signatures', partially_signed: 'Partly signed', executed: 'Signed by both sides', terminated: 'Terminated' };
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
      {o.papers.length > 0 && (
        <Card title="Agreements" subtitle="Drafted automatically when you select a partner. Open it on the partner portal under Documents → Contracts to submit, have a second person approve, and sign.">
          <ul className="cz-pick-list" aria-label="Agreements">
            {o.papers.map((p) => (
              <li key={p.responseId} className="cz-row" style={{ justifyContent: 'space-between' }}>
                <span><strong>{p.partner}</strong> · <span className="cz-mono">{p.contract?.code}</span>{p.agreement ? <> · commission <span className="cz-mono">{p.agreement.code}</span></> : null}</span>
                <StatusBadge status={p.contract?.status ?? 'draft'} label={CONTRACT[p.contract?.status ?? 'draft']} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(o.sales.length > 0 || o.papers.length > 0) && <SalesCard o={o} onDone={q.reload} />}
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

function SalesCard({ o, onDone }: { o: Detail; onDone: () => void }) {
  const [act, setAct] = useState<{ id: string; kind: 'won' | 'lost' | 'paid' } | null>(null);
  const [v, setV] = useState({ value: '', reason: '', utr: '', invoice: '' });
  const move = useMutation(async (x: { id: string; status: string }) => {
    await api.post(`/admin/offers/${o.id}/sales/${x.id}/status`, { status: x.status, saleValue: x.status === 'won' ? Math.round(Number(v.value.replace(/,/g, '')) * 100) : undefined, lostReason: x.status === 'lost' ? v.reason : undefined });
    setAct(null); setV({ value: '', reason: '', utr: '', invoice: '' }); onDone(); return true;
  });
  const paid = useMutation(async (id: string) => { await api.post(`/admin/offers/${o.id}/sales/${id}/paid`, { paymentReference: v.utr, invoiceNumber: v.invoice || undefined }); setAct(null); setV({ value: '', reason: '', utr: '', invoice: '' }); onDone(); return true; });
  const err = move.error ?? paid.error;
  return (
    <Card title="Sales under this offer" subtitle="Buyers registered by selected partners. Move each one on; recording the customer payment makes any commission earned.">
      {o.results.length > 0 && (
        <div className="cz-ta-table-wrap" style={{ marginBottom: 16 }}><table className="cz-ta-table"><caption className="cz-sr-only">Results by partner</caption>
          <thead><tr><th>Partner</th><th className="cz-num">Buyers</th><th className="cz-num">Open</th><th className="cz-num">Won</th><th className="cz-num">Won value</th><th className="cz-num">Paid value</th><th className="cz-num">Commission</th></tr></thead>
          <tbody>{o.results.map((r) => <tr key={r.partner}><td>{r.partner}</td><td className="cz-num">{r.leads}</td><td className="cz-num">{r.open}</td><td className="cz-num">{r.won}</td><td className="cz-num">{rupees(r.wonValue)}</td><td className="cz-num">{rupees(r.paidValue)}</td><td className="cz-num">{rupees(r.commission)}</td></tr>)}</tbody>
        </table></div>
      )}
      {err && <Alert tone="danger">{err}</Alert>}
      {!o.sales.length ? <EmptyState icon="leads" title="No buyers registered yet" /> : (
        <ul className="cz-sale-list" aria-label="Sales">
          {o.sales.map((s) => {
            const [label, tone] = SALE[s.status] ?? [s.status, 'neutral'];
            const next = ({ registered: ['in_discussion', 'quoted'], in_discussion: ['quoted'] } as Record<string, string[]>)[s.status] ?? [];
            return (
              <li key={s.id} data-sale={s.buyerName}>
                <div className="cz-sale-main"><strong>{s.buyerName}</strong><span className="cz-muted">{s.buyerCity} · {s.partner} · <span className="cz-mono">{s.code}</span></span>
                  <span className="cz-muted">{s.description}{s.contactName ? ` · ${s.contactName}` : ''}{s.contactPhone ? ` · ${s.contactPhone}` : ''}</span>{s.lostReason && <span className="cz-muted">Lost: {s.lostReason}</span>}</div>
                <div className="cz-sale-figs"><span>{s.saleValue != null ? rupees(s.saleValue) : s.estimatedValue != null ? `~${rupees(s.estimatedValue)}` : '—'}</span>{s.commission && <span className="cz-muted">Commission {rupees(s.commission.payable)} · {COMMISSION_STATE_LABELS[s.commission.status as keyof typeof COMMISSION_STATE_LABELS] ?? s.commission.status}</span>}{s.paymentReference && <span className="cz-muted">UTR {s.paymentReference}</span>}</div>
                <div className="cz-sale-act">
                  <StatusBadge status={s.status} tone={tone} label={label} />
                  {['registered', 'in_discussion', 'quoted'].includes(s.status) && act?.id !== s.id && (
                    <div className="cz-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {next.map((n) => <Button key={n} size="sm" variant="secondary" onClick={() => move.run({ id: s.id, status: n })}>{n === 'quoted' ? 'Quoted' : 'In discussion'}</Button>)}
                      <Button size="sm" variant="accent" onClick={() => setAct({ id: s.id, kind: 'won' })}>Won</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAct({ id: s.id, kind: 'lost' })}>Lost</Button>
                    </div>
                  )}
                  {s.status === 'won' && act?.id !== s.id && <Button size="sm" variant="accent" onClick={() => setAct({ id: s.id, kind: 'paid' })}>Customer paid</Button>}
                </div>
                {act?.id === s.id && (
                  <div className="cz-inset" style={{ gridColumn: '1 / -1' }}>
                    {act.kind === 'won' && <><TextInput label={`Sale value ₹ — ${s.buyerName}`} inputMode="decimal" value={v.value} onChange={(e) => setV({ ...v, value: e.target.value })} /><div className="cz-row"><Button variant="accent" loading={move.pending} disabled={!Number(v.value.replace(/,/g, ''))} onClick={() => move.run({ id: s.id, status: 'won' })}>Mark won</Button><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button></div></>}
                    {act.kind === 'lost' && <><TextInput label={`Why was ${s.buyerName} lost?`} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /><div className="cz-row"><Button variant="danger" loading={move.pending} disabled={v.reason.trim().length < 5} onClick={() => move.run({ id: s.id, status: 'lost' })}>Mark lost</Button><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button></div></>}
                    {act.kind === 'paid' && <><div className="cz-grid cz-grid-2"><TextInput label="Payment reference (UTR)" value={v.utr} onChange={(e) => setV({ ...v, utr: e.target.value })} /><TextInput label="Invoice number (optional)" value={v.invoice} onChange={(e) => setV({ ...v, invoice: e.target.value })} /></div>
                      <div className="cz-row"><Button variant="accent" loading={paid.pending} disabled={v.utr.trim().length < 4} onClick={() => paid.run(s.id)}>Record customer payment</Button><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button></div></>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
