'use client';
import { DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { when } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface A { seq: number; at: string; action: string; objectType: string; objectId: string | null; actor: string | null }

/** GO EB5 audit log — the module's entries from the platform's tamper-evident (hash-chained) audit trail. */
export default function Eb5Audit() {
  const q = useQuery<A[]>('/eb5/audit');
  return (
    <Screen page={{ key: 'eb5-audit', title: 'GO EB5 audit log', access: 'authenticated' }} eyebrow="GO EB5 · Compliance" description="Every view of a lead, application or document, every approval, signature, payment verification and role change. Personal data is never written to the log.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data.map((r) => ({ ...r, id: String(r.seq) }))} caption="GO EB5 audit entries" columns={[
          { key: 't', header: 'When', render: (r) => when(r.at) }, { key: 'w', header: 'Who', render: (r) => r.actor ?? 'System / public form' },
          { key: 'a', header: 'Action', render: (r) => r.action.replace('eb5.', '').replace(/_/g, ' ') }, { key: 'o', header: 'Record', render: (r) => <span className="cz-mono" style={{ fontSize: 12 }}>{r.objectType} {r.objectId?.slice(0, 8)}</span> },
        ]} />
      )}
    </Screen>
  );
}
