'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Skeleton, StatusBadge, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { dt } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface C {
  id: string; code: string; title: string; purpose: string; deadline: string; state: string; stateLabel: string; boundAt: string | null; isCreator: boolean; history: { at: string; note: string }[];
  parties: { id: string; name: string; role: string; pledge: string; pledgedAt: string | null; declined: boolean; isMe: boolean }[];
  conditions: { id: string; kindLabel: string; text: string; owner: string | null; evidence: string | null; verifiedAt: string | null; verifiedBy: string | null; iOwn: boolean; canVerify: boolean }[];
  pledged: number; verified: number;
}
const TONE: Record<string, 'success' | 'info' | 'warning' | 'danger'> = { binding: 'success', pledging: 'info', draft: 'info', lapsed: 'warning', withdrawn: 'warning' };

export default function Commitment() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<C>(`/commit/${id}`);
  const [ev, setEv] = useState<Record<string, string>>({}); const [reason, setReason] = useState('');
  const act = useMutation(async (path: string, b: object = {}) => { const r = await api.post<C>(`/commit/${path}`, b); q.setData(r); return r; });
  const c = q.data;
  const open = c && (c.state === 'draft' || c.state === 'pledging');
  const me = c?.parties.find((p) => p.isMe);
  return (
    <Screen page={{ key: 'commit-detail', title: c?.title ?? 'Commitment', access: 'partner' }} eyebrow={c ? `Commit · ${c.code}` : 'Commit'} description={c?.purpose}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !c ? <Skeleton height={300} /> : <>
        <Alert tone={TONE[c.state]} title={c.stateLabel}>
          {c.state === 'binding' ? `Binding since ${dt(c.boundAt)}. Proceed with the agreed contracts.` : `${c.pledged} of ${c.parties.length} parties pledged · ${c.verified} of ${c.conditions.length} conditions verified · deadline ${dt(c.deadline)}. Nothing binds anyone until all of it is in place.`}
        </Alert>
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        {open && me && !me.pledgedAt && !me.declined && (
          <Card title="Your pledge" className="cz-mt"><p style={{ marginTop: 0 }}>As <strong>{me.role}</strong>: {me.pledge}</p>
            <div className="cz-row" style={{ gap: 8 }}><Button onClick={() => act.run(`${id}/pledge`, { decision: 'pledge' })} loading={act.pending}>Pledge</Button><Button variant="ghost" onClick={() => act.run(`${id}/pledge`, { decision: 'decline' })}>Decline</Button></div></Card>
        )}
        <div className="cz-grid cz-grid-2 cz-mt">
          <Card title={`Parties (${c.pledged}/${c.parties.length} pledged)`}>
            <ul className="cz-commit-list">{c.parties.map((p) => (
              <li key={p.id}><div><strong>{p.name}</strong>{p.isMe ? ' (you)' : ''} <span className="cz-muted">· {p.role}</span><p>{p.pledge}</p></div>
                <StatusBadge status={p.pledgedAt ? 'completed' : p.declined ? 'rejected' : 'pending'} label={p.pledgedAt ? `Pledged ${dt(p.pledgedAt)}` : p.declined ? 'Declined' : 'Waiting'} /></li>
            ))}</ul>
          </Card>
          <Card title={`Conditions (${c.verified}/${c.conditions.length} verified)`}>
            <ul className="cz-commit-list">{c.conditions.map((x) => (
              <li key={x.id} data-condition={x.kindLabel}><div><strong>{x.text}</strong> <span className="cz-muted">· {x.kindLabel} · {x.owner}</span>
                {x.evidence && <p>Evidence: {x.evidence}</p>}
                {open && x.iOwn && !x.verifiedAt && <form noValidate className="cz-row" style={{ gap: 6, alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); act.run(`conditions/${x.id}/evidence`, { evidence: ev[x.id] ?? '' }); }}>
                  <div style={{ flex: 1 }}><TextInput label={x.evidence ? 'Update evidence' : 'Post evidence'} value={ev[x.id] ?? ''} onChange={(e) => setEv({ ...ev, [x.id]: e.target.value })} /></div><Button size="sm" type="submit">Post</Button></form>}
                {x.canVerify && <Button size="sm" onClick={() => act.run(`conditions/${x.id}/verify`)}>Verify this condition</Button>}
              </div>
                <StatusBadge status={x.verifiedAt ? 'completed' : x.evidence ? 'in_progress' : 'pending'} label={x.verifiedAt ? `Verified by ${x.verifiedBy}` : x.evidence ? 'Evidence posted' : 'Waiting'} /></li>
            ))}</ul>
          </Card>
        </div>
        <Card title="History" className="cz-mt"><Timeline items={[...c.history].reverse().map((h, i) => ({ id: String(i), at: h.at, title: h.note }))} /></Card>
        {open && c.isCreator && <details className="cz-mt"><summary>Withdraw this commitment</summary>
          <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); act.run(`${id}/withdraw`, { reason }); }}>
            <div style={{ flex: 1 }}><TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button type="submit" variant="danger">Withdraw</Button></form></details>}
      </>}
    </Screen>
  );
}
