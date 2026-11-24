'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { VAI_VENTURE_STATUS, type VaiFinanceResult, type VaiRole } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, Select, Skeleton, Tabs, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { SampleTag, VaiHeader, VaiNav, rupees, toPaise } from '@/components/VentureAi';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Member { id: string; org: string; role: VaiRole; roleLabel: string; status: string; matchPercent: number | null; matchReasons: string[] | null; mine: boolean }
interface Task { id: string; title: string; assigneeMemberId: string | null; dueOn: string | null; milestone: boolean; status: string }
interface Appr { id: string; kind: string; title: string; detail: string | null; amountPaise: number | null; status: string; note: string | null; createdAt: string }
interface Run { id: string; agent: string; instruction: string; provider: string; model: string | null; status: string; output: string | null; error: string | null; costPaise: number | null; createdAt: string }
interface Room {
  venture: { id: string; code: string; name: string; status: keyof typeof VAI_VENTURE_STATUS; legalStructure: string | null; sample: boolean }; owner: boolean; myRole: VaiRole | null; provider: string;
  opportunity: { id: string; title: string; roles: { role: VaiRole; count: number }[]; finance: { result: VaiFinanceResult } | null };
  members: Member[]; tasks: Task[]; approvals: Appr[]; runs: Run[]; agents: { key: string; label: string; does: string; estimate: { provider: string; model: string | null; costPaise: number | null } }[];
}
const KINDS: Record<string, string> = { binding_agreement: 'Binding agreement', financial_commitment: 'Financial commitment', payment: 'Payment', purchase_order: 'Purchase order', public_claim: 'Public / marketing claim', data_sharing: 'Sharing sensitive data', production_release: 'Production release', safety_engineering: 'Safety / engineering decision' };

/** Venture Room: the team, open roles, tasks and milestones, human approvals and labelled AI drafts for one approved venture. */
export default function VaiRoom() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Room>(`/venture-ai/rooms/${id}`);
  const [tab, setTab] = useState('team');
  const r = q.data;
  return (
    <Screen page={{ key: 'venture-ai-room', title: 'Venture Room', access: 'partner' }} header={false}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !r ? <Skeleton height={320} /> : (
        <>
          <VaiHeader title={r.venture.name} lead={<>Venture Room {r.venture.code} · {VAI_VENTURE_STATUS[r.venture.status]} · your role: {r.owner ? 'Owner' : r.members.find((m) => m.mine)?.roleLabel}</>}>
            <div className="pt-cta">{r.venture.sample && <SampleTag />}<Link href={`/venture-ai/opportunities/${r.opportunity.id}`}>Opportunity, score and financials →</Link></div>
          </VaiHeader>
          <VaiNav />
          <Alert tone="info">Legal structure: {r.venture.legalStructure ?? 'not decided'}. Partnerships, JVs and companies are formed only on signed agreements reviewed by qualified advisers — nothing here is binding by itself.</Alert>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'team', label: 'Team & roles' }, { value: 'tasks', label: 'Tasks & milestones' }, { value: 'approvals', label: 'Approvals' }, { value: 'ai', label: 'AI agents' }]} />
          {tab === 'team' && <Team r={r} />}
          {tab === 'tasks' && <Tasks r={r} reload={q.reload} />}
          {tab === 'approvals' && <Approvals r={r} reload={q.reload} />}
          {tab === 'ai' && <Agents r={r} reload={q.reload} />}
        </>
      )}
    </Screen>
  );
}

function Team({ r }: { r: Room }) {
  const filled = (role: VaiRole) => r.members.filter((m) => m.role === role && ['accepted', 'owner'].includes(m.status)).length;
  return (
    <div className="vai-two">
      <Card title="Members">
        <ul className="vai-list">{r.members.map((m) => (
          <li key={m.id} data-member={m.org}><div><strong>{m.org}</strong>{m.mine && ' (you)'}<p>{m.roleLabel}{m.matchPercent != null ? ` · ${m.matchPercent}% match` : ''}</p></div><span className="vai-pill" data-s={m.status}>{m.status === 'owner' ? 'Owner' : m.status === 'invited' ? 'Invited' : m.status === 'accepted' ? 'Joined' : m.status === 'declined' ? 'Declined' : m.status}</span></li>))}</ul>
      </Card>
      <Card title="Roles needed" actions={r.owner ? <Link href={`/venture-ai/opportunities/${r.opportunity.id}`}>Find members →</Link> : undefined}>
        <ul className="vai-list">{r.opportunity.roles.map((x, i) => { const n = filled(x.role); return <li key={`${x.role}-${i}`}><div><strong>{r.members.find((m) => m.role === x.role)?.roleLabel ?? x.role.replace(/_/g, ' ')}</strong><p>{n} of {x.count} filled</p></div><span className="vai-pill" data-s={n >= x.count ? 'accepted' : 'invited'}>{n >= x.count ? 'Filled' : 'Open'}</span></li>; })}</ul>
      </Card>
    </div>
  );
}

function Tasks({ r, reload }: { r: Room; reload: () => void }) {
  const [f, setF] = useState({ title: '', assigneeMemberId: '', dueOn: '', milestone: 'false' });
  const add = useMutation(async () => { await api.post(`/venture-ai/rooms/${r.venture.id}/tasks`, { title: f.title, assigneeMemberId: f.assigneeMemberId || undefined, dueOn: f.dueOn || undefined, milestone: f.milestone === 'true' }); setF({ ...f, title: '' }); reload(); return true; });
  const done = useMutation(async (id: string) => { await api.post(`/venture-ai/tasks/${id}/done`, {}); reload(); return true; });
  const members = r.members.filter((m) => ['owner', 'accepted'].includes(m.status));
  return (
    <div className="vai-two">
      <Card title="Tasks and milestones">
        {r.tasks.length ? <ul className="vai-list">{r.tasks.map((t) => (
          <li key={t.id} data-task={t.title}><div><strong>{t.milestone ? '◆ ' : ''}{t.title}</strong><p>{members.find((m) => m.id === t.assigneeMemberId)?.org ?? 'Unassigned'}{t.dueOn ? ` · due ${t.dueOn}` : ''}</p></div>
            {t.status === 'done' ? <span className="vai-pill" data-s="accepted">Done</span> : <Button size="sm" variant="ghost" onClick={() => done.run(t.id)}>Mark done</Button>}</li>))}</ul>
          : <EmptyState icon="check" title="No tasks yet" />}
      </Card>
      <Card title="Add a task">
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
          {add.error && <Alert tone="danger">{add.error}</Alert>}
          <TextInput label="Task" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={add.fieldErrors.title} />
          <Select label="Assign to" value={f.assigneeMemberId} onChange={(e) => setF({ ...f, assigneeMemberId: e.target.value })} options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: `${m.org} — ${m.roleLabel}` }))]} />
          <TextInput label="Due on" type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
          <Select label="Type" value={f.milestone} onChange={(e) => setF({ ...f, milestone: e.target.value })} options={[{ value: 'false', label: 'Task' }, { value: 'true', label: 'Milestone' }]} />
          <div><Button type="submit" loading={add.pending}>Add</Button></div>
        </form>
      </Card>
    </div>
  );
}

function Approvals({ r, reload }: { r: Room; reload: () => void }) {
  const [f, setF] = useState({ kind: 'binding_agreement', title: '', detail: '', amount: '' });
  const req = useMutation(async () => { await api.post(`/venture-ai/rooms/${r.venture.id}/approvals`, { kind: f.kind, title: f.title, detail: f.detail || undefined, amountPaise: f.amount ? toPaise(f.amount) : undefined }); setF({ ...f, title: '', detail: '', amount: '' }); reload(); return true; });
  const decide = useMutation(async (id: string, decision: 'approve' | 'reject') => { await api.post(`/venture-ai/approvals/${id}/decide`, { decision }); reload(); return true; });
  return (
    <div className="vai-two">
      <Card title="Approvals" subtitle="Agreements, money, purchase orders, public claims and safety decisions need a person’s approval — never the requester’s own.">
        {decide.error && <Alert tone="danger">{decide.error}</Alert>}
        {r.approvals.length ? <ul className="vai-list">{r.approvals.map((a) => (
          <li key={a.id} data-approval={a.title}><div><strong>{a.title}</strong><p>{KINDS[a.kind]}{a.amountPaise != null ? ` · ${rupees(a.amountPaise)}` : ''}{a.detail ? ` · ${a.detail}` : ''}{a.note ? ` · Note: ${a.note}` : ''}</p></div>
            {a.status === 'pending' && r.owner ? <div className="cz-row" style={{ gap: 6 }}><Button size="sm" onClick={() => decide.run(a.id, 'approve')}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide.run(a.id, 'reject')}>Reject</Button></div>
              : <span className="vai-pill" data-s={a.status === 'approved' ? 'accepted' : a.status === 'rejected' ? 'declined' : 'invited'}>{a.status === 'pending' ? 'Pending' : a.status === 'approved' ? 'Approved' : 'Rejected'}</span>}</li>))}</ul>
          : <EmptyState icon="audit" title="No approval requests" />}
      </Card>
      <Card title="Request an approval">
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); req.run(); }}>
          {req.error && <Alert tone="danger">{req.error}</Alert>}
          <Select label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={Object.entries(KINDS).map(([value, label]) => ({ value, label }))} />
          <TextInput label="What needs approval" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={req.fieldErrors.title} />
          <TextArea label="Details" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={2} />
          <TextInput label="Amount (₹, if any)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <div><Button type="submit" loading={req.pending}>Request approval</Button></div>
        </form>
      </Card>
    </div>
  );
}

function Agents({ r, reload }: { r: Room; reload: () => void }) {
  const [agent, setAgent] = useState(r.agents[0]?.key ?? 'research');
  const [ins, setIns] = useState('');
  const run = useMutation(async () => { await api.post(`/venture-ai/rooms/${r.venture.id}/agent-runs`, { agent, instruction: ins }); reload(); return true; });
  const a = r.agents.find((x) => x.key === agent);
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <Card title="Ask an agent" subtitle={r.provider === 'anthropic' ? 'Claude drafts from this venture’s record only. Drafts are labelled and must be checked by a person.' : 'No AI key is connected yet, so agents return structured templates built from this venture’s record — labelled as such.'}>
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); run.run(); }}>
          {run.error && <Alert tone="danger">{run.error}</Alert>}
          <Select label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} options={r.agents.map((x) => ({ value: x.key, label: x.label }))} />
          {a && <p className="vai-muted">{a.does} · {a.estimate.provider === 'anthropic' ? `${a.estimate.model} · estimated cost ${a.estimate.costPaise != null ? rupees(a.estimate.costPaise) : 'not set by admin'}` : 'Rules template · no cost'}</p>}
          <TextArea label="Instruction" value={ins} onChange={(e) => setIns(e.target.value)} rows={3} error={run.fieldErrors.instruction} />
          <div><Button type="submit" loading={run.pending}>Run</Button></div>
        </form>
      </Card>
      <Card title="Agent runs">
        {r.runs.length ? <ul className="vai-runs">{r.runs.map((x) => (
          <li key={x.id} data-run={x.agent} data-status={x.status}>
            <header><strong>{r.agents.find((g) => g.key === x.agent)?.label ?? x.agent}</strong><span className="vai-pill" data-s={x.status === 'completed' ? 'accepted' : 'declined'}>{x.status}</span><small>{x.provider === 'anthropic' ? `Claude · ${x.model}` : 'Rules template'}{x.costPaise ? ` · ${rupees(x.costPaise)}` : ''} · {new Date(x.createdAt).toLocaleString('en-IN')}</small></header>
            <p className="vai-muted">“{x.instruction}”</p>
            {x.output ? <pre className="vai-out">{x.output}</pre> : <Alert tone="warning">{x.error}</Alert>}
          </li>))}</ul> : <EmptyState icon="sparkles" title="No agent runs yet" />}
      </Card>
    </div>
  );
}
