'use client';
import { useState } from 'react';
import { Alert, Button, Card, Checkbox, DataTable, Select, StatusBadge, TextArea, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

const PURPOSE: Record<string, [string, string]> = {
  matching: ['Explainable partner & opportunity matching', 'Use my profile to suggest opportunities and collaborators. Suggestions are always human-reviewed.'],
  marketing: ['Marketing communications', 'Product news, events and co-marketing offers from COLLABIZ and Unite Group.'],
  analytics: ['Product analytics', 'Anonymous usage analytics to improve COLLABIZ.'],
  data_sharing: ['Sharing with Unite Group companies', 'Share my profile with Unite Group companies for opportunity review beyond specific leads I register.'],
};

/** Screen 149 — Privacy, Consent & Data Rights. */
export default function PrivacyPage() {
  const consents = useQuery<{ current: { purpose: string; granted: boolean; updatedAt: string | null }[] }>('/privacy/consents');
  const reqs = useQuery<any[]>('/privacy/requests');
  const [kind, setKind] = useState('export');
  const [details, setDetails] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = useMutation(async (purpose: string, granted: boolean) => { await api.post('/privacy/consents', { purpose, granted }); consents.reload(); return true; });
  const request = useMutation(async () => { await api.post('/privacy/requests', { kind, details: details || undefined }); setMsg('Request received. We respond within 30 days.'); setDetails(''); reqs.reload(); return true; });
  const download = useMutation(async () => {
    const data = await api.get('/privacy/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'collabiz-my-data.json'; a.click(); URL.revokeObjectURL(url);
    return true;
  });
  return (
    <Screen id="149" description="Control how your data is used. Consent changes take effect immediately and are recorded in an audit trail.">
      <Card title="Consents">
        {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
        {consents.loading ? <LoadingState /> : consents.error ? <ApiErrorView error={consents.error} onRetry={consents.reload} /> : consents.data!.current.map((c) => (
          <div key={c.purpose} style={{ padding: '10px 0', borderBottom: '1px solid var(--cz-grey-100)' }}>
            <Checkbox label={<><strong>{PURPOSE[c.purpose][0]}</strong><br /><span className="cz-muted">{PURPOSE[c.purpose][1]}</span></>} checked={c.granted} onChange={(e) => toggle.run(c.purpose, e.target.checked)} />
          </div>
        ))}
      </Card>
      <Card title="Your data">
        <p>Download a machine-readable copy of your personal data now, or raise a formal request for export, correction or deletion (subject to legal retention such as tax and contract records).</p>
        <Button variant="secondary" onClick={() => download.run()} loading={download.pending}>Download my data (JSON)</Button>
        <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid var(--cz-grey-100)' }} />
        {msg && <Alert tone="success">{msg}</Alert>}
        {request.error && <Alert tone="danger">{request.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); setMsg(null); request.run(); }}>
          <Select label="Request type" value={kind} onChange={(e) => setKind(e.target.value)} options={[{ value: 'export', label: 'Full data export' }, { value: 'correction', label: 'Correct my data' }, { value: 'deletion', label: 'Delete my data' }]} />
          <TextArea label="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button type="submit" loading={request.pending}>Submit request</Button>
        </form>
      </Card>
      <Card title="Request history">
        <DataTable caption="Data requests" rows={reqs.data ?? []} columns={[
          { key: 'kind', header: 'Type' }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'createdAt', header: 'Raised', render: (r) => new Date(r.createdAt).toLocaleDateString() }, { key: 'dueAt', header: 'Due by', render: (r) => new Date(r.dueAt).toLocaleDateString() },
          { key: 'resolution', header: 'Outcome', render: (r) => r.resolution ?? '—' },
        ]} empty={<p className="cz-muted">No requests yet.</p>} />
      </Card>
    </Screen>
  );
}
