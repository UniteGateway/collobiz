'use client';
import Link from 'next/link';
import { ButtonLink, Card, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, commissionLabel, rupees, type CeCard } from '@/components/Comearn';
import { useQuery } from '@/lib/hooks';

interface Item { id: string; code: string; stage: string; stageLabel: string; step: number; status: string; customer: string | null; opportunity: CeCard; potentialPaise: number | null }

/** My leads — every opportunity I work on, with the 8-step tracker position. */
export default function ComearnMy() {
  const q = useQuery<{ items: Item[] }>('/comearn/my');
  return (
    <Screen page={{ key: 'comearn-my', title: 'My leads', access: 'partner' }} header={false}>
      <CeHeader title="My leads" lead="Every customer you introduced, where it stands and what happens next." />
      <CeNav />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={240} /> : !q.data.items.length ? (
        <Card><EmptyState icon="leads" title="No leads yet" action={<ButtonLink href="/comearn/explore">Find opportunities</ButtonLink>}>Join an opportunity, accept its commission agreement and register your customer.</EmptyState></Card>
      ) : (
        <Card flush>
          <ul className="vai-list ce-mylist">{q.data.items.map((x) => (
            <li key={x.id} data-ce-my={x.opportunity.title}>
              <div><Link href={`/comearn/engagements/${x.id}`}><strong>{x.opportunity.title}</strong></Link><p>{x.opportunity.company} · {commissionLabel(x.opportunity)}{x.customer ? ` · customer ${x.customer}` : ''}</p>
                <span className="ce-progress"><i style={{ width: `${(x.step / 8) * 100}%` }} /></span><small className="ce-muted">Step {x.step} of 8 · {x.stageLabel}{x.status !== 'active' ? ` · ${x.status}` : ''}</small></div>
              <div className="ce-right">{x.potentialPaise != null && <span className="ce-muted">{rupees(x.potentialPaise)} <small>est.</small></span>}<ButtonLink size="sm" variant="ghost" href={`/comearn/engagements/${x.id}`}>Open</ButtonLink></div>
            </li>))}</ul>
        </Card>
      )}
    </Screen>
  );
}
