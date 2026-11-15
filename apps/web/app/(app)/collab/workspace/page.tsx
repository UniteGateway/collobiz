'use client';
import Link from 'next/link';
import { ButtonLink, Card, EmptyState, Kpi, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { inr, stageLabel, type Money } from '@/components/Collab';
import { useQuery } from '@/lib/hooks';

interface Item { applicationId: string; offerId: string; code: string; title: string; category: string; side: 'publisher' | 'applicant'; counterparty: string; role: 'provider' | 'client' | null; stage: string; waitingOnYou: boolean; agreement: { id: string; code: string; status: string } | null; project: { id: string; code: string } | null; money: Money }
interface Res { items: Item[]; totals: Money & { toReceive: number; toPay: number }; note?: string }

/** My collaborations: every application you made or received on a business offer, from first contact to earnings. */
export default function CollabWorkspace() {
  const r = useQuery<Res>('/collab/workspace');
  const d = r.data;
  return (
    <Screen page={{ key: 'collab-workspace', title: 'My collaborations', access: 'partner' }} eyebrow="COLLAB">
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !d ? <LoadingState /> : !d.items.length ? (
        <Card><EmptyState icon="teams" title="No collaborations yet" action={<ButtonLink href="/collab">Find collaborations</ButtonLink>}>Apply to a business offer, or publish one — every conversation, agreement and payment then appears here.</EmptyState></Card>
      ) : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <div className="cz-grid cz-grid-4">
            <Kpi label="Pipeline" value={inr(d.totals.pipelineValue)} hint="Proposals not yet agreed" />
            <Kpi label="Contract value" value={inr(d.totals.contractValue)} hint="Agreed in agreements" />
            <Kpi label="Invoiced" value={inr(d.totals.invoiced)} hint={d.totals.toReceive ? `${inr(d.totals.toReceive)} still to receive` : 'Against certified milestones'} />
            <Kpi label="Collected" value={inr(d.totals.collected)} accent hint={d.totals.toPay ? `${inr(d.totals.toPay)} you still owe` : 'Payments recorded'} />
          </div>
          <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>{d.note}</p>
          <ul className="cz-collab-items">{d.items.map((x) => (
            <li key={x.applicationId} data-collab={x.title}>
              <div>
                <Link href={`/collab/room/${x.applicationId}`}><strong>{x.title}</strong></Link>
                <span className="cz-muted"> · {x.code} · {x.category}</span>
                <p>With {x.counterparty} · you {x.side === 'publisher' ? 'published the offer' : 'applied'}{x.role ? ` · you are the ${x.role}` : ''}</p>
                <span className="cz-collab-meta">Contract {inr(x.money.contractValue)} · invoiced {inr(x.money.invoiced)} · collected {inr(x.money.collected)}</span>
              </div>
              <div className="cz-stack" style={{ gap: 6, alignItems: 'flex-end' }}>
                <StatusBadge status={x.stage} label={stageLabel(x.stage)} tone={x.stage === 'execution' ? 'success' : 'info'} />
                {x.waitingOnYou && <StatusBadge status="action" label="Waiting for you" tone="warning" />}
              </div>
            </li>
          ))}</ul>
        </div>
      )}
    </Screen>
  );
}
