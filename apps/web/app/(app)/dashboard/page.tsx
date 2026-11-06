'use client';
import Link from 'next/link';
import { Alert, ButtonLink, Card, DescriptionList, Grid, Kpi, LoadingState, StatusBadge, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Activity { id: string; at: string; action: string; actorName: string | null }

/** Screen 023 — Partner Home Dashboard: verification, real pipeline KPIs, recommendations, activity. */
export default function DashboardPage() {
  const { me } = useSession();
  const org = me?.activeOrg;
  const dash = useQuery<any>(org ? '/me/dashboard' : null);
  const activity = useQuery<Activity[]>(org ? '/orgs/current/activity' : null, { limit: 8 });
  if (!me) return <Screen id="023"><LoadingState /></Screen>;
  return (
    <Screen id="023" title={`Welcome, ${me.fullName.split(' ')[0]}`} actions={org && <><ButtonLink href="/marketplace" variant="secondary">Browse opportunities</ButtonLink><ButtonLink href="/leads/new" variant="accent">Register a lead</ButtonLink></>}>
      {!me.emailVerified && <Alert tone="warning" title="Verify your email.">Some actions stay locked until your email is verified. <Link href="/verify">Verify now</Link></Alert>}
      {!org ? (
        <Card title="Start partner onboarding"><p>Create your partner profile to browse opportunities, register protected leads and collaborate.</p><ButtonLink href="/onboarding/account-type" variant="accent">Choose account type</ButtonLink></Card>
      ) : (
        <>
          {org.verificationStatus !== 'verified' && <Alert tone="info">Verification: <StatusBadge status={org.verificationStatus} /> — <Link href="/onboarding/status">view status</Link>. Applying and lead registration unlock once verified.</Alert>}
          {dash.loading ? <LoadingState /> : dash.error ? <ApiErrorView error={dash.error} onRetry={dash.reload} /> : dash.data && (
            <Grid cols={4}>
              <Kpi label="Active applications" value={dash.data.applications.total} />
              <Kpi label="Shortlisted / accepted" value={`${dash.data.applications.shortlisted} / ${dash.data.applications.accepted}`} accent />
              <Kpi label="Recommended for you" value={dash.data.recommended} />
              <Kpi label="Unread alerts" value={dash.data.unreadNotifications} />
            </Grid>
          )}
          <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
            <Card title="Top recommendations" actions={<Link href="/feed">See all</Link>}>
              {dash.data?.topRecommendations?.length ? dash.data.topRecommendations.map((r: any) => (
                <div key={r.opportunity.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--cz-grey-100)' }}><Link href={`/opportunities/${r.opportunity.id}`}>{r.opportunity.title}</Link> <span className="cz-muted">· match {r.match.score}</span></div>
              )) : <p className="cz-muted">No recommendations yet.</p>}
            </Card>
            <Card title="Organization">
              <DescriptionList items={[['Name', org.name], ['Level', org.membershipLevel], ['Verification', <StatusBadge key="v" status={org.verificationStatus} />], ['Your role', me.orgRoles.map((r) => r.replace('org_', '')).join(', ')], ['MFA', me.mfaEnabled ? 'Enabled' : 'Not enabled']]} />
            </Card>
          </div>
          <Card title="Recent activity">
            {activity.loading ? <LoadingState /> : <Timeline items={(activity.data ?? []).map((a) => ({ id: a.id, at: a.at, title: a.action.replace(/[._]/g, ' '), detail: a.actorName ?? undefined }))} />}
          </Card>
        </>
      )}
    </Screen>
  );
}
