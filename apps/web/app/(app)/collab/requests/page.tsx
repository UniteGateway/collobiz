'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ButtonLink, Card, EmptyState, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { inr, stageLabel } from '@/components/Collab';
import { useQuery } from '@/lib/hooks';

interface Item { applicationId: string; offerId: string; code: string; title: string; side: 'publisher' | 'applicant'; counterparty: string; stage: string; waitingOnYou: boolean; money: { pipelineValue: number; contractValue: number } }
interface Invitation { id: string; offerId: string; code: string; title: string; expiresOn: string; status: string; statusLabel: string; from?: string; organization?: string }

/** Requests & deals — applications and invitations, received and sent; each opens its private room. */
export default function CollabRequests() {
  const w = useQuery<{ items: Item[] }>('/collab/workspace');
  const inv = useQuery<{ received: Invitation[]; sent: Invitation[] }>('/collab/invitations');
  const [tab, setTab] = useState('received');
  const items = (w.data?.items ?? []).filter((x) => (tab === 'received' ? x.side === 'publisher' : x.side === 'applicant'));
  const invs = (tab === 'received' ? inv.data?.received : inv.data?.sent) ?? [];
  const nRecv = (w.data?.items.filter((x) => x.side === 'publisher').length ?? 0) + (inv.data?.received.length ?? 0);
  const nSent = (w.data?.items.filter((x) => x.side === 'applicant').length ?? 0) + (inv.data?.sent.length ?? 0);
  return (
    <Screen page={{ key: 'collab-requests', title: 'Requests & deals', access: 'partner' }} eyebrow="Collab" description="Applications, enquiries and invitations. Each one has a private room where you agree terms, sign, deliver and get paid.">
      {w.error ? <ApiErrorView error={w.error} onRetry={w.reload} /> : !w.data || !inv.data ? <LoadingState /> : <>
        <Segmented label="Direction" value={tab} onChange={setTab} options={[{ value: 'received', label: `Received (${nRecv})` }, { value: 'sent', label: `Sent (${nSent})` }]} />
        <div style={{ marginTop: 14 }} className="cz-stack">
          {!items.length && !invs.length ? (
            <Card><EmptyState icon="teams" title={tab === 'received' ? 'Nothing received yet' : 'Nothing sent yet'} action={<ButtonLink href={tab === 'received' ? '/business-offers/new' : '/collab/matches'}>{tab === 'received' ? 'Post a business offer' : 'See matches'}</ButtonLink>}>
              {tab === 'received' ? 'Post a business offer or describe what you have — businesses will reach out here.' : 'Apply to an offer that fits — your requests appear here.'}</EmptyState></Card>
          ) : <>
            {items.length > 0 && <Card title={tab === 'received' ? 'Applications to your offers' : 'Your applications'}>
              <ul className="cz-ws-list">{items.map((x) => <li key={x.applicationId}><span><Link href={`/collab/room/${x.applicationId}`}>{x.title}</Link> <span className="cz-muted">· {x.code} · {x.counterparty}</span></span>
                <span className="cz-row" style={{ gap: 8 }}>{x.waitingOnYou && <StatusBadge status="pending" label="Waiting on you" />}<StatusBadge status="in_progress" label={stageLabel(x.stage)} /><span className="cz-muted">{inr(x.money.contractValue || x.money.pipelineValue)}</span></span></li>)}</ul>
            </Card>}
            {invs.length > 0 && <Card title={tab === 'received' ? 'Invitations to you' : 'Invitations you sent'}>
              <ul className="cz-ws-list">{invs.map((x) => <li key={x.id}><span><Link href={`/business-offers/${x.offerId}`}>{x.title}</Link> <span className="cz-muted">· {x.code} · {x.from ?? x.organization ?? ''}</span></span><StatusBadge status={x.status} label={x.statusLabel} /></li>)}</ul>
            </Card>}
          </>}
        </div>
      </>}
    </Screen>
  );
}
