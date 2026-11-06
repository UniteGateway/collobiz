'use client';
import Link from 'next/link';
import { Alert, ButtonLink, Card, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Screen 151 — Lead Protection Dashboard. */
export default function LeadProtection() {
  const q = useQuery<any>('/leads/protection-summary');
  if (q.loading) return <Screen id="151"><LoadingState /></Screen>;
  if (q.error) return <Screen id="151"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const d = q.data;
  return (
    <Screen id="151" actions={<><ButtonLink href="/my/leads" variant="secondary">All leads</ButtonLink><ButtonLink href="/leads/new" variant="accent">Register a lead</ButtonLink></>}>
      <Grid cols={4}>
        <Kpi label="Protected" value={d.protected} accent />
        <Kpi label="Awaiting verification" value={d.pending} />
        <Kpi label="In Unite first review" value={d.inUniteReview} />
        <Kpi label="Contested" value={d.contested} />
      </Grid>
      <div style={{ marginTop: 16 }}><Grid cols={4}><Kpi label="Released to partners" value={d.released} /><Kpi label="Rejected" value={d.rejected} /><Kpi label="Expired" value={d.expired} /><Kpi label="Open disputes" value={d.openDisputes} /></Grid></div>
      {d.openDisputes > 0 && <Alert tone="warning">You have {d.openDisputes} open ownership dispute(s). <Link href="/lead-disputes">Respond with evidence</Link></Alert>}
      <Card title="Protection expiring within 14 days">
        {!d.expiringSoon.length ? <p className="cz-muted">Nothing expiring soon.</p> : d.expiringSoon.map((l: any) => (
          <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--cz-grey-100)' }}><Link href={`/leads/${l.id}/certificate`}>{l.code} — {l.title}</Link> <span className="cz-muted">expires {new Date(l.protectedUntil).toLocaleDateString()}</span></div>
        ))}
      </Card>
    </Screen>
  );
}
