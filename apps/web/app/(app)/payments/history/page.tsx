'use client';
import { Card, DataTable, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EarningsTabs, inr, when } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

/** Screen 100 — Payment & Settlement History. */
export default function Payments() {
  const q = useQuery<any[]>('/payouts');
  return (
    <Screen id="100">
      <EarningsTabs />
      <Card>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Payouts" rows={q.data ?? []} empty={<EmptyState title="No payouts yet" />} columns={[
            { key: 'code', header: 'Payout', render: (p: any) => <><span className="cz-mono">{p.code}</span><div className="cz-muted" style={{ fontSize: 12 }}>invoice {p.partnerInvoiceNo} · {when(p.createdAt)}</div></> },
            { key: 'payable', header: 'Net amount', render: (p: any) => inr(p.payable) }, { key: 'tds', header: 'TDS', render: (p: any) => inr(p.tds) },
            { key: 'status', header: 'Status', render: (p: any) => <>{<StatusBadge status={p.status} />}{p.rejectionReason && <div className="cz-muted" style={{ fontSize: 12 }}>{p.rejectionReason}</div>}</> },
            { key: 'settlement', header: 'Bank reference', render: (p: any) => (p.settlement ? <><span className="cz-mono">{p.settlement.bankReference}</span><div className="cz-muted" style={{ fontSize: 12 }}>{p.settlement.method.toUpperCase()} · {when(p.settlement.paidAt)}</div></> : '—') },
          ]} />
        )}
      </Card>
    </Screen>
  );
}
