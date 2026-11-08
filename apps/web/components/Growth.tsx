'use client';
/** Stage 14 shared pieces: score ring, star ratings, factor bars and money formatting. */
import { Icon } from '@collabiz/ui';

export interface Score { score: number | null; tier: 'unrated' | 'emerging' | 'trusted' | 'excellent'; sampleSize: number; components: { onTimeRate: number | null; quality: number | null; settlement: number | null; reviews: number | null }; outcomes: number; onTimeOutcomes: number; publishedReviews: number; excludedReviews: number }
export const TIER: Record<string, { label: string; tone: string; note: string }> = {
  unrated: { label: 'Not yet rated', tone: 'neutral', note: 'A score appears after the first certified milestone.' },
  emerging: { label: 'Emerging', tone: 'info', note: 'Building a verified track record.' },
  trusted: { label: 'Trusted', tone: 'success', note: 'Consistent, verified delivery.' },
  excellent: { label: 'Excellent', tone: 'success', note: 'Outstanding verified delivery across many jobs.' },
};

export function ScoreRing({ score, size = 132, label = 'Reputation score' }: { score: number | null; size?: number; label?: string }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="cz-ring" style={{ width: size, height: size }} role="img" aria-label={score == null ? `${label}: not yet rated` : `${label}: ${score} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cz-grey-100)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={score == null ? 'var(--cz-grey-300)' : score >= 85 ? 'var(--cz-green-600)' : score >= 70 ? 'var(--cz-navy-700)' : 'var(--cz-warning)'} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="cz-ring-value">{score ?? '—'}<small>{score == null ? 'unrated' : 'of 100'}</small></span>
    </div>
  );
}

export function Stars({ value, label }: { value: number; label?: string }) {
  return <span className="cz-stars" role="img" aria-label={`${label ? `${label}: ` : ''}${value.toFixed(1)} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n} data-on={value >= n - 0.25 || undefined}>★</span>)}</span>;
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="cz-rate-row"><span>{label}</span>
      <div role="radiogroup" aria-label={label} className="cz-rate">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} data-on={value >= n || undefined} onClick={() => onChange(n)}>★</button>)}</div>
    </div>
  );
}

export function Factor({ label, value, detail, weight }: { label: string; value: number | null; detail: string; weight?: number }) {
  return (
    <div className="cz-factor">
      <div className="cz-factor-top"><span>{label}{weight ? <span className="cz-muted"> · {weight}% of score</span> : null}</span><strong>{value == null ? '—' : `${Math.round(value * 100)}%`}</strong></div>
      <div className="cz-factor-track" aria-hidden><span style={{ width: `${value == null ? 0 : Math.round(value * 100)}%` }} /></div>
      <p className="cz-muted">{detail}</p>
    </div>
  );
}

export function MatchFactors({ factors }: { factors: { factor: string; weight: number; score: number; detail: string }[] }) {
  return (
    <ul className="cz-match-factors">
      {factors.map((f) => <li key={f.factor}><Icon name={f.score >= 0.7 ? 'check' : f.score > 0 ? 'alert' : 'cross'} size={14} /><span><strong>{f.factor}</strong> {f.detail}</span></li>)}
    </ul>
  );
}

export const inr = (minor?: number | null) => {
  if (minor == null) return null;
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};
export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
