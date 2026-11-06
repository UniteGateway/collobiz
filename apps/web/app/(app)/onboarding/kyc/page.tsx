'use client';
import { useRef, useState } from 'react';
import { KYB_DOC_TYPES } from '@collabiz/types';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, Select, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useOnboarding } from '@/lib/onboarding';
import { DOC_LABEL } from '@/lib/labels';

interface Doc { id: string; docType: string; fileName: string; size: number; status: string; reviewNote: string | null; createdAt: string }

/** Screen 019 — KYC / KYB Document Upload (private storage, magic-byte validation, scan, signed links). */
export default function KycPage() {
  const { status, reload, goNext, locked } = useOnboarding();
  const docs = useQuery<Doc[]>('/onboarding/kyb/documents');
  const [docType, setDocType] = useState('pan');
  const fileRef = useRef<HTMLInputElement>(null);
  const [ok, setOk] = useState<string | null>(null);
  const up = useMutation(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new Error('Choose a file to upload');
    const fd = new FormData();
    fd.append('docType', docType);
    fd.append('file', file);
    await api.upload('/onboarding/kyb/documents', fd);
    setOk(`${DOC_LABEL[docType]} uploaded.`);
    if (fileRef.current) fileRef.current.value = '';
    docs.reload(); reload();
    return true;
  });
  const view = useMutation(async (id: string) => { const r = await api.get<{ url: string }>(`/onboarding/kyb/documents/${id}/url`); window.open('/api' + r.url, '_blank', 'noopener'); return true; });
  const del = useMutation(async (id: string) => { await api.delete(`/onboarding/kyb/documents/${id}`); docs.reload(); reload(); return true; });
  const missing = status?.missingDocs ?? [];
  return (
    <Screen id="019" description="Upload clear PDF, PNG, JPEG or WEBP copies (max 15 MB). Files are stored privately, scanned, and only shared with authorised reviewers through expiring links.">
      {missing.length > 0 && <Alert tone="warning">Still required: {missing.map((d) => DOC_LABEL[d]).join(', ')}</Alert>}
      {(status?.rejectedDocs ?? []).map((d) => <Alert key={d.id} tone="danger" title={`${DOC_LABEL[d.docType]} was rejected:`}>{d.reviewNote}</Alert>)}
      <Card title="Upload a document">
        {ok && <Alert tone="success">{ok}</Alert>}
        {(up.error || del.error) && <Alert tone="danger">{up.error ?? del.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); setOk(null); up.run(); }} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
          <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value)} options={KYB_DOC_TYPES.map((d) => ({ value: d, label: DOC_LABEL[d] }))} error={up.fieldErrors.docType} />
          <div className="cz-field"><label htmlFor="kyb-file">File</label><input id="kyb-file" ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="cz-input" disabled={locked} /></div>
          <Button type="submit" loading={up.pending} disabled={locked}>Upload</Button>
        </form>
      </Card>
      <Card title="Your documents">
        {docs.loading ? <LoadingState /> : docs.error ? <ApiErrorView error={docs.error} onRetry={docs.reload} /> : (
          <DataTable caption="Uploaded documents" rows={docs.data ?? []} empty={<EmptyState title="No documents yet" />} columns={[
            { key: 'docType', header: 'Type', render: (d) => DOC_LABEL[d.docType] ?? d.docType },
            { key: 'fileName', header: 'File', render: (d) => <>{d.fileName}<div className="cz-muted" style={{ fontSize: 12 }}>{(d.size / 1024).toFixed(1)} KB · {new Date(d.createdAt).toLocaleDateString()}</div></> },
            { key: 'status', header: 'Review', render: (d) => <><StatusBadge status={d.status} />{d.reviewNote && <div className="cz-muted" style={{ fontSize: 12 }}>{d.reviewNote}</div>}</> },
            { key: 'a', header: '', render: (d) => <div className="cz-row" style={{ gap: 4 }}><Button size="sm" variant="secondary" onClick={() => view.run(d.id)}>View</Button>{d.status !== 'accepted' && !locked && <Button size="sm" variant="ghost" onClick={() => del.run(d.id)}>Remove</Button>}</div> },
          ]} />
        )}
        <div style={{ marginTop: 12 }}><Button onClick={() => goNext('documents')} disabled={missing.length > 0}>Continue</Button></div>
      </Card>
    </Screen>
  );
}
