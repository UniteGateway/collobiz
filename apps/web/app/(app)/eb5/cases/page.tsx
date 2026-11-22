'use client';
import Link from 'next/link';
import { DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface C { id: string; code: string; name: string; country: string; caseStage: number; caseStageLabel: string; stageLabel: string; attorney: string | null }

/** EB-5 case tracking — coordination, not legal representation. */
export default function Eb5Cases() {
  const q = useQuery<C[]>('/eb5/cases');
  return (
    <Screen page={{ key: 'eb5-cases', title: 'EB-5 case tracking', access: 'authenticated' }} eyebrow="GO EB5" description="Each update records where it came from: client-reported, internal, attorney-verified or supported by an official document. Clients see only attorney-verified or document-supported updates.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="EB-5 cases" empty={<p className="cz-muted">Cases appear once a consultancy is active.</p>} columns={[
          { key: 'c', header: 'Client', render: (c) => <span><Link href={`/eb5/cases/${c.id}`}>{c.name}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{c.code} · {c.country}</span></span> },
          { key: 's', header: 'Case stage', render: (c) => c.caseStageLabel }, { key: 'p', header: 'Consultancy', render: (c) => <Badge s={c.stageLabel} /> }, { key: 'a', header: 'Attorney', render: (c) => c.attorney ?? 'Not assigned' },
        ]} />
      )}
    </Screen>
  );
}
