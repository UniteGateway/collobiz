'use client';
import { useParams } from 'next/navigation';
import { ButtonLink, Card, LoadingState, Money } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { PartnerCard } from '@/components/Teams';
import { useQuery } from '@/lib/hooks';

/** Screen 056 — partner profile view. */
export default function PartnerProfile() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/partners/${id}`);
  if (q.loading) return <Screen id="056"><LoadingState /></Screen>;
  if (q.error) return <Screen id="056"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const p = q.data;
  return (
    <Screen id="056" title={p.name} actions={!p.isMe && <><ButtonLink href={`/dna/${id}`} variant="secondary">Business DNA</ButtonLink><ButtonLink href={`/partners/${id}/reputation`} variant="secondary">Reputation</ButtonLink><ButtonLink href={`/teams/builder?partner=${id}`}>Invite to a team</ButtonLink></>}>
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <PartnerCard p={p} />
        <div className="cz-stack">
          <Card title="About"><p style={{ whiteSpace: 'pre-wrap' }}>{p.about ?? '—'}</p><p><strong>Services:</strong> {p.services?.join(', ') || '—'}</p></Card>
          {p.pastProjects?.length > 0 && <Card title="Past projects">{p.pastProjects.map((x: any, i: number) => <div key={i}>{x.name} ({x.year}){x.value ? <> · <Money minor={x.value} /></> : null}</div>)}</Card>}
        </div>
      </div>
    </Screen>
  );
}
