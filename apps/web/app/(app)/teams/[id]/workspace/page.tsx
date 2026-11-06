'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, DescriptionList, LoadingState, Money, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { TeamTabs } from '@/components/Teams';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useTeam } from '@/lib/team';

/** Screen 156 — Joint Proposal & Team Workspace (NDA-signed members only). */
export default function Workspace() {
  const t = useTeam();
  const full = t.data?.access === 'full';
  const posts = useQuery<any[]>(full ? `/teams/${t.id}/posts` : null);
  const [f, setF] = useState({ kind: 'proposal_section', title: '', body: '', assigneeOrgId: '' });
  const add = useMutation(async () => { await api.post(`/teams/${t.id}/posts`, { ...f, assigneeOrgId: f.assigneeOrgId || undefined }); setF({ ...f, title: '', body: '' }); posts.reload(); return true; });
  const toggle = useMutation(async (pid: string, status: string) => { await api.patch(`/teams/${t.id}/posts/${pid}`, { status }); posts.reload(); return true; });
  if (t.loading) return <Screen id="156"><LoadingState /></Screen>;
  if (t.error) return <Screen id="156"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const d = t.data;
  return (
    <Screen id="156" title={d.name}>
      <TeamTabs id={t.id} />
      {!full ? <Alert tone="warning">The workspace opens after your organization accepts the invitation and signs the team NDA. <Link href={`/teams/${t.id}/nda`}>Read the NDA</Link></Alert> : (
        <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
          <div className="cz-stack">
            <Card title="Team" actions={<StatusBadge status={d.status} />}>
              <DescriptionList items={[['Code', d.code], ['Lead', d.lead], ['Type', d.kind], ['Purpose', d.purpose]]} />
              {d.opportunity && <p style={{ marginTop: 8 }}><strong>Opportunity:</strong> <Link href={`/opportunities/${d.opportunity.id}`}>{d.opportunity.code} — {d.opportunity.title}</Link> · <Money minor={d.opportunity.estimatedValue} /></p>}
            </Card>
            <Card title="Add to workspace">
              {add.error && <Alert tone="danger">{add.error}</Alert>}
              <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={[{ value: 'proposal_section', label: 'Joint proposal section' }, { value: 'task', label: 'Shared task' }, { value: 'note', label: 'Note' }]} />
              <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <TextArea label="Content" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
              {f.kind === 'task' && <Select label="Assign to" value={f.assigneeOrgId} onChange={(e) => setF({ ...f, assigneeOrgId: e.target.value })} placeholder="Unassigned" options={d.members.filter((m: any) => m.status === 'nda_signed').map((m: any) => ({ value: m.organizationId, label: m.organization }))} />}
              <Button onClick={() => add.run()} loading={add.pending} disabled={!f.title || !f.body}>Post</Button>
            </Card>
          </div>
          <Card title="Joint proposal, tasks & notes">
            {posts.loading ? <LoadingState /> : (posts.data ?? []).map((p) => (
              <article key={p.id} style={{ borderBottom: '1px solid var(--cz-grey-100)', padding: '10px 0' }}>
                <div className="cz-row" style={{ justifyContent: 'space-between' }}><strong>{p.title}</strong><StatusBadge status={p.kind} tone="brand" label={p.kind.replace('_', ' ')} /></div>
                <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{p.body}</p>
                <div className="cz-muted" style={{ fontSize: 12 }}>{p.org} · {p.author} · {new Date(p.createdAt).toLocaleString()}</div>
                {p.kind === 'task' && <Button size="sm" variant="ghost" onClick={() => toggle.run(p.id, p.status === 'open' ? 'done' : 'open')}>{p.status === 'open' ? 'Mark done' : 'Reopen'}</Button>}
              </article>
            ))}
          </Card>
        </div>
      )}
    </Screen>
  );
}
