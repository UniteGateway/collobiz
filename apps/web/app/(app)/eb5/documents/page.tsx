'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface D { id: string; category: string; title: string; status: string; version: number; expiresOn: string | null; updatedAt: string; leadId: string; lead: string; name: string; deletionRequestedAt: string | null }

function Docs() {
  const leadId = useSearchParams().get('leadId') ?? undefined;
  const q = useQuery<D[]>('/eb5/documents', { leadId });
  return (
    <Screen page={{ key: 'eb5-documents', title: 'Secure documents', access: 'authenticated' }} eyebrow="GO EB5" description="Encrypted at rest, never public, every view and download logged. Referral partners have no access. Request documents from a client's lead.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="Client documents" empty={<p className="cz-muted">No document requests yet.</p>} columns={[
          { key: 't', header: 'Document', render: (d) => <span><Link href={`/eb5/documents/${d.id}`}>{d.title}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{d.category}</span></span> },
          { key: 'c', header: 'Client', render: (d) => <Link href={`/eb5/leads/${d.leadId}`}>{d.name}</Link> },
          { key: 's', header: 'Status', render: (d) => <Badge s={d.deletionRequestedAt ? 'review' : d.status} label={d.deletionRequestedAt ? 'Deletion requested' : d.status} /> },
          { key: 'v', header: 'Version', render: (d) => d.version || '—' }, { key: 'e', header: 'Expires', render: (d) => day(d.expiresOn) }, { key: 'u', header: 'Updated', render: (d) => day(d.updatedAt) },
        ]} />
      )}
    </Screen>
  );
}
/** Secure document register. */
export default function Page() { return <Suspense><Docs /></Suspense>; }
