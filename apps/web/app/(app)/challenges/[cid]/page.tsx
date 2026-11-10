'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface C { opportunity: { title: string; sector: string; city: string | null }; roles: string[]; deadline: string; open: boolean; isOwner: boolean; coverage: { rows: { role: string; covered: boolean; partners: string[] }[]; covered: number; total: number; pct: number };
  interests: { org: string; roles: string[]; note: string; verified: boolean }[]; myInterest: { roles: string[]; note: string } | null; canJoin: boolean; note: string }
const left = (d: string) => { const ms = new Date(d).getTime() - Date.now(); if (ms <= 0) return 'Closed'; const h = Math.floor(ms / 3600000); return `${h} h ${Math.floor((ms % 3600000) / 60000)} min left`; };

/** 48-hour team challenge — qualified partners put themselves forward for roles; coverage shows what is still open. */
export default function Challenge() {
  const { cid } = useParams<{ cid: string }>();
  const q = useQuery<C>(`/challenges/${cid}`);
  const [f, setF] = useState({ items: [] as string[], note: '' });
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  const join = useMutation(async () => { await api.post(`/challenges/${cid}/interest`, f); q.reload(); return true; });
  const c = q.data;
  return (
    <Screen page={{ key: 'challenge', title: c ? `Team challenge: ${c.opportunity.title}` : 'Team challenge', access: 'partner' }} description={c ? `${c.opportunity.sector}${c.opportunity.city ? ` · ${c.opportunity.city}` : ''} · ${c.open ? left(c.deadline) : 'Closed'}` : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !c ? <LoadingState /> : (
        <>
          <Card title={`Roles covered: ${c.coverage.covered} of ${c.coverage.total}`}>
            <ul className="cz-ws-list">{c.coverage.rows.map((r) => <li key={r.role} data-role={r.role}><span><strong>{r.role}</strong>{c.isOwner && r.partners.length ? <><br /><span className="cz-muted" style={{ fontSize: 13 }}>{r.partners.join(', ')}</span></> : null}</span><StatusBadge status={r.covered ? 'covered' : 'open'} tone={r.covered ? 'success' : 'warning'} label={r.covered ? 'Covered' : 'Open'} /></li>)}</ul>
          </Card>
          {c.canJoin && (
            <Card title={c.myInterest ? 'Update your interest' : 'Put your company forward'}>
              {c.myInterest && <Alert tone="success">You put forward: {c.myInterest.roles.join(', ')}.</Alert>}
              {join.error && <Alert tone="danger">{join.error}</Alert>}
              {c.roles.map((r) => <Checkbox key={r} label={r} checked={f.items.includes(r)} onChange={(e) => setF({ ...f, items: e.target.checked ? [...f.items, r] : f.items.filter((x) => x !== r) })} />)}
              <TextArea label="Why your company" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
              <Button onClick={() => join.run()} loading={join.pending} disabled={!f.items.length || f.note.trim().length < 10}>Put us forward</Button>
            </Card>
          )}
          {c.isOwner && c.interests.length > 0 && <Card title="Who put themselves forward"><ul className="cz-ws-list">{c.interests.map((i, k) => <li key={k}><span><strong>{i.org}</strong>{i.verified ? '' : ' (not yet verified)'} · {i.roles.join(', ')}<br /><span style={{ fontSize: 13 }}>{i.note}</span></span></li>)}</ul></Card>}
          <p className="cz-muted" style={{ fontSize: 12.5 }}>{c.note}</p>
        </>
      )}
    </Screen>
  );
}
