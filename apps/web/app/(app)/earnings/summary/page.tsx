'use client';
import { COMMISSION_STATES, COMMISSION_STATE_LABELS } from '@collabiz/types';
import { Alert, Card, DataTable, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EARNED_NOTE, EarningsTabs, inr } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

const MEANING: Record<string, string> = {
  estimated: 'Projected from the project schedule', eligible: 'Milestone certified; waiting for the customer to pay', earned: 'Customer has paid; waiting for finance approval',
  approved: 'Approved; you can request payout', invoiced: 'Payout requested on your invoice', settled: 'Paid to your bank account', on_hold: 'Paused by finance (see reason)', disputed: 'Under dispute', reversed: 'Will not be paid (see reason)',
};

/** Screen 027 — Earnings & Settlement Summary (every state of the ledger, explained). */
export default function EarningsSummary() {
  const q = useQuery<any>('/earnings');
  const d = q.data;
  return (
    <Screen id="027">
      <EarningsTabs />
      <Alert tone="info">{EARNED_NOTE}</Alert>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={3}>
            <Kpi label="Ready to request" value={inr(d.readyToRequest)} accent />
            <Kpi label="Paid this financial year" value={inr(d.totals.paidThisFy)} />
            <Kpi label="TDS deducted this year" value={inr(d.totals.tdsThisFy)} />
          </Grid>
          <Card title="Settlement summary">
            <DataTable caption="Earnings by status" rows={COMMISSION_STATES.map((s) => ({ id: s, label: COMMISSION_STATE_LABELS[s], amount: d.buckets[s] ?? 0, count: d.lines.filter((l: any) => l.status === s).length, meaning: MEANING[s] }))} columns={[
              { key: 'label', header: 'Status' }, { key: 'meaning', header: 'What it means' }, { key: 'count', header: 'Lines' }, { key: 'amount', header: 'Net amount', render: (r: any) => inr(r.amount) },
            ]} />
          </Card>
        </>
      )}
    </Screen>
  );
}
