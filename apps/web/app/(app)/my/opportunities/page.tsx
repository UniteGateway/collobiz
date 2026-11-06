'use client';
import Link from 'next/link';
import { Button, Card, DataTable, EmptyState, LoadingState, Money, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 024 — My Opportunities Overview (applications + opportunities my organization originated). */
export default function MyOpportunitiesPage() {
  const q = useQuery<{ applications: any[]; owned: any[] }>('/me/opportunities');
  const withdraw = useMutation(async (oppId: string, appId: string) => { if (!window.confirm('Withdraw this application?')) return false; await api.post(`/opportunities/${oppId}/applications/${appId}/withdraw`); q.reload(); return true; });
  if (q.loading) return <Screen id="024"><LoadingState /></Screen>;
  if (q.error) return <Screen id="024"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  return (
    <Screen id="024">
      <Card title="My applications">
        <DataTable caption="Applications" rows={q.data!.applications} empty={<EmptyState title="No applications yet"><Link href="/marketplace">Browse the marketplace</Link></EmptyState>} columns={[
          { key: 'o', header: 'Opportunity', render: (a) => <><Link href={`/opportunities/${a.opportunity.id}`}>{a.opportunity.title}</Link><div className="cz-mono cz-muted">{a.opportunity.code}</div></> },
          { key: 'proposedValue', header: 'Proposed', render: (a) => <Money minor={a.proposedValue} /> },
          { key: 'status', header: 'Status', render: (a) => <><StatusBadge status={a.status} />{a.decisionReason && <div className="cz-muted" style={{ fontSize: 12 }}>{a.decisionReason}</div>}</> },
          { key: 'createdAt', header: 'Applied', render: (a) => new Date(a.createdAt).toLocaleDateString() },
          { key: 'x', header: '', render: (a) => ['submitted', 'shortlisted'].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => withdraw.run(a.opportunity.id, a.id)}>Withdraw</Button> },
        ]} />
      </Card>
      <Card title="Originated by my organization">
        <DataTable caption="Owned opportunities" rows={q.data!.owned} empty={<EmptyState title="None yet"><Link href="/leads/new">Register a protected lead</Link></EmptyState>} columns={[
          { key: 'title', header: 'Opportunity', render: (o) => <><Link href={`/opportunities/${o.id}`}>{o.title}</Link><div className="cz-mono cz-muted">{o.code}</div></> },
          { key: 'route', header: 'Route', render: (o) => o.route.replace('_', ' ') },
          { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} /> },
          { key: 'applicants', header: 'Applicants' },
          { key: 'estimatedValue', header: 'Value', render: (o) => <Money minor={o.estimatedValue} /> },
        ]} />
      </Card>
    </Screen>
  );
}
