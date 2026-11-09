'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { SOLAR_MODEL_LABELS, SOLAR_QUOTE_STATUS_LABELS, SOLAR_SYSTEM_LABELS, regionLabel, type SolarQuoteCalc } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, LoadingState, PageHeader, StatusBadge, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav, inr } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Quote {
  id: string; code: string; partner: string | null; customer: { name: string; phone: string; email?: string; city: string; pincode?: string }; consentMethod: string; site: { segment: string; region: string; monthlyUnits: number; tariff: number; sanctionedLoadKw?: number };
  model: string; system: string; capacityKw: number; calc: SolarQuoteCalc; total: number; net: number; commission: number; status: string; statusNote: string | null; validUntil: string; next: string[]; notes: string | null;
  bill: { fileName: string; extract: { discom: string | null; consumerNo: string | null }; fileDeleted: boolean } | null; referral: { by: string; status: string; reward: number | null } | null; commissionEntry: { status: string; payable: number } | null; customerReferralCode: string | null;
}
const LABEL: Record<string, string> = { sent: 'Mark sent', accepted: 'Customer accepted', won: 'Order won', installed: 'Installed', paid: 'Customer paid', declined: 'Declined', expired: 'Expired' };

/** One solar quote for Unite admins: confirm the order, installation and payment (which drive commission and referral rewards). */
export default function SolarQuoteAdmin() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Quote>(`/solar/quotes/${id}`);
  const [note, setNote] = useState('');
  const act = useMutation(async (status: string) => { const r = await api.post(`/solar/quotes/${id}/status`, { status, note: note || undefined }); setNote(''); q.reload(); return r; });
  const d = q.data;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!d) return <LoadingState />;
  const c = d.calc;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <PageHeader title={`${d.customer.name} — ${d.capacityKw} kW`} breadcrumb="Unite Solar desk" description={`${SOLAR_MODEL_LABELS[d.model]}${d.model !== 'ppa' ? ` · ${SOLAR_SYSTEM_LABELS[d.system]}` : ''} · ${d.code} · ${d.partner ?? 'Unite Solar'}`} actions={<StatusBadge status={d.status} label={SOLAR_QUOTE_STATUS_LABELS[d.status]} />} />
      <div className="cz-ws-cols">
        <div className="cz-ws">
          <Card title="Figures">
            <div className="cz-figures">
              <div className="cz-figure"><span>{d.model === 'ppa' ? 'PPA tariff' : 'Price incl. GST'}</span><strong>{d.model === 'ppa' ? `₹${(c.ppa!.tariff / 100).toFixed(2)}/unit` : inr(d.total)}</strong>{c.subsidy > 0 && <small>{inr(d.net)} after subsidy</small>}</div>
              <div className="cz-figure"><span>Savings, year 1</span><strong>{inr(c.savings.yearOneSavings)}</strong><small>payback {c.savings.paybackYears ?? '—'} years</small></div>
              <div className="cz-figure"><span>Partner commission</span><strong>{inr(d.commission)}</strong><small>{d.commissionEntry ? `${d.commissionEntry.status} · ${inr(d.commissionEntry.payable)} payable` : 'opens when the order is won'}</small></div>
            </div>
          </Card>
          <Card title="Lines">
            <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Lines</caption>
              <thead><tr><th scope="col">Item</th><th scope="col" style={{ textAlign: 'right' }}>Qty</th><th scope="col" style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>{c.lines.map((l, i) => <tr key={i}><td data-label="Item"><strong>{l.item}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{l.spec}</span></td><td data-label="Qty" style={{ textAlign: 'right' }}>{l.quantity} {l.unit}</td><td data-label="Amount" style={{ textAlign: 'right' }}>{inr(l.amount)}</td></tr>)}</tbody>
            </table></div>
          </Card>
          <Card title="Customer and site">
            <DescriptionList items={[['Customer', `${d.customer.name}, ${d.customer.city}`], ['Mobile', d.customer.phone], ['How they asked', d.consentMethod.replace(/_/g, ' ')], ['State', regionLabel(d.site.region)], ['Usage', `${d.site.monthlyUnits.toLocaleString('en-IN')} units a month at ₹${(d.site.tariff / 100).toFixed(2)}`],
              ...(d.bill ? [['Bill', `${d.bill.fileName}${d.bill.extract.discom ? ` · ${d.bill.extract.discom}` : ''}${d.bill.extract.consumerNo ? ` · consumer ${d.bill.extract.consumerNo}` : ''}${d.bill.fileDeleted ? ' (file deleted)' : ''}`] as [string, string]] : []),
              ...(d.referral ? [['Referral', `${d.referral.by}${d.referral.reward ? ` · reward ${inr(d.referral.reward)} (${d.referral.status})` : ''}`] as [string, string]] : []),
              ...(d.customerReferralCode ? [['Customer’s referral code', d.customerReferralCode] as [string, string]] : [])]} />
          </Card>
        </div>
        <aside className="cz-ws-side">
          <Card title="Next step">
            {act.error && <Alert tone="danger">{act.error}</Alert>}
            {d.statusNote && <p style={{ marginTop: 0, fontSize: 14 }}>Last note: {d.statusNote}</p>}
            {d.next.length ? (
              <div className="cz-stack" style={{ gap: 10 }}>
                <TextInput label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="cz-row" style={{ gap: 8 }}>{d.next.map((s) => <Button key={s} size="sm" variant={['declined', 'expired'].includes(s) ? 'secondary' : 'primary'} loading={act.pending} onClick={() => act.run(s)}>{LABEL[s] ?? s}</Button>)}</div>
                <p className="cz-muted" style={{ margin: 0, fontSize: 12.5 }}>Order won opens the partner’s commission; customer paid makes it earned; installed makes any referral reward due and gives the customer a referral code.</p>
              </div>
            ) : <p className="cz-muted" style={{ margin: 0 }}>No further steps.</p>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
