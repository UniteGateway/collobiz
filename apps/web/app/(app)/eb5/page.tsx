'use client';
import Link from 'next/link';
import { ButtonLink, Card, Grid, Kpi, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ChartCard, HBarChart } from '@/components/Charts';
import { Badge, Eb5Notice, MfaHint, useEb5, usd } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface Dash {
  staffView: boolean;
  leads: { total: number; newThisWeek: number; active: number; byStage: { name: string; n: number }[]; partnerIntroductions: number; possibleDuplicates: number };
  consultations: { upcoming: number; done: number } | null; agreements: { issued: number; signed: number } | null; applications: { submitted: number } | null;
  collections: { verifiedCents: number; pendingCents: number } | null; tasks: { open: number; overdue: number }; gates: { label: string; approved: boolean }[]; note: string;
}

/** GO EB5 — consultancy operations dashboard (real records only, scoped to the viewer's role). */
export default function Eb5Dashboard() {
  const { me, has } = useEb5();
  const q = useQuery<Dash>('/eb5/dashboard');
  const d = q.data;
  return (
    <Screen page={{ key: 'eb5', title: 'GO EB5 · Consultancy operations', access: 'authenticated' }} eyebrow="GO EB5 · CITRUS360 LLC"
      description="EB-5 consultancy, partner referrals and client management. Every figure comes from records on COLLABIZ."
      actions={<>{has('lead.introduce', 'bd_partner', 'referral_consultant', 'business_manager', 'citrus_admin') && <ButtonLink href="/eb5/leads/new" variant="accent">New lead</ButtonLink>}{has('client') && <ButtonLink href="/eb5/portal" variant="secondary">My EB-5 portal</ButtonLink>}</>}>
      <MfaHint me={me} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : <>
        <Grid cols={4}>
          <Kpi label="New enquiries (7 days)" value={d.leads.newThisWeek} hint={`${d.leads.total} leads in total`} href="/eb5/leads" />
          <Kpi label="Active clients" value={d.leads.active} hint="Contacted and not closed" />
          <Kpi label="Consultations" value={d.consultations ? d.consultations.upcoming : '—'} hint={d.consultations ? `${d.consultations.done} completed` : 'Staff only'} href="/eb5/consultations" />
          <Kpi label="Verified collections" value={d.collections ? usd(d.collections.verifiedCents) : '—'} accent hint={d.collections ? `${usd(d.collections.pendingCents)} invoiced, not yet verified` : 'Finance and managers only'} />
        </Grid>
        <div className="cz-chart-row">
          <ChartCard title="Leads by pipeline stage" subtitle="Duplicates under ownership review are excluded">
            <HBarChart caption="Leads by pipeline stage" data={d.leads.byStage.filter((s) => s.n > 0).map((s) => ({ label: s.name, value: s.n }))} />
          </ChartCard>
          <Card title="Legal approvals" subtitle="Agreements, invoices and partner compensation stay switched off until each is approved">
            <ul className="cz-eb5-gates">{d.gates.map((g) => <li key={g.label}><span>{g.label}</span><Badge s={g.approved ? 'approved' : 'pending'} label={g.approved ? 'Approved' : 'Not approved'} /></li>)}</ul>
            {has('compliance', 'super_admin') && <p style={{ marginBottom: 0 }}><Link href="/eb5/settings">Record an approval</Link></p>}
          </Card>
        </div>
        <Grid cols={4}>
          <Kpi label="Partner introductions" value={d.leads.partnerIntroductions} />
          <Kpi label="Applications submitted" value={d.applications?.submitted ?? '—'} href="/eb5/applications" />
          <Kpi label="Agreements issued / signed" value={d.agreements ? `${d.agreements.issued} / ${d.agreements.signed}` : '—'} href="/eb5/agreements" />
          <Kpi label="My open follow-ups" value={d.tasks.open} hint={d.tasks.overdue ? `${d.tasks.overdue} overdue` : 'None overdue'} href="/eb5/tasks" />
        </Grid>
        {d.leads.possibleDuplicates > 0 && has('compliance', 'super_admin', 'citrus_admin') && <p><Link href="/eb5/disputes">{d.leads.possibleDuplicates} ownership claim{d.leads.possibleDuplicates > 1 ? 's' : ''} to review</Link></p>}
        <p className="cz-muted" style={{ fontSize: 13 }}>{d.note}</p>
        <Eb5Notice compact />
      </>}
    </Screen>
  );
}
