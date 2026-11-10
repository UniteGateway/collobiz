'use client';
import { sectorName } from '@collabiz/types';
import { Alert, Card, LoadingState, PageHeader } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Row { key: string; label: string; count: number; value: number }
interface R { funnel: { stage: string; kind: string; count: number; value: number }[]; totals: Record<'pipeline' | 'booked' | 'invoiced' | 'collected' | 'outstanding', number>; aging: { label: string; amount: number; count: number }[];
  losses: { deals: { reason: string; count: number; value: number }[]; opportunitiesLost: { count: number; value: number } }; bySector: Row[]; byRegion: Row[]; byPartner: Row[];
  commission: { liabilities: { status: string; count: number; value: number }[]; owed: number; projected: number; settled: number }; applications: { total: number; progressed: number; rate: number | null }; note: string }
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const KIND: Record<string, string> = { pipeline: 'Estimate', booked: 'Contracted', invoiced: 'Invoiced', collected: 'Received', settled: 'Paid out' };

function Bars({ rows, label }: { rows: { label: string; value: number; count: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">{label}</caption>
      <thead><tr><th scope="col">{label}</th><th scope="col" style={{ textAlign: 'right' }}>Count</th><th scope="col" style={{ textAlign: 'right' }}>Value</th><th scope="col"><span className="cz-sr-only">Share</span></th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td data-label={label}>{r.label}</td><td data-label="Count" style={{ textAlign: 'right' }}>{r.count}</td><td data-label="Value" style={{ textAlign: 'right' }}>{rupees(r.value)}</td>
        <td data-label="Share" style={{ width: '30%' }}><span aria-hidden style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--cz-green-700)', width: `${Math.max(2, (r.value / max) * 100)}%` }} /></td></tr>)}</tbody>
    </table></div>
  );
}

/** Screen 177 — Opportunity-to-revenue: lead to settlement, with pipeline, booked, invoiced and collected kept apart. */
export default function Revenue() {
  const q = useQuery<R>('/admin/analytics/revenue');
  const d = q.data;
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Opportunity to revenue" breadcrumb="Overview" description="From registered lead to settled commission. Each figure measures something different — estimates, contracts, invoices and money received are never added together." />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            <div className="cz-figure"><span>Pipeline (estimates)</span><strong>{rupees(d.totals.pipeline)}</strong></div>
            <div className="cz-figure"><span>Booked (contracts)</span><strong>{rupees(d.totals.booked)}</strong></div>
            <div className="cz-figure"><span>Invoiced</span><strong>{rupees(d.totals.invoiced)}</strong></div>
            <div className="cz-figure"><span>Collected</span><strong className="cz-good">{rupees(d.totals.collected)}</strong><small>{rupees(d.totals.outstanding)} outstanding</small></div>
          </div>
          <Alert tone="info">{d.note}</Alert>
          <Card title="Funnel">
            <ol className="cz-ws-list" style={{ listStyle: 'none', padding: 0 }}>{d.funnel.map((f) => (
              <li key={f.stage} data-stage={f.stage}><span><strong>{f.stage}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{KIND[f.kind]}</span></span><span style={{ textAlign: 'right' }}><strong>{f.count}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>{rupees(f.value)}</span></span></li>
            ))}</ol>
          </Card>
          <div className="cz-grid cz-grid-2">
            <Card title="Receivables ageing"><Bars label="Age" rows={d.aging.map((a) => ({ label: a.label, value: a.amount, count: a.count }))} /></Card>
            <Card title="Commission">
              <dl className="cz-dl"><dt>Owed (earned, not yet paid)</dt><dd>{rupees(d.commission.owed)}</dd><dt>Projected (not yet earned)</dt><dd>{rupees(d.commission.projected)}</dd><dt>Paid out</dt><dd>{rupees(d.commission.settled)}</dd>
                <dt>Applications progressed</dt><dd>{d.applications.rate == null ? '—' : `${d.applications.progressed} of ${d.applications.total} (${d.applications.rate}%)`}</dd></dl>
            </Card>
            <Card title="Open pipeline by sector"><Bars label="Sector" rows={d.bySector.map((r) => ({ ...r, label: sectorName(r.key) }))} /></Card>
            <Card title="Open pipeline by region"><Bars label="Region" rows={d.byRegion} /></Card>
            <Card title="Booked by partner"><Bars label="Partner" rows={d.byPartner} /></Card>
            <Card title="Why deals were lost"><Bars label="Reason" rows={d.losses.deals.map((l) => ({ label: l.reason, value: l.value, count: l.count }))} /><p className="cz-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>{d.losses.opportunitiesLost.count} opportunities lost ({rupees(d.losses.opportunitiesLost.value)} estimated).</p></Card>
          </div>
        </>
      )}
    </div>
  );
}
