'use client';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, DescriptionList, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtTime, ProjectTabs, rupees, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 084 — Project Closure & Completion Certificate (hashed snapshot of certified milestones and evidence). */
export default function Closure() {
  const p = useProject();
  const q = useQuery<any>(`/projects/${p.id}/closure`);
  const complete = useMutation(async () => { const r = await api.request('POST', `/projects/${p.id}/complete`, undefined, { idempotencyKey: newIdempotencyKey() }); q.reload(); p.reload(); return r; });
  const close = useMutation(async () => { await api.post(`/projects/${p.id}/close`); q.reload(); p.reload(); return true; });
  if (p.loading || q.loading) return <Screen id="084"><LoadingState /></Screen>;
  if (p.error || q.error) return <Screen id="084"><ApiErrorView error={p.error ?? q.error} onRetry={q.reload} /></Screen>;
  const d = p.data;
  const c = q.data;
  const cert = c.certificate;
  return (
    <Screen id="084" title={d.title}>
      <ProjectTabs id={p.id} role={d.role} />
      {(complete.error || close.error) && <Alert tone="danger">{complete.error ?? close.error}</Alert>}
      <Card title="Closure checklist">
        <ul className="cz-checklist" aria-label="Closure checks">{c.checks.map((x: any) => <li key={x.key} data-ok={x.ok}>{x.ok ? '✅' : '❌'} {x.label}</li>)}</ul>
        {c.role === 'owner' && d.status === 'active' && <Button onClick={() => complete.run()} disabled={!c.checks.filter((x: any) => !x.closeOnly).every((x: any) => x.ok)} loading={complete.pending}>Issue completion certificate</Button>}
        {c.role === 'owner' && d.status === 'completed' && <Button variant="secondary" onClick={() => close.run()} disabled={!c.checks.every((x: any) => x.ok)} loading={close.pending}>Close project</Button>}
        {d.status === 'closed' && <Alert tone="success">Project closed on {fmtTime(d.closedAt)}.</Alert>}
      </Card>
      {cert && (
        <Card title={`Completion certificate ${cert.code}`}>
          <DescriptionList items={[['Issued', fmtTime(cert.completedAt)], ['Contract value', rupees(cert.snapshot.value)], ['Certificate hash (SHA-256)', <span key="h" className="cz-mono" style={{ wordBreak: 'break-all' }}>{cert.hash}</span>], ['Inspections', `${cert.snapshot.inspections.passed} passed of ${cert.snapshot.inspections.total}; ${cert.snapshot.inspections.nonConformancesClosed} non-conformance(s) closed`]]} />
          <DataTable caption="Certified milestones" rows={cert.snapshot.milestones.map((m: any) => ({ ...m, id: String(m.seq) }))} columns={[
            { key: 'seq', header: '#' }, { key: 'title', header: 'Milestone' }, { key: 'certifiedAmount', header: 'Certified', render: (m: any) => rupees(m.certifiedAmount) },
            { key: 'evidenceHash', header: 'Evidence seal', render: (m: any) => <span className="cz-mono">{m.evidenceHash?.slice(0, 12)}…</span> },
          ]} />
        </Card>
      )}
    </Screen>
  );
}
