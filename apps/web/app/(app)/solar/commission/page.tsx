'use client';
import { Card, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { SolarNav, lakh, perUnit, rupees } from '@/components/Solar';
import { useQuery } from '@/lib/hooks';

interface S { commission: { kitPerKw: number; kitMin: number; epcTiers: { upTo: number | null; rateBps: number }[]; ppaPerKw: number }; referral: { residentialFlat: number; businessPerKw: number; businessCap: number }; ppa: { minKw: number; tariff: number; termYears: number }; subsidy: { cap: number; slabs: { upToKw: number; perKw: number }[] }; gstBps: number; epcRates: { upToKw: number; perWp: number }[] }

/** How partners earn on Unite Solar sales and referrals. Figures come from Unite Solar's live settings. */
export default function SolarCommission() {
  const q = useQuery<{ structure: S }>('/solar/overview');
  const s = q.data?.structure;
  return (
    <Screen page={{ key: 'solar-commission', title: 'Commission structure', access: 'verified-partner' }} description="What you earn on every Unite Solar order you bring, and for referrals. Commission becomes earned when the customer pays; TDS and GST are applied as on all COLLABIZ earnings.">
      <SolarNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !s ? <Skeleton height={300} /> : (
        <>
          <div className="cz-grid cz-grid-3">
            <Card title="Solar kits">
              <p className="cz-kpi-value" style={{ margin: 0 }}>{rupees(s.commission.kitPerKw)}<span className="cz-muted" style={{ fontSize: 15, fontWeight: 500 }}> per kW</span></p>
              <p className="cz-muted" style={{ fontSize: 14 }}>Minimum {rupees(s.commission.kitMin)} per order. Example: a 3 kW kit earns {rupees(Math.max(s.commission.kitMin, 3 * s.commission.kitPerKw))}.</p>
            </Card>
            <Card title="EPC projects">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.8 }}>{s.commission.epcTiers.map((t, i) => <li key={i}><strong>{t.rateBps / 100}%</strong> of contract value {t.upTo == null ? (i ? `above ${lakh(s.commission.epcTiers[i - 1].upTo!)}` : '') : `up to ${lakh(t.upTo)}`}</li>)}</ul>
              <p className="cz-muted" style={{ fontSize: 14 }}>Example: a {lakh(50_00_000_00)} plant earns {rupees(50_00_000_00 * (s.commission.epcTiers[0].rateBps / 10000))}.</p>
            </Card>
            <Card title="PPA (no upfront cost)">
              <p className="cz-kpi-value" style={{ margin: 0 }}>{rupees(s.commission.ppaPerKw)}<span className="cz-muted" style={{ fontSize: 15, fontWeight: 500 }}> per kWp</span></p>
              <p className="cz-muted" style={{ fontSize: 14 }}>One-time, on commissioning. Sites from {s.ppa.minKw} kW; customer pays {perUnit(s.ppa.tariff)} per unit for {s.ppa.termYears} years.</p>
            </Card>
          </div>
          <Card title="Referral rewards">
            <p style={{ marginTop: 0 }}>Anyone — partners, their staff and happy customers — can share a referral link. When the referred customer’s system is installed, the referrer earns:</p>
            <ul style={{ fontSize: 15, lineHeight: 1.8 }}>
              <li><strong>{rupees(s.referral.residentialFlat)}</strong> for a home</li>
              <li><strong>{rupees(s.referral.businessPerKw)} per kW</strong> for a business or factory, up to {rupees(s.referral.businessCap)}</li>
            </ul>
            <p className="cz-muted" style={{ marginBottom: 0, fontSize: 13 }}>Referral rewards are paid by Unite Solar after installation. A partner cannot use their own referral link on their own quote — that sale already earns commission.</p>
          </Card>
          <Card title="How prices are set">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
              <li>Kit prices include GST. EPC prices are per watt-peak before GST: {s.epcRates.map((r) => `${perUnit(r.perWp)}/Wp ${r.upToKw >= 1_000_000 ? 'above' : `up to ${r.upToKw} kW`}`).join(' · ')}.</li>
              <li>GST on a solar system is taken as {s.gstBps / 100}% (composite of goods and installation).</li>
              <li>Homes on on-grid systems get PM Surya Ghar subsidy up to {rupees(s.subsidy.cap)}, paid by the government after DISCOM inspection.</li>
            </ul>
          </Card>
        </>
      )}
    </Screen>
  );
}
