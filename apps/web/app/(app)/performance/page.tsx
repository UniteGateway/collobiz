'use client';
import Link from 'next/link';
import { EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Factor, ScoreRing, Stars, TIER, fmtDate, type Score } from '@/components/Growth';
import { useQuery } from '@/lib/hooks';

interface Mine { score: Score; outcomes: { id: string; title: string; project: string; projectCode: string; certifiedAt: string; dueDate: string; onTime: boolean }[]; reviews: { id: string; quality: number; timeliness: number; communication: number; status: string; reviewer: string }[]; reviewable: unknown[]; tips: string[] }

/** Screen 029 — Partner performance scorecard: the score, what it is made of, and the verified evidence behind it. */
export default function Performance() {
  const q = useQuery<Mine>('/reputation/me');
  const d = q.data;
  const s = d?.score;
  const avg = (d?.reviews ?? []).filter((r) => r.status === 'published');
  const reviewAvg = avg.length ? avg.reduce((t, r) => t + (r.quality + r.timeliness + r.communication) / 3, 0) / avg.length : null;
  return (
    <Screen id="029" title="Performance" description="Your reputation is calculated only from verified outcomes and reviews from companies you worked with. It can’t be bought or boosted.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d || !s ? <Skeleton height={260} /> : (
        <div className="cz-perf">
          <div className="cz-stack" style={{ gap: 16 }}>
          <section className="cz-card cz-perf-hero" aria-label="Reputation score">
            <ScoreRing score={s.score} />
            <div>
              <StatusBadge status={s.tier} tone={TIER[s.tier].tone as never} label={TIER[s.tier].label} />
              <h2>{s.score == null ? 'Your score starts with your first certified milestone' : `${s.score} out of 100`}</h2>
              <p className="cz-muted">{TIER[s.tier].note} Based on {s.outcomes} certified milestone{s.outcomes === 1 ? '' : 's'} and {s.publishedReviews} published review{s.publishedReviews === 1 ? '' : 's'}.{s.excludedReviews ? ` ${s.excludedReviews} review under appeal is not counted.` : ''}</p>
              <div className="cz-row" style={{ gap: 8, marginTop: 12 }}><Link href="/reputation/excellence" className="cz-btn cz-btn-secondary cz-btn-sm">See your next level</Link><Link href="/reputation/reviews" className="cz-btn cz-btn-ghost cz-btn-sm">Reviews</Link></div>
            </div>
          </section>
          {d.tips.length > 0 && (
            <section className="cz-card cz-perf-tips" aria-labelledby="tips-h">
              <h2 id="tips-h" className="cz-help-h">How to improve</h2>
              <ul>{d.tips.map((t) => <li key={t}><Icon name="info" size={16} />{t}</li>)}</ul>
            </section>
          )}
          </div>
          <section className="cz-card" aria-labelledby="parts-h">
            <h2 id="parts-h" className="cz-help-h">What makes up your score</h2>
            <div className="cz-factors">
              <Factor label="On-time delivery" weight={35} value={s.components.onTimeRate} detail={`${s.onTimeOutcomes} of ${s.outcomes} milestones certified by their due date`} />
              <Factor label="Quality" weight={30} value={s.components.quality == null ? null : (s.components.quality - 1) / 4} detail="From reviewers’ quality ratings on certified projects" />
              <Factor label="Settlement conduct" weight={15} value={s.components.settlement == null ? null : (s.components.settlement - 1) / 4} detail={s.components.settlement == null ? 'Not enough settled payments yet' : 'Invoices and payments handled as agreed'} />
              <Factor label="Reviews" weight={20} value={s.components.reviews == null ? null : (s.components.reviews - 1) / 4} detail={reviewAvg == null ? 'No published reviews yet' : `Average ${reviewAvg.toFixed(1)} of 5 from ${avg.length} review${avg.length === 1 ? '' : 's'}`} />
            </div>
            <p className="cz-muted" style={{ fontSize: 12.5, marginTop: 12 }}>Small samples are pulled towards a neutral score, so a single job can’t produce 100.</p>
          </section>
          <section className="cz-card" aria-labelledby="ev-h" style={{ gridColumn: '1 / -1' }}>
            <div className="cz-card-head"><h2 id="ev-h">Verified outcomes</h2>{reviewAvg != null && <span className="cz-row" style={{ gap: 6 }}><Stars value={reviewAvg} label="Average review" /><span className="cz-muted">{reviewAvg.toFixed(1)}</span></span>}</div>
            {!d.outcomes.length ? <EmptyState icon="projects" title="No certified milestones yet">When a client certifies a milestone you delivered, it appears here and counts towards your score.</EmptyState> : (
              <div className="cz-ta-table-wrap">
                <table className="cz-ta-table">
                  <caption className="cz-sr-only">Certified milestones</caption>
                  <thead><tr><th scope="col">Milestone</th><th scope="col">Project</th><th scope="col">Due</th><th scope="col">Certified</th><th scope="col">Result</th></tr></thead>
                  <tbody>{d.outcomes.map((o) => <tr key={o.id}><td><strong>{o.title}</strong></td><td><span className="cz-mono cz-muted" style={{ fontSize: 12 }}>{o.projectCode}</span><div>{o.project}</div></td><td className="cz-ta-date">{fmtDate(o.dueDate)}</td><td className="cz-ta-date">{fmtDate(o.certifiedAt)}</td><td><StatusBadge status={o.onTime ? 'on_time' : 'late'} tone={o.onTime ? 'success' : 'warning'} label={o.onTime ? 'On time' : 'Late'} /></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </Screen>
  );
}
