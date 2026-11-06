'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card, DataTable, EmptyState, LoadingState, StatusBadge, Tabs } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Row { id: string; displayName: string; legalName: string; type: string; city: string | null; country: string; verificationStatus: string; partnerTypes: string[]; submittedAt: string | null; reviewerName: string | null; openFlags: number }

/** Screen 130 — Partner Verification Queue. Oldest first; claim, review documents, decide with reasons. */
export default function VerificationQueue() {
  const [tab, setTab] = useState('submitted,under_review');
  const q = useQuery<Row[]>('/admin/verification/queue', { status: tab });
  return (
    <Screen id="130" description="KYC/KYB applications awaiting review. Reviewers cannot decide on organizations they belong to; every decision requires a reason.">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'submitted,under_review', label: 'Awaiting review' }, { value: 'reupload_requested', label: 'Re-upload requested' }, { value: 'rejected', label: 'Rejected' }, { value: 'verified', label: 'Verified' }]} />
      <Card>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Verification queue" rows={q.data ?? []} empty={<EmptyState title="Queue is clear" >No applications in this state.</EmptyState>} columns={[
            { key: 'displayName', header: 'Applicant', render: (r) => <><Link href={`/verification/${r.id}`}><strong>{r.displayName}</strong></Link><div className="cz-muted" style={{ fontSize: 12 }}>{r.legalName}</div></> },
            { key: 'type', header: 'Type', render: (r) => `${r.type.replace('partner_', '')} · ${r.partnerTypes.join(', ')}` },
            { key: 'city', header: 'Location', render: (r) => [r.city, r.country].filter(Boolean).join(', ') },
            { key: 'submittedAt', header: 'Submitted', render: (r) => (r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—') },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.verificationStatus} /> },
            { key: 'reviewer', header: 'Reviewer', render: (r) => r.reviewerName ?? 'Unassigned' },
            { key: 'flags', header: 'Risk flags', render: (r) => (r.openFlags ? <StatusBadge status="flagged" tone="danger" label={`${r.openFlags} open`} /> : '—') },
          ]} />
        )}
      </Card>
    </Screen>
  );
}
