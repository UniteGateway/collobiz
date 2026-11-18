'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Skeleton, StatusBadge, Stepper, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { dt } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Plan {
  id: string; code: string; model: { code: string; title: string; summary: string; earns: string; firstSteps: string[] }; stage: number; stages: string[];
  applications: { kind: string; id: string; title: string; status: string; href: string; at: string }[]; history: { stage: number; at: string; note: string }[];
  offers: { id: string; title: string; city: string | null }[]; programmes: { slug: string; name: string; open: boolean }[]; lookingFor: number; createdAt: string;
}

export default function LaunchPlan() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Plan>(`/launch/plans/${id}`);
  const [note, setNote] = useState('');
  const move = useMutation(async (stage: number) => { await api.post(`/launch/plans/${id}/stage`, { stage, note }); setNote(''); q.reload(); return true; });
  const p = q.data;
  return (
    <Screen page={{ key: 'launch-plan', title: p ? p.model.title : 'Launch plan', access: 'partner' }} eyebrow={p ? `Launch plan ${p.code}` : 'Launch'} description={p?.model.summary}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <Skeleton height={300} /> : <>
        <Card title="Progress"><Stepper steps={p.stages} current={p.stage} />
          <p className="cz-muted" style={{ fontSize: 13 }}>“Applied” is set automatically when you apply to a matching offer or programme on COLLABIZ. Record later steps yourself, one at a time, with a note.</p>
          {p.stage >= 1 && p.stage < p.stages.length - 1 && (
            <form noValidate className="cz-row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); move.run(p.stage + 1); }}>
              <div style={{ flex: 1, minWidth: 240 }}><TextInput label={`Note for “${p.stages[p.stage + 1]}”`} value={note} onChange={(e) => setNote(e.target.value)} error={move.fieldErrors.note} /></div>
              <Button type="submit" loading={move.pending}>Record: {p.stages[p.stage + 1]}</Button>
            </form>
          )}
          {move.error && !move.fieldErrors.note && <Alert tone="danger">{move.error}</Alert>}
        </Card>
        <div className="cz-grid cz-grid-2" style={{ marginTop: 16 }}>
          <Card title={`Applications (${p.applications.length})`}>
            {p.applications.length ? <ul className="cz-ws-list">{p.applications.map((a) => <li key={a.id}><span><Link href={a.href}>{a.title}</Link> <span className="cz-muted">· {a.kind} · {dt(a.at)}</span></span><StatusBadge status={a.status} /></li>)}</ul>
              : <p className="cz-muted" style={{ margin: 0 }}>None yet. Apply to one of the offers or programmes below.</p>}
          </Card>
          <Card title="Where to apply">
            <ul className="cz-ws-list">
              {p.offers.map((o) => <li key={o.id}><Link href={`/opportunities/${o.id}`}>{o.title}</Link><span className="cz-muted">{o.city ?? 'Offer'}</span></li>)}
              {p.programmes.map((v) => <li key={v.slug}><Link href={`/ventures/${v.slug}`}>{v.name}</Link><span className="cz-muted">{v.open ? 'Unite programme' : 'Not open yet'}</span></li>)}
            </ul>
            <p className="cz-muted" style={{ fontSize: 13, marginBottom: 0 }}>{p.lookingFor} businesses on Collab declared a need this model serves.</p>
          </Card>
        </div>
        <div className="cz-grid cz-grid-2" style={{ marginTop: 16 }}>
          <Card title="First steps"><ol style={{ margin: 0, paddingLeft: 20 }}>{p.model.firstSteps.map((s) => <li key={s}>{s}</li>)}</ol><p className="cz-muted" style={{ fontSize: 13 }}>How it earns: {p.model.earns}</p></Card>
          <Card title="History"><Timeline items={[...p.history].reverse().map((h, i) => ({ id: String(i), at: h.at, title: p.stages[h.stage], detail: h.note }))} /></Card>
        </div>
      </>}
    </Screen>
  );
}
