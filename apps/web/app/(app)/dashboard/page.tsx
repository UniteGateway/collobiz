'use client';
import { Alert, ButtonLink, Card, DescriptionList, Grid, Kpi, StatusBadge, Timeline, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Activity { id: string; at: string; action: string; objectType: string; actorName: string | null; reason: string | null }

/** Screen 023 — Partner Home Dashboard. Stage 02 baseline (identity, tenant, verification, activity); KPIs added in Stage 05+. */
export default function DashboardPage() {
  const { me } = useSession();
  const activity = useQuery<Activity[]>(me?.activeOrg ? '/orgs/current/activity' : null, { limit: 10 });
  if (!me) return <Screen id="023"><LoadingState /></Screen>;
  const org = me.activeOrg;
  return (
    <Screen id="023" title={`Welcome, ${me.fullName.split(' ')[0]}`}>
      {!me.emailVerified && <Alert tone="warning" title="Verify your email.">Some actions stay locked until your email is verified. <a href="/verify">Verify now</a></Alert>}
      {!org && (
        <Card title="Start partner onboarding">
          <p>Create your individual or company partner profile to browse opportunities, register protected leads and collaborate.</p>
          <ButtonLink href="/onboarding/account-type" variant="accent">Choose account type</ButtonLink>
        </Card>
      )}
      {org && (
        <>
          <Grid cols={3}>
            <Kpi label="Verification" value={<StatusBadge status={org.verificationStatus} />} />
            <Kpi label="Membership level" value={org.membershipLevel.replace('_', ' ')} accent />
            <Kpi label="Your role" value={me.orgRoles.map((r) => r.replace('org_', '')).join(', ') || '—'} />
          </Grid>
          <div className="cz-grid cz-grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
            <Card title="Organization">
              <DescriptionList items={[['Name', org.name], ['Type', org.type.replace('partner_', '')], ['Verification', <StatusBadge key="v" status={org.verificationStatus} />], ['MFA', me.mfaEnabled ? 'Enabled' : 'Not enabled']]} />
              <div className="cz-row" style={{ marginTop: 12 }}>
                <ButtonLink href="/company/team" variant="secondary" size="sm">Manage team</ButtonLink>
                <ButtonLink href="/settings/security" variant="secondary" size="sm">Security</ButtonLink>
              </div>
            </Card>
            <Card title="Recent activity">
              {activity.loading ? <LoadingState /> : activity.error ? <ApiErrorView error={activity.error} onRetry={activity.reload} /> : (
                <Timeline items={(activity.data ?? []).map((a) => ({ id: a.id, at: a.at, title: a.action.replace(/[._]/g, ' '), detail: a.actorName ?? undefined }))} />
              )}
            </Card>
          </div>
        </>
      )}
    </Screen>
  );
}
