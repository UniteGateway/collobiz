'use client';
import Link from 'next/link';
import { Alert, Card, EmptyState, FactorBars, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { OpportunityCard } from '@/components/Opportunities';
import { useQuery } from '@/lib/hooks';

/** Screen 025 — Recommended Business Feed (explainable, consent-gated, human decides). */
export default function FeedPage() {
  const q = useQuery<{ consent: boolean; items: any[] }>('/me/feed');
  return (
    <Screen id="025" description="Opportunities ranked against your declared sectors, coverage, capacity and certifications. Each recommendation shows why — you decide whether to act.">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data!.consent ? (
        <Alert tone="info">Recommendations are off because matching consent is withdrawn. <Link href="/settings/privacy">Change in Privacy settings</Link>.</Alert>
      ) : !q.data!.items.length ? <EmptyState title="No strong matches right now">Update your industries and coverage to improve recommendations.</EmptyState> : q.data!.items.map((it) => (
        <Card key={it.opportunity.id}>
          <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
            <OpportunityCard o={it.opportunity} />
            <div>
              <div className="cz-row" style={{ justifyContent: 'space-between' }}><strong>Match {it.match.score}/100</strong><StatusBadge status={it.match.confidence} tone={it.match.confidence === 'high' ? 'success' : it.match.confidence === 'medium' ? 'warning' : 'neutral'} label={`${it.match.confidence} confidence`} /></div>
              <FactorBars factors={it.match.factors} />
              {it.match.uncertainty.length > 0 && <p className="cz-muted" style={{ fontSize: 12 }}>Uncertainty: {it.match.uncertainty.join('; ')}</p>}
              <p className="cz-muted" style={{ fontSize: 12 }}>{it.match.disclaimer}</p>
            </div>
          </div>
        </Card>
      ))}
    </Screen>
  );
}
