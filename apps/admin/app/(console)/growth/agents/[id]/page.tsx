'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CONTACT_SOURCE_LABELS, COUNTRIES, GROWTH_AGENT_STATUS_LABELS, GROWTH_AUDIENCE_LABELS, GROWTH_CADENCE_LABELS, GROWTH_LEAD_STATUS_LABELS, GROWTH_MESSAGE_STATUS_LABELS, INDIA_STATES, LAWFUL_BASIS_LABELS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, EmptyState, LoadingState, PageHeader, StatusBadge, Tabs, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Msg { id: string; subject: string; body: string; status: string; blockedReason: string | null; provider: string; promptVersion: string; sources: { type: string; ref: string }[]; edited: boolean; sentAt: string | null }
interface Lead { id: string; score: number; reasons: string[]; status: string; suggestedPartner: string | null; contact: { organizationName: string; contactName: string | null; email: string | null; phone: string | null; city: string | null; region: string | null; country: string; sector: string; source: string; sourceDetail: string; lawfulBasis: string; optedOut: boolean }; message: Msg | null }
interface Run { id: string; trigger: string; provider: string; considered: number; created: number; drafted: number; skipped: { reason: string; n: number }[]; startedAt: string }
interface Detail {
  agent: { id: string; code: string; name: string; product: string; audience: string; sectors: string[]; regions: string[]; countries: string[]; pitch: string; callToAction: string; cadence: string; minScore: number; maxLeadsPerRun: number; dailySendCap: number; status: string; needsClearance: boolean; clearanceNote: string | null; sentToday: number; venture: { name: string } | null; lastRunAt: string | null };
  sendingEnabled: boolean; runs: Run[]; leads: Lead[];
}
const NEXT: Record<string, string[]> = { approved: ['contacted', 'rejected'], contacted: ['replied', 'meeting', 'won', 'lost'], replied: ['meeting', 'won', 'lost'], meeting: ['won', 'lost'] };
const region = (c: string | null) => INDIA_STATES.find(([k]) => k === c)?.[1] ?? c;
const country = (c: string) => COUNTRIES.find(([k]) => k === c)?.[1] ?? c;
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const q = useQuery<Detail>(`/admin/growth/agents/${id}`);
  const [tab, setTab] = useState('approve');
  const [note, setNote] = useState('');
  const act = useMutation(async (fn: () => Promise<unknown>) => { const r = await fn(); await q.reload(); return r; });
  const d = q.data;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  if (!d) return <LoadingState />;
  const a = d.agent;
  const toApprove = d.leads.filter((l) => l.message && ['draft', 'blocked'].includes(l.message.status));
  const approved = d.leads.filter((l) => l.message?.status === 'approved').length;
  const superAdmin = me?.platformRoles.includes('super_admin');
  return (
    <div>
      <PageHeader title={a.name} breadcrumb="Growth Desk" description={`${a.code} · ${GROWTH_AUDIENCE_LABELS[a.audience]}${a.venture ? ` · ${a.venture.name}` : ''}`}
        actions={<div className="cz-row" style={{ gap: 8 }}>
          <StatusBadge status={a.status} tone={a.status === 'active' ? 'success' : a.status === 'paused' ? 'warning' : 'neutral'} label={GROWTH_AGENT_STATUS_LABELS[a.status]} />
          {a.status !== 'active' && <Button variant="secondary" disabled={a.needsClearance} onClick={() => act.run(() => api.request('PATCH', `/admin/growth/agents/${id}`, { status: 'active' }))}>Switch on</Button>}
          {a.status === 'active' && <Button variant="secondary" onClick={() => act.run(() => api.request('PATCH', `/admin/growth/agents/${id}`, { status: 'paused' }))}>Pause</Button>}
          <Button loading={act.pending} disabled={a.status === 'paused' || a.needsClearance} onClick={() => act.run(() => api.post(`/admin/growth/agents/${id}/run`, {}))}>Run now</Button>
        </div>} />
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {a.needsClearance && (
        <Card title="Clearance needed before this agent can run">
          <p className="cz-muted" style={{ marginTop: 0 }}>Investor outreach can be treated as offering securities. A super admin records the legal opinion or approval first. Even then, the agent reaches only investors who opted in.</p>
          {superAdmin ? (
            <form className="cz-row" style={{ gap: 8, alignItems: 'flex-end' }} onSubmit={(ev) => { ev.preventDefault(); act.run(() => api.post(`/admin/growth/agents/${id}/clearance`, { note })); }}>
              <div style={{ flex: 1, minWidth: 240 }}><TextInput label="Clearance note (legal opinion reference)" value={note} onChange={(ev) => setNote(ev.target.value)} /></div>
              <Button type="submit" disabled={note.trim().length < 10}>Record clearance</Button>
            </form>
          ) : <Alert tone="warning">Ask a super admin to record clearance.</Alert>}
        </Card>
      )}
      <div className="cz-stack" style={{ gap: 16 }}>
        <Card title="What this agent does" actions={<span className="cz-muted" style={{ fontSize: 13 }}>{a.lastRunAt ? `Last run ${when(a.lastRunAt)}` : 'Not run yet'}</span>}>
          <DescriptionList items={[
            ['Product or service', a.product],
            ['Looks in', `${a.sectors.map(sectorName).join(', ')} · ${a.countries.map(country).join(', ')}${a.regions.length ? ` · ${a.regions.map(region).join(', ')}` : ''}`],
            ['Runs', `${GROWTH_CADENCE_LABELS[a.cadence]} · keeps leads scoring ${a.minScore}+ · up to ${a.maxLeadsPerRun} new leads per run · at most ${a.dailySendCap} e-mails a day`],
            ['Approved pitch', a.pitch],
            ['Asks them to', a.callToAction],
            ...(a.clearanceNote ? [['Clearance', a.clearanceNote] as [string, string]] : []),
          ]} />
        </Card>
        <Card title="Sending">
          {d.sendingEnabled ? (
            <div className="cz-row" style={{ gap: 12 }}><span>{approved} approved message{approved === 1 ? '' : 's'} waiting · {a.sentToday} sent today of {a.dailySendCap}</span>
              <Button disabled={!approved || a.status !== 'active'} onClick={() => act.run(() => api.post(`/admin/growth/agents/${id}/send`, {}))}>Send approved messages</Button></div>
          ) : <p className="cz-muted" style={{ margin: 0 }}>{approved} approved message{approved === 1 ? '' : 's'} waiting. Sending is switched off until a separate marketing e-mail service is set up — approved messages are kept.</p>}
        </Card>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'approve', label: `To approve ${toApprove.length}` }, { value: 'leads', label: `All leads ${d.leads.length}` }, { value: 'runs', label: 'Runs' }]} />
        {tab === 'approve' && (!toApprove.length ? <Card><EmptyState icon="check" title="Nothing waiting for approval">Run the agent to find new leads.</EmptyState></Card> : (
          <ul className="cz-stack" style={{ gap: 12, listStyle: 'none', margin: 0, padding: 0 }} aria-label="Drafts to approve">
            {toApprove.map((l) => <DraftItem key={l.id} lead={l} onDone={q.reload} />)}
          </ul>
        ))}
        {tab === 'leads' && (!d.leads.length ? <Card><EmptyState icon="users" title="No leads yet">Run the agent to look through the lead database.</EmptyState></Card> : (
          <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }} aria-label="Leads">
            {d.leads.map((l) => (
              <li key={l.id} className="cz-card cz-lead" data-lead={l.contact.organizationName}>
                <LeadHead l={l} />
                <div className="cz-row" style={{ gap: 8 }}>
                  <StatusBadge status={l.status} label={GROWTH_LEAD_STATUS_LABELS[l.status]} tone={l.status === 'won' ? 'success' : l.status === 'rejected' || l.status === 'lost' ? 'neutral' : 'info'} />
                  {l.message && <span className="cz-muted" style={{ fontSize: 13 }}>Message: {GROWTH_MESSAGE_STATUS_LABELS[l.message.status]}</span>}
                  <span style={{ marginLeft: 'auto' }} className="cz-row">
                    {(NEXT[l.status] ?? []).map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => act.run(() => api.post(`/admin/growth/leads/${l.id}/status`, { status: s }))}>{GROWTH_LEAD_STATUS_LABELS[s]}</Button>)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ))}
        {tab === 'runs' && (!d.runs.length ? <Card><EmptyState icon="calendar" title="Not run yet" /></Card> : (
          <Card title="Recent runs">
            <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
              {d.runs.map((r) => (
                <li key={r.id} style={{ fontSize: 14 }}>
                  <strong>{when(r.startedAt)}</strong> <span className="cz-muted">· {r.trigger === 'schedule' ? 'scheduled' : 'run by hand'} · {r.provider === 'rules' ? 'built-in rules engine' : r.provider}</span>
                  <div>Looked at {r.considered} contacts · {r.created} new leads · {r.drafted} drafts</div>
                  {r.skipped.length > 0 && <div className="cz-muted" style={{ fontSize: 13 }}>Skipped: {r.skipped.map((s) => `${s.reason} (${s.n})`).join(' · ')}</div>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LeadHead({ l }: { l: Lead }) {
  const c = l.contact;
  return (
    <>
      <div className="cz-lead-head">
        <span className="cz-score" data-high={l.score >= 70 || undefined} aria-label={`Score ${l.score} of 100`}>{l.score}</span>
        <strong>{c.organizationName}</strong>
        <span className="cz-muted">{[c.contactName, c.city, c.region ? region(c.region) : null, c.country !== 'IN' ? country(c.country) : null].filter(Boolean).join(' · ')}</span>
      </div>
      <ul className="cz-reasons">{l.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <span className="cz-muted" style={{ fontSize: 12.5 }}>Source: {CONTACT_SOURCE_LABELS[c.source]} — {c.sourceDetail} · {LAWFUL_BASIS_LABELS[c.lawfulBasis]}{l.suggestedPartner ? ` · Suggested partner to follow up: ${l.suggestedPartner}` : ''}</span>
    </>
  );
}

function DraftItem({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const m = lead.message!;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ subject: m.subject, body: m.body });
  const act = useMutation(async (fn: () => Promise<unknown>) => { const r = await fn(); setEditing(false); onDone(); return r; });
  return (
    <li className="cz-card cz-lead" data-draft={lead.contact.organizationName}>
      <LeadHead l={lead} />
      {m.status === 'blocked' && <Alert tone="warning">{m.blockedReason}</Alert>}
      {act.error && <Alert tone="danger">{act.error}</Alert>}
      {editing ? (
        <div className="cz-stack" style={{ gap: 8 }}>
          <TextInput label="Subject" value={f.subject} onChange={(ev) => setF({ ...f, subject: ev.target.value })} error={act.fieldErrors.subject} />
          <TextArea label="Message" rows={14} value={f.body} onChange={(ev) => setF({ ...f, body: ev.target.value })} error={act.fieldErrors.body} />
          <div className="cz-row" style={{ gap: 8 }}><Button size="sm" loading={act.pending} onClick={() => act.run(() => api.request('PATCH', `/admin/growth/messages/${m.id}`, f))}>Save changes</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setF({ subject: m.subject, body: m.body }); }}>Cancel</Button></div>
        </div>
      ) : (
        <>
          <pre className="cz-draft"><span className="cz-draft-subject">To: {lead.contact.email} · Subject: {m.subject}</span>{'\n\n'}{m.body}</pre>
          <span className="cz-muted" style={{ fontSize: 12.5 }}>Drafted by {m.provider === 'rules' ? 'the built-in rules engine' : m.provider} ({m.promptVersion}){m.edited ? ' · edited by staff' : ''} · Sources: {m.sources.map((s) => s.ref).join('; ')}</span>
          <div className="cz-row" style={{ gap: 8 }}>
            <Button size="sm" disabled={m.status === 'blocked'} loading={act.pending} onClick={() => act.run(() => api.post(`/admin/growth/messages/${m.id}/decide`, { decision: 'approve' }))}>Approve</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/admin/growth/messages/${m.id}/decide`, { decision: 'reject' }))}>Reject</Button>
            <Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/admin/growth/leads/${lead.id}/status`, { status: 'rejected' }))}>Not a fit</Button>
          </div>
        </>
      )}
    </li>
  );
}
