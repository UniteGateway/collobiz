'use client';
import { useRef, useState } from 'react';
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, DOCUMENT_MODULES, DOCUMENT_VISIBILITY, DOCUMENT_VISIBILITY_LABELS } from '@collabiz/types';
import { Alert, Button, DataTable, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const blank = { moduleKey: 'unite-solar', title: '', kind: 'brochure', description: '', url: '', visibility: 'partners', sortOrder: '100' };
const sizeOf = (b: number | null) => (b == null ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Document library — catalogues, brochures, DPRs, datasheets, presentations and templates for every module. */
export default function Library() {
  const [filter, setFilter] = useState('');
  const q = useQuery<R[]>('/admin/documents', filter ? { module: filter } : undefined);
  const [f, setF] = useState(blank);
  const [mode, setMode] = useState('file');
  const [editing, setEditing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useMutation(async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => { if (v !== '' && !(k === 'url' && mode === 'file')) fd.append(k, v); });
    const file = fileRef.current?.files?.[0];
    if (file && mode === 'file') fd.append('file', file);
    await api.request('POST', editing ? `/admin/documents/${editing}` : '/admin/documents', undefined, { form: fd });
    setF({ ...blank, moduleKey: f.moduleKey }); setEditing(null); if (fileRef.current) fileRef.current.value = ''; q.reload();
  });
  const status = useMutation(async (d: R) => { await api.post(`/admin/documents/${d.id}/status`, { status: d.status === 'published' ? 'archived' : 'published' }); q.reload(); });
  const edit = (d: R) => { setEditing(d.id); setMode(d.source); setF({ moduleKey: d.moduleKey, title: d.title, kind: d.kind, description: d.description ?? '', url: d.url ?? '', visibility: d.visibility, sortOrder: '100' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const modules = DOCUMENT_MODULES.map(([value, label]) => ({ value, label }));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Document" accent="library" sub="Catalogues, brochures, DPRs, datasheets and templates for every COLLABIZ module. Each appears on its module’s home page and in the partners’ Catalogues & documents library." chips={['Catalogues', 'Brochures', 'DPRs', 'Datasheets', 'Templates']} />
      <section className="cz-card" aria-label={editing ? 'Edit document' : 'Add a document'} style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>{editing ? 'Edit document' : 'Add a document'}</h2>
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          <div className="cz-grid cz-grid-3">
            <Select label="Module" value={f.moduleKey} onChange={(e) => setF({ ...f, moduleKey: e.target.value })} options={modules} />
            <Select label="Type" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))} />
            <Select label="Who can see it" value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} options={DOCUMENT_VISIBILITY.map((v) => ({ value: v, label: DOCUMENT_VISIBILITY_LABELS[v] }))} />
          </div>
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={save.fieldErrors.title} />
          <TextArea label="Short description (optional)" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <Segmented label="Source" value={mode} onChange={setMode} options={[{ value: 'file', label: 'Upload a file' }, { value: 'link', label: 'Link' }]} />
          {mode === 'file' ? (
            <label className="cz-field"><span className="cz-label">{editing ? 'Replace the file (optional — raises the version)' : 'File (PDF, PNG, JPEG or WEBP, up to 15 MB)'}</span>
              <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" aria-label="File" /></label>
          ) : <TextInput label="Link (https://… or an in-app path like /powertek)" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={save.fieldErrors.url} />}
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending} disabled={f.title.length < 3}>{editing ? 'Save changes' : 'Publish document'}</Button>{editing && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setF(blank); }}>Cancel</Button>}</div>
        </form>
      </section>
      <div style={{ maxWidth: 320, marginBottom: 12 }}><Select label="Show module" value={filter} placeholder="All modules" onChange={(e) => setFilter(e.target.value)} options={modules} /></div>
      {status.error && <Alert tone="danger">{status.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <section className="cz-card"><DataTable caption="Documents" rows={q.data} columns={[
          { key: 't', header: 'Document', render: (d: R) => <><strong>{d.title}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{d.kindLabel} · {d.module}</span></> },
          { key: 's', header: 'Source', render: (d: R) => (d.source === 'file' ? `${d.fileName} · ${sizeOf(d.size)} · v${d.version}` : d.url) },
          { key: 'v', header: 'Visible to', render: (d: R) => DOCUMENT_VISIBILITY_LABELS[d.visibility] },
          { key: 'o', header: 'Opens', render: (d: R) => d.opens },
          { key: 'st', header: 'Status', render: (d: R) => <StatusBadge status={d.status} tone={d.status === 'published' ? 'success' : 'neutral'} label={d.status} /> },
          { key: 'a', header: '', render: (d: R) => <div className="cz-row" style={{ gap: 4 }}><Button size="sm" variant="ghost" onClick={() => edit(d)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => status.run(d)}>{d.status === 'published' ? 'Archive' : 'Publish'}</Button></div> },
        ]} /></section>
      )}
    </div>
  );
}
