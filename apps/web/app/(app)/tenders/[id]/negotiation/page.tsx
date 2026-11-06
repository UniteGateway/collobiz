'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadingState, Money, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmt, TenderTabs, useTender } from '@/components/Tenders';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { toMinor } from '@/lib/regions';

/** Screen 073 — Negotiation & Revision Workspace (issuer ↔ one shortlisted bidder; every revision kept). */
export default function Negotiation() {
  const t = useTender();
  const d = t.data;
  const list = useQuery<any>(d ? `/tenders/${t.id}/negotiations` : null);
  const [bidId, setBidId] = useState('');
  useEffect(() => { if (!bidId && list.data?.bids?.[0]) setBidId(list.data.bids[0].id); }, [list.data, bidId]);
  const th = useQuery<any>(bidId ? `/tenders/${t.id}/bids/${bidId}/negotiation` : null);
  const [msg, setMsg] = useState('');
  const [amount, setAmount] = useState('');
  const post = useMutation(async () => { await api.post(`/tenders/${t.id}/bids/${bidId}/negotiation`, { body: msg, revisedAmount: toMinor(amount) }); setMsg(''); setAmount(''); th.reload(); list.reload(); return true; });
  if (t.loading) return <Screen id="073"><LoadingState /></Screen>;
  if (t.error) return <Screen id="073"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const isBidder = list.data?.role === 'bidder';
  return (
    <Screen id="073" title={d.title}>
      <TenderTabs t={d} />
      {list.loading || (!list.data && !list.error) ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : !list.data.bids.length ? <EmptyState title="No bids are in negotiation">The issuer shortlists bids for negotiation after commercial evaluation.</EmptyState> : (
        <>
          {!isBidder && (
            <div className="cz-row" role="group" aria-label="Shortlisted bidders">
              {list.data.bids.map((b: any) => <Button key={b.id} size="sm" variant={b.id === bidId ? 'primary' : 'secondary'} onClick={() => setBidId(b.id)}>{b.bidder}</Button>)}
            </div>
          )}
          {th.loading ? <LoadingState /> : th.error ? <ApiErrorView error={th.error} onRetry={th.reload} /> : th.data && (
            <Card title={`Negotiation — ${list.data.bids.find((b: any) => b.id === bidId)?.bidder ?? ''}`} actions={<StatusBadge status={th.data.bidStatus} />}>
              <p>Sealed price: <Money minor={th.data.sealed} /> · Latest price: <strong><Money minor={th.data.final} /></strong></p>
              <ol className="cz-thread" aria-label="Negotiation messages">
                {th.data.messages.map((m: any) => (
                  <li key={m.id} data-mine={m.mine}>
                    <div className="cz-muted" style={{ fontSize: 12 }}>{m.org} · {m.author} · {fmt(m.createdAt)}</div>
                    <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{m.body}</p>
                    {m.revisedAmount != null && <StatusBadge status="revised" tone="warning" label={`Revised price ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(m.revisedAmount / 100)}`} />}
                  </li>
                ))}
              </ol>
              {th.data.messages.length === 0 && <p className="cz-muted">No messages yet.</p>}
              {post.error && <Alert tone="danger">{post.error}</Alert>}
              {th.data.open && (isBidder || list.data.canManage) ? (
                <>
                  <TextArea label="Message" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} error={post.fieldErrors.body} />
                  {isBidder && <TextInput label="Revised price (₹, optional)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={post.fieldErrors.revisedAmount} />}
                  <Button onClick={() => post.run()} disabled={msg.trim().length < 2} loading={post.pending}>{isBidder && amount ? 'Send revised offer' : 'Send message'}</Button>
                </>
              ) : <Alert tone="info">Negotiation is closed for this bid.</Alert>}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
