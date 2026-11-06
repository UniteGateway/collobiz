'use client';
import Link from 'next/link';
import { Alert, ButtonLink, Card, DataTable, EmptyState, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CommissionBadge, EARNED_NOTE, EarningsTabs, inr } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

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
