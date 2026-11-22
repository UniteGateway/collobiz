'use client';
import Link from 'next/link';
import { DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface A { id: string; code: string; status: string; submittedAt: string | null; updatedAt: string; leadId: string; lead: string; name: string; country: string }

/** Preliminary consultancy applications. */
export default function Eb5Applications() {
  const q = useQuery<A[]>('/eb5/applications');
  return (
    <Screen page={{ key: 'eb5-applications', title: 'Client applications', access: 'authenticated' }} eyebrow="GO EB5" description="Opening an application is recorded in the audit log. Legal eligibility questions go to the assigned U.S. immigration attorney.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="Applications" empty={<p className="cz-muted">No applications yet. Invite a client to the portal from their lead.</p>} columns={[
          { key: 'c', header: 'Application', render: (a) => <span><Link href={`/eb5/applications/${a.id}`}>{a.name}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{a.code} · lead {a.lead}</span></span> },
          { key: 'k', header: 'Country', render: (a) => a.country }, { key: 's', header: 'Status', render: (a) => <Badge s={a.status} /> },
          { key: 'd', header: 'Submitted', render: (a) => day(a.submittedAt) }, { key: 'u', header: 'Updated', render: (a) => day(a.updatedAt) },
        ]} />
      )}
    </Screen>
  );
}
