'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtTime, ProjectTabs, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const TEMPLATES: Record<string, string[]> = {
  quality: ['Work matches approved drawings', 'Materials as per specification', 'Workmanship and finish acceptable', 'Test results within limits'],
  safety: ['Permit to work in place', 'PPE worn by all workers', 'Lock-out / tag-out applied', 'Edge protection and fall arrest in place'],
};

/** Screen 082 — Quality & Safety Inspection. A failed item opens a non-conformance that blocks certification until closed. */
export default function Inspections() {
  const p = useProject();
  const q = useQuery<any[]>(`/projects/${p.id}/inspections`);
  const ms = useQuery<any>(`/projects/${p.id}/milestones`);
  const [kind, setKind] = useState('quality');
  const [milestoneId, setMilestoneId] = useState('');
  const [items, setItems] = useState(TEMPLATES.quality.map((item) => ({ item, result: 'pass', note: '' })));
  const [obs, setObs] = useState('');
  const [ca, setCa] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const pick = (k: string) => { setKind(k); setItems(TEMPLATES[k].map((item) => ({ item, result: 'pass', note: '' }))); };
  const save = useMutation(async () => { await api.post(`/projects/${p.id}/inspections`, { kind, milestoneId: milestoneId || undefined, checklist: items.map((i) => ({ item: i.item, result: i.result, note: i.note || undefined })), observations: obs || undefined, correctiveAction: ca || undefined }); setObs(''); setCa(''); pick(kind); q.reload(); return true; });
  const close = useMutation(async (iid: string) => { await api.post(`/projects/${p.id}/inspections/${iid}/close`, { note: closeNote }); setCloseNote(''); q.reload(); return true; });
  if (p.loading) return <Screen id="082"><LoadingState /></Screen>;
  if (p.error) return <Screen id="082"><ApiErrorView error={p.error} onRetry={p.reload} /></Screen>;
  const d = p.data;
  const canInspect = ['owner', 'lead'].includes(d.role) && ['active', 'on_hold', 'completed'].includes(d.status);
  const failing = items.some((i) => i.result === 'fail');
  return (
    <Screen id="082" title={d.title} description="Certification needs a passing inspection recorded by the owner's own team for each inspection the milestone requires.">
      <ProjectTabs id={p.id} role={d.role} />
      {(save.error || close.error) && <Alert tone="danger">{save.error ?? close.error}</Alert>}
      <Card title="Inspection record">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Inspections" rows={q.data ?? []} empty={<EmptyState title="No inspections yet" />} columns={[
            { key: 'kind', header: 'Type', render: (i: any) => <StatusBadge status={i.kind} tone="brand" /> },
            { key: 'milestone', header: 'Milestone', render: (i: any) => i.milestone ?? 'General' },
            { key: 'result', header: 'Result', render: (i: any) => <StatusBadge status={i.result} tone={i.result === 'pass' ? 'success' : 'danger'} label={i.result === 'pass' ? 'Pass' : i.closedAt ? 'Fail — closed' : 'Fail — open NCR'} /> },
            { key: 'inspector', header: 'Inspector', render: (i: any) => <>{i.inspector}<div className="cz-muted" style={{ fontSize: 12 }}>{i.org} · {fmtTime(i.createdAt)}</div></> },
            { key: 'items', header: 'Checklist', render: (i: any) => i.checklist.map((c: any) => `${c.result === 'pass' ? '✓' : c.result === 'fail' ? '✗' : '–'} ${c.item}`).join(' · ') },
            { key: 'ca', header: 'Corrective action', render: (i: any) => i.correctiveAction ?? '—' },
            { key: 'close', header: 'NCR', render: (i: any) => (i.result === 'fail' && !i.closedAt ? <Button size="sm" variant="secondary" onClick={() => close.run(i.id)} disabled={closeNote.trim().length < 5} aria-label="Close non-conformance">Close</Button> : null) },
          ]} />
        )}
        {(q.data ?? []).some((i) => i.result === 'fail' && !i.closedAt) && <TextInput label="Verification note to close a non-conformance" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />}
      </Card>
      {canInspect && (
        <Card title="Record an inspection">
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <Select label="Inspection type" value={kind} onChange={(e) => pick(e.target.value)} options={[{ value: 'quality', label: 'Quality' }, { value: 'safety', label: 'Safety' }]} />
            <Select label="Milestone" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} placeholder="General" options={(ms.data?.milestones ?? []).map((m: any) => ({ value: m.id, label: `${m.seq}. ${m.title}` }))} />
          </div>
          <fieldset className="cz-fieldset"><legend>Checklist</legend>
            {items.map((it, ix) => (
              <div key={it.item} className="cz-row" style={{ alignItems: 'flex-end' }}>
                <span style={{ minWidth: 260 }}>{it.item}</span>
                <Select label={`Result: ${it.item}`} value={it.result} onChange={(e) => setItems(items.map((x, j) => (j === ix ? { ...x, result: e.target.value } : x)))} options={[{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'na', label: 'Not applicable' }]} />
              </div>
            ))}
          </fieldset>
          <TextArea label="Observations" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          {failing && <TextArea label="Corrective action required" rows={2} value={ca} onChange={(e) => setCa(e.target.value)} error={save.fieldErrors.correctiveAction} />}
          <Button onClick={() => save.run()} loading={save.pending}>Save inspection</Button>
        </Card>
      )}
    </Screen>
  );
}
