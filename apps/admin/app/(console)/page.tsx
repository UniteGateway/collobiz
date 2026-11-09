'use client';
import { Card, DescriptionList, Grid, Kpi, LoadingState, PageHeader, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Summary { failed24h: number; locked: number; admins_without_mfa: number; suspended: number }

/** Admin home. Becomes screen 127 (Group Admin Executive Dashboard) with business KPIs in Stage 16; Stage 02 shows security posture. */
export default function AdminHome() {
  const { me } = useSession();
  const sec = useQuery<Summary>(me?.capabilities.includes('audit.read') ? '/admin/security/summary' : null);
  const chain = useQuery<{ intact: boolean; checked: number }>(me?.capabilities.includes('audit.read') ? '/admin/audit/verify' : null);
  return (
    <div>
      <PageHeader title="Group administration" breadcrumb="Unite Group Administration" description={`Signed in as ${me?.fullName} · ${(me?.platformRoles ?? []).map((r: string) => r.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())).join(', ')}`} />
      {sec.loading ? <LoadingState /> : sec.error ? <ApiErrorView error={sec.error} onRetry={sec.reload} /> : sec.data && (
        <Grid cols={4}>
          <Kpi label="Failed sign-ins (24 h)" value={sec.data.failed24h} />
          <Kpi label="Locked accounts" value={sec.data.locked} />
          <Kpi label="Admins without MFA" value={sec.data.admins_without_mfa} accent={sec.data.admins_without_mfa === 0} />
          <Kpi label="Suspended users" value={sec.data.suspended} />
        </Grid>
      )}
      {chain.data && (
        <Card title="Audit trail integrity">
          <DescriptionList items={[['Hash chain', <StatusBadge key="c" status={chain.data.intact ? 'verified' : 'breach'} label={chain.data.intact ? 'Intact' : 'Broken'} />], ['Events checked', chain.data.checked]]} />
        </Card>
      )}
    </div>
  );
}
