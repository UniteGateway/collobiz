'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Button, Card, LoadingState, Segmented, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Cand { partnerId: string; partnerName: string; score: number; reputation: number | null; factors: { factor: string; detail: string }[]; evidence: { item: string; state: string }[] }
interface Role { key: string; role: string; kind?: string; why?: string; coveredByYou?: boolean; responsibilities: string[]; candidates?: Cand[]; gaps?: string[] }
interface Invite { id: string; roleKey: string; organizationId: string; organization: string; status: string; message: string | null; mine: boolean }
interface Plan { id: string; title: string; status: string; teamId: string | null; isOwner: boolean; owner: string; roles: Role[]; invites: Invite[]; matrix?: { activity: string; cells: Record<string, string> }[]; readiness?: { openRoles: string[]; canApprove: boolean }; note?: string }
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { invited: 'info', accepted: 'success', declined: 'neutral', rejected: 'danger' };

/** Screen 166 — AI team plan: roles, responsibilities, ranked candidates with reasons, gaps, matrix, invitations and approval. */
export default function TeamPlan() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery<Plan>(`/ai/team-plans/${id}`);
  const [kind, setKind] = useState('team');
  const invite = useMutation(async (roleKey: string, organizationId: string) => { await api.post(`/ai/team-plans/${id}/invites`, { roleKey, organizationId }); q.reload(); return true; });
  const respond = useMutation(async (inviteId: string, decision: string) => { await api.post(`/team-plan-invites/${inviteId}/respond`, { decision }); q.reload(); return true; });
  const approve = useMutation(async () => { const r = await api.post<{ teamId: string }>(`/ai/team-plans/${id}/approve`, { kind }); router.push(`/teams/${r.teamId}/members`); return r; });
  const p = q.data;
  const err = invite.error ?? respond.error ?? approve.error;
  return (
    <Screen page={{ key: 'team-plan', title: p?.title ?? 'Team plan', access: 'partner' }} description={p ? `Plan by ${p.owner}` : undefined} actions={p ? <StatusBadge status={p.status} /> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <LoadingState /> : (
        <>
          {err && <Alert tone="danger">{err}</Alert>}
          {p.note && <Alert tone="info">{p.note}</Alert>}
          {!p.isOwner && p.invites.filter((i) => i.mine).map((i) => (
            <Card key={i.id} title={`${p.owner} invites you: ${p.roles.find((r) => r.key === i.roleKey)?.role ?? ''}`}>
              <ul style={{ marginTop: 0 }}>{p.roles.find((r) => r.key === i.roleKey)?.responsibilities.map((x) => <li key={x}>{x}</li>)}</ul>
              {i.message && <p className="cz-muted">“{i.message}”</p>}
              {i.status === 'invited' ? <div className="cz-row" style={{ gap: 8 }}><Button onClick={() => respond.run(i.id, 'accept')}>Accept</Button><Button variant="secondary" onClick={() => respond.run(i.id, 'decline')}>Decline</Button></div> : <StatusBadge status={i.status} tone={TONE[i.status]} />}
            </Card>
          ))}
          {p.isOwner && (
            <div className="cz-ws-cols">
              <div className="cz-stack" style={{ gap: 14 }}>
                {p.roles.map((r) => {
                  const invs = p.invites.filter((i) => i.roleKey === r.key);
                  return (
                    <Card key={r.key} title={r.role} subtitle={r.why}>
                      <div data-role={r.key} className="cz-stack" style={{ gap: 10 }}>
                        <p style={{ margin: 0, fontSize: 14 }}><strong>Responsibilities:</strong> {r.responsibilities.join(' · ')}</p>
                        {r.coveredByYou && <Alert tone="success">Your company covers this role.</Alert>}
                        {r.gaps?.map((g) => <Alert key={g} tone="warning">{g}</Alert>)}
                        {invs.map((i) => <div key={i.id} className="cz-row" style={{ gap: 8 }}><strong>{i.organization}</strong><StatusBadge status={i.status} tone={TONE[i.status]} />{i.status === 'accepted' && p.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => respond.run(i.id, 'reject')}>Remove</Button>}</div>)}
                        {(r.candidates ?? []).map((c) => {
                          const invited = invs.some((i) => i.organizationId === c.partnerId);
                          return (
                            <div key={c.partnerId} className="cz-inset" style={{ padding: 12 }}>
                              <div className="cz-row" style={{ gap: 8, justifyContent: 'space-between' }}>
                                <span><strong>{c.partnerName}</strong> <span className="cz-muted">· match {Math.round(c.score)}{c.reputation != null ? ` · reputation ${Math.round(c.reputation)}` : ''}</span></span>
                                {p.status === 'draft' && <Button size="sm" variant={invited ? 'ghost' : 'secondary'} disabled={invited} onClick={() => invite.run(r.key, c.partnerId)}>{invited ? 'Invited' : 'Invite'}</Button>}
                              </div>
                              <p className="cz-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{c.factors.slice(0, 3).map((f) => f.detail).join(' · ')}</p>
                              {c.evidence.length > 0 && <p style={{ margin: '4px 0 0', fontSize: 12.5 }}>{c.evidence.map((e) => `${e.item}: ${e.state}`).join(' · ')}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
              <aside className="cz-ws-side">
                <Card title="Approve the team">
                  {p.status !== 'draft' ? <p style={{ margin: 0 }}>Approved. <a href={`/teams/${p.teamId}/members`}>Open the team</a> — members sign the team NDA to join.</p> : (
                    <div className="cz-stack" style={{ gap: 10 }}>
                      {p.readiness?.openRoles.length ? <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Still open: {p.readiness.openRoles.join(', ')}.</p> : <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Every role is covered.</p>}
                      <Segmented label="Create as" value={kind} onChange={setKind} options={[{ value: 'team', label: 'Team' }, { value: 'consortium', label: 'Consortium' }]} />
                      <Button onClick={() => approve.run()} loading={approve.pending} disabled={!p.readiness?.canApprove}>Approve and create</Button>
                      <p className="cz-muted" style={{ margin: 0, fontSize: 12.5 }}>Needs at least one accepted partner. Creates a team with an NDA; nothing is signed on anyone’s behalf.</p>
                    </div>
                  )}
                </Card>
                {p.matrix && (
                  <Card title="Draft responsibility matrix">
                    <div className="cz-table-wrap"><table className="cz-table cz-table-stack"><caption className="cz-sr-only">Responsibility matrix: R responsible, A accountable, C consulted, I informed</caption>
                      <thead><tr><th scope="col">Activity</th>{p.roles.map((r) => <th key={r.key} scope="col">{r.key === 'lead' ? 'Lead' : r.role.replace(/\s*\(.*\)/, '')}</th>)}</tr></thead>
                      <tbody>{p.matrix.map((m) => <tr key={m.activity}><td data-label="Activity"><strong>{m.activity}</strong></td>{p.roles.map((r) => <td key={r.key} data-label={r.role}>{m.cells[r.key]}</td>)}</tr>)}</tbody>
                    </table></div>
                    <p className="cz-muted" style={{ fontSize: 12, marginBottom: 0 }}>R responsible · A accountable · C consulted · I informed. A draft to agree with partners.</p>
                  </Card>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
