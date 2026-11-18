'use client';
import Link from 'next/link';
import { ButtonLink, DataTable, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { dt } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

interface Row { id: string; code: string; title: string; deadline: string; state: string; stateLabel: string; parties: number; pledged: number; conditions: number; verified: number; myPledged: boolean }
const COMMIT_TONE: Record<string, string> = { binding: 'completed', pledging: 'in_progress', draft: 'pending', lapsed: 'expired', withdrawn: 'cancelled' };

/** Commit — conditional agreements between several businesses. */
export default function Commitments() {
  const q = useQuery<Row[]>('/commit/mine');
  return (
    <Screen page={{ key: 'commit', title: 'Commit', access: 'partner' }} eyebrow="Trade"
      description="Conditional agreements between several businesses. Nothing binds anyone until every party has pledged and every condition — buyer orders, capacity, permits, financing — is verified before the deadline."
      actions={<ButtonLink href="/commit/new" variant="accent">New commitment</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : (
        <DataTable rows={q.data} caption="My commitments" empty={<EmptyState title="No commitments yet">Create one when a deal only works if several things happen together.</EmptyState>} columns={[
          { key: 't', header: 'Commitment', render: (r) => <span><Link href={`/commit/${r.id}`}>{r.title}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{r.code}</span></span> },
          { key: 'p', header: 'Pledges', render: (r) => `${r.pledged} / ${r.parties}` },
          { key: 'c', header: 'Conditions verified', render: (r) => `${r.verified} / ${r.conditions}` },
          { key: 'd', header: 'Deadline', render: (r) => dt(r.deadline) },
          { key: 's', header: 'State', render: (r) => <StatusBadge status={COMMIT_TONE[r.state] ?? r.state} label={r.stateLabel} /> },
          { key: 'm', header: 'You', render: (r) => (r.myPledged ? 'Pledged' : <strong>Pledge needed</strong>) },
        ]} />
      )}
    </Screen>
  );
}
