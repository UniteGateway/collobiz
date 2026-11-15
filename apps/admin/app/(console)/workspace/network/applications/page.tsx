'use client';
import { useState } from 'react';
import { DataTable, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav } from '@/components/Workspace';
import { NetworkTabs, TONE, inr } from '@/components/Network';
import { useQuery } from '@/lib/hooks';

type R = Record<string, any>;

/** Applications — every franchise / store application with its payment state; open one to review, verify and activate. */
export default function Applications() {
  const [f, setF] = useState('todo');
  const q = useQuery<R[]>('/admin/network/applications');
  const rows = (q.data ?? []).filter((a) => (f === 'todo' ? a.status === 'applied' || a.paymentStatus === 'submitted' || ['approved', 'agreement_signed', 'setup'].includes(a.status) : f === 'live' ? a.status === 'live' : true));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: '8px 0 12px' }}>Applications</h1>
      <NetworkTabs />
      <Segmented label="Show" value={f} onChange={setF} options={[{ value: 'todo', label: 'Needs action' }, { value: 'live', label: 'Active' }, { value: 'all', label: 'All' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <section className="cz-card" style={{ marginTop: 12 }}><DataTable caption="Applications" rows={rows} columns={[
          { key: 'p', header: 'Applicant', render: (a: R) => <a href={`/workspace/network/applications/${a.id}`}><strong>{a.partner}</strong></a> },
          { key: 'k', header: 'Plan', render: (a: R) => <>{a.pricing?.packageName}{a.leadDnaAddon ? ' + LeadDNA' : ''}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{a.code} · v{a.packageVersion}</span></> },
          { key: 'l', header: 'Location / territory', render: (a: R) => <>{a.city}, {a.district}, {a.state}<br /><span className="cz-muted" style={{ fontSize: 12 }}>{a.territory}</span></> },
          { key: 't', header: 'Total', render: (a: R) => inr(a.pricing?.total) },
          { key: 's', header: 'Status', render: (a: R) => <StatusBadge status={a.status} tone={TONE[a.status]} label={a.status.replace('_', ' ')} /> },
          { key: 'y', header: 'Payment', render: (a: R) => <StatusBadge status={a.paymentStatus} tone={TONE[a.paymentStatus]} label={a.paymentStatus} /> },
        ]} /></section>
      )}
    </div>
  );
}
