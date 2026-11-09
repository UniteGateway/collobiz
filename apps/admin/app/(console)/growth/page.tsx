'use client';
import Link from 'next/link';
import { GROWTH_AGENT_STATUS_LABELS, GROWTH_AUDIENCE_LABELS } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, EmptyState, Kpi, LoadingState, PageHeader, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface AgentRow { id: string; code: string; name: string; product: string; audience: string; status: string; cadence: string; venture: string | null; lastRunAt: string | null; needsClearance: boolean; leads: number; toReview: number; awaitingApproval: number; sent: number; replied: number; won: number }
interface Dash { sendingEnabled: boolean; provider: string; aiProviderConfigured: boolean; totals: Record<string, number>; agents: AgentRow[] }
const TONE: Record<string, 'success' | 'neutral' | 'warning'> = { active: 'success', draft: 'neutral', paused: 'warning' };

/** AI Growth Desk — campaign agents per Unite product or service: they find, score and draft; people approve. */
export default function GrowthDesk() {
  const q = useQuery<Dash>('/admin/growth');
  const bulk = useMutation(async () => { const r = await api.post<{ created: number; alreadyHadAgent: number }>('/admin/growth/agents/from-businesses', {}); q.reload(); return r; });
  const d = q.data;
  return (
    <div>
      <PageHeader title="Growth Desk" breadcrumb="Unite Group Administration"
        description="AI campaign agents, one per Unite product or service. They look through the lead database, score who fits and draft personal messages. Nothing is sent until a person approves it."
        actions={<div className="cz-row" style={{ gap: 8 }}>
          <ButtonLink href="/growth/contacts" variant="secondary">Lead database</ButtonLink>
          <Button variant="secondary" loading={bulk.pending} onClick={() => bulk.run()}>Agent for every open business</Button>
          <ButtonLink href="/growth/agents/new">New agent</ButtonLink>
        </div>} />
      {bulk.data && <Alert tone="success">{bulk.data.created ? `Created ${bulk.data.created} draft agents — review each one and switch it on.` : 'Every open business already has an agent.'}</Alert>}
      {bulk.error && <Alert tone="danger">{bulk.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <Alert tone="info" title={d.sendingEnabled ? 'Sending is on' : 'Drafting only — sending is switched off'}>
            {d.sendingEnabled ? 'Approved messages are sent from the marketing e-mail service, within each agent’s daily limit.' : 'Agents find, score and draft. Approved messages wait until a separate marketing e-mail service is set up.'}{' '}
            {d.aiProviderConfigured ? '' : 'Drafts are written by the built-in rules engine; they become more personal once an AI provider is connected.'}
          </Alert>
          <div className="cz-growth-kpis">
            <Kpi label="Agents switched on" value={`${d.totals.active} / ${d.totals.agents}`} />
            <Kpi label="Usable contacts" value={d.totals.usableContacts} hint={`${d.totals.contacts} in the database · ${d.totals.optedOut} opted out`} href="/growth/contacts" />
            <Kpi label="Messages to approve" value={d.totals.awaitingApproval} accent={d.totals.awaitingApproval > 0} />
            <Kpi label="Sent" value={d.totals.sent} hint={`${d.totals.approved} approved and waiting`} />
            <Kpi label="Replies and meetings" value={d.totals.replied} hint={`${d.totals.won} won`} />
          </div>
          {!d.agents.length ? <Card><EmptyState icon="users" title="No agents yet" action={<ButtonLink href="/growth/agents/new">Create the first agent</ButtonLink>}>Create an agent for a product, or one for every open Unite business in one click.</EmptyState></Card> : (
            <ul className="cz-offer-list" aria-label="Agents">
              {d.agents.map((a) => (
                <li key={a.id} className="cz-card cz-offer" data-agent={a.code}>
                  <div className="cz-offer-head"><span className="cz-tag">{GROWTH_AUDIENCE_LABELS[a.audience]}</span>{a.venture && <span className="cz-muted" style={{ fontSize: 12.5 }}>{a.venture}</span>}
                    <StatusBadge status={a.status} tone={a.needsClearance ? 'warning' : TONE[a.status]} label={a.needsClearance ? 'Needs clearance' : GROWTH_AGENT_STATUS_LABELS[a.status]} /></div>
                  <strong className="cz-offer-title"><Link href={`/growth/agents/${a.id}`}>{a.name}</Link></strong>
                  <span className="cz-muted">{a.product}</span>
                  <div className="cz-offer-stats">
                    <span><strong>{a.leads}</strong> leads</span>
                    {a.awaitingApproval > 0 && <span><strong>{a.awaitingApproval}</strong> to approve</span>}
                    <span><strong>{a.sent}</strong> sent</span><span><strong>{a.replied}</strong> replied</span><span><strong>{a.won}</strong> won</span>
                    <span className="cz-muted" style={{ marginLeft: 'auto' }}>{a.lastRunAt ? `Last run ${new Date(a.lastRunAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Not run yet'}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
