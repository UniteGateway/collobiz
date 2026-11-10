'use client';
import { XCHANGE_DEAL_STATUS_LABELS } from '@collabiz/types';
import { Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, KpiRow, WorkspaceNav, inr } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Res { totals: { offers: number; needs: number; offerValue: number; deals: number; completed: number; disputed: number; exchanged: number }; deals: { id: string; code: string; kind: string; status: string; createdAt: string; parties: string[]; value: number; disputes: (string | null)[] }[] }
const KIND: Record<string, string> = { direct: 'Direct', part_cash: 'Part-cash', multi: 'Multi-party' };
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { proposed: 'info', agreed: 'warning', completed: 'success', cancelled: 'neutral', disputed: 'danger' };

/** XCHANGE oversight — listings, exchanges between businesses, and disputes needing Unite's attention. */
export default function XchangeAdmin() {
  const q = useQuery<Res>('/admin/xchange');
  const d = q.data;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="COLLABIZ" accent="XCHANGE" sub="Business barter between verified companies — goods, services, machinery, surplus stock and idle capacity, directly, with part-cash or in multi-party chains. No platform currency; every supply is invoiced at open-market value." chips={['Direct & part-cash', 'Multi-party chains', 'Delivery & acceptance', 'Disputes']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          <KpiRow tint="teal" items={[['trading', d.totals.offers, 'Offers listed', `${inr(d.totals.offerValue)} declared value`], ['search', d.totals.needs, 'Needs listed', 'open'], ['check', d.totals.completed, 'Exchanges completed', `${inr(d.totals.exchanged)} exchanged`], ['alert', d.totals.disputed, 'Disputed', 'need attention']]} />
          <Card title="Exchanges">
            {!d.deals.length ? <EmptyState icon="trading" title="No exchanges yet" /> : (
              <ul className="cz-ws-list">{d.deals.map((x) => (
                <li key={x.id} data-exchange={x.code} style={{ alignItems: 'flex-start' }}><span><strong>{x.code}</strong> · {KIND[x.kind]} · {inr(x.value)}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{x.parties.join(' · ')}</span>{x.disputes.filter(Boolean).map((r, i) => <span key={i} style={{ display: 'block', fontSize: 13, color: 'var(--cz-danger)' }}>Dispute: {r}</span>)}</span>
                  <StatusBadge status={x.status} tone={TONE[x.status]} label={XCHANGE_DEAL_STATUS_LABELS[x.status]} /></li>
              ))}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
