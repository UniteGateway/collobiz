'use client';
import { useState } from 'react';
import Link from 'next/link';
import { humanize, Alert, Button, Card, DataTable, Dialog, Grid, Kpi, LoadingState, Select, StatusBadge, Tabs, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 131 — Partner Risk & Compliance Review (flags, four-eyes clearing, data-rights queue). */
export default function RiskPage() {
  const [tab, setTab] = useState('open');
  const risk = useQuery<any>('/admin/risk', { status: tab === 'requests' ? 'open' : tab });
  const reqs = useQuery<any[]>(tab === 'requests' ? '/admin/risk/data-requests' : null);
  const [clear, setClear] = useState<any>(null);
  const [note, setNote] = useState('');
  const [raise, setRaise] = useState({ organizationId: '', kind: 'manual', severity: 'medium', note: '' });
  const [resolve, setResolve] = useState<any>(null);
  const [res, setRes] = useState({ status: 'completed', resolution: '', legalHold: false });
  const doClear = useMutation(async () => { await api.post(`/admin/risk/flags/${clear.id}/clear`, { note }); setClear(null); setNote(''); risk.reload(); return true; });
  const doRaise = useMutation(async () => { await api.post('/admin/risk/flags', raise); setRaise({ ...raise, note: '' }); risk.reload(); return true; });
  const doResolve = useMutation(async () => { await api.post(`/admin/risk/data-requests/${resolve.id}/resolve`, res); setResolve(null); reqs.reload(); return true; });
  const c = risk.data?.counts;
  return (
    <Screen id="131" description="Automatic and manual risk flags (duplicate tax IDs, sanctions screening, document mismatch, adverse media). A flag must be cleared by a reviewer other than the one who raised it.">
      <Grid cols={4}><Kpi label="High severity" value={c?.high ?? '…'} /><Kpi label="Medium" value={c?.medium ?? '…'} /><Kpi label="Low" value={c?.low ?? '…'} /><Kpi label="Organizations flagged" value={c?.orgs ?? '…'} accent /></Grid>
      <div style={{ marginTop: 16 }}><Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Open flags' }, { value: 'cleared', label: 'Cleared' }, { value: 'requests', label: 'Data-rights requests' }]} /></div>
      {tab !== 'requests' ? (
        <Card>
          {risk.loading ? <LoadingState /> : risk.error ? <ApiErrorView error={risk.error} onRetry={risk.reload} /> : (
            <DataTable caption="Risk flags" rows={risk.data.flags} columns={[
              { key: 'orgName', header: 'Organization', render: (f: any) => <Link href={`/verification/${f.organizationId}`}>{f.orgName}</Link> },
              { key: 'kind', header: 'Flag', render: (f: any) => <>{f.kind.replace(/_/g, ' ')}<div className="cz-muted" style={{ fontSize: 12 }}>{f.source}</div></> },
              { key: 'severity', header: 'Severity', render: (f: any) => <StatusBadge status={f.severity} tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'} /> },
              { key: 'note', header: 'Detail', render: (f: any) => <>{f.note}{f.clearNote && <div className="cz-muted" style={{ fontSize: 12 }}>Cleared: {f.clearNote}</div>}</> },
              { key: 'createdAt', header: 'Raised', render: (f: any) => new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
              { key: 'a', header: '', render: (f: any) => f.status === 'open' && <Button size="sm" variant="secondary" onClick={() => setClear(f)}>Clear</Button> },
            ]} />
          )}
          <h3 style={{ marginTop: 20 }}>Raise a manual flag</h3>
          {doRaise.error && <Alert tone="danger">{doRaise.error}</Alert>}
          <form noValidate onSubmit={(e) => { e.preventDefault(); doRaise.run(); }} className="cz-grid cz-grid-4" style={{ alignItems: 'end' }}>
            <TextInput label="Organization ID" value={raise.organizationId} onChange={(e) => setRaise({ ...raise, organizationId: e.target.value })} error={doRaise.fieldErrors.organizationId} />
            <Select label="Kind" value={raise.kind} onChange={(e) => setRaise({ ...raise, kind: e.target.value })} options={['manual', 'sanctions_screen', 'document_mismatch', 'adverse_media', 'duplicate_tax_id'].map((k) => ({ value: k, label: humanize(k) }))} />
            <Select label="Severity" value={raise.severity} onChange={(e) => setRaise({ ...raise, severity: e.target.value })} options={['low', 'medium', 'high'].map((k) => ({ value: k, label: k }))} />
            <TextInput label="Note" value={raise.note} onChange={(e) => setRaise({ ...raise, note: e.target.value })} error={doRaise.fieldErrors.note} />
            <Button type="submit" loading={doRaise.pending}>Raise flag</Button>
          </form>
        </Card>
      ) : (
        <Card>
          {reqs.loading ? <LoadingState /> : reqs.error ? <ApiErrorView error={reqs.error} onRetry={reqs.reload} /> : (
            <DataTable caption="Data requests" rows={reqs.data ?? []} columns={[
              { key: 'fullName', header: 'Requester', render: (r: any) => <>{r.fullName}<div className="cz-muted" style={{ fontSize: 12 }}>{r.email}</div></> },
              { key: 'kind', header: 'Type' }, { key: 'details', header: 'Details', render: (r: any) => r.details ?? '—' },
              { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
              { key: 'dueAt', header: 'Due', render: (r: any) => <span style={{ color: new Date(r.dueAt) < new Date() && r.status !== 'completed' ? 'var(--cz-danger)' : undefined }}>{new Date(r.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
              { key: 'a', header: '', render: (r: any) => !['completed', 'rejected'].includes(r.status) && <Button size="sm" variant="secondary" onClick={() => setResolve(r)}>Resolve</Button> },
            ]} />
          )}
        </Card>
      )}
      <Dialog open={!!clear} onClose={() => setClear(null)} title="Clear risk flag">
        {doClear.error && <Alert tone="danger">{doClear.error}</Alert>}
        <TextArea label="Clearance note (evidence reviewed)" value={note} onChange={(e) => setNote(e.target.value)} error={doClear.fieldErrors.note} />
        <div className="cz-row"><Button onClick={() => doClear.run()} loading={doClear.pending}>Clear flag</Button><Button variant="secondary" onClick={() => setClear(null)}>Cancel</Button></div>
      </Dialog>
      <Dialog open={!!resolve} onClose={() => setResolve(null)} title="Resolve data request">
        {doResolve.error && <Alert tone="danger">{doResolve.error}</Alert>}
        <Select label="Outcome" value={res.status} onChange={(e) => setRes({ ...res, status: e.target.value })} options={[{ value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'rejected', label: 'Rejected (retention / legal hold)' }]} />
        <TextArea label="Resolution" value={res.resolution} onChange={(e) => setRes({ ...res, resolution: e.target.value })} error={doResolve.fieldErrors.resolution} />
        <label className="cz-check"><input type="checkbox" checked={res.legalHold} onChange={(e) => setRes({ ...res, legalHold: e.target.checked })} /> Records under legal hold</label>
        <div className="cz-row" style={{ marginTop: 12 }}><Button onClick={() => doResolve.run()} loading={doResolve.pending}>Save</Button><Button variant="secondary" onClick={() => setResolve(null)}>Cancel</Button></div>
      </Dialog>
    </Screen>
  );
}
