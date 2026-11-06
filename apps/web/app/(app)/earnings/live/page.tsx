'use client';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { CommissionBadge, EARNED_NOTE, EarningsTabs, inr } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

const STEPS = ['estimated', 'eligible', 'earned', 'approved', 'invoiced', 'settled'];

/** Screen 158 — Live Earnings & Settlement Tracker (each line's position and its full journal). */
export default function LiveTracker() {
  const q = useQuery<any>('/earnings');
  const [sel, setSel] = useState<string | null>(null);
  const j = useQuery<any[]>(sel ? `/commissions/entries/${sel}/journal` : null);
  return (
    <Screen id="158">
      <EarningsTabs />
      <Alert tone="info">{EARNED_NOTE}</Alert>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : q.data.lines.map((l: any) => (
        <Card key={l.id} title={l.description} actions={<CommissionBadge status={l.status} />}>
          <p className="cz-muted" style={{ marginTop: 0 }}>{l.project} · net {inr(l.payable)}{l.holdReason ? ` · on hold: ${l.holdReason}` : ''}</p>
          <ol className="cz-steps" aria-label={`Progress of ${l.description}`}>
            {STEPS.map((s, i) => { const at = STEPS.indexOf(l.status); const done = at >= i; return <li key={s} data-done={done} aria-current={at === i ? 'step' : undefined}>{s === 'estimated' ? 'Projected' : s === 'settled' ? 'Paid' : s[0].toUpperCase() + s.slice(1)}</li>; })}
          </ol>
          <Button size="sm" variant="ghost" onClick={() => setSel(sel === l.id ? null : l.id)} aria-expanded={sel === l.id} aria-label={`History of ${l.description}`}>{sel === l.id ? 'Hide history' : 'Show history'}</Button>
          {sel === l.id && (j.loading ? <LoadingState /> : j.error ? <ApiErrorView error={j.error} /> : <Timeline items={(j.data ?? []).map((x) => ({ id: x.id, at: x.createdAt, title: `${x.action.replace('entry.', '').replace('_', ' ')}${x.amount != null ? ` · ${inr(x.amount)}` : ''}`, detail: `${x.who}${x.note ? ` — ${x.note}` : ''}` }))} />)}
        </Card>
      ))}
    </Screen>
  );
}
