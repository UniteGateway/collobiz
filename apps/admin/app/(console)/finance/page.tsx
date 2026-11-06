'use client';
import { useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, EmptyState, Grid, Kpi, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const inr = (m?: number | null) => (m == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(m / 100));

/** Screen 138 — Finance & Settlement Controls (payout approval, idempotent settlement, ledger reconciliation). */
export default function FinanceControls() {
  const [status, setStatus] = useState('');
  const q = useQuery<any>('/finance/payouts', status ? { status } : undefined);
  const [ref, setRef] = useState<Record<string, { utr: string; method: string; key: string }>>({});
  const [reason, setReason] = useState('');
  const r = (id: string) => ref[id] ?? { utr: '', method: 'neft', key: newIdempotencyKey() };
  const act = useMutation(async (id: string, action: string) => {
    if (action === 'settle') await api.request('POST', `/finance/payouts/${id}/settle`, { bankReference: r(id).utr, method: r(id).method }, { idempotencyKey: r(id).key });
    else await api.post(`/finance/payouts/${id}/${action}`, action === 'reject' ? { reason } : undefined);
    q.reload(); return action;
  });
  const ledger = q.data?.ledger ?? [];
  const amt = (s: string) => ledger.find((x: any) => x.status === s)?.amount ?? 0;
  return (
    <Screen id="138" description="Approve payout requests, then record the bank transfer once. Each settlement is idempotent and unique per payout and per bank reference; above the threshold the approver cannot also record the settlement.">
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Grid cols={4}>
            <Kpi label="Earned, awaiting approval" value={inr(amt('earned'))} />
            <Kpi label="Approved, not requested" value={inr(amt('approved'))} />
            <Kpi label="Requested (invoiced)" value={inr(amt('invoiced'))} accent />
            <Kpi label="Paid" value={inr(amt('settled'))} />
          </Grid>
          <Card title={`Payout requests · dual control from ${inr(q.data.threshold)}`} actions={<Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All" options={['requested', 'approved', 'settled', 'rejected'].map((s) => ({ value: s, label: s }))} />}>
            <DataTable caption="Payout requests" rows={q.data.payouts} empty={<EmptyState title="No payout requests" />} columns={[
              { key: 'code', header: 'Payout', render: (p: any) => <><span className="cz-mono">{p.code}</span><div className="cz-muted" style={{ fontSize: 12 }}>{p.beneficiary} · invoice {p.partnerInvoiceNo}</div></> },
              { key: 'payable', header: 'Net', render: (p: any) => <>{inr(p.payable)}<div className="cz-muted" style={{ fontSize: 12 }}>TDS {inr(p.tds)} · GST {inr(p.gst)}</div></> },
              { key: 'bank', header: 'Bank', render: (p: any) => (p.bank ? <>••{p.bank.last4} · {p.bank.ifsc} {p.bank.verified ? '✓' : <StatusBadge status="unverified" tone="danger" />}</> : '—') },
              { key: 'status', header: 'Status', render: (p: any) => <>{<StatusBadge status={p.status} />}{p.settlement && <div className="cz-mono cz-muted" style={{ fontSize: 12 }}>{p.settlement.bankReference}</div>}</> },
              { key: 'actions', header: 'Actions', render: (p: any) => (
                <div className="cz-row" style={{ alignItems: 'flex-end' }}>
                  {p.status === 'requested' && <Button size="sm" onClick={() => act.run(p.id, 'approve')} aria-label={`Approve ${p.code}`}>Approve</Button>}
                  {p.status === 'approved' && (
                    <>
                      <TextInput label={`UTR for ${p.code}`} value={r(p.id).utr} onChange={(e) => setRef({ ...ref, [p.id]: { ...r(p.id), utr: e.target.value } })} />
                      <Select label={`Method for ${p.code}`} value={r(p.id).method} onChange={(e) => setRef({ ...ref, [p.id]: { ...r(p.id), method: e.target.value } })} options={['neft', 'rtgs', 'imps', 'upi'].map((m) => ({ value: m, label: m.toUpperCase() }))} />
                      <Button size="sm" variant="accent" onClick={() => act.run(p.id, 'settle')} disabled={r(p.id).utr.trim().length < 8} aria-label={`Record settlement for ${p.code}`}>Record settlement</Button>
                    </>
                  )}
                  {['requested', 'approved'].includes(p.status) && <Button size="sm" variant="ghost" onClick={() => act.run(p.id, 'reject')} disabled={reason.trim().length < 5} aria-label={`Reject ${p.code}`}>Reject</Button>}
                </div>
              ) },
            ]} />
            <TextInput label="Reason (for rejections)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Card>
        </>
      )}
    </Screen>
  );
}
