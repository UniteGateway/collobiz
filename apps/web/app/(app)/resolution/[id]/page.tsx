'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { RESOLUTION_DECISION_LABELS } from '@collabiz/types';
import { Alert, Button, Card, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface C { code: string; subject: string; statement: string; amount: number | null; status: string; decision: string | null; decisionNote: string | null; raisedBy: string; against: string; project: { code: string; title: string } | null; events: { kind: string; body: string; at: string; org: string; who: string }[]; canRespond: boolean; canAppeal: boolean; appealDeadline: string | null }
const STATUS: Record<string, string> = { open: 'Open', decided: 'Decided — appeal possible', appealed: 'Appealed', closed: 'Closed' };

/** Contract-responsibility dispute: statements, evidence, decision and appeal. */
export default function DisputeCase() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<C>(`/resolution/${id}`);
  const [text, setText] = useState('');
  const respond = useMutation(async (kind: string) => { await api.post(`/resolution/${id}/respond`, { body: text, kind }); setText(''); q.reload(); return true; });
  const appeal = useMutation(async () => { await api.post(`/resolution/${id}/appeal`, { note: text }); setText(''); q.reload(); return true; });
  const c = q.data;
  return (
    <Screen page={{ key: 'dispute-case', title: c ? `${c.code}: ${c.subject}` : 'Dispute', access: 'partner' }} description={c ? `${c.raisedBy} v ${c.against}${c.project ? ` · ${c.project.code}` : ''}${c.amount ? ` · ₹${Math.round(c.amount / 100).toLocaleString('en-IN')} in question` : ''}` : undefined}
      actions={c ? <StatusBadge status={c.status} label={STATUS[c.status]} /> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !c ? <LoadingState /> : (
        <div className="cz-ws-cols">
          <div className="cz-stack" style={{ gap: 14 }}>
            {c.decision && <Alert tone={c.status === 'closed' ? 'success' : 'info'} title={`Decision: ${RESOLUTION_DECISION_LABELS[c.decision]}`}>{c.decisionNote}{c.canAppeal && c.appealDeadline ? ` You may appeal once until ${new Date(c.appealDeadline).toLocaleDateString('en-IN')}.` : ''}</Alert>}
            <Card title="Record">
              <ol className="cz-timeline">{c.events.map((e, i) => <li key={i} data-event={e.kind}><strong>{e.org}</strong> · {e.kind} · <span className="cz-muted">{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span><br /><span style={{ fontSize: 14 }}>{e.body}</span></li>)}</ol>
            </Card>
          </div>
          <aside className="cz-ws-side">
            {(c.canRespond || c.canAppeal) && (
              <Card title={c.canAppeal ? 'Appeal the decision' : 'Add to the record'}>
                {(respond.error || appeal.error) && <Alert tone="danger">{respond.error ?? appeal.error}</Alert>}
                <TextArea label={c.canAppeal ? 'Why the decision should change' : 'Your response or evidence'} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="cz-row" style={{ gap: 8 }}>
                  {c.canRespond && <><Button onClick={() => respond.run('response')} disabled={text.trim().length < 10}>Add response</Button><Button variant="secondary" onClick={() => respond.run('evidence')} disabled={text.trim().length < 10}>Add as evidence</Button></>}
                  {c.canAppeal && <Button onClick={() => appeal.run()} disabled={text.trim().length < 20}>Appeal</Button>}
                </div>
              </Card>
            )}
            <Card title="How this works"><p style={{ margin: 0, fontSize: 14 }}>A Unite reviewer who belongs to neither company reads the record and decides with reasons. Either side may appeal once within 14 days; a super admin then makes the final decision. This is internal mediation, not a court or arbitration.</p></Card>
          </aside>
        </div>
      )}
    </Screen>
  );
}
