'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { sectorName, newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DataTable, DescriptionList, LoadingState, Select, StatusBadge, TextArea, Timeline } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { DOC_LABEL } from '@/lib/labels';
import { regionName } from '@/lib/regions';

/** Screens 130/022 — application dossier and decision (verified / rejected / re-upload requested). */
export default function Dossier() {
  const { orgId } = useParams<{ orgId: string }>();
  const d = useQuery<any>(`/admin/verification/${orgId}`);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dec, setDec] = useState({ decision: 'verified', reason: '', riskLevel: 'low' });
  const [key, setKey] = useState(newIdempotencyKey);
  const [done, setDone] = useState<string | null>(null);
  const claim = useMutation(async () => { await api.post(`/admin/verification/${orgId}/claim`); d.reload(); return true; });
  const review = useMutation(async (docId: string, status: string) => { await api.post(`/admin/verification/documents/${docId}/review`, { status, note: notes[docId] || undefined }); d.reload(); return true; });
  const view = useMutation(async (docId: string) => { const r = await api.get<{ url: string }>(`/admin/verification/documents/${docId}/url`); window.open('/api' + r.url, '_blank', 'noopener'); return true; });
  const decide = useMutation(async () => {
    await api.request('POST', `/admin/verification/${orgId}/decision`, dec, { idempotencyKey: key });
    setDone(`Decision recorded: ${dec.decision.replace('_', ' ')}`);
    setKey(newIdempotencyKey());
    d.reload();
    return true;
  });
  if (d.loading) return <Screen id="130"><LoadingState /></Screen>;
  if (d.error) return <Screen id="130"><ApiErrorView error={d.error} onRetry={d.reload} /></Screen>;
  const { organization: o, profile: p, documents, bankTax: b, agreements, history, flags, people, assignment } = d.data;
  const reviewing = o.verificationStatus === 'under_review';
  return (
    <Screen id="130" title={o.displayName} actions={!reviewing && o.verificationStatus === 'submitted' ? <Button onClick={() => claim.run()} loading={claim.pending}>Claim for review</Button> : <StatusBadge status={o.verificationStatus} />}>
      {(claim.error || review.error || view.error) && <Alert tone="danger">{claim.error ?? review.error ?? view.error}</Alert>}
      {done && <Alert tone="success">{done}</Alert>}
      {flags.filter((f: any) => f.status === 'open').map((f: any) => <Alert key={f.id} tone={f.severity === 'high' ? 'danger' : 'warning'} title={`Risk flag (${f.severity}) · ${f.kind.replace(/_/g, ' ')}:`}>{f.note} <a href="/risk">Review in risk centre</a></Alert>)}
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Applicant">
          <DescriptionList items={[
            ['Legal name', o.legalName], ['Type', `${o.type} · ${o.partnerTypes.join(', ')}`], ['Location', [o.city, o.country].filter(Boolean).join(', ')],
            ['Registration no.', p?.registrationNumber], ['GSTIN', p?.gstin], ['PAN', p?.panMasked], ['Sectors', p?.sectors.map(sectorName).join(', ')], ['Coverage', p?.regions.map(regionName).join(', ')],
            ['People', people.map((x: any) => `${x.fullName} (${x.role.replace('org_', '')}${x.emailVerified ? ', email verified' : ''})`).join('; ')],
            ['Reviewer', assignment ? 'Assigned' : 'Unassigned'],
          ]} />
        </Card>
        <Card title="Bank, tax & agreements">
          {b ? <DescriptionList items={[['Account', `${b.bankName} ${b.accountMasked}`], ['IFSC', b.ifsc], ['PAN', b.panMasked], ['GST', b.gstRegistered ? b.gstin : 'Not registered']]} /> : <p>No bank details.</p>}
          <div style={{ marginTop: 10 }}>{agreements.map((a: any) => <div key={a.code}>{a.title}: <StatusBadge status={a.accepted ? 'signed' : 'pending'} /></div>)}</div>
        </Card>
      </div>
      <Card title="Documents">
        <DataTable caption="KYB documents" rows={documents} columns={[
          { key: 'docType', header: 'Type', render: (x: any) => DOC_LABEL[x.docType] ?? x.docType },
          { key: 'fileName', header: 'File', render: (x: any) => <>{x.fileName}<div className="cz-mono" style={{ fontSize: 11 }}>sha256 {x.sha256.slice(0, 16)}…</div></> },
          { key: 'status', header: 'Status', render: (x: any) => <><StatusBadge status={x.status} />{x.reviewNote && <div className="cz-muted" style={{ fontSize: 12 }}>{x.reviewNote}</div>}</> },
          { key: 'a', header: 'Review', render: (x: any) => (
            <div className="cz-row" style={{ gap: 4 }}>
              <Button size="sm" variant="secondary" onClick={() => view.run(x.id)}>Open</Button>
              {reviewing && x.status === 'pending' && <>
                <Button size="sm" onClick={() => review.run(x.id, 'accepted')}>Accept</Button>
                <input aria-label={`Rejection note for ${x.fileName}`} className="cz-input" style={{ width: 160, minHeight: 32 }} placeholder="Rejection note" value={notes[x.id] ?? ''} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} />
                <Button size="sm" variant="danger" onClick={() => review.run(x.id, 'rejected')}>Reject</Button>
              </>}
            </div>
          ) },
        ]} />
      </Card>
      {reviewing && (
        <Card title="Decision">
          {decide.error && <Alert tone="danger">{decide.error}</Alert>}
          <form noValidate onSubmit={(e) => { e.preventDefault(); decide.run(); }}>
            <div className="cz-grid cz-grid-2">
              <Select label="Decision" value={dec.decision} onChange={(e) => setDec({ ...dec, decision: e.target.value })} options={[{ value: 'verified', label: 'Verify' }, { value: 'reupload_requested', label: 'Request re-upload / corrections' }, { value: 'rejected', label: 'Reject' }]} />
              <Select label="Risk level" value={dec.riskLevel} onChange={(e) => setDec({ ...dec, riskLevel: e.target.value })} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
            </div>
            <TextArea label="Reason (shared with the applicant and recorded in the audit log)" value={dec.reason} onChange={(e) => setDec({ ...dec, reason: e.target.value })} error={decide.fieldErrors.reason} />
            <Button type="submit" variant={dec.decision === 'rejected' ? 'danger' : 'primary'} loading={decide.pending}>Record decision</Button>
          </form>
        </Card>
      )}
      <Card title="Decision history"><Timeline items={history.map((h: any, i: number) => ({ id: String(i), at: h.at, title: `${h.from.replace(/_/g, ' ')} → ${h.to.replace(/_/g, ' ')}${h.actor ? ` · ${h.actor}` : ''}`, detail: h.reason }))} /></Card>
    </Screen>
  );
}
