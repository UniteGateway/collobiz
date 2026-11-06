'use client';
import { useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput, Timeline } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { inr } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Shared by 104 (payment disputes & reconciliation) and 159 (commission disputes). */
export function FinanceDisputes({ kind }: { kind: 'commission' | 'payment' }) {
  const q = useQuery<any>('/finance/disputes');
  const earn = useQuery<any>(kind === 'commission' ? '/earnings' : null);
  const pays = useQuery<any[]>(kind === 'payment' ? '/payouts' : null);
  const [f, setF] = useState({ ref: '', reason: '', expected: '' });
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [rule, setRule] = useState({ outcome: 'rejected', resolution: '', adjusted: '' });
  const raise = useMutation(async () => { const d = await api.post<any>('/finance/disputes', { kind, entryId: kind === 'commission' ? f.ref : undefined, payoutId: kind === 'payment' ? f.ref : undefined, reason: f.reason, expectedAmount: toMinor(f.expected) }); setF({ ref: '', reason: '', expected: '' }); q.reload(); earn.reload(); setSel(d.id); return d; });
  const post = useMutation(async () => { await api.post(`/finance/disputes/${sel}/messages`, { body: msg }); setMsg(''); q.reload(); return true; });
  const ruleM = useMutation(async () => { await api.request('POST', `/finance/disputes/${sel}/rule`, { outcome: rule.outcome, resolution: rule.resolution, adjustedAmount: toMinor(rule.adjusted) }, { idempotencyKey: newIdempotencyKey() }); q.reload(); return true; });
  const rows = (q.data?.disputes ?? []).filter((d: any) => d.kind === kind);
  const d = rows.find((x: any) => x.id === sel);
  const options = kind === 'commission'
    ? (earn.data?.lines ?? []).filter((l: any) => ['earned', 'approved', 'settled'].includes(l.status)).map((l: any) => ({ value: l.id, label: `${l.description} · ${inr(l.payable)}` }))
    : (pays.data ?? []).map((p: any) => ({ value: p.id, label: `${p.code} · ${inr(p.payable)} · ${p.status}` }));
  return (
    <>
      {(raise.error || post.error || ruleM.error) && <Alert tone="danger">{raise.error ?? post.error ?? ruleM.error}</Alert>}
      <Card title="Disputes">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption={kind === 'commission' ? 'Commission disputes' : 'Payment disputes'} rows={rows} empty={<EmptyState title="No disputes" />} columns={[
            { key: 'code', header: 'Dispute', render: (x: any) => <Button size="sm" variant="ghost" onClick={() => setSel(x.id)} aria-label={`Open ${x.code}`}>{x.code}</Button> },
            { key: 'subject', header: 'About', render: (x: any) => x.entry ?? x.payout },
            ...(q.data.canRule ? [{ key: 'org', header: 'Raised by' }] : []),
            { key: 'expectedAmount', header: 'Expected', render: (x: any) => inr(x.expectedAmount) },
            { key: 'status', header: 'Status', render: (x: any) => <>{<StatusBadge status={x.status} />}{x.outcome && <div className="cz-muted" style={{ fontSize: 12 }}>{x.outcome}</div>}</> },
          ]} />
        )}
      </Card>
      {d && (
        <Card title={`${d.code}`} actions={<StatusBadge status={d.status} />}>
          <Timeline items={d.messages.map((m: any, i: number) => ({ id: String(i), at: m.at, title: m.org === 'COLLABIZ Finance' ? 'COLLABIZ Finance' : d.org, detail: m.body }))} />
          {d.resolution && <Alert tone={d.outcome === 'rejected' ? 'warning' : 'success'} title={`Outcome: ${d.outcome}`}>{d.resolution}{d.adjustedAmount != null ? ` (adjusted to ${inr(d.adjustedAmount)})` : ''}</Alert>}
          {!['resolved', 'closed'].includes(d.status) && (
            <>
              <TextArea label="Add a message or evidence note" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} />
              <Button variant="secondary" onClick={() => post.run()} disabled={msg.trim().length < 2} loading={post.pending}>Send</Button>
              {q.data.canRule && (
                <section aria-label="Ruling" style={{ marginTop: 12 }}>
                  <Select label="Outcome" value={rule.outcome} onChange={(e) => setRule({ ...rule, outcome: e.target.value })} options={[{ value: 'rejected', label: 'Rejected — amount stands' }, { value: 'upheld', label: 'Upheld — no amount change' }, { value: 'adjusted', label: 'Adjusted — new payable' }]} />
                  {rule.outcome === 'adjusted' && <TextInput label="Adjusted net payable (₹)" inputMode="decimal" value={rule.adjusted} onChange={(e) => setRule({ ...rule, adjusted: e.target.value })} />}
                  <TextArea label="Reasoned decision" rows={2} value={rule.resolution} onChange={(e) => setRule({ ...rule, resolution: e.target.value })} />
                  <Button onClick={() => ruleM.run()} disabled={rule.resolution.trim().length < 10} loading={ruleM.pending}>Record ruling</Button>
                </section>
              )}
            </>
          )}
        </Card>
      )}
      {!q.data?.canRule && (
        <Card title={kind === 'commission' ? 'Dispute a commission line' : 'Report a payment problem'}>
          <Select label={kind === 'commission' ? 'Commission line' : 'Payout'} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="Choose" options={options} />
          <TextArea label="What is wrong?" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={raise.fieldErrors.reason} />
          <TextInput label="Amount you expected (₹, optional)" inputMode="decimal" value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} />
          <Button onClick={() => raise.run()} disabled={!f.ref} loading={raise.pending}>Raise dispute</Button>
        </Card>
      )}
    </>
  );
}
