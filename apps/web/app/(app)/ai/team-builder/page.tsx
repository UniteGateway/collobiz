'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Icon, StatusBadge } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { MatchFactors } from '@/components/Growth';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useRouter } from 'next/navigation';

interface Plan { suggestionId: string; opportunity: { id: string; code: string; title: string }; plan: { role: string; why: string; coveredByYou: boolean; candidates: { partnerId: string; partnerName: string; score: number; reputation: number | null; factors: { factor: string; weight: number; score: number; detail: string }[] }[] }[]; note: string; provider: string; promptVersion: string }

/** Screen 162 — AI project collaboration builder: the roles an opportunity needs, which you cover, and who could fill the rest. */
export default function TeamBuilder() {
  const opps = useQuery<{ items: { id: string; code: string; title: string }[] }>('/opportunities', { paged: 'true', limit: '50' });
  const [oid, setOid] = useState('');
  useEffect(() => { const o = new URLSearchParams(window.location.search).get('opportunity'); if (o) setOid(o); }, []);
  const router = useRouter();
  const m = useMutation(async () => api.post<Plan>('/ai/team-builder', { opportunityId: oid }));
  const review = useMutation(async (status: string) => { await api.post(`/ai/suggestions/${m.data!.suggestionId}/review`, { status }); return status; });
  return (
    <Screen id="162" title="Team builder" description="Pick an opportunity. The assistant lists the roles it needs, marks the ones your company covers, and suggests verified partners for the gaps.">
      <form className="cz-ai-query" onSubmit={(e) => { e.preventDefault(); m.run(); }}>
        <label className="cz-sched-label" style={{ flex: '1 1 360px' }}>Opportunity<select className="cz-select" value={oid} onChange={(e) => setOid(e.target.value)}><option value="">Choose an opportunity</option>{(opps.data?.items ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} — {o.title}</option>)}</select></label>
        <Button type="submit" loading={m.pending} disabled={!oid}><Icon name="teams" size={16} />Build team plan</Button>
      </form>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {m.data && (
        <>
          <ol className="cz-roles">
            {m.data.plan.map((r) => (
              <li key={r.role} className="cz-card">
                <div className="cz-card-head"><div><h2>{r.role}</h2><p>{r.why}</p></div><StatusBadge status={r.coveredByYou ? 'covered' : 'gap'} tone={r.coveredByYou ? 'success' : 'warning'} label={r.coveredByYou ? 'Your company covers this' : 'Gap — partner needed'} /></div>
                {!r.coveredByYou && (r.candidates.length ? (
                  <ul className="cz-role-cands">{r.candidates.map((c) => <li key={c.partnerId}><div className="cz-match"><strong>{c.score}</strong><span>match</span></div><div className="cz-ai-main"><Link className="cz-ai-title" href={`/partners/${c.partnerId}/reputation`}>{c.partnerName}</Link><span className="cz-muted" style={{ fontSize: 12.5 }}>{c.reputation == null ? 'Not yet rated' : `Reputation ${c.reputation}/100`}</span><MatchFactors factors={c.factors.filter((f) => f.score < 1 || f.factor === 'Sector').slice(0, 3)} /></div></li>)}</ul>
                ) : <p className="cz-muted">No verified partner who consented to matching fits this role yet.</p>)}
              </li>
            ))}
          </ol>
          <div className="cz-ai-actions">
            <p className="cz-ai-prov" style={{ margin: 0 }}><Icon name="info" size={13} />{m.data.note} Version {m.data.promptVersion}.</p>
            {review.data ? <span className="cz-muted">Thanks — feedback recorded.</span> : <span className="cz-row" style={{ gap: 6 }}><Button size="sm" onClick={async () => { review.run('accepted'); const r = await api.post<{ id: string }>('/ai/team-plans', { sourceType: 'opportunity', sourceId: oid }); router.push(`/ai/team-plans/${r.id}`); }}>Plan, invite and approve</Button><Link href="/teams/new" className="cz-btn cz-btn-secondary cz-btn-sm" onClick={() => review.run('accepted')}>Create a team manually</Link><Button size="sm" variant="ghost" onClick={() => review.run('rejected')}>Not useful</Button></span>}
          </div>
        </>
      )}
    </Screen>
  );
}
