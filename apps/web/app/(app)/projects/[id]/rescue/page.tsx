'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, StatusBadge, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ProjectTabs, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface R { project: { code: string; title: string }; parties: { id: string; name: string }[]; gaps: { key: string; label: string }[]; canRequest: boolean;
  rescue: { id: string; status: string; gaps: string[]; note: string; authorized: { orgId: string; name: string; at: string | null }[]; canAuthorize: boolean } | null;
  candidates: { orgId: string; name: string; city: string | null; covers: string[] }[]; interests: { org: string; items: string[]; note: string }[] }

/** Opportunity Rescue — when the team cannot finish, find partners for the missing finance, technology, crews or equipment, with every party's authorisation. */
export default function Rescue() {
  const pr = useProject();
  const q = useQuery<R>(`/projects/${pr.id}/rescue`);
  const [f, setF] = useState({ gaps: [] as string[], note: '' });
  const [invited, setInvited] = useState<string[]>([]);
  const ask = useMutation(async () => { await api.post(`/projects/${pr.id}/rescue`, f); q.reload(); return true; });
  const auth = useMutation(async (rid: string) => { await api.post(`/rescue/${rid}/authorize`); q.reload(); return true; });
  const invite = useMutation(async (a: { rid: string; org: string }) => { await api.post(`/rescue/${a.rid}/invite/${a.org}`); setInvited((x) => [...x, a.org]); return true; });
  const d = q.data;
  const err = ask.error ?? auth.error ?? invite.error;
  return (
    <Screen page={{ key: 'project-rescue', title: 'Rescue', access: 'partner' }} description="If the team cannot complete this project, list what is missing. COLLABIZ searches for partners only after every original party authorises it.">
      <ProjectTabs id={pr.id} role={pr.data?.role} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : (
        <>
          {err && <Alert tone="danger">{err}</Alert>}
          {!d.rescue || d.rescue.status === 'closed' ? (d.canRequest ? (
            <Card title="What is missing?">
              {d.gaps.map((g) => <Checkbox key={g.key} label={g.label} checked={f.gaps.includes(g.key)} onChange={(e) => setF({ ...f, gaps: e.target.checked ? [...f.gaps, g.key] : f.gaps.filter((x) => x !== g.key) })} />)}
              <TextArea label="Describe the gap" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} hint="What, how much and for how long" />
              <Button onClick={() => ask.run()} loading={ask.pending} disabled={!f.gaps.length || f.note.trim().length < 20}>Ask the other party to authorise</Button>
            </Card>
          ) : <EmptyState icon="success" title="No rescue requested" />) : (
            <>
              <Card title="Rescue request" actions={<StatusBadge status={d.rescue.status} tone={d.rescue.status === 'searching' ? 'success' : 'warning'} label={d.rescue.status === 'searching' ? 'Authorised — searching' : 'Waiting for authorisation'} />}>
                <p style={{ margin: 0 }}><strong>{d.rescue.gaps.join(', ')}</strong> — {d.rescue.note}</p>
                <ul style={{ fontSize: 13.5, margin: '8px 0 0', paddingLeft: 18 }}>{d.rescue.authorized.map((a) => <li key={a.orgId} data-authorized={a.name}>{a.name}: {a.at ? `authorised ${new Date(a.at).toLocaleDateString('en-IN')}` : 'not yet'}</li>)}</ul>
                {d.rescue.canAuthorize && <div style={{ marginTop: 10 }}><Button onClick={() => auth.run(d.rescue!.id)} loading={auth.pending}>Authorise the search</Button></div>}
              </Card>
              {d.rescue.status === 'searching' && (
                <div className="cz-grid cz-grid-2">
                  <Card title="Partners who could help">{!d.candidates.length ? <p className="cz-muted" style={{ margin: 0 }}>No verified partner matches yet.</p> : (
                    <ul className="cz-ws-list">{d.candidates.map((c) => (
                      <li key={c.orgId} data-candidate={c.name}><span><Link href={`/dna/${c.orgId}`}><strong>{c.name}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{c.city ?? ''} · could help with {c.covers.join(', ')}</span></span>
                        <Button size="sm" variant="secondary" disabled={invited.includes(c.orgId)} onClick={() => invite.run({ rid: d.rescue!.id, org: c.orgId })}>{invited.includes(c.orgId) ? 'Invited' : 'Invite'}</Button></li>
                    ))}</ul>)}</Card>
                  <Card title="Offers of help">{!d.interests.length ? <p className="cz-muted" style={{ margin: 0 }}>None yet.</p> : <ul className="cz-ws-list">{d.interests.map((i, k) => <li key={k} data-offer={i.org}><span><strong>{i.org}</strong> · {i.items.join(', ')}<br /><span style={{ fontSize: 13 }}>{i.note}</span></span></li>)}</ul>}</Card>
                </div>
              )}
            </>
          )}
          <p className="cz-muted" style={{ fontSize: 12.5 }}>Offers are expressions of interest. Any new partner joins only through the normal team, NDA and agreement steps.</p>
        </>
      )}
    </Screen>
  );
}
