'use client';
import Link from 'next/link';
import { Alert, ButtonLink, Card, DataTable, EmptyState, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CommissionBadge, EARNED_NOTE, EarningsTabs, inr } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';
import { ChartCard, DonutChart, HBarChart } from '@/components/Charts';
const short = (minor: number) => { const r = minor / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(1)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };

/** Screen 095 — Partner Earnings Overview. */
export default function Earnings() {
  const q = useQuery<any>('/earnings');
  const ag = useQuery<any[]>('/commissions/agreements');
  const d = q.data;
  return (
    <Screen id="095" actions={d?.readyToRequest > 0 ? <ButtonLink href="/payouts/request">Request payout of {inr(d.readyToRequest)}</ButtonLink> : undefined}>
      <EarningsTabs />
      <Alert tone="info">{EARNED_NOTE}</Alert>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={4}>
            <Kpi label="Projected (not yet earned)" value={inr(d.totals.projected)} />
            <Kpi label="Earned, awaiting payment" value={inr(d.totals.earnedNotPaid)} accent />
            <Kpi label="Paid this financial year" value={inr(d.totals.paidThisFy)} />
            <Kpi label="TDS deducted this year" value={inr(d.totals.tdsThisFy)} />
          </Grid>
          <div className="cz-chart-row">
            <ChartCard title="Where your commission stands" subtitle="Projected is not earned; earned is not paid">
              <DonutChart caption="Commission by state" fmt={short} centre={{ value: short(d.totals.projected + d.totals.earnedNotPaid + d.totals.paidThisFy), label: 'total' }}
                data={[{ label: 'Projected', value: d.totals.projected }, { label: 'Earned, awaiting payment', value: d.totals.earnedNotPaid }, { label: 'Paid this year', value: d.totals.paidThisFy }]} />
            </ChartCard>
            <ChartCard title="Net payable by status" subtitle="Commission lines after TDS">
              <HBarChart caption="Net payable by status" fmt={short} data={Object.entries((d.lines as any[]).reduce((a: Record<string, number>, l: any) => { a[l.status] = (a[l.status] ?? 0) + l.payable; return a; }, {})).map(([k, v]) => ({ label: k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), value: v as number }))} />
            </ChartCard>
          </div>
          <Card title="Commission lines">
            <DataTable caption="Commission lines" rows={d.lines} empty={<EmptyState title="No commission yet">Commission appears when a project you introduced has a commission agreement.</EmptyState>} columns={[
              { key: 'description', header: 'Line', render: (l: any) => <>{l.description}<div className="cz-muted" style={{ fontSize: 12 }}>{l.project} · <Link href={`/commissions/agreements/${l.agreementId}`}>{l.agreementCode}</Link></div></> },
              { key: 'status', header: 'Status', render: (l: any) => <CommissionBadge status={l.status} /> },
              { key: 'taxable', header: 'Commission', render: (l: any) => inr(l.taxable) },
              { key: 'tds', header: 'TDS', render: (l: any) => inr(l.tds) },
              { key: 'payable', header: 'Net payable', render: (l: any) => <strong>{inr(l.payable)}</strong> },
            ]} />
          </Card>
          <Card title="Commission agreements">
            <DataTable caption="Agreements" rows={ag.data ?? []} empty={<EmptyState title="No agreements" />} columns={[
              { key: 'code', header: 'Agreement', render: (a: any) => <Link href={`/commissions/agreements/${a.id}`} className="cz-mono">{a.code}</Link> },
              { key: 'project', header: 'Project' }, { key: 'payer', header: 'Payer' }, { key: 'policy', header: 'Terms', render: (a: any) => `${a.terms.policy.name} (v${a.terms.policy.version})` },
            ]} />
          </Card>
        </>
      )}
    </Screen>
  );
}
