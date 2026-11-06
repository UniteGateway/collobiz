'use client';
import { SCREENS, SCREEN_STATUS } from '@collabiz/types';
import { Card, DescriptionList, ErrorState, Grid, Kpi, LoadingState, Logo, StatusBadge } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

/** Platform status page (no auth): API health and build progress. Supports operations runbooks. */
export default function StatusPage() {
  const health = useQuery<{ status: string; checks: Record<string, string>; version: string; time: string }>('/health');
  const done = SCREENS.filter((s) => ['implemented', 'verified'].includes(SCREEN_STATUS[s.id]?.status ?? '')).length;
  return (
    <main id="main" className="cz-container cz-section">
      <div style={{ background: 'var(--cz-navy-900)', padding: 12, borderRadius: 12, display: 'inline-block', marginBottom: 16 }}><Logo label="collabiz admin" href="/" /></div>
      <h1>Platform status</h1>
      <Grid cols={3}>
        <Kpi label="Screens implemented" value={`${done} / 165`} accent />
        <Kpi label="API status" value={health.data?.status ?? '…'} />
        <Kpi label="API version" value={health.data?.version ?? '…'} />
      </Grid>
      <Card title="Dependencies">
        {health.loading ? <LoadingState /> : health.error ? <ErrorState error={health.error} onRetry={health.reload} /> : (
          <DescriptionList items={Object.entries(health.data!.checks).map(([k, v]) => [k, <StatusBadge key={k} status={v} tone={v === 'ok' ? 'success' : v === 'skipped' ? 'neutral' : 'danger'} />])} />
        )}
      </Card>
    </main>
  );
}
