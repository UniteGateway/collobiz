'use client';
import { useState } from 'react';
import { sectorName, newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, Dialog, LoadingState, Money, Select, StatusBadge, Tabs, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

/** Screen 132 — Opportunity Approval & Routing (Unite-first review queue with business-hours SLA). */
export default function RoutingQueue() {
  const { me } = useSession();
  const [tab, setTab] = useState<'open' | 'decided'>('open');
  const q = useQuery<any[]>('/admin/routing/queue', { state: tab });
  const [sel, setSel] = useState<any>(null);
  const [f, setF] = useState({ decision: 'accept', reason: '' });
  const decide = useMutation(async () => { await api.request('POST', `/admin/routing/${sel.opportunityId}/decision`, f, { idempotencyKey: newIdempotencyKey() }); setSel(null); setF({ decision: 'accept', reason: '' }); q.reload(); return true; });
  const sweep = useMutation(async () => { const r = await api.post<any>('/admin/routing/sweep'); q.reload(); return r; });
  return (
    <Screen id="132" description="Partner-originated leads awaiting first review by the matching Unite Group company. Accept, release (listed for partners only where the buyer consented), reject, pause with a reason, or escalate." actions={me?.capabilities.includes('routing.configure') && <Button variant="secondary" onClick={() => sweep.run()} loading={sweep.pending}>Run SLA sweep</Button>}>
      {sweep.data && <Alert tone="info">Sweep: {sweep.data.checked} open · {sweep.data.escalated} escalated · {sweep.data.autoReleased} auto-released</Alert>}
      <Tabs value={tab} onChange={(v) => setTab(v as 'open' | 'decided')} tabs={[{ value: 'open', label: 'Awaiting decision' }, { value: 'decided', label: 'Decided' }]} />
      <Card>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Routing queue" rows={(q.data ?? []).map((x) => ({ ...x, id: x.opportunityId }))} columns={[
            { key: 'title', header: 'Lead', render: (x) => <><strong>{x.title}</strong><div className="cz-mono cz-muted">{x.code} · {x.introducer}</div></> },
            { key: 'gc', header: 'Reviewer', render: (x) => <>{x.groupCompany}<div className="cz-muted" style={{ fontSize: 12 }}>{sectorName(x.sector)}</div></> },
            { key: 'value', header: 'Value', render: (x) => <Money minor={x.estimatedValue} /> },
            { key: 'sla', header: 'SLA', render: (x) => x.decision ? <StatusBadge status={x.decision} /> : (
              <>{x.breached ? <StatusBadge status="breached" tone="danger" label="Breached" /> : x.paused ? <StatusBadge status="paused" label="Paused" /> : <span>{hm(x.remainingMinutes)} left</span>}
                <div className="cz-muted" style={{ fontSize: 12 }}>due {new Date(x.dueAt).toLocaleString('en-IN', { timeZone: x.timezone, dateStyle: 'medium', timeStyle: 'short' })} {x.timezone}{x.urgent ? ' · urgent' : ''}{x.escalatedAt ? ' · escalated' : ''}</div></>
            ) },
            { key: 'a', header: '', render: (x) => !x.decision && <Button size="sm" onClick={() => { setSel(x); setF({ decision: x.paused ? 'resume' : 'accept', reason: '' }); }}>Review</Button> },
          ]} />
        )}
      </Card>
      <Dialog open={!!sel} onClose={() => setSel(null)} title={`Review ${sel?.code ?? ''}`}>
        {sel && <p style={{ whiteSpace: 'pre-wrap' }}>{sel.summary}</p>}
        {decide.error && <Alert tone="danger">{decide.error}</Alert>}
        <Select label="Decision" value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })} options={[
          { value: 'accept', label: 'Accept — Unite takes the opportunity' }, { value: 'release', label: 'Release — to approved partners if consented' }, { value: 'reject', label: 'Reject' },
          { value: sel?.paused ? 'resume' : 'pause', label: sel?.paused ? 'Resume review' : 'Pause (e.g. awaiting buyer information)' }, { value: 'escalate', label: 'Escalate to category owner' },
        ]} />
        <TextArea label="Reason (recorded and shared with the introducer)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={decide.fieldErrors.reason} />
        <div className="cz-row"><Button onClick={() => decide.run()} loading={decide.pending}>Record</Button><Button variant="secondary" onClick={() => setSel(null)}>Cancel</Button></div>
      </Dialog>
    </Screen>
  );
}
