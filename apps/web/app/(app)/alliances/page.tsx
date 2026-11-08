'use client';
import { useState } from 'react';
import { COUNTRIES, SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, EmptyState, Icon, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { regionName } from '@/lib/regions';

interface Proposal { id: string; code: string; kind: string; title: string; rationale: string; scope: string; markets: string[]; sectors: string[]; proposerSharePct: number | null; durationMonths: number; status: string; decisionReason: string | null; proposer: string; target: string; incoming: boolean; createdAt: string }
const KIND: Record<string, string> = { joint_venture: 'Joint venture', strategic_alliance: 'Strategic alliance', distribution: 'Distribution agreement' };
const STATUS: Record<string, [string, string]> = { submitted: ['Awaiting reply', 'info'], in_discussion: ['In discussion', 'info'], accepted: ['Agreed in principle', 'success'], declined: ['Declined', 'warning'], withdrawn: ['Withdrawn', 'neutral'] };

/** Screen 123 — JV & strategic alliance proposals. Only the receiving company decides; nothing is binding until signed in Contracts. */
export default function Alliances() {
  const q = useQuery<{ proposals: Proposal[]; targets: { id: string; name: string; type: string }[] }>('/alliances');
  const [tab, setTab] = useState('incoming');
  const [creating, setCreating] = useState(false);
  const list = (q.data?.proposals ?? []).filter((p) => (tab === 'incoming' ? p.incoming : !p.incoming));
  return (
    <Screen id="123" title="Alliances" description="Propose joint ventures, strategic alliances or distribution deals. Agreement here is in principle; the binding contract is drafted and signed in Contracts."
      actions={<Button variant="accent" onClick={() => setCreating(true)}><Icon name="plus" size={16} />New proposal</Button>}>
      {creating && q.data && <NewProposal targets={q.data.targets} onClose={() => setCreating(false)} onDone={() => { setCreating(false); setTab('outgoing'); q.reload(); }} />}
      <div style={{ marginBottom: 14 }}><Segmented label="Proposals" value={tab} onChange={setTab} options={[{ value: 'incoming', label: `Received${q.data ? ` ${q.data.proposals.filter((p) => p.incoming).length}` : ''}` }, { value: 'outgoing', label: 'Sent' }]} /></div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !list.length ? <div className="cz-card"><EmptyState icon="teams" title={tab === 'incoming' ? 'No proposals received' : 'You haven’t sent any proposals'} /></div> : (
        <ul className="cz-review-list">{list.map((p) => <ProposalItem key={p.id} p={p} onChange={q.reload} />)}</ul>
      )}
    </Screen>
  );
}

function ProposalItem({ p, onChange }: { p: Proposal; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const m = useMutation(async (decision: string) => { const r = await api.post<{ next: string | null }>(`/alliances/${p.id}/decision`, { decision, reason }); setReason(''); onChange(); return r; });
  const open = ['submitted', 'in_discussion'].includes(p.status);
  return (
    <li className="cz-card cz-review" data-proposal={p.code}>
      <div className="cz-review-head"><div><span className="cz-route cz-route-unite">{KIND[p.kind]}</span> <span className="cz-mono cz-muted" style={{ fontSize: 12 }}>{p.code}</span></div><StatusBadge status={p.status} tone={STATUS[p.status]?.[1] as never} label={STATUS[p.status]?.[0] ?? p.status} /></div>
      <strong style={{ fontSize: 17, color: 'var(--cz-navy-900)' }}>{p.title}</strong>
      <span className="cz-muted" style={{ fontSize: 13 }}>{p.incoming ? `From ${p.proposer}` : `To ${p.target}`} · {p.markets.map(regionName).join(', ')} · {p.sectors.map(sectorName).join(', ')} · {p.durationMonths} months{p.proposerSharePct ? ` · proposer share ${p.proposerSharePct}%` : ''}</span>
      <p><strong>Why: </strong>{p.rationale}</p>
      <p><strong>Scope: </strong>{p.scope}</p>
      {p.decisionReason && <blockquote className="cz-review-reply"><strong>Latest note</strong>{p.decisionReason}</blockquote>}
      {m.data?.next && <Alert tone="success" title="Next step">{m.data.next}</Alert>}
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {open && (
        <div className="cz-stack" style={{ gap: 8 }}>
          <textarea className="cz-input" rows={2} aria-label={`Note for ${p.code}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={p.incoming ? 'Your reply to the proposer' : 'Reason for withdrawing'} />
          <div className="cz-row" style={{ gap: 8 }}>
            {p.incoming ? (<>
              <Button size="sm" variant="accent" onClick={() => m.run('accepted')} disabled={reason.trim().length < 5}>Agree in principle</Button>
              {p.status === 'submitted' && <Button size="sm" variant="secondary" onClick={() => m.run('in_discussion')} disabled={reason.trim().length < 5}>Discuss</Button>}
              <Button size="sm" variant="ghost" onClick={() => m.run('declined')} disabled={reason.trim().length < 5}>Decline</Button>
            </>) : <Button size="sm" variant="ghost" onClick={() => m.run('withdrawn')} disabled={reason.trim().length < 5}>Withdraw</Button>}
          </div>
        </div>
      )}
    </li>
  );
}

function NewProposal({ targets, onClose, onDone }: { targets: { id: string; name: string; type: string }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ kind: 'strategic_alliance', targetOrgId: '', title: '', rationale: '', scope: '', markets: ['IN'] as string[], sectors: [] as string[], share: '', months: '24' });
  const m = useMutation(async () => { await api.post('/alliances', { kind: f.kind, targetOrgId: f.targetOrgId, title: f.title, rationale: f.rationale, scope: f.scope, markets: f.markets, sectors: f.sectors, proposerSharePct: f.share ? Number(f.share) : undefined, durationMonths: Number(f.months) }); onDone(); return true; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const tog = (k: 'markets' | 'sectors', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  return (
    <section className="cz-card cz-compose" aria-labelledby="np-h" style={{ maxWidth: 820 }}>
      <div className="cz-card-head"><h2 id="np-h">New proposal</h2><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></Button></div>
      {m.error && <Alert tone="danger">{m.error}{Object.values(m.fieldErrors).length ? ` — ${Object.values(m.fieldErrors).join('; ')}` : ''}</Alert>}
      <form className="cz-sched" onSubmit={(e) => { e.preventDefault(); m.run(); }}>
        <label>Type<select className="cz-select" value={f.kind} onChange={set('kind')}>{Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>With<select className="cz-select" value={f.targetOrgId} onChange={set('targetOrgId')}><option value="">Choose a company</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}{t.type === 'group_company' ? ' (Unite Group)' : ''}</option>)}</select></label>
        <label>Duration (months)<input className="cz-input" inputMode="numeric" value={f.months} onChange={(e) => setF({ ...f, months: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="cz-sched-wide">Title<input className="cz-input" value={f.title} onChange={set('title')} /></label>
        <label className="cz-sched-wide">Why this makes sense<textarea className="cz-input" rows={3} value={f.rationale} onChange={set('rationale')} placeholder="At least 30 characters" /></label>
        <label className="cz-sched-wide">Scope<textarea className="cz-input" rows={2} value={f.scope} onChange={set('scope')} placeholder="What each side contributes (at least 20 characters)" /></label>
        <fieldset className="cz-sched-wide cz-chipset"><legend>Markets</legend>{COUNTRIES.map(([c, n]) => <label key={c} data-on={f.markets.includes(c) || undefined}><input type="checkbox" checked={f.markets.includes(c)} onChange={() => tog('markets', c)} />{n}</label>)}</fieldset>
        <fieldset className="cz-sched-wide cz-chipset"><legend>Sectors</legend>{SECTORS.map((s) => <label key={s.code} data-on={f.sectors.includes(s.code) || undefined}><input type="checkbox" checked={f.sectors.includes(s.code)} onChange={() => tog('sectors', s.code)} />{s.name}</label>)}</fieldset>
        <label>Your share % (optional)<input className="cz-input" inputMode="numeric" value={f.share} onChange={(e) => setF({ ...f, share: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
        <div className="cz-sched-wide"><Button type="submit" variant="accent" loading={m.pending} disabled={!f.targetOrgId || f.rationale.trim().length < 30 || f.scope.trim().length < 20 || !f.markets.length || !f.sectors.length}>Send proposal</Button></div>
      </form>
    </section>
  );
}
