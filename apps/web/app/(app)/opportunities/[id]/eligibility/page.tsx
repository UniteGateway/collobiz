'use client';
import { useParams } from 'next/navigation';
import { Alert, ButtonLink, Card, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 041 — Opportunity Eligibility Checker (the server applies the same checks on apply). */
export default function EligibilityPage() {
  const { id } = useParams<{ id: string }>();
  const opp = useQuery<any>(`/opportunities/${id}`);
  const q = useQuery<{ eligible: boolean; checks: { key: string; label: string; result: string; detail: string }[] }>(`/opportunities/${id}/eligibility`);
  return (
    <Screen id="041" description={opp.data ? `${opp.data.code} · ${opp.data.title}` : undefined}>
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <Card>
          {q.data!.eligible ? <Alert tone="success">You meet all mandatory requirements.</Alert> : <Alert tone="warning">You can’t apply yet — resolve the failed checks below.</Alert>}
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {q.data!.checks.map((c) => (
              <li key={c.key} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--cz-grey-100)' }} data-check={c.key}>
                <StatusBadge status={c.result} tone={c.result === 'pass' ? 'success' : c.result === 'warn' ? 'warning' : 'danger'} label={c.result === 'pass' ? 'Pass' : c.result === 'warn' ? 'Note' : 'Fail'} />
                <div><strong>{c.label}</strong><div className="cz-muted" style={{ fontSize: 13 }}>{c.detail}</div></div>
              </li>
            ))}
          </ul>
          <div className="cz-row">
            {q.data!.eligible && <ButtonLink href={`/opportunities/${id}/apply`} variant="accent">Continue to application</ButtonLink>}
            <ButtonLink href={`/opportunities/${id}`} variant="secondary">Back to opportunity</ButtonLink>
          </div>
        </Card>
      )}
    </Screen>
  );
}
