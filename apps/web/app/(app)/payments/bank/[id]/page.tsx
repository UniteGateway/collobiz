'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, Select, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EarningsTabs, inr } from '@/components/Finance';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Opt { invoiceId: string; number: string; outstanding: number; counterparty: string; projectId: string }
interface Line { id: string; seq: number; txnDate: string; description: string; reference: string | null; utr: string | null; direction: 'credit' | 'debit'; amount: number; status: string; matchReason: string | null; matchScore: number | null; suggested: Opt | null; candidates: (Opt & { reason: string })[]; options: Opt[]; receipt: { invoice: string; pending: boolean; reference: string } | null }
interface S { fileName: string; company: string; periodFrom: string; periodTo: string; layout: string; skippedCount: number; payeeReports: boolean; lines: Line[] }
const TONE: Record<string, 'success' | 'info' | 'neutral' | 'warning'> = { matched: 'success', suggested: 'info', unmatched: 'warning', ignored: 'neutral' };
const LABEL: Record<string, string> = { matched: 'Matched', suggested: 'Suggested', unmatched: 'Not matched', ignored: 'Ignored' };

/** One statement, line by line: accept a suggestion, choose an invoice, or ignore lines that are not project payments. */
export default function BankStatement() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<S>(`/finance/bank-statements/${id}`);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const [pick, setPick] = useState<Record<string, string>>({});
  const act = useMutation(async (a: { line: string; invoiceId?: string }) => { await (a.invoiceId ? api.post(`/finance/bank-statement-lines/${a.line}/match`, { invoiceId: a.invoiceId }) : api.post(`/finance/bank-statement-lines/${a.line}/ignore`, {})); q.reload(); return true; });
  const s = q.data;
  const rows = s?.lines.filter((l) => show === 'all' || l.status === 'suggested' || l.status === 'unmatched') ?? [];
  return (
    <Screen page={{ key: 'bank-statement', title: s ? s.fileName : 'Bank statement', access: 'partner' }} description={s ? `${s.company} · ${s.lines.length} transactions${s.skippedCount ? ` · ${s.skippedCount} heading or total rows skipped` : ''}` : undefined}>
      <EarningsTabs />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !s ? <LoadingState /> : (
        <>
          {s.payeeReports && <Alert tone="info">Credits you match are recorded as <strong>reported by you</strong>. The client confirms them before the invoice counts as paid.</Alert>}
          {act.error && <Alert tone="danger">{act.error}</Alert>}
          <div className="cz-row" style={{ gap: 8 }} role="group" aria-label="Show">
            <Button size="sm" variant={show === 'open' ? 'primary' : 'secondary'} onClick={() => setShow('open')}>To review ({s.lines.filter((l) => l.status === 'suggested' || l.status === 'unmatched').length})</Button>
            <Button size="sm" variant={show === 'all' ? 'primary' : 'secondary'} onClick={() => setShow('all')}>All ({s.lines.length})</Button>
          </div>
          <Card>
            {!rows.length ? <p className="cz-muted" style={{ margin: 0 }}>Every line is matched or ignored.</p> : (
              <ul className="cz-ws-list">{rows.map((l) => (
                <li key={l.id} data-line={l.seq} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingBlock: 14, borderBottom: '1px solid var(--cz-hairline)' }}>
                  <span>
                    <strong style={{ color: l.direction === 'credit' ? 'var(--cz-success)' : undefined }}>{l.direction === 'credit' ? '+' : '−'}{inr(l.amount)}</strong> · {new Date(l.txnDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    <br /><span style={{ fontSize: 13.5 }}>{l.description}</span>
                    {l.utr && <><br /><span className="cz-muted cz-mono" style={{ fontSize: 12 }}>UTR {l.utr}</span></>}
                    {l.status === 'suggested' && l.suggested && <><br /><span style={{ fontSize: 13 }}>Suggested: <strong>{l.suggested.number}</strong> ({l.suggested.counterparty}, {inr(l.suggested.outstanding)} due) — {l.matchReason}</span></>}
                    {l.status === 'unmatched' && l.matchReason && <><br /><span className="cz-muted" style={{ fontSize: 13 }}>{l.matchReason}</span></>}
                    {l.receipt && <><br /><span style={{ fontSize: 13 }}>Recorded on <strong>{l.receipt.invoice}</strong>{l.receipt.pending ? ' — waiting for the client to confirm' : ''}</span></>}
                  </span>
                  <span className="cz-row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <StatusBadge status={l.status} tone={TONE[l.status]} label={LABEL[l.status]} />
                    {l.status === 'suggested' && l.suggested && <Button size="sm" onClick={() => act.run({ line: l.id, invoiceId: l.suggested!.invoiceId })}>Confirm match</Button>}
                    {(l.status === 'unmatched' || l.status === 'suggested') && l.options.length > 0 && (
                      <>
                        <div style={{ minWidth: 240, maxWidth: 380, flex: '1 1 240px', marginBottom: -4 }}><Select label="Or choose an invoice" placeholder="Invoice" value={pick[l.id] ?? ''} onChange={(e) => setPick({ ...pick, [l.id]: e.target.value })} options={l.options.map((o) => ({ value: o.invoiceId, label: `${o.number} · ${o.counterparty} · ${inr(o.outstanding)} due` }))} /></div>
                        <Button size="sm" variant="secondary" disabled={!pick[l.id]} onClick={() => act.run({ line: l.id, invoiceId: pick[l.id] })}>Match</Button>
                      </>
                    )}
                    {l.status !== 'matched' && <Button size="sm" variant="ghost" onClick={() => act.run({ line: l.id })}>{l.status === 'ignored' ? 'Restore' : 'Ignore'}</Button>}
                  </span>
                </li>
              ))}</ul>
            )}
          </Card>
          <p className="cz-muted" style={{ fontSize: 12.5 }}><Link href="/payments/bank">All statements</Link> · Matching only ever offers invoices that still have at least this amount outstanding.</p>
        </>
      )}
    </Screen>
  );
}
