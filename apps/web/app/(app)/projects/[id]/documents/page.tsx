'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, Grid, LoadingState, Select, StatusBadge, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtTime, ProjectTabs, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const CATS = [['drawing', 'Drawing'], ['permit', 'Permit / approval'], ['photo', 'Photo'], ['test_report', 'Test report'], ['handover', 'Handover (as-built, manuals, warranties)'], ['other', 'Other']].map(([value, label]) => ({ value, label }));

/** Screen 081 — Project Documents Repository (new versions supersede; nothing is overwritten). */
export default function Documents() {
  const p = useProject();
  const q = useQuery<any[]>(`/projects/${p.id}/documents`);
  const ms = useQuery<any>(`/projects/${p.id}/milestones`);
  const [showAll, setShowAll] = useState(false);
  const [f, setF] = useState({ title: '', category: 'drawing', milestoneId: '', supersedesId: '', reason: '' });
  const [file, setFile] = useState<File | null>(null);
  const up = useMutation(async () => {
    const fd = new FormData(); if (file) fd.append('file', file);
    Object.entries(f).forEach(([k, v]) => v && fd.append(k, v));
    await api.upload(`/projects/${p.id}/documents`, fd); setF({ title: '', category: 'drawing', milestoneId: '', supersedesId: '', reason: '' }); setFile(null); q.reload(); return true;
  });
  const open = async (docId: string) => { const r = await api.get<{ url: string }>(`/projects/${p.id}/documents/${docId}/url`); window.open(r.url, '_blank', 'noopener'); };
  if (p.loading) return <Screen id="081"><LoadingState /></Screen>;
  if (p.error) return <Screen id="081"><ApiErrorView error={p.error} onRetry={p.reload} /></Screen>;
  const d = p.data;
  const rows = (q.data ?? []).filter((x) => showAll || x.current);
  return (
    <Screen id="081" title={d.title}>
      <ProjectTabs id={p.id} role={d.role} />
      <Card title="Documents" actions={<Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show current versions only' : 'Show superseded versions'}</Button>}>
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
          <DataTable caption="Project documents" rows={rows} empty={<EmptyState title="No documents yet" />} columns={[
            { key: 'title', header: 'Document', render: (x: any) => <>{x.title}{!x.current && <> <StatusBadge status="superseded" /></>}<div className="cz-muted" style={{ fontSize: 12 }}>{x.fileName}{x.milestone ? ` · ${x.milestone}` : ''}</div></> },
            { key: 'category', header: 'Category', render: (x: any) => x.category.replace('_', ' ') },
            { key: 'org', header: 'Uploaded by', render: (x: any) => <>{x.uploadedByName}<div className="cz-muted" style={{ fontSize: 12 }}>{x.org} · {fmtTime(x.createdAt)}</div></> },
            { key: 'sha256', header: 'SHA-256', render: (x: any) => <span className="cz-mono" title={x.sha256}>{x.sha256.slice(0, 12)}…</span> },
            { key: 'open', header: 'Open', render: (x: any) => <Button size="sm" variant="ghost" onClick={() => open(x.id)} aria-label={`Open ${x.title}`}>Open</Button> },
          ]} />
        )}
      </Card>
      {d.status !== 'closed' && (
        <Card title="Upload">
          {up.error && <Alert tone="danger">{up.error}</Alert>}
          <Grid cols={2}>
            <TextInput label="Document title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={up.fieldErrors.title} />
            <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={CATS} />
            <Select label="Evidence for milestone (optional)" value={f.milestoneId} onChange={(e) => setF({ ...f, milestoneId: e.target.value })} placeholder="Not linked" options={(ms.data?.milestones ?? []).filter((m: any) => !['certified', 'invoiced'].includes(m.status)).map((m: any) => ({ value: m.id, label: `${m.seq}. ${m.title}` }))} />
            <Select label="Replaces (new version of)" value={f.supersedesId} onChange={(e) => setF({ ...f, supersedesId: e.target.value })} placeholder="New document" options={(q.data ?? []).filter((x) => x.current).map((x) => ({ value: x.id, label: x.title }))} />
            {f.supersedesId && <TextInput label="Reason for new version" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />}
            <label className="cz-field"><span className="cz-label">File</span><input aria-label="File" type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          </Grid>
          <Button onClick={() => up.run()} disabled={!file} loading={up.pending}>Upload document</Button>
        </Card>
      )}
    </Screen>
  );
}
