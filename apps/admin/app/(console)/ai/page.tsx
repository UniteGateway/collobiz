'use client';
import { useState } from 'react';
import { Alert, Button, EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Overview { provider: string; promptVersion: string; capabilities: { kind: string; enabled: boolean; total: number; pending: number; acceptance: number | null; lastAt: string | null }[]; recent: { id: string; kind: string; org: string; status: string; feedback: string | null; provider: string; promptVersion: string; sources: { type: string }[]; createdAt: string }[]; safeguards: string[] }
const KIND: Record<string, [string, string]> = { proposal_draft: ['Proposal drafts', 'Technical sections for bids, from the partner’s verified profile'], opportunity_match: ['Opportunity matching', 'Ranks open opportunities for each partner'], partner_match: ['Partner recommendations', 'Ranks verified partners for a sector or opportunity'], team_builder: ['Team builder', 'Proposes roles and partners to fill capability gaps'] };
const STATUS: Record<string, [string, string]> = { draft: ['Not reviewed', 'neutral'], accepted: ['Accepted', 'success'], edited: ['Edited', 'info'], rejected: ['Rejected', 'warning'] };

/** Screen 140 — AI monitoring and recommendation controls. Super admin only. */
export default function AiGovernance() {
  const q = useQuery<Overview>('/admin/ai');
  const [pending, setPending] = useState<{ kind: string; enabled: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const save = useMutation(async () => { await api.put('/admin/ai/settings', { ...pending, reason }); setPending(null); setReason(''); await q.reload(); return true; });
  const d = q.data;
  return (
    <Screen id="140" title="AI governance" description="Every AI output on COLLABIZ is a reviewable draft that records its sources and version. Switch any capability off here; it stops immediately for everyone.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <div className="cz-ta">
          <p className="cz-ai-prov" style={{ margin: 0 }}><Icon name="info" size={13} />Provider: <strong>{d.provider === 'rules' ? 'COLLABIZ rules engine (no external model)' : d.provider}</strong> · version {d.promptVersion}</p>
          <div className="cz-ta-kpis">
            {d.capabilities.map((c) => (
              <div key={c.kind} className="cz-ta-kpi" data-tone={!c.enabled ? 'warn' : undefined} style={{ cursor: 'default' }}>
                <span className="cz-ta-kpi-top"><span>{KIND[c.kind]?.[0] ?? c.kind}</span><StatusBadge status={c.enabled ? 'on' : 'off'} tone={c.enabled ? 'success' : 'warning'} label={c.enabled ? 'On' : 'Off'} /></span>
                <strong>{c.total}</strong>
                <span className="cz-ta-kpi-hint">{c.acceptance == null ? 'No reviewed outputs yet' : `${c.acceptance}% accepted or edited`}{c.pending ? ` · ${c.pending} awaiting review` : ''}</span>
                <span className="cz-ta-kpi-hint">{KIND[c.kind]?.[1]}</span>
                <Button size="sm" variant={c.enabled ? 'ghost' : 'secondary'} onClick={() => setPending({ kind: c.kind, enabled: !c.enabled })}>{c.enabled ? 'Turn off' : 'Turn on'}</Button>
              </div>
            ))}
          </div>
          {pending && (
            <form className="cz-card cz-stack" style={{ gap: 10, maxWidth: 640 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
              <strong>{pending.enabled ? 'Turn on' : 'Turn off'} {KIND[pending.kind]?.[0]}?</strong>
              {save.error && <Alert tone="danger">{save.error}</Alert>}
              <textarea className="cz-input" rows={2} aria-label="Reason (recorded in the audit log)" placeholder="Reason — recorded in the audit log (at least 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="cz-row" style={{ gap: 8 }}><Button type="submit" variant={pending.enabled ? 'primary' : 'danger'} loading={save.pending} disabled={reason.trim().length < 10}>Confirm</Button><Button type="button" variant="ghost" onClick={() => setPending(null)}>Cancel</Button></div>
            </form>
          )}
          <section className="cz-card" aria-labelledby="sg-h"><h2 id="sg-h" className="cz-help-h">Safeguards in force</h2><ul className="cz-od-checks">{d.safeguards.map((s) => <li key={s} data-result="pass"><Icon name="check" size={16} /><span><strong>{s}</strong></span></li>)}</ul></section>
          <section aria-labelledby="log-h">
            <h2 id="log-h" className="cz-help-h">Recent outputs</h2>
            {!d.recent.length ? <div className="cz-card"><EmptyState icon="info" title="No AI outputs yet" /></div> : (
              <div className="cz-ta-table-wrap">
                <table className="cz-ta-table">
                  <caption className="cz-sr-only">Recent AI outputs</caption>
                  <thead><tr><th scope="col">Capability</th><th scope="col">Organization</th><th scope="col">Review</th><th scope="col">Sources</th><th scope="col">When</th></tr></thead>
                  <tbody>{d.recent.map((r) => <tr key={r.id} style={{ cursor: 'default' }}><td><strong>{KIND[r.kind]?.[0] ?? r.kind}</strong><div className="cz-muted" style={{ fontSize: 12 }}>{r.promptVersion}</div></td><td>{r.org}</td><td><StatusBadge status={r.status} tone={STATUS[r.status]?.[1] as never} label={STATUS[r.status]?.[0] ?? r.status} />{r.feedback && <div className="cz-muted" style={{ fontSize: 12 }}>“{r.feedback}”</div>}</td><td className="cz-muted" style={{ fontSize: 12.5 }}>{(r.sources ?? []).map((s) => s.type.replace(/_/g, ' ')).join(', ') || '—'}</td><td className="cz-ta-date">{new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </Screen>
  );
}
