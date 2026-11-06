'use client';
import { useParams } from 'next/navigation';
import { Alert, Card, DescriptionList, Kpi, Grid, LoadingState, ProgressBar, StatusBadge, Stepper } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { useQuery } from '@/lib/hooks';

const STEPS = ['Submitted', 'Consent check', 'Duplicate review', 'Verified', 'Unite first review', 'Decision'];
const IDX: Record<string, number> = { submitted: 0, consent_check: 1, duplicate_review: 2, verified: 3, unite_priority_review: 4, accepted: 6, released: 6, rejected: 6 };
const hm = (m: number) => `${Math.floor(m / 60)} h ${m % 60} min`;
/** Show SLA times in the review calendar's time zone (not the viewer's browser zone). */
const inTz = (d: string, tz: string) => new Date(d).toLocaleString('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' });

/** Screen 050 — Unite First-Review Status (atlas: mobile-first). Business-hours SLA timer with pauses. */
export default function ReviewStatus() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}`);
  if (q.loading) return <Screen id="050"><LoadingState /></Screen>;
  if (q.error) return <Screen id="050"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const { opportunity: o, routing: r } = q.data;
  return (
    <Screen id="050" title={`First review — ${o.code}`}>
      <LeadTabs id={id} />
      <Card><Stepper steps={STEPS} current={IDX[o.status] ?? 0} /></Card>
      {!r ? <Alert tone="info">The Unite Group first review starts once the lead is verified.</Alert> : (
        <>
          {r.breached && <Alert tone="warning">The review window has passed. The lead has been escalated to the category owner and central operations.</Alert>}
          {r.paused && <Alert tone="info" title="Review paused:">{r.pauseReason}</Alert>}
          {r.decision && <Alert tone={r.decision === 'reject' ? 'danger' : 'success'} title={`Decision: ${r.decision}.`}>{r.reason}</Alert>}
          <Grid cols={3}>
            <Kpi label="Review window" value={hm(r.slaMinutes)} hint="Business hours" />
            <Kpi label={r.decision ? 'Decided' : 'Time remaining'} value={r.decision ? inTz(r.decidedAt, r.timezone) : hm(r.remainingMinutes)} accent={!r.breached} />
            <Kpi label="Due" value={inTz(r.dueAt, r.timezone)} hint={r.timezone} />
          </Grid>
          {!r.decision && <div style={{ marginTop: 12 }}><ProgressBar value={(r.elapsedMinutes / r.slaMinutes) * 100} label="Review window used" /></div>}
          <Card title="Details">
            <DescriptionList items={[['Reviewer', o.groupCompany], ['Started', `${inTz(r.startAt, r.timezone)} (${r.timezone})`], ['Urgent workflow', r.urgent ? 'Yes' : 'No'], ['Escalated', r.escalatedAt ? new Date(r.escalatedAt).toLocaleString() : 'No'], ['Status', <StatusBadge key="s" status={o.status} />]]} />
            <p className="cz-muted" style={{ fontSize: 13 }}>The review window is a service target, not a guaranteed entitlement. Unite Group may accept, release (to approved partners if the buyer consented) or reject with reasons.</p>
          </Card>
        </>
      )}
    </Screen>
  );
}
