'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PRICING_LABELS, PRICING_MODELS } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { JourneyStepper, MoneyRow, inr, send, type Money, type OfferView } from '@/components/Collab';
import { useMutation, useQuery } from '@/lib/hooks';

interface Terms { scope: string; deliverables: string; pricingModel: string; value: number; sharePercent?: number; paymentTerms: string; durationMonths: number; startDate: string; payer: 'owner' | 'applicant'; note?: string }
interface Room {
  side: 'owner' | 'applicant'; offer: OfferView; stage: string; waitingFor: 'you' | 'them' | 'first_proposal' | null; prerequisite: string | null;
  application: { id: string; status: string; message: string; proposedValue: number | null; applicant: string };
  rounds: { id: string; round: number; from: 'owner' | 'applicant'; mine: boolean; status: string; terms: Terms; pricingLabel: string; createdAt: string }[];
  can: { propose: boolean; accept: boolean; decline: boolean; withdraw: boolean };
  agreement: { id: string; code: string; status: string; value: number; issuer: 'you' | 'them' } | null; project: { id: string; code: string; status: string } | null; money: Money;
}
const ROUND_LABEL: Record<string, string> = { sent: 'Open', superseded: 'Countered', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn' };
const in3Weeks = () => new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

/** Private proposal room for one application: proposals and counter-proposals, then the agreement, project and money. */
export default function ProposalRoom() {
  const { id } = useParams<{ id: string }>();
  const r = useQuery<Room>(`/collab/applications/${id}/room`);
  const [composing, setComposing] = useState(false);
  const act = useMutation(async (path: string, body?: object) => { const x = await send(path, body); r.reload(); return x; });
  const d = r.data;
  const live = d?.rounds.find((x) => x.status === 'sent');
  const other = d ? (d.side === 'owner' ? d.application.applicant : d.offer.publisher) : '';
  return (
    <Screen page={{ key: 'collab-room', title: 'Proposal room', access: 'partner' }} eyebrow="COLLAB"
      description={d ? `${d.offer.title} · ${d.offer.code} · with ${other}` : undefined}>
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <JourneyStepper stage={d.stage} />
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          {d.prerequisite && <Alert tone="info">{d.prerequisite}</Alert>}
          {d.agreement && (
            <Card title="Agreement" actions={<StatusBadge status={d.agreement.status} tone={d.agreement.status === 'executed' ? 'success' : 'warning'} label={d.agreement.status === 'executed' ? 'Signed by both' : d.agreement.status === 'partially_signed' ? 'Signed by one party' : 'Ready to sign'} />}>
              <p style={{ marginTop: 0 }}>{d.agreement.code} · {inr(d.agreement.value)}. Both parties agreed these terms here; each signs the agreement in Documents.</p>
              <div className="cz-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <ButtonLink href={`/vault?contract=${d.agreement.id}`}>{d.agreement.status === 'executed' ? 'View agreement' : 'Review and sign'}</ButtonLink>
                {d.project ? <ButtonLink variant="secondary" href={`/projects/${d.project.id}`}>Open project {d.project.code}</ButtonLink>
                  : d.agreement.status === 'executed' && <span className="cz-muted">{d.agreement.issuer === 'you' ? 'As the client, start the project from the agreement to plan milestones.' : 'The client starts the project; you then plan the milestones.'}</span>}
              </div>
            </Card>
          )}
          <Card title="Money for this collaboration"><MoneyRow m={d.money} /></Card>
          <Card title="Proposals" subtitle={d.waitingFor === 'you' ? 'Waiting for you: accept, counter or decline the open proposal.' : d.waitingFor === 'them' ? `Waiting for ${other} to respond.` : d.waitingFor === 'first_proposal' ? 'Either party can send the first proposal.' : undefined}
            actions={d.can.propose && !composing ? <Button size="sm" onClick={() => setComposing(true)}>{live ? 'Send a counter-proposal' : 'Send a proposal'}</Button> : undefined}>
            {!d.rounds.length && !composing && <p className="cz-muted" style={{ margin: 0 }}>No proposals yet.</p>}
            <ol className="cz-collab-rounds">{[...d.rounds].reverse().map((x) => (
              <li key={x.id} data-round={x.round} data-status={x.status} className={x.mine ? 'mine' : ''}>
                <header><strong>Round {x.round} · {x.mine ? 'You' : other}</strong><StatusBadge status={x.status} label={ROUND_LABEL[x.status]} tone={x.status === 'accepted' ? 'success' : x.status === 'sent' ? 'info' : 'neutral'} /></header>
                <p className="cz-collab-terms-value">{inr(x.terms.value)} <span className="cz-muted">· {x.pricingLabel}{x.terms.sharePercent ? ` ${x.terms.sharePercent}%` : ''} · {x.terms.durationMonths} months from {new Date(x.terms.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
                <dl className="cz-collab-terms"><dt>Scope</dt><dd>{x.terms.scope}</dd><dt>Deliverables</dt><dd>{x.terms.deliverables}</dd><dt>Payment</dt><dd>{x.terms.paymentTerms} · paid by {x.terms.payer === d.side ? 'you' : other}</dd>{x.terms.note && <><dt>Note</dt><dd>{x.terms.note}</dd></>}</dl>
                {x.status === 'sent' && !x.mine && (d.can.accept || d.can.decline) && (
                  <div className="cz-row" style={{ gap: 8 }}>
                    {d.can.accept && <Button size="sm" loading={act.pending} onClick={() => act.run(`/collab/proposals/${x.id}/accept`)}>Accept and create agreement</Button>}
                    {d.can.decline && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Why are you declining? (shared with the other party)'); if (reason) act.run(`/collab/proposals/${x.id}/decline`, { reason }); }}>Decline</Button>}
                  </div>
                )}
                {x.status === 'sent' && x.mine && d.can.withdraw && <Button size="sm" variant="ghost" onClick={() => act.run(`/collab/proposals/${x.id}/withdraw`)}>Withdraw</Button>}
              </li>
            ))}</ol>
            {composing && <Compose base={live?.terms} side={d.side} onCancel={() => setComposing(false)} onSent={() => { setComposing(false); r.reload(); }} appId={d.application.id} />}
          </Card>
          <Link href={`/business-offers/${d.offer.id}`} className="cz-muted" style={{ fontSize: 13 }}>← Back to the offer</Link>
        </div>
      )}
    </Screen>
  );
}

function Compose({ base, side, appId, onCancel, onSent }: { base?: Terms; side: 'owner' | 'applicant'; appId: string; onCancel: () => void; onSent: () => void }) {
  const [f, setF] = useState({
    scope: base?.scope ?? '', deliverables: base?.deliverables ?? '', pricingModel: base?.pricingModel ?? 'fixed_fee', value: base ? String(base.value / 100) : '', sharePercent: base?.sharePercent ? String(base.sharePercent) : '',
    paymentTerms: base?.paymentTerms ?? '', durationMonths: String(base?.durationMonths ?? 12), startDate: base?.startDate ?? in3Weeks(), payer: base?.payer ?? (side === 'owner' ? 'applicant' : 'owner'), note: '',
  });
  const save = useMutation(async () => {
    const x = await send(`/collab/applications/${appId}/proposals`, { scope: f.scope, deliverables: f.deliverables, pricingModel: f.pricingModel, value: Math.round(Number(f.value) * 100), sharePercent: f.sharePercent ? Number(f.sharePercent) : undefined, paymentTerms: f.paymentTerms, durationMonths: Number(f.durationMonths), startDate: f.startDate, payer: f.payer, note: f.note || undefined });
    onSent(); return x;
  });
  const e = save.fieldErrors;
  const share = f.pricingModel === 'revenue_share' || f.pricingModel === 'commission';
  return (
    <form className="cz-stack cz-collab-compose" style={{ gap: 4 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
      <h3 style={{ margin: '0 0 4px' }}>{base ? 'Counter-proposal' : 'Proposal'}</h3>
      {save.error && <Alert tone="danger">{save.error}</Alert>}
      <TextArea label="Scope of work" rows={3} value={f.scope} onChange={(ev) => setF({ ...f, scope: ev.target.value })} error={e.scope} />
      <TextArea label="Deliverables" rows={2} value={f.deliverables} onChange={(ev) => setF({ ...f, deliverables: ev.target.value })} error={e.deliverables} />
      <div className="cz-grid cz-grid-2" style={{ gap: '0 12px' }}>
        <Select label="Pricing" value={f.pricingModel} onChange={(ev) => setF({ ...f, pricingModel: ev.target.value })} options={PRICING_MODELS.filter((p) => p !== 'barter').map((p) => ({ value: p, label: PRICING_LABELS[p] }))} hint="For barter, use XCHANGE" />
        <TextInput label="Total value for the term (₹)" inputMode="numeric" value={f.value} onChange={(ev) => setF({ ...f, value: ev.target.value.replace(/\D/g, '') })} error={e.value} />
        {share && <TextInput label="Percentage (%)" inputMode="decimal" value={f.sharePercent} onChange={(ev) => setF({ ...f, sharePercent: ev.target.value.replace(/[^\d.]/g, '') })} error={e.sharePercent} />}
        <TextInput label="Payment terms" placeholder="e.g. Monthly in arrears, 15 days" value={f.paymentTerms} onChange={(ev) => setF({ ...f, paymentTerms: ev.target.value })} error={e.paymentTerms} />
        <TextInput label="Duration (months)" inputMode="numeric" value={f.durationMonths} onChange={(ev) => setF({ ...f, durationMonths: ev.target.value.replace(/\D/g, '') })} error={e.durationMonths} />
        <TextInput label="Start date" type="date" value={f.startDate} onChange={(ev) => setF({ ...f, startDate: ev.target.value })} error={e.startDate} />
      </div>
      <Segmented label="Who pays" value={f.payer} onChange={(v) => setF({ ...f, payer: v as 'owner' | 'applicant' })} options={[{ value: side, label: 'We pay' }, { value: side === 'owner' ? 'applicant' : 'owner', label: 'They pay' }]} />
      <TextInput label="Note (optional)" value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} />
      <p className="cz-muted" style={{ fontSize: 12.5 }}>If the other party accepts, an agreement with these terms is created for both of you to sign. COLLABIZ is not a party to it.</p>
      <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending} disabled={!f.value || f.scope.length < 20}>Send</Button><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
