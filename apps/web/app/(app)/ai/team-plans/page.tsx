'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SECTORS } from '@collabiz/types';
import { Alert, Button, Card, EmptyState, LoadingState, Segmented, Select, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Plans { mine: { id: string; title: string; sourceType: string; status: string; roles: number; createdAt: string }[]; invited: { inviteId: string; planId: string; title: string; role?: string; status: string }[] }

/** Screen 166 (list) — AI team plans for projects, tenders and opportunities. */
export default function TeamPlans() {
  const router = useRouter();
  const q = useQuery<Plans>('/ai/team-plans');
  const projects = useQuery<any[]>('/projects');
  const tenders = useQuery<any>('/tenders');
  const [src, setSrc] = useState('project');
  const [id, setId] = useState('');
  const [sector, setSector] = useState('');
  const tenderList: any[] = [...(tenders.data?.issued ?? []), ...(tenders.data?.open ?? [])];
  const options = src === 'project' ? (projects.data ?? []).filter((p) => p.role !== 'subcontractor').map((p) => ({ value: p.id, label: `${p.code} — ${p.title}` })) : tenderList.map((t) => ({ value: t.id, label: `${t.code} — ${t.title}` }));
  const create = useMutation(async () => { const r = await api.post<{ id: string }>('/ai/team-plans', { sourceType: src, sourceId: id, sector: sector || undefined }); router.push(`/ai/team-plans/${r.id}`); return r; });
  return (
    <Screen page={{ key: 'team-plans', title: 'AI team plans', access: 'partner' }} description="Plan the team a project or tender needs: roles and responsibilities, the best verified partners for each, and the gaps nobody covers yet. You decide whom to invite.">
      <Card title="New team plan">
        {create.error && <Alert tone="danger">{create.error}</Alert>}
        <div className="cz-stack" style={{ gap: 4 }}>
          <Segmented label="For" value={src} onChange={(v) => { setSrc(v); setId(''); }} options={[{ value: 'project', label: 'A project' }, { value: 'tender', label: 'A tender' }]} />
          <div className="cz-grid cz-grid-2" style={{ gap: '0 16px', marginTop: 12 }}>
            <Select label={src === 'project' ? 'Project' : 'Tender'} placeholder="Choose" value={id} onChange={(e) => setId(e.target.value)} options={options} />
            <Select label="Main sector (optional)" placeholder="From the project or tender" value={sector} onChange={(e) => setSector(e.target.value)} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          </div>
          <div><Button onClick={() => create.run()} loading={create.pending} disabled={!id}>Build team plan</Button></div>
          <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>For a marketplace opportunity, use Team builder on the opportunity. Nobody is contacted until you invite them.</p>
        </div>
      </Card>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <div className="cz-grid cz-grid-2">
          <Card title="Your plans">{!q.data.mine.length ? <EmptyState icon="teams" title="No plans yet" /> : <ul className="cz-ws-list">{q.data.mine.map((p) => <li key={p.id} data-plan={p.title}><span><Link href={`/ai/team-plans/${p.id}`}><strong>{p.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{p.roles} roles · {new Date(p.createdAt).toLocaleDateString('en-IN')}</span></span><StatusBadge status={p.status} /></li>)}</ul>}</Card>
          <Card title="Invitations to you">{!q.data.invited.length ? <EmptyState icon="inbox" title="No invitations" /> : <ul className="cz-ws-list">{q.data.invited.map((i) => <li key={i.inviteId}><span><Link href={`/ai/team-plans/${i.planId}`}><strong>{i.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{i.role}</span></span><StatusBadge status={i.status} /></li>)}</ul>}</Card>
        </div>
      )}
    </Screen>
  );
}
