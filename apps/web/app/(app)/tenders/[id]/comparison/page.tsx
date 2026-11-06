'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, DataTable, LoadingState, Money, Select, StatusBadge, TextArea } from '@collabiz/ui';
import { newIdempotencyKey } from '@collabiz/types';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TenderTabs, useTender } from '@/components/Tenders';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 069 — Bid Comparison Table (weighted; prices hidden from technical-only evaluators). */
export default function BidComparison() {
  const t = useTender();
  const d = t.data;
  const q = useQuery<any>(d ? `/tenders/${t.id}/comparison` : null);
  const [pick, setPick] = useState<string[]>([]);
  const [winner, setWinner] = useState('');
  const [reason, setReason] = useState('');
  const shortlist = useMutation(async () => { await api.post(`/tenders/${t.id}/shortlist`, { bidIds: pick }); t.reload(); q.reload(); return true; });
  const award = useMutation(async () => { const r = await api.request<any>('POST', `/tenders/${t.id}/award`, { bidId: winner, reason }, { idempotencyKey: newIdempotencyKey() }); t.reload(); q.reload(); return r; });
  if (t.loading) return <Screen id="069"><LoadingState /></Screen>;
  if (t.error) return <Screen id="069"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const c = q.data;
  const canDecide = d.canManage && ['commercial_evaluation', 'negotiation'].includes(d.status);
  const awardable = (c?.bids ?? []).filter((b: any) => (d.status === 'negotiation' ? b.status === 'shortlisted' : b.status === 'technically_qualified'));
  return (
    <Screen id="069" title={d.title}>
      <TenderTabs t={d} />
      {q.loading || (!q.data && !q.error) ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          {!c.commercialVisible && <Alert tone="info">Prices are shown once commercial evaluation opens{d.evaluatorRole === 'technical' ? ' — and never to technical-only evaluators' : ''}.</Alert>}
          {(shortlist.error || award.error) && <Alert tone="danger">{shortlist.error ?? award.error}</Alert>}
          {award.data && <Alert tone="success">Tender awarded. All bidders have been notified.</Alert>}
          <Card title={`Weighted comparison (${c.techWeight}% technical / ${100 - c.techWeight}% commercial)`}>
            <DataTable caption="Bid comparison" rows={c.bids} columns={[
              { key: 'rank', header: 'Rank', render: (b: any) => b.rank ?? '—' },
              { key: 'bidder', header: 'Bidder' },
              { key: 'status', header: 'Status', render: (b: any) => <StatusBadge status={b.status} /> },
              { key: 'technicalScore', header: 'Technical', render: (b: any) => b.technicalScore ?? '—' },
              { key: 'timelineWeeks', header: 'Timeline', render: (b: any) => `${b.timelineWeeks} wks` },
              ...(c.commercialVisible ? [
                { key: 'amount', header: 'Sealed price', render: (b: any) => (b.amount != null ? <Money minor={b.amount} /> : 'Sealed') },
                { key: 'finalAmount', header: 'Latest price', render: (b: any) => (b.finalAmount != null ? <Money minor={b.finalAmount} /> : '—') },
                { key: 'commercialScore', header: 'Commercial', render: (b: any) => b.commercialScore ?? (b.priceScore != null ? `${b.priceScore} (price)` : '—') },
                { key: 'combined', header: 'Combined', render: (b: any) => (b.combined != null ? <strong>{b.combined}</strong> : '—') },
              ] : []),
              ...(canDecide && d.status === 'commercial_evaluation' ? [{ key: 'pick', header: 'Shortlist', render: (b: any) => (b.status === 'technically_qualified' ? <Checkbox label={`Shortlist ${b.bidder}`} checked={pick.includes(b.id)} onChange={(e) => setPick(e.target.checked ? [...pick, b.id] : pick.filter((x) => x !== b.id))} /> : null) }] : []),
            ]} />
            {c.bids.filter((b: any) => !b.qualified && b.qualificationReason).map((b: any) => <p key={b.id} className="cz-muted" style={{ fontSize: 13 }}>{b.bidder}: {b.qualificationReason}</p>)}
          </Card>
          {canDecide && (
            <Card title="Decision">
              {d.status === 'commercial_evaluation' && <Button variant="secondary" onClick={() => shortlist.run()} disabled={!pick.length} loading={shortlist.pending}>Shortlist for negotiation</Button>}
              <div className="cz-row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
                <Select label="Award to" value={winner} onChange={(e) => setWinner(e.target.value)} placeholder="Choose a bid" options={awardable.map((b: any) => ({ value: b.id, label: b.bidder }))} />
                <TextArea label="Award justification" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button variant="accent" onClick={() => award.run()} disabled={!winner || reason.trim().length < 10} loading={award.pending}>Award tender</Button>
              </div>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
