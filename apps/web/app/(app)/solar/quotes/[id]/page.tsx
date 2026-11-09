'use client';
import { useParams } from 'next/navigation';
import { SOLAR_QUOTE_STATUS_LABELS, regionLabel, type SolarQuoteCalc } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { SOLAR_TONE, SolarNav, kwLabel, lakh, modelSystem, perUnit, rupees } from '@/components/Solar';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Quote {
  id: string; code: string; partner: string | null; customer: { name: string; phone: string; email?: string; city: string; pincode?: string }; site: { segment: string; region: string; monthlyUnits: number; tariff: number; sanctionedLoadKw?: number };
  model: string; system: string; capacityKw: number; calc: SolarQuoteCalc; total: number; net: number; commission: number; status: string; statusNote: string | null; validUntil: string; createdAt: string; next: string[];
  bill: { fileName: string; fileDeleted: boolean } | null; referral: { by: string; status: string; reward: number | null } | null; commissionEntry: { status: string; payable: number } | null; customerReferralCode: string | null;
}
const PARTNER_STEPS: Record<string, string> = { sent: 'Mark as sent to customer', accepted: 'Customer accepted', declined: 'Customer declined', expired: 'Mark expired' };

/** One solar quote — the customer-facing proposal (printable) plus status and commission for the partner. */
export default function SolarQuotePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Quote>(`/solar/quotes/${id}`);
  const act = useMutation(async (status: string) => { const r = await api.post(`/solar/quotes/${id}/status`, { status }); q.reload(); return r; });
  const d = q.data; const c = d?.calc;
  return (
    <Screen page={{ key: 'solar-quote', title: d ? `Solar proposal for ${d.customer.name}` : 'Solar quote', access: 'verified-partner' }}
      description={d ? `${d.code} · ${modelSystem(d.model, d.system)} · valid until ${new Date(d.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : undefined}
      actions={d ? <span className="cz-row cz-no-print" style={{ gap: 8 }}><StatusBadge status={d.status} tone={SOLAR_TONE[d.status]} label={SOLAR_QUOTE_STATUS_LABELS[d.status]} /><Button variant="secondary" onClick={() => window.print()}>Print or save PDF</Button></span> : undefined}>
      <SolarNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d || !c ? <Skeleton height={320} /> : (
        <div className="cz-ws-cols">
          <div className="cz-stack" style={{ gap: 16 }}>
            <p className="cz-print-only" style={{ margin: 0 }}><strong>Unite Solar</strong> · proposal prepared {d.partner ? `by ${d.partner}, authorised COLLABIZ partner` : 'by Unite Solar'} for {d.customer.name}, {d.customer.city}.</p>
            <Card title="What you get">
              <div className="cz-figures">
                <div className="cz-figure"><span>Solar system</span><strong>{kwLabel(d.capacityKw)}</strong><small>{c.savings.annualGeneration.toLocaleString('en-IN')} units a year</small></div>
                {d.model === 'ppa'
                  ? <><div className="cz-figure"><span>Upfront cost</span><strong>₹0</strong><small>Unite Solar builds, owns and maintains</small></div><div className="cz-figure"><span>Solar tariff</span><strong>{perUnit(c.ppa!.tariff)}</strong><small>per unit, {c.ppa!.termYears} years{c.ppa!.escalationBps ? `, +${c.ppa!.escalationBps / 100}% a year` : ', fixed'}</small></div></>
                  : <><div className="cz-figure"><span>Price incl. GST</span><strong>{d.total >= 1_00_000_00 ? lakh(d.total) : rupees(d.total)}</strong><small>GST {rupees(c.gst)}</small></div>{c.subsidy > 0 && <div className="cz-figure"><span>After subsidy</span><strong className="cz-good">{rupees(d.net)}</strong><small>PM Surya Ghar {rupees(c.subsidy)}</small></div>}</>}
                <div className="cz-figure"><span>Savings in year 1</span><strong className="cz-good">{c.savings.yearOneSavings >= 1_00_000_00 ? lakh(c.savings.yearOneSavings) : rupees(c.savings.yearOneSavings)}</strong><small>about {rupees(Math.round(c.savings.yearOneSavings / 12))} a month</small></div>
                {d.model !== 'ppa' && <div className="cz-figure"><span>Pays for itself in</span><strong>{c.savings.paybackYears ? `${c.savings.paybackYears} years` : '—'}</strong><small>simple payback</small></div>}
                <div className="cz-figure"><span>Savings over {c.savings.years} years</span><strong className="cz-good">{lakh(c.savings.lifetimeSavings)}</strong><small>{c.savings.co2TonnesPerYear} tonnes CO₂ avoided a year</small></div>
              </div>
            </Card>
            <Card title={d.model === 'epc' ? 'Bill of quantities' : 'Included'}>
              <div className="cz-table-wrap"><table className="cz-table"><caption className="cz-sr-only">Items</caption>
                <thead><tr><th scope="col">Item</th><th scope="col">Specification</th><th scope="col" style={{ textAlign: 'right' }}>Qty</th>{d.model !== 'ppa' && <th scope="col" style={{ textAlign: 'right' }}>Amount</th>}</tr></thead>
                <tbody>
                  {c.lines.map((l, i) => <tr key={i}><td><strong>{l.item}</strong></td><td>{l.spec}</td><td style={{ textAlign: 'right' }}>{l.quantity.toLocaleString('en-IN')} {l.unit}</td>{d.model !== 'ppa' && <td style={{ textAlign: 'right' }}>{rupees(l.amount)}</td>}</tr>)}
                  {d.model !== 'ppa' && <><tr><td colSpan={3} style={{ textAlign: 'right' }}>GST</td><td style={{ textAlign: 'right' }}>{rupees(c.gst)}</td></tr><tr><td colSpan={3} style={{ textAlign: 'right' }}><strong>Total</strong></td><td style={{ textAlign: 'right' }}><strong>{rupees(d.total)}</strong></td></tr></>}
                </tbody>
              </table></div>
            </Card>
            <Card title="Based on">
              <DescriptionList items={[['Customer', `${d.customer.name}, ${d.customer.city}${d.customer.pincode ? ` ${d.customer.pincode}` : ''}`], ['State', regionLabel(d.site.region)], ['Units used', `${d.site.monthlyUnits.toLocaleString('en-IN')} a month`], ['Grid tariff', `${perUnit(d.site.tariff)} per unit`],
                ...(d.site.sanctionedLoadKw ? [['Sanctioned load', `${d.site.sanctionedLoadKw} kW`] as [string, string]] : []), ...(d.bill ? [['From bill', d.bill.fileDeleted ? `${d.bill.fileName} (file deleted after 90 days)` : d.bill.fileName] as [string, string]] : [])]} />
              <p className="cz-muted" style={{ margin: '12px 0 0', fontSize: 12.5 }}>Estimates use typical sunshine for the state, a 3% yearly rise in grid tariff and 0.5% yearly panel ageing; actual savings depend on the site, shading and usage. Subsidy under PM Surya Ghar is paid by the government to eligible homes after DISCOM inspection. Prices are valid until the date above.</p>
            </Card>
          </div>
          <aside className="cz-ws-side cz-no-print">
            <Card title="Status">
              {act.error && <Alert tone="danger">{act.error}</Alert>}
              {d.statusNote && <p style={{ marginTop: 0, fontSize: 14 }}>{d.statusNote}</p>}
              <div className="cz-row" style={{ gap: 8 }}>{d.next.filter((s) => PARTNER_STEPS[s]).map((s) => <Button key={s} size="sm" variant={s === 'declined' || s === 'expired' ? 'secondary' : 'primary'} loading={act.pending} onClick={() => act.run(s)}>{PARTNER_STEPS[s]}</Button>)}</div>
              {['accepted'].includes(d.status) && <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>Unite Solar confirms the order once the advance is received.</p>}
            </Card>
            <Card title="Your commission">
              <p style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{rupees(d.commission)}</p>
              <p className="cz-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{d.commissionEntry ? `In Earnings: ${d.commissionEntry.status} · ${rupees(d.commissionEntry.payable)} payable after TDS` : 'Opens in Earnings when Unite Solar confirms the order; earned when the customer pays.'}</p>
            </Card>
            {d.referral && <Card title="Referral"><p style={{ margin: 0, fontSize: 14 }}>Referred by {d.referral.by}. {d.referral.reward ? `Reward ${rupees(d.referral.reward)} (${d.referral.status}).` : 'Reward due after installation.'}</p></Card>}
            {d.customerReferralCode && <Card title="Customer’s referral link"><p style={{ marginTop: 0, fontSize: 14 }}>Share with {d.customer.name}: friends who install solar earn them a reward.</p><span className="cz-code">{d.customerReferralCode}</span></Card>}
          </aside>
        </div>
      )}
    </Screen>
  );
}
