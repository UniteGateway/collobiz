'use client';
import { useParams } from 'next/navigation';
import { Alert, Card, DataTable, EmptyState, LoadingState, ProgressBar, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { useQuery } from '@/lib/hooks';

/** Screen 048 — Duplicate Lead Detection (atlas: mobile-first). Other parties are never identified. */
export default function Duplicates() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}`);
  if (q.loading) return <Screen id="048"><LoadingState /></Screen>;
  if (q.error) return <Screen id="048"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const dups = q.data.duplicates as any[];
  return (
    <Screen id="048" description="Duplicates are decided on evidence, timestamps and relationship history by an independent compliance reviewer — never on who clicked first.">
      <LeadTabs id={id} />
      {!dups.length ? <Alert tone="success">No similar registrations were found.</Alert> : <Alert tone="warning">{dups.length} similar registration(s) found. Add supporting documents to strengthen your evidence.</Alert>}
      <Card>
        <DataTable caption="Possible duplicates" rows={dups} empty={<EmptyState title="No possible duplicates" />} columns={[
          { key: 'score', header: 'Similarity', render: (d) => <div style={{ minWidth: 120 }}><ProgressBar value={d.score * 100} label="Similarity" />{Math.round(d.score * 100)}%</div> },
          { key: 'reasons', header: 'Why', render: (d) => d.reasons.join('; ') },
          { key: 'ruling', header: 'Ruling', render: (d) => <><StatusBadge status={d.ruling} />{d.rulingReason && <div className="cz-muted" style={{ fontSize: 12 }}>{d.rulingReason}</div>}</> },
        ]} />
      </Card>
    </Screen>
  );
}
