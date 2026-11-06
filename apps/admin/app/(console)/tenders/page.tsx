'use client';
import { useState } from 'react';
import { TENDER_STATES } from '@collabiz/types';
import { Alert, Card, DataTable, DescriptionList, EmptyState, LoadingState, Select, StatusBadge, Timeline, Button } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Screen 137 — Project / Tender Administration: oversight of every tender's lifecycle, seals and audit trail. Never bid content. */
export default function TenderAdmin() {
  const [status, setStatus] = useState('');
  const q = useQuery<any[]>('/admin/tenders', status ? { status } : undefined);
  const [sel, setSel] = useState<string | null>(null);
  const d = useQuery<any>(sel ? `/admin/tenders/${sel}` : null);
  return (
    <Screen id="137" description="Platform oversight of tender integrity. Bid envelopes are sealed and encrypted — administrators see metadata, seal hashes and the audit trail only.">
      <Card title="Tenders" actions={<Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={TENDER_STATES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))} />}>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Tenders" rows={q.data ?? []} empty={<EmptyState title="No tenders" />} columns={[
            { key: 'title', header: 'Tender', render: (t: any) => <><Button size="sm" variant="ghost" onClick={() => setSel(t.id)} aria-label={`Inspect ${t.code}`}>{t.title}</Button><div className="cz-mono cz-muted">{t.code}</div></> },
            { key: 'issuer', header: 'Issuer' },
            { key: 'status', header: 'Status', render: (t: any) => <>{<StatusBadge status={t.status} />}{t.overdueToClose && <> <StatusBadge status="overdue" tone="warning" label="Past closing — not closed" /></>}</> },
            { key: 'closesAt', header: 'Closes', render: (t: any) => fmt(t.closesAt) },
            { key: 'submitted', header: 'Sealed bids' },
            { key: 'withdrawn', header: 'Withdrawn' },
            { key: 'evaluators', header: 'Evaluators', render: (t: any) => (t.evaluators ? t.evaluators : <StatusBadge status="missing" tone="danger" label="None" />) },
          ]} />
        )}
      </Card>
      {sel && (
        <Card title={d.data ? `${d.data.code} — ${d.data.title}` : 'Tender'} actions={d.data && <StatusBadge status={d.data.status} />}>
          {d.loading ? <LoadingState /> : d.error ? <ApiErrorView error={d.error} onRetry={d.reload} /> : (
            <>
              <DescriptionList items={[['Published', fmt(d.data.publishedAt)], ['Closes', fmt(d.data.closesAt)], ['Opened', fmt(d.data.openedAt)], ['Evaluators', d.data.evaluators.map((e: any) => `${e.name} (${e.role})`).join(', ') || '—'], ...(d.data.cancelReason ? [['Cancellation', d.data.cancelReason] as [string, string]] : [])]} />
              <Alert tone="info">Bid content is not available to administrators. Seal hashes let compliance confirm that what was opened is what was submitted.</Alert>
              <DataTable caption="Bids (metadata only)" rows={d.data.bids} empty={<EmptyState title="No bids" />} columns={[
                { key: 'org', header: 'Bidder' }, { key: 'status', header: 'Status', render: (b: any) => <StatusBadge status={b.status} /> },
                { key: 'submittedAt', header: 'Submitted', render: (b: any) => fmt(b.submittedAt) },
                { key: 'sealedHash', header: 'Seal', render: (b: any) => <span className="cz-mono" title={b.sealedHash ?? ''}>{b.sealedHash ? `${b.sealedHash.slice(0, 16)}…` : '—'}</span> },
              ]} />
              <h3>Audit trail</h3>
              <Timeline items={d.data.events.map((e: any, i: number) => ({ id: String(i), at: e.at, title: e.action, detail: e.reason ?? e.objectType }))} />
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
