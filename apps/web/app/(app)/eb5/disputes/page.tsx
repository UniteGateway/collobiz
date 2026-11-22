'use client';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadingState, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface D { id: string; code: string; name: string; country: string; created_at: string; existing_code: string; claimant: string | null; existing_partner: string | null; dispute: { status: string; decision?: string; note?: string } | null }

/** Lead-ownership claims: a second introduction of the same person. The earlier, time-stamped introduction keeps ownership unless compliance decides otherwise. */
export default function Eb5Disputes() {
  const q = useQuery<D[]>('/eb5/disputes');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = useMutation(async (id: string, decision: string) => { await api.post(`/eb5/leads/${id}/ownership`, { decision, note: notes[id] ?? '' }); q.reload(); return true; });
  return (
    <Screen page={{ key: 'eb5-disputes', title: 'Lead-ownership claims', access: 'authenticated' }} eyebrow="GO EB5 · Compliance">
      {decide.error && <Alert tone="danger">{decide.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <Card><EmptyState icon="verify" title="No ownership claims" /></Card> : (
        <div className="cz-stack" style={{ gap: 14 }}>{q.data.map((d) => (
          <Card key={d.id} title={`${d.name} · ${d.country}`} subtitle={`Claim ${d.code} on ${day(d.created_at)} matches ${d.existing_code}`}>
            <dl className="cz-dl"><dt>Existing introducer</dt><dd>{d.existing_partner ?? 'Direct'}</dd><dt>Claimant</dt><dd>{d.claimant ?? 'Direct / public form'}</dd><dt>Status</dt><dd><Badge s={d.dispute?.status ?? 'open'} label={d.dispute?.decision ? `${d.dispute.decision.replace(/_/g, ' ')} — ${d.dispute.note}` : 'Open'} /></dd></dl>
            {d.dispute?.status === 'open' && <div className="cz-stack" style={{ gap: 8, marginTop: 12 }}>
              <TextArea label="Decision note (evidence considered)" rows={2} value={notes[d.id] ?? ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
              <div className="cz-row" style={{ gap: 8 }}><Button size="sm" onClick={() => decide.run(d.id, 'keep_existing')}>Keep existing owner</Button><Button size="sm" variant="secondary" onClick={() => decide.run(d.id, 'transfer_to_claimant')}>Transfer to claimant</Button></div>
            </div>}
          </Card>
        ))}</div>
      )}
    </Screen>
  );
}
