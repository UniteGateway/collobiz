'use client';
import { Alert, Card, DescriptionList, LoadingState, Money, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ScoreForm, TenderTabs, useTender } from '@/components/Tenders';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 071 — Commercial Evaluation (technically qualified bids only). */
export default function CommercialEvaluation() {
  const t = useTender();
  const d = t.data;
  const q = useQuery<any>(d ? `/tenders/${t.id}/commercial` : null);
  const score = useMutation(async (bidId: string, s: number, comment: string) => { await api.post(`/tenders/${t.id}/bids/${bidId}/scores`, { kind: 'commercial', score: s, comment }); q.reload(); return bidId; });
  if (t.loading) return <Screen id="071"><LoadingState /></Screen>;
  if (t.error) return <Screen id="071"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  return (
    <Screen id="071" title={d.title}>
      <TenderTabs t={d} />
      {q.loading || (!q.data && !q.error) ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Alert tone="info">Only technically qualified bids are shown. The price score is the lowest qualified price divided by each price; evaluators record the commercial score used in the weighted comparison.</Alert>
          {q.data.bids.map((b: any) => (
            <Card key={b.id} title={b.bidder} actions={<StatusBadge status={b.status} />}>
              <section aria-label={`Commercial envelope — ${b.bidder}`}>
                <DescriptionList items={[
                  ['Price', <Money minor={b.commercial.amount} /> ],
                  ['Price score', `${b.priceScore}/100` ],
                  ['Validity', `${b.commercial.validityDays} days` ],
                  ['Payment terms', b.commercial.paymentTerms ],
                  ...(b.commercial.exclusions ? [['Exclusions', b.commercial.exclusions] as [string, React.ReactNode]] : []),
                  ['Commercial score', b.average == null ? 'Not scored yet' : String(b.average) ],
                ]} />
              </section>
              {b.scores.map((s: any) => <p key={s.evaluator} className="cz-muted" style={{ fontSize: 13 }}>{s.evaluator}: <strong>{s.score}</strong> — {s.comment}</p>)}
              {q.data.canScore && !b.myScore && b.status === 'technically_qualified' && <ScoreForm label={`Score ${b.bidder}`} pending={score.pending} error={score.error} onSubmit={(s, c) => score.run(b.id, s, c)} />}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
