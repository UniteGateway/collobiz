'use client';
import { Alert, DataTable, Kpi, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { DISCLAIMER, STATUS_TONE, inr, pct } from '@/components/UniteSolar';

interface Entry { id: string; reference: string; description: string; base: number; baseLabel: string; rateBps: number; amount: number; status: string; statusLabel: string; createdAt: string; compliance: string | null }
interface Earn { streams: { stream: string; label: string; totals: { earned: number; pending: number; approved: number; paid: number; reversed: number; blocked: number }; entries: Entry[] }[]; resaleMargin: number; settlements: { id: string; number: string; amount: number; entries: number; status: string; paymentReference: string | null; paidAt: string | null; createdAt: string }[]; disclaimer: string }
const HOW: Record<string, string> = {
  product: 'Up to the product’s rate (max 10%) on Unite-fulfilled sales, after the customer pays and accepts.',
  district_profit: 'Your share of the district’s eligible net profit (revenue − direct costs − approved expenses), approved by Unite each period.',
  inter_franchise: 'When another franchise executes your protected lead: your rate × the eligible pool set by Unite (not project turnover), after payment is verified.',
  solar_park: 'Up to 2% of the approved eligible project value, shared among the contributors Unite names.',
  investment: 'Up to 2% of investment actually received, after compliance clearance. Not payable where the law restricts it.',
};

/** Earnings — five streams, each with reference, base, rate, earned, pending, approved, paid and reversed; plus settlements. */
export default function Earnings() {
  const q = useQuery<Earn>('/network/earnings');
  return (
    <Screen page={{ key: 'unite-solar-earnings', title: 'Unite Solar earnings', access: 'partner' }} description={DISCLAIMER}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={420} /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          {q.data.streams.map((s) => (
            <section key={s.stream} className="cz-card" aria-label={s.label} data-stream={s.stream}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{s.label}</h2>
              <p className="cz-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>{HOW[s.stream]}</p>
              <div className="cz-us-earn">
                {(['earned', 'pending', 'approved', 'paid', 'reversed'] as const).map((k) => <div key={k}><span className="cz-muted" style={{ fontSize: 12.5, textTransform: 'capitalize' }}>{k}</span><strong>{inr(s.totals[k])}</strong></div>)}
              </div>
              {s.entries.length > 0 && <DataTable caption={`${s.label} entries`} rows={s.entries} columns={[
                { key: 'r', header: 'Reference', render: (e) => <><strong>{e.reference}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.description}</span></> },
                { key: 'b', header: 'Base', render: (e) => <>{inr(e.base)}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.baseLabel}</span></> },
                { key: 'p', header: 'Rate', render: (e) => pct(e.rateBps) }, { key: 'a', header: 'Amount', render: (e) => inr(e.amount) },
                { key: 's', header: 'Status', render: (e) => <StatusBadge status={e.status} tone={STATUS_TONE[e.status]} label={e.statusLabel} /> },
              ]} />}
            </section>
          ))}
          <div className="cz-grid cz-grid-2">
            <Kpi label="Resale margin on own stock" value={inr(q.data.resaleMargin)} hint="Earned by selling stock you bought at partner price — not a commission." />
            <Kpi label="Paid out" value={inr(q.data.settlements.filter((s) => s.status === 'paid').reduce((a, s) => a + s.amount, 0))} hint={`${q.data.settlements.length} settlement(s)`} />
          </div>
          <section className="cz-card" aria-label="Settlements"><DataTable caption="Settlements (partner wallet)" rows={q.data.settlements} columns={[
            { key: 'n', header: 'Settlement', render: (s) => s.number }, { key: 'a', header: 'Amount', render: (s) => inr(s.amount) }, { key: 'e', header: 'Entries', render: (s) => s.entries },
            { key: 's', header: 'Status', render: (s) => <StatusBadge status={s.status} tone={STATUS_TONE[s.status]} label={s.status === 'paid' ? `Paid ${s.paidAt?.slice(0, 10)} · ${s.paymentReference}` : 'Being paid'} /> },
          ]} /></section>
          <Alert tone="info">TDS and GST on commissions follow Unite finance’s statement for each settlement.</Alert>
        </div>
      )}
    </Screen>
  );
}
