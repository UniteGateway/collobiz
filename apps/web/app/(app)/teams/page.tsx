'use client';
import Link from 'next/link';
import { ButtonLink, Card, DataTable, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { PageHeader } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

/** My teams & consortiums (hub for screens 058–064, 155, 156). */
export default function MyTeams() {
  const q = useQuery<any[]>('/teams');
  return (
    <div>
      <PageHeader title="My collaboration teams" breadcrumb="Collaboration & Partner Matching" actions={<><ButtonLink href="/collaboration/requests" variant="secondary">Incoming requests</ButtonLink><ButtonLink href="/teams/new">Create team</ButtonLink></>} />
      <Card>{q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <DataTable caption="Teams" rows={q.data ?? []} empty={<EmptyState title="No teams yet" />} columns={[
          { key: 'name', header: 'Team', render: (t) => <><Link href={`/teams/${t.id}/workspace`}>{t.name}</Link><div className="cz-mono cz-muted">{t.code} · {t.kind}</div></> },
          { key: 'lead', header: 'Lead', render: (t) => (t.isLead ? 'Your organization' : t.lead) },
          { key: 'myRole', header: 'Your role' },
          { key: 'status', header: 'Team status', render: (t) => <StatusBadge status={t.status} /> },
          { key: 'myStatus', header: 'Your status', render: (t) => <StatusBadge status={t.myStatus} /> },
        ]} />
      )}</Card>
    </div>
  );
}
