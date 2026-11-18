'use client';
import Link from 'next/link';
import { ButtonLink, Card, DataTable, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MICRO_STATUS, dt, rs, type Micro } from '@/components/Ops';
import { useQuery } from '@/lib/hooks';

export default function MyMicro() {
  const q = useQuery<{ posted: (Micro & { applications: number })[]; working: (Micro & { application: string })[] }>('/micro/mine');
  const d = q.data;
  const cols = (posted: boolean) => [
    { key: 't', header: 'Work', render: (m: Micro) => <span><Link href={`/micro/${m.id}`}>{m.title}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{m.code} · {m.kindLabel}</span></span> },
    { key: 'p', header: 'Price', render: (m: Micro) => rs(m.priceRs) },
    { key: 'd', header: 'Due', render: (m: Micro) => dt(m.due) },
    posted ? { key: 'a', header: 'Applicants', render: (m: Micro) => String(m.applications ?? 0) } : { key: 'a', header: 'Posted by', render: (m: Micro) => m.poster ?? '—' },
    { key: 's', header: 'Status', render: (m: Micro) => <StatusBadge status={m.status} label={!posted && m.application === 'not_chosen' ? 'Not chosen' : !posted && m.application === 'applied' && m.status === 'open' ? 'Applied' : MICRO_STATUS[m.status]} /> },
  ];
  return (
    <Screen page={{ key: 'micro-mine', title: 'My micro-contracts', access: 'partner' }} eyebrow="Micro-contracts" actions={<ButtonLink href="/micro/new" variant="accent">Post work</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={240} /> : <>
        <Card title={`Work I posted (${d.posted.length})`}><DataTable rows={d.posted} caption="Work I posted" columns={cols(true)} empty={<p className="cz-muted">Nothing posted yet.</p>} /></Card>
        <div style={{ height: 16 }} />
        <Card title={`Work I applied for or am doing (${d.working.length})`}><DataTable rows={d.working} caption="Work I applied for" columns={cols(false)} empty={<p className="cz-muted">Apply to open work to build your Proof passport.</p>} /></Card>
      </>}
    </Screen>
  );
}
