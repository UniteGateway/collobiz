'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { CONSENT_METHODS, COMMISSION_STATUS, CONTRACT_STATUS, SALE_STATUS, rupees, type OfferSale } from '@/components/Offers';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

export interface Papers { contract: { id: string; code: string; status: string } | null; agreement: { id: string; code: string } | null }

/** For a selected partner: the agreement and commission links, and the sales registered under the offer. */
export function PartnerPapers({ papers }: { papers: Papers | null }) {
  if (!papers?.contract) return null;
  return (
    <div className="cz-papers">
      <div><span className="cz-muted">Agreement</span><Link href={`/vault?contract=${papers.contract.id}`} className="cz-mono">{papers.contract.code}</Link><span>{CONTRACT_STATUS[papers.contract.status] ?? papers.contract.status}</span></div>
      {papers.agreement && <div><span className="cz-muted">Commission</span><Link href={`/commissions/agreements/${papers.agreement.id}`} className="cz-mono">{papers.agreement.code}</Link><span>Paid through Earnings once customers pay</span></div>}
    </div>
  );
}

export function PartnerSales({ offerId, sales, signed, hasCommission, onChange }: { offerId: string; sales: OfferSale[]; signed: boolean; hasCommission: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const empty = { buyerName: '', buyerCity: '', contactName: '', contactPhone: '', contactEmail: '', description: '', value: '', consentMethod: 'meeting_minutes', consent: false };
  const [f, setF] = useState(empty);
  const key = useMemo(newIdempotencyKey, [open]);
  const add = useMutation(async () => {
    await api.request('POST', `/offers/${offerId}/sales`, { buyerName: f.buyerName, buyerCity: f.buyerCity, contactName: f.contactName || undefined, contactPhone: f.contactPhone || undefined, contactEmail: f.contactEmail || undefined, description: f.description, estimatedValue: toMinor(f.value), consentMethod: f.consentMethod, consent: f.consent }, { idempotencyKey: key });
    setF(empty); setOpen(false); onChange(); return true;
  });
  const withdraw = useMutation(async (id: string) => { await api.post(`/offers/${offerId}/sales/${id}/withdraw`); onChange(); return true; });
  const e = add.fieldErrors;
  const live = sales.filter((s) => s.status !== 'withdrawn');
  const earned = live.reduce((t, s) => t + (s.commission && ['earned', 'approved', 'invoiced', 'settled'].includes(s.commission.status) ? s.commission.payable : 0), 0);
  const projected = live.reduce((t, s) => t + (s.commission && ['estimated', 'eligible'].includes(s.commission.status) ? s.commission.payable : 0), 0);
  return (
    <Card title="Your sales under this offer" subtitle="Register buyers you introduce. Unite Group quotes, contracts and delivers; you see each step here." actions={!open && <Button onClick={() => setOpen(true)}>Register a buyer</Button>}>
      {hasCommission && <div className="cz-offer-stats" style={{ marginBottom: 12 }}><span><strong>{live.length}</strong> buyers</span><span><strong>{live.filter((s) => ['won', 'paid'].includes(s.status)).length}</strong> won</span><span>Projected <strong>{rupees(projected)}</strong></span><span>Earned <strong>{rupees(earned)}</strong></span></div>}
      {hasCommission && !signed && <Alert tone="info">Commission can be earned once the agreement is signed by both sides.</Alert>}
      {withdraw.error && <Alert tone="danger">{withdraw.error}</Alert>}
      {open && (
        <form noValidate className="cz-inset" style={{ marginBottom: 16 }} onSubmit={(ev) => { ev.preventDefault(); add.run(); }}>
          {add.error && <Alert tone="danger">{add.error}</Alert>}
          <div className="cz-grid cz-grid-2">
            <TextInput label="Buyer (company name)" value={f.buyerName} onChange={(ev) => setF({ ...f, buyerName: ev.target.value })} error={e.buyerName} />
            <TextInput label="City" value={f.buyerCity} onChange={(ev) => setF({ ...f, buyerCity: ev.target.value })} error={e.buyerCity} />
            <TextInput label="Contact person (optional)" value={f.contactName} onChange={(ev) => setF({ ...f, contactName: ev.target.value })} />
            <TextInput label="Phone (optional)" inputMode="tel" value={f.contactPhone} onChange={(ev) => setF({ ...f, contactPhone: ev.target.value })} error={e.contactPhone} />
            <TextInput label="Email (optional)" type="email" value={f.contactEmail} onChange={(ev) => setF({ ...f, contactEmail: ev.target.value })} error={e.contactEmail} />
            <TextInput label="Expected order value ₹ (optional)" inputMode="decimal" value={f.value} onChange={(ev) => setF({ ...f, value: ev.target.value })} />
          </div>
          <TextArea label="What the buyer needs" value={f.description} onChange={(ev) => setF({ ...f, description: ev.target.value })} error={e.description} />
          <Select label="How the buyer agreed to be introduced" value={f.consentMethod} onChange={(ev) => setF({ ...f, consentMethod: ev.target.value })} options={CONSENT_METHODS.map(([v, l]) => ({ value: v, label: l }))} />
          <Checkbox label="The buyer agreed to be introduced to Unite Group for this" checked={f.consent} onChange={(ev) => setF({ ...f, consent: ev.target.checked })} />
          {e.consent && <p className="cz-error-text" style={{ marginTop: -8 }}>{e.consent}</p>}
          <div className="cz-row"><Button type="submit" variant="accent" loading={add.pending} disabled={!f.consent}>Register buyer</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      )}
      {!sales.length ? <EmptyState icon="leads" title="No buyers registered yet">Each buyer is protected for you under this offer — nobody else can register the same buyer.</EmptyState> : (
        <ul className="cz-sale-list" aria-label="Your sales">
          {sales.map((s) => {
            const [label, tone] = SALE_STATUS[s.status] ?? [s.status, 'neutral'];
            return (
              <li key={s.id} data-sale={s.buyerName}>
                <div className="cz-sale-main"><strong>{s.buyerName}</strong><span className="cz-muted">{s.buyerCity} · <span className="cz-mono">{s.code}</span></span>{s.lostReason && <span className="cz-muted">Lost: {s.lostReason}</span>}</div>
                <div className="cz-sale-figs">
                  <span>{s.saleValue != null ? rupees(s.saleValue) : s.estimatedValue != null ? `~${rupees(s.estimatedValue)}` : '—'}</span>
                  {s.commission && <span className="cz-muted">Commission {rupees(s.commission.payable)} · {COMMISSION_STATUS[s.commission.status] ?? s.commission.status}</span>}
                </div>
                <div className="cz-sale-act"><StatusBadge status={s.status} tone={tone} label={label} />{['registered', 'in_discussion'].includes(s.status) && <Button size="sm" variant="ghost" onClick={() => withdraw.run(s.id)}>Withdraw</Button>}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
