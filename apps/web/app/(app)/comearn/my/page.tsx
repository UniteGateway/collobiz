'use client';
import Link from 'next/link';
import { CE_CATEGORIES } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, EmptyState, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CeHeader, CeNav, commissionLabel, rupees, type CeCard } from '@/components/Comearn';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Item { id: string; code: string; stage: string; stageLabel: string; step: number; status: string; customer: string | null; opportunity: CeCard; potentialPaise: number | null }

/** My leads — every opportunity I work on, with the 8-step tracker position. */
export default function ComearnMy() {
  const q = useQuery<{ items: Item[] }>('/comearn/my');
  const reqs = useQuery<{ items: { id: string; code: string; title: string; category: keyof typeof CE_CATEGORIES; city: string; status: string; closesOn: string; bids: number; engagementId: string | null }[] }>('/comearn/requirements/mine');
  const inv = useQuery<{ items: { id: string; engagementId: string; status: string; roleLabel: string; sharePct: number; lead: string; title: string; potentialPaise: number | null; matchReasons: string[] }[] }>('/comearn/team-invitations');
  const respond = useMutation(async (id: string, decision: 'accept' | 'decline') => { await api.post(`/comearn/team/${id}/respond`, { decision }); inv.reload(); q.reload(); return true; });
  return (
    <Screen page={{ key: 'comearn-my', title: 'My leads', access: 'partner' }} header={false}>
      <CeHeader title="My leads" lead="Every customer you introduced, where it stands and what happens next." />
      <CeNav />
      {respond.error && <Alert tone="danger">{respond.error}</Alert>}
      {inv.data && inv.data.items.length > 0 && (
        <Card title="Team invitations" subtitle="A member invited you to work on a commission with them. Your share is fixed once you accept.">
          <ul className="vai-list">{inv.data.items.map((x) => (
            <li key={x.id} data-ce-invite={x.title}><div><strong>{x.roleLabel} · {x.title}</strong><p>{x.lead} · {x.sharePct}% of the commission{x.potentialPaise != null ? ` · about ${rupees(x.potentialPaise)} (estimate)` : ''}{x.matchReasons?.length ? ` · ${x.matchReasons.join(' · ')}` : ''}</p></div>
              {x.status === 'invited' ? <div className="cz-row" style={{ gap: 6 }}><Button size="sm" onClick={() => respond.run(x.id, 'accept')}>Accept</Button><Button size="sm" variant="ghost" onClick={() => respond.run(x.id, 'decline')}>Decline</Button></div>
                : x.status === 'accepted' ? <ButtonLink size="sm" variant="ghost" href={`/comearn/engagements/${x.engagementId}`}>Open</ButtonLink> : <span className="ce-muted">{x.status}</span>}</li>))}</ul>
        </Card>
      )}
      <Card title="My customer requirements" actions={<ButtonLink size="sm" variant="ghost" href="/comearn/requirements/new">Post a requirement</ButtonLink>}>
        {reqs.data?.items.length ? <ul className="vai-list">{reqs.data.items.map((r) => (
          <li key={r.id} data-ce-myreq={r.title}><div><Link href={`/comearn/requirements/${r.id}`}><strong>{r.title}</strong></Link><p>{CE_CATEGORIES[r.category]} · {r.city} · {r.bids} offer{r.bids === 1 ? '' : 's'} · {r.status === 'open' ? `open until ${r.closesOn}` : r.status}</p></div>
            <ButtonLink size="sm" variant="ghost" href={r.engagementId ? `/comearn/engagements/${r.engagementId}` : `/comearn/requirements/${r.id}`}>{r.status === 'open' && r.bids ? 'Compare offers' : 'Open'}</ButtonLink></li>))}</ul>
          : <p className="ce-muted">Have a customer with a need? Post it and let businesses offer you a commission.</p>}
      </Card>
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
