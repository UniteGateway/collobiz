'use client';
import Link from 'next/link';
import { sectorName } from '@collabiz/types';
import { ButtonLink, Card, DataTable, EmptyState, LoadingState, Money, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 026 — My Leads & Pipeline. */
export default function MyLeads() {
  const q = useQuery<any[]>('/leads');
  return (
    <Screen id="026" actions={<ButtonLink href="/leads/new" variant="accent">Register a lead</ButtonLink>}>
      <Card>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="My leads" rows={q.data ?? []} empty={<EmptyState title="No leads yet" action={<ButtonLink href="/leads/new">Register your first lead</ButtonLink>}>Registered leads are time-stamped, evidence-sealed and protected once verified.</EmptyState>} columns={[
            { key: 'code', header: 'Lead', render: (l) => <><Link href={`/leads/${l.id}/confirmation`}><strong>{l.title}</strong></Link><div className="cz-mono cz-muted">{l.code}</div></> },
            { key: 'customer', header: 'Customer', render: (l) => <>{l.customer}<div className="cz-muted" style={{ fontSize: 12 }}>{sectorName(l.sector)}</div></> },
            { key: 'value', header: 'Value', render: (l) => <Money minor={l.estimatedValue} /> },
            { key: 'protection', header: 'Protection', render: (l) => <><StatusBadge status={l.claimStatus} />{l.protectedUntil && <div className="cz-muted" style={{ fontSize: 12 }}>until {new Date(l.protectedUntil).toLocaleDateString()}</div>}</> },
            { key: 'stage', header: 'Stage', render: (l) => <><StatusBadge status={l.opportunityStatus} />{l.routing && !l.routing.decision && <div className="cz-muted" style={{ fontSize: 12 }}>{l.routing.breached ? 'Review overdue' : `${Math.floor(l.routing.remainingMinutes / 60)}h left in review`}</div>}</> },
          ]} />
        )}
      </Card>
    </Screen>
  );
}
