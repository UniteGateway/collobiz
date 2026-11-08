'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Factor, ScoreRing, Stars, TIER, fmtDate, type Score } from '@/components/Growth';
import { useQuery } from '@/lib/hooks';

interface Profile { id: string; name: string; city: string | null; levelName: string; memberSince: string; isMe: boolean; score: Score; certifications: { title: string; level: string; holders: number }[]; reviews: { id: string; reviewer: string; quality: number; timeliness: number; communication: number; comment: string; response: string | null; createdAt: string }[] }

/** Screen 163 — Partner reputation profile, as other partners see it. */
export default function ReputationProfile() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Profile>(`/reputation/orgs/${id}`);
  const p = q.data;
  return (
    <Screen id="163" title={p?.name ?? 'Reputation'} header={false}>
      <Link href={`/partners/${id}`} className="cz-od-back"><Icon name="prev" size={16} />Partner profile</Link>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <Skeleton height={300} /> : (
        <>
          <header className="cz-rep-hero">
            <ScoreRing score={p.score.score} size={112} />
            <div>
              <h1 className="cz-od-title" style={{ fontSize: 30 }}>{p.name}</h1>
              <p className="cz-od-sub"><span><Icon name="verify" size={15} />{p.levelName}</span>{p.city && <span><Icon name="location" size={15} />{p.city}</span>}<span><Icon name="calendar" size={15} />Member since {new Date(p.memberSince).getFullYear()}</span></p>
              <StatusBadge status={p.score.tier} tone={TIER[p.score.tier].tone as never} label={TIER[p.score.tier].label} />
              {p.isMe && <p className="cz-muted" style={{ fontSize: 13 }}>This is how other partners see your company.</p>}
            </div>
          </header>
          <div className="cz-perf">
            <section className="cz-card" aria-labelledby="rec-h">
              <h2 id="rec-h" className="cz-help-h">Verified record</h2>
              <dl className="cz-sheet-facts" style={{ marginBottom: 16 }}>
                <div><dt>Certified milestones</dt><dd>{p.score.outcomes}</dd></div>
                <div><dt>On time</dt><dd>{p.score.outcomes ? `${p.score.onTimeOutcomes} of ${p.score.outcomes}` : '—'}</dd></div>
              </dl>
              <Factor label="On-time delivery" value={p.score.components.onTimeRate} detail="Milestones certified by their due date" />
              <Factor label="Reviews" value={p.score.components.reviews == null ? null : (p.score.components.reviews - 1) / 4} detail={`${p.score.publishedReviews} published review${p.score.publishedReviews === 1 ? '' : 's'}`} />
            </section>
            <section className="cz-card" aria-labelledby="cert-h">
              <h2 id="cert-h" className="cz-help-h">COLLABIZ certifications</h2>
              {!p.certifications.length ? <p className="cz-muted">No current certifications.</p> : <ul className="cz-cert-mini">{p.certifications.map((c) => <li key={c.title}><Icon name="award" size={16} /><span><strong>{c.title}</strong><span className="cz-muted">{c.holders} team member{c.holders === 1 ? '' : 's'} · {c.level}</span></span></li>)}</ul>}
            </section>
            <section aria-labelledby="rv-h" style={{ gridColumn: '1 / -1' }}>
              <h2 id="rv-h" className="cz-help-h">Reviews from companies they worked with</h2>
              {!p.reviews.length ? <div className="cz-card"><EmptyState icon="award" title="No reviews yet" /></div> : (
                <ul className="cz-review-list">
                  {p.reviews.map((r) => { const avg = (r.quality + r.timeliness + r.communication) / 3; return (
                    <li key={r.id} className="cz-card cz-review">
                      <div className="cz-review-head"><strong>{r.reviewer}</strong><span className="cz-muted">{fmtDate(r.createdAt)}</span></div>
                      <div className="cz-review-scores"><span><Stars value={avg} /> {avg.toFixed(1)}</span><span className="cz-muted">Quality {r.quality} · Timeliness {r.timeliness} · Communication {r.communication}</span></div>
                      <p>{r.comment}</p>
                      {r.response && <blockquote className="cz-review-reply"><strong>Reply from {p.name}</strong>{r.response}</blockquote>}
                    </li>); })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </Screen>
  );
}
