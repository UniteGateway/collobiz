'use client';
import { useState } from 'react';
import { RESOLUTION_DECISION_LABELS, RESOLUTION_KIND_LABELS } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, PageHeader, Select, StatusBadge, TextArea } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Case { kind: string; id: string; code: string; subject: string; parties: string[]; status: string; open: boolean; ageDays: number; reviewer: string | null; link: string }
interface Q { totals: { open: number; unassigned: number; over14: number }; cases: Case[]; reviewers: { id: string; name: string }[]; canAssign: boolean }
interface T { events: { at: string; who: string; what: string }[]; digest: { count: number; parties: string[]; spanDays: number; note: string } }

/** Screen 175 — Resolution centre: every dispute in one queue — lead, commission, XCHANGE and contract — with reviewer assignment, the evidence timeline and decisions. */
export default function ResolutionCentre() {
  const q = useQuery<Q>('/admin/resolution');
  const [kind, setKind] = useState('');
  const [assign, setAssign] = useState<Case | null>(null);
  const [view, setView] = useState<Case | null>(null);
  const rows = q.data?.cases.filter((c) => !kind || c.kind === kind) ?? [];
  return (
    <div className="cz-stack" style={{ gap: 18 }}>
      <PageHeader title="Resolution centre" breadcrumb="Partners & compliance" description="All disputes in one queue. Assign a reviewer who belongs to neither party; they read the record and decide with reasons. Appeals go to a super admin." />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <>
          <div className="cz-figures">
            <div className="cz-figure"><span>Open</span><strong>{q.data.totals.open}</strong></div>
            <div className="cz-figure"><span>No reviewer</span><strong style={{ color: q.data.totals.unassigned ? 'var(--cz-warning)' : undefined }}>{q.data.totals.unassigned}</strong></div>
            <div className="cz-figure"><span>Open over 14 days</span><strong style={{ color: q.data.totals.over14 ? 'var(--cz-danger)' : undefined }}>{q.data.totals.over14}</strong></div>
          </div>
          <div style={{ maxWidth: 260 }}><Select label="Kind" placeholder="All kinds" value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(RESOLUTION_KIND_LABELS).map(([value, label]) => ({ value, label }))} /></div>
          <Card>{!rows.length ? <EmptyState icon="success" title="No disputes" /> : (
            <ul className="cz-ws-list">{rows.map((c) => (
              <li key={`${c.kind}-${c.id}`} data-case={c.code}><span><strong>{c.code}</strong> · {RESOLUTION_KIND_LABELS[c.kind]} · {c.subject}<br /><span className="cz-muted" style={{ fontSize: 13 }}>{c.parties.join(' v ')} · {c.ageDays} days · reviewer: {c.reviewer ?? <strong style={{ color: 'var(--cz-warning)' }}>not assigned</strong>}</span></span>
                <span className="cz-row" style={{ gap: 8 }}><StatusBadge status={c.status} tone={c.open ? (c.ageDays > 14 ? 'danger' : 'warning') : 'success'} />
                  {c.open && q.data!.canAssign && <Button size="sm" variant="secondary" onClick={() => setAssign(c)}>{c.reviewer ? 'Reassign' : 'Assign'}</Button>}
                  <Button size="sm" onClick={() => setView(c)}>Open record</Button></span></li>
            ))}</ul>
          )}</Card>
          <Assign c={assign} reviewers={q.data.reviewers} onClose={() => setAssign(null)} onDone={() => { setAssign(null); q.reload(); }} />
          <Record c={view} onClose={() => setView(null)} onDone={() => { setView(null); q.reload(); }} />
        </>
      )}
    </div>
  );
}

function Assign({ c, reviewers, onClose, onDone }: { c: Case | null; reviewers: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [who, setWho] = useState('');
  const save = useMutation(async () => { await api.post('/admin/resolution/assign', { kind: c!.kind, sourceId: c!.id, reviewerUserId: who }); setWho(''); onDone(); return true; });
  return (
    <Dialog open={!!c} onClose={onClose} title={c ? `Reviewer for ${c.code}` : 'Reviewer'}>
      <div className="cz-stack" style={{ gap: 8 }}>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <Select label="Reviewer" placeholder="Choose a Unite reviewer" value={who} onChange={(e) => setWho(e.target.value)} options={reviewers.map((r) => ({ value: r.id, label: r.name }))} />
        <p className="cz-muted" style={{ fontSize: 12.5, margin: 0 }}>Choose someone with no link to {c?.parties.join(' or ')}.</p>
        <div><Button onClick={() => save.run()} loading={save.pending} disabled={!who}>Assign</Button></div>
      </div>
    </Dialog>
  );
}

function Record({ c, onClose, onDone }: { c: Case | null; onClose: () => void; onDone: () => void }) {
  const t = useQuery<T>(c ? `/admin/resolution/${c.kind}/${c.id}/timeline` : null);
  const [f, setF] = useState({ decision: '', note: '' });
  const decide = useMutation(async () => { await api.post(`/admin/resolution/contract/${c!.id}/decide`, f); setF({ decision: '', note: '' }); onDone(); return true; });
  const canDecide = c?.kind === 'contract' && c.open;
  return (
    <Dialog open={!!c} onClose={onClose} title={c ? `${c.code} — ${RESOLUTION_KIND_LABELS[c.kind]}` : 'Record'}>
      <div className="cz-stack" style={{ gap: 10 }}>
        {!t.data ? <LoadingState /> : (
          <>
            <Alert tone="info" title={`${t.data.digest.count} recorded events over ${t.data.digest.spanDays} days`}>{t.data.digest.note}</Alert>
            <ol className="cz-timeline" style={{ maxHeight: 260, overflow: 'auto' }}>{t.data.events.map((e, i) => <li key={i} data-event={e.what.slice(0, 20)}><strong>{e.who}</strong> · <span className="cz-muted">{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span><br /><span style={{ fontSize: 13.5 }}>{e.what}</span></li>)}</ol>
          </>
        )}
        {canDecide ? (
          <>
            {decide.error && <Alert tone="danger">{decide.error}</Alert>}
            <Select label={c!.status === 'appealed' ? 'Final decision (appeal)' : 'Decision'} placeholder="Choose" value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })} options={Object.entries(RESOLUTION_DECISION_LABELS).map(([value, label]) => ({ value, label }))} />
            <TextArea label="Reasons, with reference to the evidence" rows={4} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={decide.fieldErrors.note} />
            <div><Button onClick={() => decide.run()} loading={decide.pending} disabled={!f.decision || f.note.trim().length < 20}>Record decision</Button></div>
          </>
        ) : c && c.kind !== 'contract' ? <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>Decide this case in its own queue: <a href={c.link}>{c.link}</a>.</p> : null}
      </div>
    </Dialog>
  );
}
