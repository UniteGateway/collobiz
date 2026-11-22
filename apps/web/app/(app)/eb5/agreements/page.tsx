'use client';
import Link from 'next/link';
import { DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, usd } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface A { id: string; code: string; version: number; state: string; terms: { total: number; commencement: number }; createdAt: string; lead: string; name: string; leadId: string }

/** CITRUS360 LLC consultancy agreements. */
export default function Eb5Agreements() {
  const q = useQuery<A[]>('/eb5/agreements');
  return (
    <Screen page={{ key: 'eb5-agreements', title: 'Consultancy agreements', access: 'authenticated' }} eyebrow="GO EB5 · CITRUS360 LLC" description="Draft → internal review → legal approval → sent → signed → counter-signed → active (after the verified commencement payment). Legal approval needs counsel's sign-off on the template and fees.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="Agreements" empty={<p className="cz-muted">No agreements yet. Draft one from a lead.</p>} columns={[
          { key: 'c', header: 'Agreement', render: (a) => <span><Link href={`/eb5/agreements/${a.id}`}>{a.code}</Link> <span className="cz-muted">v{a.version}</span><br /><span className="cz-muted" style={{ fontSize: 12 }}>{a.name} · {a.lead}</span></span> },
          { key: 'f', header: 'Consultancy fee', render: (a) => usd(a.terms.total) }, { key: 'm', header: 'Commencement', render: (a) => usd(a.terms.commencement) },
          { key: 's', header: 'State', render: (a) => <Badge s={a.state} /> }, { key: 'd', header: 'Created', render: (a) => day(a.createdAt) },
        ]} />
      )}
    </Screen>
  );
}
