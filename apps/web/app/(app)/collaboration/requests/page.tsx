'use client';
import Link from 'next/link';
import { Alert, Button, Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 059 — Incoming Collaboration Requests (atlas: mobile-first). */
export default function Requests() {
  const q = useQuery<any[]>('/collaboration/requests');
  const respond = useMutation(async (teamId: string, decision: string) => { await api.post(`/teams/${teamId}/respond`, { decision }); q.reload(); return true; });
  return (
    <Screen id="059" description="Accepting lets you read and sign the team NDA. Private details unlock only after you sign.">
      {respond.error && <Alert tone="danger">{respond.error}</Alert>}
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data?.length ? <EmptyState title="No collaboration requests" /> : q.data.map((r) => (
        <Card key={r.memberId} title={`${r.team} — from ${r.lead}`} actions={<StatusBadge status={r.status} />}>
          <p>{r.purpose}</p>
          <p><strong>Your proposed role:</strong> {r.role} — {r.responsibilities}</p>
          {r.message && <blockquote style={{ borderLeft: '3px solid var(--cz-green-500)', margin: 0, paddingLeft: 12 }}>{r.message}</blockquote>}
          {r.matchScore != null && <p className="cz-muted" style={{ fontSize: 13 }}>Suggested by explainable matching (score {Math.round(r.matchScore)}).</p>}
          {r.revokedReason && <Alert tone="warning">Removed: {r.revokedReason}</Alert>}
          <div className="cz-row" style={{ marginTop: 8 }}>
            {r.status === 'invited' && <><Button onClick={() => respond.run(r.teamId, 'accept')}>Accept</Button><Button variant="secondary" onClick={() => respond.run(r.teamId, 'decline')}>Decline</Button></>}
            {r.status === 'accepted' && <Link className="cz-btn cz-btn-accent" href={`/teams/${r.teamId}/nda`}>Read &amp; sign NDA</Link>}
            {r.status === 'nda_signed' && <Link className="cz-btn cz-btn-secondary" href={`/teams/${r.teamId}/workspace`}>Open workspace</Link>}
          </div>
        </Card>
      ))}
    </Screen>
  );
}
