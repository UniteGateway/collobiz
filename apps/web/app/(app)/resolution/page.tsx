'use client';
import Link from 'next/link';
import { RESOLUTION_KIND_LABELS } from '@collabiz/types';
import { Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 175 (partner) — every dispute your company is part of: leads, commission, XCHANGE and contracts. */
export default function MyDisputes() {
  const q = useQuery<{ kind: string; id: string; code: string; subject: string; status: string; openedAt: string; link: string }[]>('/resolution/mine');
  return (
    <Screen page={{ key: 'resolution', title: 'Disputes and resolution', access: 'partner' }} description="Lead ownership, commission, XCHANGE delivery and contract-responsibility disputes in one place. Unite reviewers decide on the evidence; you can appeal once.">
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="success" title="No disputes">Good — nothing needs resolving.</EmptyState> : (
        <ul className="cz-ws-list">{q.data.map((d) => (
          <li key={`${d.kind}-${d.id}`} data-dispute={d.code}><span><Link href={d.link}><strong>{d.code}</strong></Link> · {RESOLUTION_KIND_LABELS[d.kind]}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{d.subject} · opened {new Date(d.openedAt).toLocaleDateString('en-IN')}</span></span><StatusBadge status={d.status} /></li>
        ))}</ul>
      )}</Card>
    </Screen>
  );
}
