'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DISPUTE_OPTIONS, INCOTERMS, ISO_COUNTRIES, MEMBER_AGREEMENT_TYPES, countryName } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Dialog, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Terms { title: string; version: number; body: string; counselApproved: boolean; accepted: { by: string; at: string } | null; canAccept: boolean }
interface Ag { id: string; contractId: string; code: string; title: string; type: string; status: string; pilotDraft: boolean; direction: string; otherParty: string; createdAt: string; executedAt: string | null }
const STATUS: Record<string, [string, 'success' | 'info' | 'warning' | 'neutral']> = { approved: ['Ready to sign', 'info'], partially_signed: ['Signed by one party', 'warning'], executed: ['Signed by both — in force', 'success'], terminated: ['Terminated', 'neutral'], superseded: ['Replaced by a newer version', 'neutral'] };
const TYPE: Record<string, string> = { brand_licence: 'Brand licence', nda: 'NDA', distribution: 'Distribution', mou: 'MoU' };

/** Unite Industry Club — Terms and Conditions, the member's club code, and virtual agreements with other members anywhere. */
export default function ClubAgreements() {
  const t = useQuery<Terms>('/club/terms');
  const a = useQuery<{ memberCode: string | null; items: Ag[] }>('/club/agreements');
  const [open, setOpen] = useState(false);
  return (
    <Screen page={{ key: 'club-agreements', title: 'Club agreements', access: 'partner' }} eyebrow="UNITE INDUSTRY CLUB"
      description="Sign agreements online with any club member, in any country — NDAs, distribution agreements, collaboration MoUs and your Unite brand licence. Every signature is tied to the exact text you read."
      actions={t.data?.accepted && t.data.canAccept ? <Button onClick={() => setOpen(true)}>New agreement</Button> : undefined}>
      <div className="cz-stack" style={{ gap: 16 }}>
        {t.error ? <ApiErrorView error={t.error} onRetry={t.reload} /> : !t.data ? <LoadingState /> : <TermsCard t={t.data} onDone={() => { t.reload(); a.reload(); }} />}
        {a.data && (
          <Card>
            <div className="cz-club-code" data-member-code={a.data.memberCode ?? ''}>
              <div><p className="cz-muted" style={{ margin: 0 }}>Your club code</p><strong>{a.data.memberCode ?? 'Join the club to get your code'}</strong></div>
              <p className="cz-muted" style={{ margin: 0 }}>Share this code with a business you want to work with. They use it to send you an agreement; your details stay private until you both sign.</p>
            </div>
          </Card>
        )}
        <Card>
          <h2>My agreements</h2>
          {a.error ? <ApiErrorView error={a.error} onRetry={a.reload} /> : !a.data ? <LoadingState /> : !a.data.items.length ? <EmptyState icon="contracts" title="No agreements yet">Agreements you send or receive appear here.</EmptyState> : (
            <ul className="cz-board-list">{a.data.items.map((x) => {
              const [label, tone] = STATUS[x.status] ?? [x.status, 'neutral'];
              return (
                <li key={x.id} data-club-agreement={x.code}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div><strong>{x.title}</strong><div className="cz-muted">{x.code} · {TYPE[x.type] ?? x.type} · {x.direction === 'sent' ? 'Sent to' : 'From'} {x.otherParty}{x.pilotDraft ? ' · Pilot draft text' : ''}</div></div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><StatusBadge status={x.status} label={label} tone={tone} /><Link className="cz-btn cz-btn-secondary cz-btn-sm" href={`/vault?contract=${x.contractId}`}>{['approved', 'partially_signed'].includes(x.status) ? 'Review and sign' : 'Open'}</Link></div>
                  </div>
                </li>
              );
            })}</ul>
          )}
        </Card>
        <p className="cz-muted" style={{ fontSize: 14 }}>Unite Group provides the templates and the signing record and is not a party to agreements between members. Templates are drafts until Unite’s counsel approves them — see the <Link href="/club/legal">legal library</Link>.</p>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="New agreement"><NewAgreement onDone={() => { setOpen(false); a.reload(); }} /></Dialog>
    </Screen>
  );
}

function TermsCard({ t, onDone }: { t: Terms; onDone: () => void }) {
  const [name, setName] = useState('');
  const [read, setRead] = useState(false);
  const m = useMutation(async () => { await api.post('/club/terms/accept', { typedName: name, version: t.version }); onDone(); return true; });
  return (
    <Card>
      <div data-club-terms>
        <h2 style={{ marginTop: 0 }}>{t.title} <span className="cz-muted" style={{ fontWeight: 400, fontSize: 15 }}>version {t.version}</span></h2>
        {!t.counselApproved && <Alert tone="warning">Pilot draft — this version has not yet been approved by Unite’s legal counsel.</Alert>}
        {t.accepted ? <Alert tone="success">Accepted by {t.accepted.by} on {new Date(t.accepted.at).toLocaleDateString('en-IN')}.</Alert> : (
          <>
            <details style={{ margin: '8px 0' }}><summary>Read the full terms</summary><pre className="cz-legal">{t.body}</pre></details>
            {t.canAccept ? (
              <div className="cz-stack" style={{ gap: 8, maxWidth: 520 }}>
                <Checkbox label="I have read the terms and I am authorised to accept them for my business" checked={read} onChange={(e) => setRead(e.target.checked)} />
                <TextInput label="Type your full name to accept" value={name} onChange={(e) => setName(e.target.value)} />
                {m.error && <Alert tone="danger">{m.error}</Alert>}
                <div><Button disabled={!read || name.trim().length < 3 || m.pending} onClick={() => m.run()}>Accept the Club terms</Button></div>
              </div>
            ) : <p className="cz-muted">Your business owner or an admin accepts the terms.</p>}
          </>
        )}
      </div>
    </Card>
  );
}

const countryOptions = ISO_COUNTRIES.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label));

function NewAgreement({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ type: 'nda', counterpartyCode: '', dispute: 'india', termMonths: '24', purpose: '', contributionA: '', contributionB: '', targetDate: '', products: '', territory: [] as string[], exclusive: false, currency: 'USD', incoterm: 'FOB', paymentTerms: '', minimumTargets: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [pick, setPick] = useState('AE');
  const m = useMutation(async () => {
    const base = { type: f.type, counterpartyCode: f.counterpartyCode, dispute: f.dispute, termMonths: Number(f.termMonths) };
    const b = f.type === 'nda' ? { ...base, purpose: f.purpose }
      : f.type === 'mou' ? { ...base, purpose: f.purpose, contributionA: f.contributionA, contributionB: f.contributionB, targetDate: f.targetDate }
        : { ...base, products: f.products, territory: f.territory, exclusive: f.exclusive, currency: f.currency, incoterm: f.incoterm, paymentTerms: f.paymentTerms, minimumTargets: f.minimumTargets || undefined };
    await api.post('/club/agreements', b); onDone(); return true;
  });
  const fe = m.fieldErrors;
  return (
    <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="club-agreement">
      <Select label="Agreement" value={f.type} onChange={set('type')} options={MEMBER_AGREEMENT_TYPES.map((t) => ({ value: t.code, label: t.label }))} />
      <p className="cz-muted" style={{ margin: 0 }}>{MEMBER_AGREEMENT_TYPES.find((t) => t.code === f.type)?.text}</p>
      <TextInput label="Other member’s club code" placeholder="UIC-123456" value={f.counterpartyCode} onChange={set('counterpartyCode')} error={fe.counterpartyCode} required />
      {(f.type === 'nda' || f.type === 'mou') && <TextArea label="Purpose" rows={2} value={f.purpose} onChange={set('purpose')} error={fe.purpose} />}
      {f.type === 'mou' && (<>
        <TextArea label="What your business brings" rows={2} value={f.contributionA} onChange={set('contributionA')} error={fe.contributionA} />
        <TextArea label="What the other business brings" rows={2} value={f.contributionB} onChange={set('contributionB')} error={fe.contributionB} />
        <TextInput label="Target date for the final agreement" type="date" value={f.targetDate} onChange={set('targetDate')} error={fe.targetDate} />
      </>)}
      {f.type === 'distribution' && (<>
        <TextArea label="Products" rows={2} value={f.products} onChange={set('products')} error={fe.products} />
        <fieldset className="cz-fieldset"><legend>Territory (countries)</legend>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220 }}><Select label="Country" value={pick} onChange={(e) => setPick(e.target.value)} options={countryOptions} /></div>
            <Button type="button" variant="secondary" onClick={() => setF((x) => ({ ...x, territory: x.territory.includes(pick) ? x.territory : [...x.territory, pick] }))}>Add country</Button>
          </div>
          <div className="cz-board-why">{f.territory.map((c) => <button type="button" key={c} className="cz-chip" aria-pressed="true" onClick={() => setF((x) => ({ ...x, territory: x.territory.filter((y) => y !== c) }))}>{countryName(c)} ✕</button>)}</div>
          {fe.territory && <p role="alert" style={{ color: '#B3261E', margin: '6px 0 0' }}>{fe.territory}</p>}
        </fieldset>
        <Checkbox label="Exclusive in this territory" checked={f.exclusive} onChange={(e) => setF((x) => ({ ...x, exclusive: e.target.checked }))} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <TextInput label="Currency" value={f.currency} onChange={set('currency')} error={fe.currency} maxLength={3} />
          <Select label="Delivery (Incoterm)" value={f.incoterm} onChange={set('incoterm')} options={INCOTERMS.map((i) => ({ value: i, label: i }))} />
        </div>
        <TextInput label="Payment terms" value={f.paymentTerms} onChange={set('paymentTerms')} error={fe.paymentTerms} />
        <TextInput label="Minimum purchase targets (optional)" value={f.minimumTargets} onChange={set('minimumTargets')} />
      </>)}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Select label="Law and disputes" value={f.dispute} onChange={set('dispute')} options={DISPUTE_OPTIONS.map((d) => ({ value: d.code, label: d.label }))} />
        <TextInput label="Term (months)" inputMode="numeric" value={f.termMonths} onChange={set('termMonths')} error={fe.termMonths} />
      </div>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <Button type="submit" disabled={m.pending}>{m.pending ? 'Preparing…' : 'Prepare and send for signature'}</Button>
      <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>The agreement is generated from the Club template with your details and the other member’s registered details. Both of you review the full text before signing.</p>
    </form>
  );
}
