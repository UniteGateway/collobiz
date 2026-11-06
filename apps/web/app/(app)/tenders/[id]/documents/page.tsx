'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmt, SEALED_NOTE, TenderSummary, TenderTabs, useTender } from '@/components/Tenders';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Screen 067 — Tender Documents & Eligibility (+ issuer controls: evaluators, publish, close, open, cancel). */
export default function TenderDocuments() {
  const t = useTender();
  const d = t.data;
  const docs = useQuery<any[]>(t.data ? `/tenders/${t.id}/documents` : null);
  const manage = !!d?.canManage;
  const cands = useQuery<any[]>(manage && ['draft', 'published', 'closed'].includes(d?.status) ? `/tenders/${t.id}/evaluator-candidates` : null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [ev, setEv] = useState({ userId: '', role: 'technical' });
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const reload = () => { t.reload(); docs.reload(); };
  const upload = useMutation(async () => {
    const fd = new FormData(); if (file) fd.append('file', file); fd.append('title', title);
    await api.upload(`/tenders/${t.id}/documents`, fd); setFile(null); setTitle(''); reload(); return true;
  });
  const addEv = useMutation(async () => { await api.post(`/tenders/${t.id}/evaluators`, ev); setEv({ ...ev, userId: '' }); reload(); return true; });
  const rmEv = useMutation(async (eid: string) => { await api.delete(`/tenders/${t.id}/evaluators/${eid}`); reload(); return true; });
  const act = useMutation(async (action: string) => {
    setProblems([]);
    try { await api.post(`/tenders/${t.id}/${action}`, action === 'cancel' ? { reason } : undefined); }
    catch (e: any) { setProblems(e?.body?.problems ?? []); throw e; }
    reload(); return action;
  });
  const download = async (docId: string) => { const r = await api.get<{ url: string }>(`/tenders/${t.id}/documents/${docId}/url`); window.open(r.url, '_blank', 'noopener'); };
  if (t.loading) return <Screen id="067"><LoadingState /></Screen>;
  if (t.error) return <Screen id="067"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  const err = upload.error ?? addEv.error ?? rmEv.error ?? act.error;
  return (
    <Screen id="067" title={d.title}>
      <TenderTabs t={d} />
      {err && <Alert tone="danger" title={problems.length ? err : undefined}>{problems.length ? <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul> : err}</Alert>}
      {act.data === 'technical/complete' && <Alert tone="success">Technical evaluation complete. Commercial envelopes of qualified bids are now open to commercial evaluators.</Alert>}
      {act.data === 'publish' && <Alert tone="success">Tender published. Eligible verified partners can now bid until {fmt(d.closesAt)}.</Alert>}
      <Card title="Tender overview" actions={<StatusBadge status={d.status} />}>
        <TenderSummary t={d} />
        <p style={{ whiteSpace: 'pre-wrap' }}>{d.scope}</p>
        {d.cancelReason && <Alert tone="warning" title="Cancelled">{d.cancelReason}</Alert>}
      </Card>
      {d.role === 'bidder' && d.eligibility && (
        <Card title="Your eligibility" actions={<StatusBadge status={d.eligibility.eligible ? 'eligible' : 'not_eligible'} tone={d.eligibility.eligible ? 'success' : 'danger'} label={d.eligibility.eligible ? 'Eligible' : 'Not eligible'} />}>
          <ul className="cz-checklist">{d.eligibility.checks.map((c: any) => <li key={c.key} data-ok={c.ok}>{c.ok ? '✅' : '❌'} {c.label} <span className="cz-muted">— {c.detail}</span></li>)}</ul>
        </Card>
      )}
      <Card title="Tender documents">
        {docs.loading ? <LoadingState /> : (
          <DataTable caption="Documents" rows={docs.data ?? []} empty={<EmptyState title="No documents yet" />} columns={[
            { key: 'title', header: 'Document', render: (x: any) => <>{x.title}{x.addendum && <> <StatusBadge status="addendum" tone="warning" label="Addendum" /></>}<div className="cz-muted" style={{ fontSize: 12 }}>{x.fileName}</div></> },
            { key: 'createdAt', header: 'Added', render: (x: any) => fmt(x.createdAt) },
            { key: 'sha256', header: 'SHA-256', render: (x: any) => <span className="cz-mono" title={x.sha256}>{x.sha256.slice(0, 12)}…</span> },
            { key: 'dl', header: 'Download', render: (x: any) => <Button size="sm" variant="ghost" onClick={() => download(x.id)} aria-label={`Download ${x.title}`}>Download</Button> },
          ]} />
        )}
        {manage && (d.status === 'draft' || (d.status === 'published' && d.biddingOpen)) && (
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label="Document title" value={title} onChange={(e) => setTitle(e.target.value)} error={upload.fieldErrors.title} />
            <label className="cz-field"><span className="cz-label">File</span><input aria-label="File" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
            <Button onClick={() => upload.run()} loading={upload.pending} disabled={!file}>{d.status === 'draft' ? 'Upload document' : 'Issue addendum'}</Button>
          </div>
        )}
      </Card>
      {d.evaluators && (
        <Card title="Evaluation committee">
          <DataTable caption="Evaluators" rows={d.evaluators} empty={<EmptyState title="No evaluators assigned" />} columns={[
            { key: 'name', header: 'Evaluator' }, { key: 'role', header: 'Envelope', render: (e: any) => <StatusBadge status={e.role} tone="brand" /> },
            ...(manage && ['draft', 'published', 'closed'].includes(d.status) ? [{ key: 'rm', header: 'Remove', render: (e: any) => <Button size="sm" variant="ghost" onClick={() => rmEv.run(e.id)} aria-label={`Remove ${e.name}`}>Remove</Button> }] : []),
          ]} />
          {manage && cands.data && (
            <div className="cz-row" style={{ alignItems: 'flex-end' }}>
              <Select label="Evaluator" value={ev.userId} onChange={(e) => setEv({ ...ev, userId: e.target.value })} placeholder="Choose a colleague" options={cands.data.map((c) => ({ value: c.userId, label: c.name }))} error={addEv.fieldErrors.userId} />
              <Select label="Evaluates" value={ev.role} onChange={(e) => setEv({ ...ev, role: e.target.value })} options={[{ value: 'technical', label: 'Technical envelope' }, { value: 'commercial', label: 'Commercial envelope' }, { value: 'both', label: 'Both envelopes' }]} />
              <Button variant="secondary" onClick={() => addEv.run()} disabled={!ev.userId} loading={addEv.pending}>Assign evaluator</Button>
            </div>
          )}
          <p className="cz-muted" style={{ fontSize: 13 }}>Evaluators must belong to the issuing organization and may not belong to any bidder. Assignments freeze when bids are opened.</p>
        </Card>
      )}
      {manage && (
        <Card title="Tender actions">
          <Alert tone="info">{SEALED_NOTE}</Alert>
          <div className="cz-row">
            {d.status === 'draft' && <Button onClick={() => act.run('publish')} loading={act.pending}>Publish tender</Button>}
            {d.status === 'published' && <Button variant="secondary" onClick={() => act.run('close')} disabled={d.biddingOpen} loading={act.pending}>Close bidding</Button>}
            {d.status === 'closed' && <Button onClick={() => act.run('open')} loading={act.pending}>Open bids (verify seals)</Button>}
            {d.status === 'technical_evaluation' && <Button onClick={() => act.run('technical/complete')} loading={act.pending}>Complete technical evaluation</Button>}
          </div>
          {d.status === 'published' && d.biddingOpen && <p className="cz-muted">Bidding stays open until {fmt(d.closesAt)}; tenders cannot be closed early.</p>}
          {!['awarded', 'cancelled'].includes(d.status) && (
            <div className="cz-row" style={{ alignItems: 'flex-end' }}>
              <TextArea label="Cancellation reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="danger" onClick={() => act.run('cancel')} disabled={reason.trim().length < 10} loading={act.pending}>Cancel tender</Button>
            </div>
          )}
        </Card>
      )}
    </Screen>
  );
}
