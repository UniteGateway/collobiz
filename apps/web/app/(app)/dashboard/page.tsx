'use client';
import Link from 'next/link';
import { PIPELINE_STAGES, sectorName } from '@collabiz/types';
import { Alert, ButtonLink, EmptyState, Icon, Skeleton, StatusBadge, type IconName } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Home {
  figures: Record<string, number>;
  actions: { kind: string; title: string; detail: string; href: string; due?: string | null; tone: 'urgent' | 'normal' }[];
  pipeline: { stage: string; count: number; value: number }[];
  recommendations: { id: string; code: string; title: string; sector: string; city: string | null; value: number | null; deadline: string | null; score: number | null; reasons: string[] }[];
  activity: { id: string; text: string; actor: string | null; at: string }[];
}

const inr = (minor = 0) => {
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};
const ACTION_ICON: Record<string, IconName> = { team: 'teams', contract: 'contracts', milestone: 'projects', invoice: 'documents', certify: 'verify', payout: 'earnings', task: 'calendar', order: 'trading', claim: 'warning', tender: 'tenders' };
const when = (d?: string | null) => {
  if (!d) return null;
  const days = Math.round((new Date(d).getTime() - Date.now()) / 86400_000);
  return days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`;
};
const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** Screen 023 — Partner Home: what needs you today, how the business is doing, and what to pursue next. */
export default function DashboardPage() {
  const { me } = useSession();
  const org = me?.activeOrg;
  const q = useQuery<Home>(org ? '/me/home' : null);
  const d = q.data;
  const f = d?.figures ?? {};
  const maxStage = Math.max(1, ...(d?.pipeline ?? []).map((p) => p.value));
  return (
    <Screen id="023" eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={me ? `${greeting()}, ${me.fullName.split(' ')[0]}` : 'Welcome'}
      description={org ? <span className="cz-row" style={{ gap: 8 }}>{org.name}<StatusBadge status={org.verificationStatus} label={org.verificationStatus === 'verified' ? (org.membershipLevel === 'verified' ? 'Verified partner' : `Verified · ${org.membershipLevel.replace('_', ' ')} level`) : undefined} /></span> : undefined}
      actions={org && <><ButtonLink href="/marketplace" variant="secondary">Find opportunities</ButtonLink><ButtonLink href="/leads/new" variant="accent"><Icon name="leads" size={16} />Register a lead</ButtonLink></>}>
      {me && !me.emailVerified && <Alert tone="warning" title="Verify your email.">Some actions stay locked until your email is verified. <Link href="/verify">Verify now</Link></Alert>}
      {me && !org ? (
        <div className="cz-card"><EmptyState icon="verify" title="Set up your partner account" action={<ButtonLink href="/onboarding/account-type" variant="accent">Get started</ButtonLink>}>Create your company profile to discover opportunities, register protected leads and collaborate with verified partners.</EmptyState></div>
      ) : org && org.verificationStatus !== 'verified' ? (
        <Alert tone="info" title="Finish verification to unlock the network.">Applying to opportunities and registering leads open once your company is verified. <Link href="/onboarding/status">See what’s left</Link></Alert>
      ) : null}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : org && (
        <div className="cz-dash">
          {/* ---------- Today ---------- */}
          <section className="cz-card cz-dash-today" aria-labelledby="today-h">
            <div className="cz-card-head"><div><h2 id="today-h">Needs your attention</h2><p>{d ? (d.actions.length ? `${d.actions.length} item${d.actions.length > 1 ? 's' : ''} across your workspace` : 'You’re all caught up') : 'Checking your workspace…'}</p></div></div>
            {!d ? [0, 1, 2].map((i) => <Skeleton key={i} height={52} style={{ marginBottom: 10 }} />) : d.actions.length ? (
              <ul className="cz-actions-list">
                {d.actions.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} data-tone={a.tone}>
                      <span className="cz-action-icon"><Icon name={ACTION_ICON[a.kind] ?? 'info'} size={18} /></span>
                      <span className="cz-action-text"><strong>{a.title}</strong><span>{a.detail}</span></span>
                      {a.due && <span className={`cz-action-due${when(a.due)?.includes('overdue') ? ' cz-overdue' : ''}`}>{when(a.due)}</span>}
                      <Icon name="next" size={16} className="cz-action-chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="success" title="Nothing waiting on you">New invitations, signatures, certifications and payouts will appear here.</EmptyState>}
          </section>

          {/* ---------- Earnings ---------- */}
          <section className="cz-card cz-dash-earn" aria-labelledby="earn-h">
            <div className="cz-card-head"><h2 id="earn-h">Earnings</h2><Link href="/earnings" className="cz-link-arrow">Details<Icon name="arrow" size={14} /></Link></div>
            <div className="cz-earn-figure">{d ? inr(f.earnedUnpaid) : <Skeleton height={36} width={140} />}</div>
            <p className="cz-muted" style={{ margin: '2px 0 18px', fontSize: 13.5 }}>Earned and awaiting payment</p>
            <div className="cz-earn-row"><span>Projected</span><strong>{d ? inr(f.projected) : '—'}</strong></div>
            <p className="cz-muted" style={{ fontSize: 12.5, margin: '14px 0 0' }}>{d && !f.earnedUnpaid && !f.projected ? 'No commission yet. Introductions you register earn commission once the customer pays for the work.' : 'Commission is earned only when the customer pays the milestone.'}</p>
          </section>

          {/* ---------- Figures ---------- */}
          <div className="cz-dash-figures">
            {[
              { label: 'Open pipeline', value: d ? inr(f.pipelineValue) : null, hint: d ? `${f.openDeals} open deal${f.openDeals === 1 ? '' : 's'}` : '', icon: 'crm' as IconName, href: '/crm/pipeline' },
              { label: 'Active leads', value: d ? String(f.activeLeads) : null, hint: d ? `${f.protectedLeads} protected` : '', icon: 'leads' as IconName, href: '/my/leads' },
              { label: 'Active projects', value: d ? String(f.activeProjects) : null, hint: 'Owner, lead or subcontractor', icon: 'projects' as IconName, href: '/projects' },
              { label: 'Open applications', value: d ? String(f.openApplications) : null, hint: 'Submitted or shortlisted', icon: 'opportunities' as IconName, href: '/my/opportunities' },
            ].map((k) => (
              <Link key={k.label} href={k.href} className="cz-kpi cz-kpi-link">
                <div className="cz-kpi-top"><span>{k.label}</span><Icon name={k.icon} size={16} /></div>
                <div className="cz-kpi-value">{k.value ?? <Skeleton height={30} width={90} />}</div>
                <div className="cz-kpi-hint">{k.hint}</div>
              </Link>
            ))}
          </div>

          {/* ---------- Recommendations ---------- */}
          <section className="cz-card cz-dash-recs" aria-labelledby="rec-h">
            <div className="cz-card-head"><div><h2 id="rec-h">Recommended for you</h2><p>Matched to your sectors, coverage and capacity</p></div><Link href="/feed" className="cz-link-arrow">See all<Icon name="arrow" size={14} /></Link></div>
            {!d ? <Skeleton height={140} /> : d.recommendations.length ? (
              <ul className="cz-rec-list">
                {d.recommendations.map((r) => (
                  <li key={r.id}>
                    <Link href={`/opportunities/${r.id}`}>
                      {r.score != null && <span className="cz-match" aria-label={`Match score ${r.score} out of 100`}><strong>{r.score}</strong><span>match</span></span>}
                      <span className="cz-rec-body">
                        <strong>{r.title}</strong>
                        <span className="cz-muted">{sectorName(r.sector)}{r.city ? ` · ${r.city}` : ''}{r.value ? ` · ${inr(r.value)}` : ''}</span>
                        {r.reasons.length > 0 && <span className="cz-rec-reasons">{r.reasons.map((x) => <span key={x} className="cz-tag">{x}</span>)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="search" title="No matches yet">Add sectors and coverage to your profile to receive explainable recommendations.</EmptyState>}
          </section>

          {/* ---------- Pipeline ---------- */}
          <section className="cz-card cz-dash-pipe" aria-labelledby="pipe-h">
            <div className="cz-card-head"><h2 id="pipe-h">Pipeline by stage</h2><Link href="/crm/pipeline" className="cz-link-arrow">Open<Icon name="arrow" size={14} /></Link></div>
            {!d ? <Skeleton height={140} /> : (
              <ul className="cz-stage-bars" aria-label="Deal value by stage">
                {PIPELINE_STAGES.filter((s) => s !== 'lost').map((s) => {
                  const p = d.pipeline.find((x) => x.stage === s);
                  return (
                    <li key={s}>
                      <span className="cz-stage-name">{s.replace('_', ' ')}</span>
                      <span className="cz-stage-track">{p?.value ? <span style={{ width: `${(p.value / maxStage) * 100}%` }} /> : null}</span>
                      <span className="cz-stage-val cz-num">{p ? `${inr(p.value)} · ${p.count}` : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- Activity ---------- */}
          <section className="cz-card cz-dash-activity" aria-labelledby="act-h">
            <div className="cz-card-head"><h2 id="act-h">Recent activity</h2><Link href="/activity" className="cz-link-arrow">All activity<Icon name="arrow" size={14} /></Link></div>
            {!d ? <Skeleton height={120} /> : d.activity.length ? (
              <ul className="cz-activity">
                {d.activity.map((a) => <li key={a.id}><span className="cz-activity-dot" /><span><strong>{a.text}</strong>{a.actor ? <span className="cz-muted"> · {a.actor}</span> : null}</span><time className="cz-muted" dateTime={a.at}>{ago(a.at)}</time></li>)}
              </ul>
            ) : <p className="cz-muted" style={{ margin: 0 }}>Activity from your team will appear here.</p>}
          </section>
        </div>
      )}
    </Screen>
  );
}
