'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, useEb5, when } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface D { id: string; category: string; title: string; status: string; note: string | null; reviewNote: string | null; version: number; mime: string | null; size: number | null; sha256: string | null; expiresOn: string | null; retainUntil: string | null; deletionRequestedAt: string | null;
  versions: { v: number; sha256: string; size: number; at: string }[]; lead: { id: string; code: string; fullName: string }; access: { action: string; at: string; who: string }[]; canReview: boolean }

/** One secure document: upload, review, versions and its access history. */
export default function Eb5Document() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<D>(`/eb5/documents/${id}`);
  const [note, setNote] = useState(''); const [reason, setReason] = useState('');
  const act = useMutation(async (fn: () => Promise<unknown>) => { await fn(); q.reload(); return true; });
  const upload = (f: File) => act.run(async () => { const fd = new FormData(); fd.append('file', f); await api.upload(`/eb5/documents/${id}/upload`, fd); });
  const d = q.data;
  return (
    <Screen page={{ key: 'eb5-document', title: d?.title ?? 'Document', access: 'authenticated' }} eyebrow={d ? `GO EB5 · ${d.category}` : 'GO EB5'}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <LoadingState /> : <>
        {act.error && <Alert tone="danger">{act.error}</Alert>}
        <div className="cz-grid cz-grid-2">
          <Card title="Document">
            <dl className="cz-dl">
              <dt>Client</dt><dd>{d.lead.fullName} · {d.lead.code}</dd><dt>Status</dt><dd><Badge s={d.status} /></dd><dt>Request note</dt><dd>{d.note ?? '—'}</dd>
              <dt>Version</dt><dd>{d.version || 'Nothing uploaded'}</dd><dt>Fingerprint</dt><dd className="cz-mono" style={{ fontSize: 11 }}>{d.sha256 ?? '—'}</dd>
              <dt>Expires</dt><dd>{day(d.expiresOn)}</dd><dt>Keep until</dt><dd>{day(d.retainUntil)}</dd><dt>Review</dt><dd>{d.reviewNote ?? '—'}</dd>
            </dl>
            <div className="cz-row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {d.version > 0 && <a className="cz-btn cz-btn-secondary cz-btn-sm" href={`/api/v1/eb5/documents/${id}/file`} target="_blank" rel="noopener noreferrer">Open securely</a>}
              {d.status !== 'accepted' && <label className="cz-btn cz-btn-ghost cz-btn-sm" style={{ cursor: 'pointer' }}>Upload {d.version ? 'a new version' : 'file'}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} /></label>}
            </div>
          </Card>
          {d.canReview ? <Card title="Review">
            {d.status === 'uploaded' && <>
              <TextInput label="Note (needed to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="cz-row" style={{ gap: 8, marginTop: 8 }}><Button size="sm" onClick={() => act.run(() => api.post(`/eb5/documents/${id}/review`, { decision: 'accept', note: note || undefined }))}>Accept</Button><Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/eb5/documents/${id}/review`, { decision: 'reject', note }))}>Ask for a new upload</Button></div>
            </>}
            {d.deletionRequestedAt && <Alert tone="warning" title="The client asked to delete this document">Requested {when(d.deletionRequestedAt)}. Check the retention date and any legal hold.</Alert>}
            {has('compliance', 'super_admin') && d.deletionRequestedAt && <div className="cz-row" style={{ gap: 8, marginTop: 8, alignItems: 'flex-end' }}><div style={{ flex: 1 }}><TextInput label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button size="sm" variant="danger" onClick={() => act.run(() => api.post(`/eb5/documents/${id}/delete`, { reason }))}>Delete stored file</Button></div>}
            <h3 style={{ fontSize: 14 }}>Versions</h3>
            <ul className="cz-ws-list">{d.versions.map((v) => <li key={v.v}><span>Version {v.v} · {(v.size / 1024).toFixed(0)} KB</span><span className="cz-muted">{when(v.at)}</span></li>)}</ul>
          </Card> : <Card title="Your document"><p style={{ marginTop: 0 }}>Only your GO EB5 manager and the advisors assigned to you can open it.</p>
            {!d.deletionRequestedAt && <Button size="sm" variant="ghost" onClick={() => act.run(() => api.post(`/eb5/documents/${id}/deletion-request`))}>Ask to delete this document</Button>}</Card>}
        </div>
        {d.canReview && <Card title="Access history" className="cz-mt">
          <DataTable rows={d.access.map((a, i) => ({ ...a, id: String(i) }))} caption="Access history" columns={[{ key: 'w', header: 'Who', render: (a) => a.who }, { key: 'a', header: 'Action', render: (a) => a.action.replace('_', ' ') }, { key: 't', header: 'When', render: (a) => when(a.at) }]} />
        </Card>}
      </>}
    </Screen>
  );
}
