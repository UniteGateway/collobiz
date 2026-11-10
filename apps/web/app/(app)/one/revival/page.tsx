'use client';
import { useState } from 'react';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Item { id: string; code: string; title: string; status: string; sector: string; value: number | null; owner: boolean; request: { id: string; status: string; reason: string; decisionNote: string | null } | null; suggestions: { kind: string; title: string; detail: string }[] }
const rupees = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);

/** Opportunity Revival — lost or expired opportunities you brought, with ways to make them work and the owner's permission to try again. */
export default function Revival() {
  const q = useQuery<{ items: Item[] }>('/revival');
  const [ask, setAsk] = useState<Item | null>(null);
  return (
    <Screen page={{ key: 'revival', title: 'Revive past opportunities', access: 'partner' }} description="Lost or expired opportunities you own or introduced. Suggestions are ideas only; you revive with the owner's permission.">
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length ? <EmptyState icon="success" title="Nothing to revive" /> : (
        <ul className="cz-ws-list">{q.data.items.map((o) => (
          <li key={o.id} data-revival={o.code} style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ flex: '1 1 380px' }}><strong>{o.code} — {o.title}</strong> · {o.sector} · {rupees(o.value)}<br />
              <span style={{ fontSize: 13.5 }}>{o.suggestions.map((s) => <span key={s.kind} style={{ display: 'block' }}>• <strong>{s.title}</strong> — {s.detail}</span>)}</span></span>
            <span className="cz-row" style={{ gap: 8 }}>
              {o.request && <StatusBadge status={o.request.status} tone={o.request.status === 'approved' ? 'success' : o.request.status === 'declined' ? 'danger' : 'warning'} label={o.request.status === 'approved' ? 'Revival approved' : o.request.status === 'declined' ? 'Declined' : 'Waiting for owner'} />}
              {(!o.request || o.request.status === 'declined') && <Button size="sm" onClick={() => setAsk(o)}>{o.owner ? 'Revive' : 'Ask the owner'}</Button>}
            </span>
          </li>
        ))}</ul>
      )}</Card>
      <Ask item={ask} onClose={() => setAsk(null)} onDone={() => { setAsk(null); q.reload(); }} />
    </Screen>
  );
}

function Ask({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const go = useMutation(async () => { await api.post(`/opportunities/${item!.id}/revival`, { reason }); setReason(''); onDone(); return true; });
  return (
    <Dialog open={!!item} onClose={onClose} title={item ? `Revive ${item.code}` : 'Revive'}>
      <div className="cz-stack" style={{ gap: 6 }}>
        {go.error && <Alert tone="danger">{go.error}</Alert>}
        <TextArea label="Why it can work now" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div><Button onClick={() => go.run()} loading={go.pending} disabled={reason.trim().length < 20}>{item?.owner ? 'Revive' : 'Send to the owner'}</Button></div>
      </div>
    </Dialog>
  );
}
