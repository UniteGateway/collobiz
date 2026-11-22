'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, LoadingState, Select, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface P { id: string; org: string; city: string | null; kyb: string; kind: string; role: string; jurisdiction: string; specialization: string; credentials: string | null; contactEmail: string; i956kStatus: string; agreementStatus: string; complianceStatus: string; complianceNote: string | null; reviewedAt: string | null; createdAt: string; isOwn: boolean }

/** Partner profile with the compliance review. */
export default function Eb5Partner() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<P>(`/eb5/partners/${id}`);
  const [f, setF] = useState({ decision: 'approve', note: '', i956kStatus: 'pending', agreementStatus: 'signed' });
  const review = useMutation(async () => { await api.post(`/eb5/partners/${id}/review`, f); q.reload(); return true; });
  const p = q.data;
  return (
    <Screen page={{ key: 'eb5-partner', title: p?.org ?? 'GO EB5 partner', access: 'authenticated' }} eyebrow="GO EB5 · Partner">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <LoadingState /> : <div className="cz-grid cz-grid-2">
        <Card title="Profile">
          <dl className="cz-dl">
            <dt>Business</dt><dd>{p.org}{p.city ? ` · ${p.city}` : ''} <Badge s={p.kyb} /></dd>
            <dt>Type</dt><dd>{p.kind.replace(/_/g, ' ')}</dd><dt>Role</dt><dd>{p.role === 'bd_partner' ? 'Business development partner' : 'Referral consultant'}</dd>
            <dt>Jurisdiction</dt><dd>{p.jurisdiction}</dd><dt>Specialisation</dt><dd>{p.specialization}</dd><dt>Credentials</dt><dd>{p.credentials ?? '—'}</dd>
            <dt>Contact</dt><dd>{p.contactEmail}</dd><dt>Applied</dt><dd>{day(p.createdAt)}</dd>
          </dl>
        </Card>
        <Card title="Compliance">
          <dl className="cz-dl">
            <dt>Status</dt><dd><Badge s={p.complianceStatus} /></dd><dt>Partner agreement</dt><dd><Badge s={p.agreementStatus} /></dd>
            <dt>Form I-956K</dt><dd><Badge s={p.i956kStatus} /></dd><dt>Note</dt><dd>{p.complianceNote ?? '—'}</dd><dt>Reviewed</dt><dd>{day(p.reviewedAt)}</dd>
          </dl>
          {has('compliance', 'super_admin', 'citrus_admin') && !p.isOwn && (
            <form noValidate className="cz-stack" style={{ gap: 10, marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); review.run(); }}>
              {review.error && <Alert tone="danger">{review.error}</Alert>}
              <div className="cz-grid cz-grid-2">
                <Select label="Decision" value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })} options={[{ value: 'approve', label: 'Approve' }, { value: 'reject', label: 'Reject' }, { value: 'suspend', label: 'Suspend' }]} />
                <Select label="Partner agreement" value={f.agreementStatus} onChange={(e) => setF({ ...f, agreementStatus: e.target.value })} options={[{ value: 'none', label: 'None' }, { value: 'sent', label: 'Sent' }, { value: 'signed', label: 'Signed' }]} />
                <Select label="Form I-956K (counsel's assessment)" value={f.i956kStatus} onChange={(e) => setF({ ...f, i956kStatus: e.target.value })} options={[{ value: 'not_assessed', label: 'Not assessed' }, { value: 'not_required', label: 'Not required' }, { value: 'pending', label: 'Registration pending' }, { value: 'registered', label: 'Registered' }]} />
              </div>
              <TextArea label="Reason (recorded and shown to the partner)" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={review.fieldErrors.note} />
              <div><Button type="submit" loading={review.pending}>Record decision</Button></div>
            </form>
          )}
        </Card>
      </div>}
    </Screen>
  );
}
