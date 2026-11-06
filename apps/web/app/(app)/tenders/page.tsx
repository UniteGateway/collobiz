'use client';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { Alert, ButtonLink, Card, DataTable, EmptyState, Kpi, Grid, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmt, SEALED_NOTE } from '@/components/Tenders';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Screen 065 — Tender & RFQ Dashboard. */
export default function TenderDashboard() {
  const q = useQuery<any>('/tenders');
  const { can } = useSession();
  const d = q.data;
  return (
    <Screen id="065" actions={can('tender.issue') ? <ButtonLink href="/tenders/new">Publish tender</ButtonLink> : undefined}>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={4}>
            <Kpi label="Open for bidding" value={d.open.length} />
            <Kpi label="My bids" value={d.myBids.filter((b: any) => b.status !== 'withdrawn').length} />
            <Kpi label="Issued by my organization" value={d.issued.length} />
            <Kpi label="Assigned to me to evaluate" value={d.evaluating.length} accent />
          </Grid>
          <Alert tone="info">{SEALED_NOTE}</Alert>
          <Card title="Open tenders & RFQs">
            <DataTable caption="Open tenders" rows={d.open} empty={<EmptyState title="No open tenders match your organization right now" />} columns={[
              { key: 'title', header: 'Tender', render: (t: any) => <><Link href={`/tenders/${t.id}/documents`}>{t.title}</Link><div className="cz-mono cz-muted">{t.code}</div></> },
              { key: 'issuer', header: 'Issuer' },
              { key: 'sector', header: 'Sector', render: (t: any) => sectorName(t.sector) },
              { key: 'closesAt', header: 'Closes', render: (t: any) => fmt(t.closesAt) },
              { key: 'myBid', header: 'My bid', render: (t: any) => (t.myBid ? <StatusBadge status={t.myBid} /> : <Link href={`/tenders/${t.id}/bid`}>Prepare bid</Link>) },
            ]} />
          </Card>
          <Card title="My bids">
            <DataTable caption="My bids" rows={d.myBids} empty={<EmptyState title="You have not bid on any tender yet" />} columns={[
              { key: 'tender', header: 'Tender', render: (b: any) => <><Link href={`/tenders/${b.tender.id}/bid`}>{b.tender.title}</Link><div className="cz-mono cz-muted">{b.tender.code}</div></> },
              { key: 'status', header: 'Bid status', render: (b: any) => <StatusBadge status={b.status} /> },
              { key: 'tstatus', header: 'Tender status', render: (b: any) => <StatusBadge status={b.tender.status} /> },
              { key: 'submittedAt', header: 'Submitted', render: (b: any) => fmt(b.submittedAt) },
            ]} />
          </Card>
          {(d.issued.length > 0 || can('tender.issue')) && (
            <Card title="Issued by my organization">
              <DataTable caption="Issued tenders" rows={d.issued} empty={<EmptyState title="No tenders issued yet" />} columns={[
                { key: 'title', header: 'Tender', render: (t: any) => <><Link href={`/tenders/${t.id}/documents`}>{t.title}</Link><div className="cz-mono cz-muted">{t.code}</div></> },
                { key: 'status', header: 'Status', render: (t: any) => <StatusBadge status={t.status} /> },
                { key: 'closesAt', header: 'Closes', render: (t: any) => fmt(t.closesAt) },
                { key: 'bidCount', header: 'Sealed bids' },
              ]} />
            </Card>
          )}
          {d.evaluating.length > 0 && (
            <Card title="Assigned to me for evaluation">
              <DataTable caption="Evaluation assignments" rows={d.evaluating} columns={[
                { key: 'title', header: 'Tender', render: (t: any) => <><Link href={`/tenders/${t.id}/${t.evaluatorRole === 'commercial' ? 'commercial' : 'technical'}`}>{t.title}</Link><div className="cz-mono cz-muted">{t.code}</div></> },
                { key: 'evaluatorRole', header: 'My role', render: (t: any) => <StatusBadge status={t.evaluatorRole} tone="brand" /> },
                { key: 'status', header: 'Status', render: (t: any) => <StatusBadge status={t.status} /> },
              ]} />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
