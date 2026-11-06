'use client';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, LoadingState, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtTime, ProjectTabs, useProject } from '@/components/Projects';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 079 — Site Progress & Photo Updates (photos become certification evidence for the milestone). */
export default function Progress() {
  const p = useProject();
  const q = useQuery<any[]>(`/projects/${p.id}/updates`);
  const ms = useQuery<any>(`/projects/${p.id}/milestones`);
  const [f, setF] = useState({ note: '', progressPct: '', milestoneId: '' });
  const [files, setFiles] = useState<File[]>([]);
  const post = useMutation(async () => {
    const fd = new FormData();
    fd.append('note', f.note); if (f.milestoneId) fd.append('milestoneId', f.milestoneId); if (f.progressPct) fd.append('progressPct', f.progressPct);
    files.forEach((x) => fd.append('files', x));
    await api.upload(`/projects/${p.id}/updates`, fd);
    setF({ note: '', progressPct: '', milestoneId: '' }); setFiles([]); q.reload(); ms.reload(); return true;
  });
  const open = async (docId: string) => { const r = await api.get<{ url: string }>(`/projects/${p.id}/documents/${docId}/url`); window.open(r.url, '_blank', 'noopener'); };
  if (p.loading) return <Screen id="079"><LoadingState /></Screen>;
  if (p.error) return <Screen id="079"><ApiErrorView error={p.error} onRetry={p.reload} /></Screen>;
  const d = p.data;
  const reportable = (ms.data?.milestones ?? []).filter((m: any) => ['in_progress', 'rejected'].includes(m.status));
  return (
    <Screen id="079" title={d.title}>
      <ProjectTabs id={p.id} role={d.role} />
      {['active', 'on_hold'].includes(d.status) && (
        <Card title="Post a site update">
          {post.error && <Alert tone="danger">{post.error}</Alert>}
          {post.data && <Alert tone="success">Update posted. Photos are stored privately with a SHA-256 hash and count as evidence for the milestone.</Alert>}
          <TextArea label="What happened on site?" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={post.fieldErrors.note} />
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <Select label="Milestone" value={f.milestoneId} onChange={(e) => setF({ ...f, milestoneId: e.target.value })} placeholder="General update" options={reportable.map((m: any) => ({ value: m.id, label: `${m.seq}. ${m.title} (${m.progressPct}%)` }))} error={post.fieldErrors.milestoneId} />
            <TextInput label="Progress %" inputMode="numeric" value={f.progressPct} onChange={(e) => setF({ ...f, progressPct: e.target.value })} disabled={!f.milestoneId} error={post.fieldErrors.progressPct} />
            <label className="cz-field"><span className="cz-label">Photos or reports (up to 5)</span><input aria-label="Photos or reports" type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} /></label>
          </div>
          <Button onClick={() => post.run()} disabled={f.note.trim().length < 5} loading={post.pending}>Post update</Button>
        </Card>
      )}
      <Card title="Site diary">
        {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data!.length ? <EmptyState title="No site updates yet" /> : (
          <ol className="cz-thread" aria-label="Site updates">
            {q.data!.map((u) => (
              <li key={u.id}>
                <div className="cz-muted" style={{ fontSize: 12 }}>{u.org} · {u.author} · {fmtTime(u.createdAt)}{u.milestone ? ` · ${u.milestone}` : ''}{u.progressPct != null ? ` · ${u.progressPct}%` : ''}</div>
                <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{u.note}</p>
                {u.attachments.map((a: any) => <Button key={a.id} size="sm" variant="ghost" onClick={() => open(a.id)} aria-label={`Open ${a.fileName}`}>{a.category === 'photo' ? '📷' : '📄'} {a.fileName}</Button>)}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </Screen>
  );
}
