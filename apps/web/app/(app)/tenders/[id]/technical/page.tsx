'use client';
import { Alert, Button, Card, DescriptionList, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ScoreForm, TenderTabs, useTender } from '@/components/Tenders';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 070 — Technical Evaluation (technical envelopes only; commercial stays sealed). */
export default function TechnicalEvaluation() {
  const t = useTender();
  const d = t.data;
  const q = useQuery<any>(d ? `/tenders/${t.id}/technical` : null);
  const score = useMutation(async (bidId: string, s: number, comment: string) => { await api.post(`/tenders/${t.id}/bids/${bidId}/scores`, { kind: 'technical', score: s, comment }); q.reload(); return bidId; });
  const complete = useMutation(async () => { const r = await api.post<any>(`/tenders/${t.id}/technical/complete`); t.reload(); q.reload(); return r; });
  if (t.loading) return <Screen id="070"><LoadingState /></Screen>;
  if (t.error) return <Screen id="070"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  return (
    <Screen id="070" title={d.title}>
      <TenderTabs t={d} />
      {q.loading || (!q.data && !q.error) ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Alert tone="info">Technical pass mark: {q.data.minTechScore}. Commercial envelopes stay sealed until technical evaluation is complete and are opened only for bids that pass. Scores are final once recorded.</Alert>
          {complete.error && <Alert tone="danger">{complete.error}</Alert>}
          {complete.data && <Alert tone="success">Technical evaluation complete: {complete.data.results.filter((r: any) => r.qualified).length} of {complete.data.results.length} bids qualified.</Alert>}
          {q.data.bids.map((b: any) => (
            <Card key={b.id} title={b.bidder} actions={<StatusBadge status={b.status} />}>
              <section aria-label={`Technical envelope — ${b.bidder}`}>
                <DescriptionList items={[
                  ['Approach', <span style={{ whiteSpace: 'pre-wrap' }}>{b.technical.approach}</span> ],
                  ['Experience', b.technical.experience ],
                  ['Timeline', `${b.technical.timelineWeeks} weeks` ],
                  ...(b.technical.team ? [['Team', b.technical.team] as [string, React.ReactNode]] : []),
                  ['Average score', b.average == null ? 'Not scored yet' : `${b.average} (${b.scored}/${q.data.evaluatorCount} evaluators)` ],
                ]} />
              </section>
              {b.scores.map((s: any) => <p key={s.evaluator} className="cz-muted" style={{ fontSize: 13 }}>{s.evaluator}: <strong>{s.score}</strong> — {s.comment}</p>)}
              {q.data.canScore && !b.myScore && b.status === 'opened' && <ScoreForm label={`Score ${b.bidder}`} pending={score.pending} error={score.error} onSubmit={(s, c) => score.run(b.id, s, c)} />}
            </Card>
          ))}
          {d.canManage && d.status === 'technical_evaluation' && <Button onClick={() => complete.run()} loading={complete.pending}>Complete technical evaluation</Button>}
        </>
      )}
    </Screen>
  );
}
