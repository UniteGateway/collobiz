'use client';
import { useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CommissionBadge, inr, when } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 098 — Commission Approval Workflow (finance; two approvers at or above the threshold). */
export default function Approvals() {
  const q = useQuery<any>('/finance/approvals');
  const [reason, setReason] = useState('');
  const act = useMutation(async (id: string, action: string) => {
    if (action === 'approve') await api.request('POST', `/finance/entries/${id}/approve`, {}, { idempotencyKey: newIdempotencyKey() });
    else await api.post(`/finance/entries/${id}/${action}`, action === 'release' ? {} : { reason });
    setReason(''); q.reload(); return action;
  });
  return (
    <Screen id="098" description="Only earned commission (customer payment recorded) can be approved. At or above the threshold, two different finance approvers are required.">
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <Card title={`Approval queue · dual approval from ${inr(q.data.threshold)}`}>
          <DataTable caption="Approval queue" rows={q.data.entries} empty={<EmptyState title="Nothing awaiting approval" />} columns={[
            { key: 'description', header: 'Line', render: (e: any) => <>{e.description}<div className="cz-muted" style={{ fontSize: 12 }}>{e.beneficiary} · {e.project} · {e.agreementCode}</div></> },
            { key: 'status', header: 'Status', render: (e: any) => <><CommissionBadge status={e.status} />{e.holdReason && <div className="cz-muted" style={{ fontSize: 12 }}>{e.holdReason}</div>}</> },
            { key: 'earnedAt', header: 'Earned', render: (e: any) => when(e.earnedAt) },
            { key: 'payable', header: 'Net payable', render: (e: any) => inr(e.payable) },
            { key: 'approvals', header: 'Approvals', render: (e: any) => `${e.approvals.length}/${e.approvalsRequired}${e.approvals.length ? ` (${e.approvals.map((a: any) => a.who).join(', ')})` : ''}` },
            { key: 'actions', header: 'Actions', render: (e: any) => (
              <div className="cz-row">
                {e.status === 'earned' && !e.approvedByMe && <Button size="sm" onClick={() => act.run(e.id, 'approve')} aria-label={`Approve ${e.description}`}>Approve</Button>}
                {['earned', 'eligible'].includes(e.status) && <Button size="sm" variant="secondary" onClick={() => act.run(e.id, 'hold')} disabled={reason.trim().length < 5} aria-label={`Hold ${e.description}`}>Hold</Button>}
                {e.status === 'on_hold' && <Button size="sm" variant="secondary" onClick={() => act.run(e.id, 'release')} aria-label={`Release ${e.description}`}>Release</Button>}
              </div>
            ) },
          ]} />
          <TextInput label="Reason (for holds)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Card>
      )}
    </Screen>
  );
}
