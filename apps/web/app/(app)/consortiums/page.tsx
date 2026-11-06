'use client';
import Link from 'next/link';
import { Alert, ButtonLink, Card, DataTable, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 124 — Consortium Formation. Consortiums are agreements among named parties, not automatic legal entities (§6.5). */
export default function Consortiums() {
  const q = useQuery<any[]>('/teams');
  return (
    <Screen id="124" actions={<ButtonLink href="/teams/new?kind=consortium">Form a consortium</ButtonLink>}>
      <Alert tone="info">A consortium on COLLABIZ records named parties, roles, work shares and signed terms. It does not create a legal entity; liabilities and decision authority are set in the consortium agreement.</Alert>
      <Card>{q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <DataTable caption="Consortiums" rows={(q.data ?? []).filter((t) => t.kind === 'consortium')} empty={<EmptyState title="No consortiums yet" />} columns={[
          { key: 'name', header: 'Consortium', render: (t) => <Link href={`/teams/${t.id}/members`}>{t.name}</Link> },
          { key: 'lead', header: 'Lead party', render: (t) => (t.isLead ? 'Your organization' : t.lead) },
          { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
        ]} />
      )}</Card>
    </Screen>
  );
}
