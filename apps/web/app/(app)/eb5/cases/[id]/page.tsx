'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, LoadingState, Select, TextArea, TextInput, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface M { id: string; stage: number; stageLabel: string; statusSource: string; sourceLabel: string; note: string; by: string; createdAt: string; visibleToClient: boolean }
interface C { lead: { id: string; code: string; fullName: string }; caseStage: number; stages: string[]; sources: { code: string; label: string }[]; relation: string; milestones: M[]; note: string }

/** Case milestones with their provenance. */
export default function Eb5Case() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<C>(`/eb5/cases/${id}`);
  const docs = useQuery<{ id: string; title: string; status: string }[]>(has('citrus_admin', 'business_manager', 'immigration_consultant', 'attorney') ? '/eb5/documents' : null, { leadId: id });
  const [f, setF] = useState({ stage: '0', statusSource: 'internal', note: '', evidenceDocumentId: '', visibleToClient: false });
  const add = useMutation(async () => { await api.post(`/eb5/cases/${id}/milestones`, { stage: Number(f.stage), statusSource: f.statusSource, note: f.note, evidenceDocumentId: f.evidenceDocumentId || undefined, visibleToClient: f.visibleToClient }); setF({ ...f, note: '' }); q.reload(); return true; });
  const c = q.data;
  return (
    <Screen page={{ key: 'eb5-case', title: c ? `Case — ${c.lead.fullName}` : 'Case', access: 'authenticated' }} eyebrow={c ? `GO EB5 · ${c.lead.code}` : 'GO EB5'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !c ? <LoadingState /> : <>
        <ol className="cz-eb5-steps" aria-label="Case stages">{c.stages.map((s, i) => <li key={s} className={i === c.caseStage ? 'now' : i < c.caseStage ? 'done' : ''}>{s}</li>)}</ol>
        <Alert tone="info">{c.note}</Alert>
        {has('citrus_admin', 'business_manager', 'immigration_consultant', 'attorney') && <Card title="Record an update" className="cz-mt">
          {add.error && <Alert tone="danger">{add.error}</Alert>}
          <form noValidate className="cz-stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
            <div className="cz-grid cz-grid-2">
              <Select label="Stage" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} options={c.stages.map((s, i) => ({ value: String(i), label: s }))} />
              <Select label="Where this comes from" value={f.statusSource} onChange={(e) => setF({ ...f, statusSource: e.target.value })} options={c.sources.filter((s) => s.code !== 'attorney_verified' || has('attorney')).map((s) => ({ value: s.code, label: s.label }))} />
              {f.statusSource === 'document_supported' && <Select label="Supporting document (accepted)" value={f.evidenceDocumentId} onChange={(e) => setF({ ...f, evidenceDocumentId: e.target.value })} options={[{ value: '', label: 'Choose' }, ...(docs.data ?? []).filter((d) => d.status === 'accepted').map((d) => ({ value: d.id, label: d.title }))]} />}
            </div>
            <TextArea label="What happened" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={add.fieldErrors.note} />
            {['attorney_verified', 'document_supported'].includes(f.statusSource) && <Checkbox label="Show this update to the client" checked={f.visibleToClient} onChange={(e) => setF({ ...f, visibleToClient: e.target.checked })} />}
            <div><Button type="submit" loading={add.pending}>Record update</Button></div>
          </form>
        </Card>}
        <Card title="Updates" className="cz-mt">
          <Timeline items={[...c.milestones].reverse().map((m) => ({ id: m.id, at: m.createdAt, title: <span>{m.stageLabel} <Badge s={m.statusSource === 'attorney_verified' || m.statusSource === 'document_supported' ? 'verified' : 'pending'} label={m.sourceLabel} /></span>, detail: `${m.note} — ${m.by}${m.visibleToClient ? ' · shown to client' : ''}` }))} empty="No updates yet." />
        </Card>
      </>}
    </Screen>
  );
}
void TextInput;
