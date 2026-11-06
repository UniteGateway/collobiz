'use client';
import { useParams } from 'next/navigation';
import { Card, DataTable, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CommissionBadge, EarningsTabs, inr, when } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

/** Screen 157 — Commission Agreement & Milestones (each line beside the project milestone and customer invoice behind it). */
export default function AgreementMilestones() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/commissions/agreements/${id}`);
  if (q.loading) return <Screen id="157"><LoadingState /></Screen>;
  if (q.error) return <Screen id="157"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const a = q.data;
  return (
    <Screen id="157" title={`${a.code} — ${a.project.title}`}>
      <EarningsTabs />
      <Card title="Schedule">
        <DataTable caption="Commission schedule" rows={a.lines} columns={[
          { key: 'milestone', header: 'Project milestone', render: (l: any) => <>{l.milestone.seq}. {l.milestone.title}<div className="cz-muted" style={{ fontSize: 12 }}>due {l.milestone.dueDate} · <StatusBadge status={l.milestone.status} /></div></> },
          { key: 'base', header: 'Milestone value', render: (l: any) => inr(l.milestone.certifiedAmount ?? l.milestone.amount) },
          { key: 'invoice', header: 'Customer invoice', render: (l: any) => (l.invoice ? <>{l.invoice.number}<div className="cz-muted" style={{ fontSize: 12 }}>{l.invoice.status === 'paid' ? `paid ${when(l.invoice.paidAt)}` : 'awaiting payment'}</div></> : '—') },
          { key: 'gross', header: 'Commission', render: (l: any) => inr(l.taxable) },
          { key: 'payable', header: 'Net payable', render: (l: any) => inr(l.payable) },
          { key: 'status', header: 'Status', render: (l: any) => <CommissionBadge status={l.status} /> },
        ]} />
      </Card>
    </Screen>
  );
}
