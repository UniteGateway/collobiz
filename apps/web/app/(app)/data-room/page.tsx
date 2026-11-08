'use client';
import { Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 125 — Investor opportunity data room. Switched off until regulatory review; this page says so plainly. */
export default function DataRoom() {
  const q = useQuery<{ featureDisabled?: boolean; reason?: string }>('/data-room');
  return (
    <Screen id="125" title="Investor data room" description="A secure room for investment opportunities, for approved investors only.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : (
        <section className="cz-card cz-ai-start" aria-label="Status">
          <span className="cz-od-route-icon"><Icon name="lock" size={20} /></span>
          <div><strong>Not available yet</strong><p className="cz-muted">{q.data.reason}</p></div>
        </section>
      )}
    </Screen>
  );
}
