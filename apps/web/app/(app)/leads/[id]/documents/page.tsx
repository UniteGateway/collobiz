'use client';
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 047 — Upload Lead Supporting Documents (private; hashed; access audited). */
export default function LeadDocuments() {
  const { id } = useParams<{ id: string }>();
  const docs = useQuery<any[]>(`/leads/${id}/documents`);
  const file = useRef<HTMLInputElement>(null);
  const [desc, setDesc] = useState('');
  const up = useMutation(async () => {
    const f = file.current?.files?.[0];
    if (!f) throw new Error('Choose a file');
    const fd = new FormData(); fd.append('file', f); fd.append('description', desc);
    await api.upload(`/leads/${id}/documents`, fd);
    setDesc(''); if (file.current) file.current.value = ''; docs.reload(); return true;
  });
  const open = useMutation(async (docId: string) => { const r = await api.get<{ url: string }>(`/leads/${id}/documents/${docId}/url`); window.open('/api' + r.url, '_blank', 'noopener'); return true; });
  return (
    <Screen id="047" description="Emails, letters of authority, meeting minutes or RFQs that support your introduction. The registration snapshot itself stays sealed.">
      <LeadTabs id={id} />
      <Card title="Add evidence">
        {up.error && <Alert tone="danger">{up.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); up.run(); }} className="cz-grid cz-grid-3" style={{ alignItems: 'end' }}>
          <div className="cz-field"><label htmlFor="lead-file">File (PDF/PNG/JPEG/WEBP, max 15 MB)</label><input id="lead-file" ref={file} type="file" className="cz-input" accept="application/pdf,image/png,image/jpeg,image/webp" /></div>
          <TextInput label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button type="submit" loading={up.pending}>Upload</Button>
        </form>
      </Card>
      <Card title="Documents">
        {docs.loading ? <LoadingState /> : docs.error ? <ApiErrorView error={docs.error} onRetry={docs.reload} /> : (
          <DataTable caption="Lead documents" rows={docs.data ?? []} empty={<EmptyState title="No supporting documents yet" />} columns={[
            { key: 'fileName', header: 'File', render: (d) => <>{d.fileName}<div className="cz-mono" style={{ fontSize: 11 }}>sha256 {d.sha256.slice(0, 16)}…</div></> },
            { key: 'description', header: 'Description', render: (d) => d.description ?? '—' },
            { key: 'createdAt', header: 'Uploaded', render: (d) => new Date(d.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) },
            { key: 'a', header: '', render: (d) => <Button size="sm" variant="secondary" onClick={() => open.run(d.id)}>Open</Button> },
          ]} />
        )}
      </Card>
    </Screen>
  );
}
