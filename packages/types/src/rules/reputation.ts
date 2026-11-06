/**
 * Verified partner reputation — §4.2: verified job history, quality, on-time delivery, settlement conduct,
 * moderated feedback and appeal. Only verified outcomes and published (moderated) reviews count.
 * Paid placement never influences the score (§1.4).
 */
export interface ReputationEvent {
  kind: 'verified_outcome' | 'review';
  onTime?: boolean;
  quality?: number; // 1-5
  settlementConduct?: number; // 1-5
  rating?: number; // 1-5 (reviews)
  status: 'counted' | 'excluded'; // excluded = under appeal / rejected / unverified
}
export interface ReputationScore {
  score: number | null;
  sampleSize: number;
  components: { onTimeRate: number | null; quality: number | null; settlement: number | null; reviews: number | null };
  tier: 'unrated' | 'emerging' | 'trusted' | 'excellent';
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeReputation(events: ReputationEvent[]): ReputationScore {
  const ev = events.filter((e) => e.status === 'counted');
  const outcomes = ev.filter((e) => e.kind === 'verified_outcome');
  const reviews = ev.filter((e) => e.kind === 'review' && e.rating != null);
  const onTimeRate = outcomes.filter((o) => o.onTime != null).length
    ? outcomes.filter((o) => o.onTime).length / outcomes.filter((o) => o.onTime != null).length : null;
  const quality = avg(outcomes.filter((o) => o.quality != null).map((o) => o.quality!));
  const settlement = avg(outcomes.filter((o) => o.settlementConduct != null).map((o) => o.settlementConduct!));
  const reviewAvg = avg(reviews.map((r) => r.rating!));
  const parts: [number | null, number][] = [
    [onTimeRate, 35], [quality == null ? null : (quality - 1) / 4, 30], [settlement == null ? null : (settlement - 1) / 4, 15], [reviewAvg == null ? null : (reviewAvg - 1) / 4, 20],
  ];
  const present = parts.filter(([v]) => v != null) as [number, number][];
  const sampleSize = outcomes.length + reviews.length;
  if (!present.length || outcomes.length === 0) {
    return { score: null, sampleSize, components: { onTimeRate, quality, settlement, reviews: reviewAvg }, tier: 'unrated' };
  }
  const w = present.reduce((s, [, wt]) => s + wt, 0);
  const raw = present.reduce((s, [v, wt]) => s + v * wt, 0) / w;
  // Shrink toward neutral 0.6 for small samples so 1 job can't produce 100.
  const k = 3;
  const score = Math.round(((raw * outcomes.length + 0.6 * k) / (outcomes.length + k)) * 100);
  const tier = score >= 85 && outcomes.length >= 5 ? 'excellent' : score >= 70 && outcomes.length >= 2 ? 'trusted' : 'emerging';
  return { score, sampleSize, components: { onTimeRate, quality, settlement, reviews: reviewAvg }, tier };
}
