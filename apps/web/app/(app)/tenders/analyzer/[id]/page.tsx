'use client';
import { useParams } from 'next/navigation';
import { CRITERION_LABELS } from '@collabiz/types';
import { Alert, Button, Card, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Row { id: string; kind: keyof typeof CRITERION_LABELS; label: string; value: number | null; unit: string | null; page: number; line: number; text: string; status: string; note: string }
interface A { id: string; title: string; fileName: string; pages: number; status: string; reviewNote: string | null; reviewedAt: string | null; rows: Row[]; notMet: number; evidence: number; summary: string; risk: string; deadlineSoon: boolean; disclaimer: string; consortiumCandidates: { partnerId: string; name: string; score: number }[]; checklist: string[]; isOwner: boolean }
const TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = { met: 'success', needs_evidence: 'warning', not_met: 'danger', info: 'info' };
const LABEL: Record<string, string> = { met: 'Meets (your profile)', needs_evidence: 'Needs documents', not_met: 'Gap', info: 'Note' };
const val = (r: Row) => r.value == null ? '' : r.unit === 'paise' ? `₹${(r.value / 100 >= 1e7 ? `${(r.value / 1e9).toFixed(2)} Cr` : (r.value / 100).toLocaleString('en-IN'))}` : r.unit === 'date' ? new Date(r.value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : `${r.value.toLocaleString('en-IN')} ${r.unit ?? ''}`;

/** Screen 170 (detail) — conditions with source references, comparison with the profile, checklist and consortium help. */
export default function TenderAnalysis() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<A>(`/tender-analyses/${id}`);
  const req = useMutation(async () => { await api.post(`/tender-analyses/${id}/request-review`, {}); q.reload(); return true; });
  const a = q.data;
  const groups = a ? Array.from(new Set(a.rows.map((r) => r.kind))) : [];
  return (
    <Screen page={{ key: 'tender-analysis', title: a?.title ?? 'Tender analysis', access: 'partner' }} description={a ? `${a.fileName} · ${a.pages} pages · ${a.rows.length} conditions found` : undefined}
      actions={a ? <StatusBadge status={a.status} tone={a.status === 'reviewed' ? 'success' : 'info'} label={a.status === 'reviewed' ? 'Reviewed by Unite' : a.status === 'review_requested' ? 'Review requested' : 'Not reviewed'} /> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !a ? <LoadingState /> : (
        <>
          <Alert tone={a.risk === 'high' ? 'danger' : a.risk === 'medium' ? 'warning' : 'success'} title={a.summary}>{a.disclaimer}</Alert>
          {a.deadlineSoon && <Alert tone="warning">The submission deadline is within 7 days.</Alert>}
          {a.status === 'reviewed' && <Alert tone="success" title="Unite reviewer’s note">{a.reviewNote}</Alert>}
          <div className="cz-ws-cols">
            <div className="cz-stack" style={{ gap: 14 }}>
              {groups.map((k) => (
                <Card key={k} title={CRITERION_LABELS[k]}>
                  <ul className="cz-ws-list">{a.rows.filter((r) => r.kind === k).map((r) => (
                    <li key={r.id} data-criterion={r.label} style={{ alignItems: 'flex-start' }}>
                      <span><strong>{r.label}{val(r) ? ` — ${val(r)}` : ''}</strong><br />
                        <span className="cz-muted" style={{ fontSize: 13 }}>{r.note}</span><br />
                        <span style={{ fontSize: 12.5 }}>Page {r.page}, line {r.line}: “{r.text}”</span></span>
                      <StatusBadge status={r.status} tone={TONE[r.status]} label={LABEL[r.status]} />
                    </li>
                  ))}</ul>
                </Card>
              ))}
              {!a.rows.length && <Card><p style={{ margin: 0 }}>No conditions were found. The PDF may be scanned; read it and note the conditions yourself.</p></Card>}
            </div>
            <aside className="cz-ws-side">
              <Card title="Bid checklist"><ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>{a.checklist.map((c) => <li key={c}>{c}</li>)}</ul></Card>
              {a.consortiumCandidates.length > 0 && <Card title="Partners who could close the gaps"><ul className="cz-ws-list">{a.consortiumCandidates.map((c) => <li key={c.partnerId}><span><strong>{c.name}</strong><br /><span className="cz-muted" style={{ fontSize: 13 }}>match {Math.round(c.score)}</span></span></li>)}</ul><p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Check the tender’s consortium rules first. Plan a team from Collaboration → Team plans.</p></Card>}
              {a.isOwner && a.status === 'draft' && <Card title="Confirm with Unite">{req.error && <Alert tone="danger">{req.error}</Alert>}<p style={{ marginTop: 0, fontSize: 14 }}>A Unite reviewer checks the conditions against the original document.</p><Button onClick={() => req.run()} loading={req.pending}>Request review</Button></Card>}
            </aside>
          </div>
        </>
      )}
    </Screen>
  );
}
