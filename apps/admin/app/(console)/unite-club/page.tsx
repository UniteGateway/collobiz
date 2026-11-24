'use client';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Ch { id: string; slug: string; name: string; city: string; state: string | null; about: string; meetingSchedule: string; status: string; proposedBy: string; createdAt: string; members: number }

/** Unite Club chapters: approve proposed chapters; see every chapter's size. */
export default function UniteClubAdmin() {
  const [status, setStatus] = useState('proposed');
  const q = useQuery<{ items: Ch[] }>('/admin/unite-club/chapters', status ? { status } : undefined);
  const decide = useMutation(async (id: string, decision: string) => {
    const note = decision === 'decline' ? window.prompt('Reason (shared with the proposer)') ?? undefined : undefined;
    await api.post(`/admin/unite-club/chapters/${id}/decide`, { decision, note }); q.reload(); return true;
  });
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Unite Club" description="Members propose local chapters of the Unite Club business club. Approve a chapter to open it; its proposer becomes president and runs members, meetings and referrals." />
      <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: 'proposed', label: 'Proposed' }, { value: 'active', label: 'Active' }, { value: 'declined', label: 'Declined' }, { value: '', label: 'All' }]} />
      {decide.error && <Alert tone="danger">{decide.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length ? <Card><EmptyState icon="teams" title="Nothing here">No chapters in this state.</EmptyState></Card> : (
        <div className="cz-grid cz-grid-2">{q.data.items.map((c) => (
          <Card key={c.id}>
            <div className="cz-row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>{c.name}</h3><StatusBadge status={c.status} /></div>
            <p className="cz-muted" style={{ fontSize: 13 }}>{c.city}{c.state ? `, ${c.state}` : ''} · {c.meetingSchedule} · proposed by {c.proposedBy} · {c.members} active members</p>
            <p>{c.about}</p>
            {c.status === 'proposed' && <div className="cz-row" style={{ gap: 8 }}><Button size="sm" variant="accent" onClick={() => decide.run(c.id, 'approve')}>Approve chapter</Button><Button size="sm" variant="ghost" onClick={() => decide.run(c.id, 'decline')}>Decline</Button></div>}
          </Card>
        ))}</div>
      )}
    </div>
  );
}
