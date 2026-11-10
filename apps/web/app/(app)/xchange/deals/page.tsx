'use client';
import Link from 'next/link';
import { XCHANGE_DEAL_STATUS_LABELS } from '@collabiz/types';
import { Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { XchangeNav, inr } from '@/components/Xchange';
import { useQuery } from '@/lib/hooks';

const KIND: Record<string, string> = { direct: 'Direct barter', part_cash: 'Part-cash', multi: 'Multi-party' };
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { proposed: 'info', agreed: 'warning', completed: 'success', cancelled: 'neutral', disputed: 'danger' };

/** Screen 182 — your XCHANGE exchanges. */
export default function MyExchanges() {
  const q = useQuery<{ id: string; code: string; kind: string; status: string; createdAt: string; legs: number; value: number }[]>('/xchange/deals');
  return (
    <Screen page={{ key: 'xchange-deals', title: 'My exchanges', access: 'partner' }} description="Exchanges you proposed or were invited to — approvals, deliveries and invoice data.">
      <XchangeNav />
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="trading" title="No exchanges yet">Propose one from “Matches for you”.</EmptyState> : (
        <ul className="cz-ws-list">{q.data.map((d) => <li key={d.id} data-exchange={d.code}><span><Link href={`/xchange/deals/${d.id}`}><strong>{d.code}</strong></Link> · {KIND[d.kind]}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{d.legs} supplies · {inr(d.value)} exchanged · {new Date(d.createdAt).toLocaleDateString('en-IN')}</span></span><StatusBadge status={d.status} tone={TONE[d.status]} label={XCHANGE_DEAL_STATUS_LABELS[d.status]} /></li>)}</ul>
      )}</Card>
    </Screen>
  );
}
