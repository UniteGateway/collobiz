'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ButtonLink, Card, LoadingState, TextArea } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ApplicationSheet } from '@/components/Eb5Docs';
import { Badge, useEb5 } from '@/components/Eb5';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface A { office: import('@/components/Eb5Docs').OfficeUse | null; id: string; code: string; status: string; submittedAt: string | null; signedName: string | null; reviewNote: string | null; hasPhoto: boolean; data: Record<string, Record<string, unknown> | string | undefined>; lead: { id: string; code: string }; brand: string; entity: string }

/** Review a preliminary application. */
export default function Eb5Application() {
  const { id } = useParams<{ id: string }>();
  const { has } = useEb5();
  const q = useQuery<A>(`/eb5/applications/${id}`);
  const [note, setNote] = useState('');
  const review = useMutation(async () => { await api.post(`/eb5/applications/${id}/review`, { note }); q.reload(); return true; });
  const a = q.data;
  return (
    <Screen page={{ key: 'eb5-application', title: a ? `Application ${a.code}` : 'Application', access: 'authenticated' }} eyebrow="GO EB5 · Applications"
      actions={a ? <><ButtonLink href={`/eb5/applications/${id}/print`} variant="secondary">A4 / PDF</ButtonLink>{has('citrus_admin', 'business_manager', 'immigration_consultant') && <ButtonLink href={`/eb5/leads/${a.lead.id}`} variant="ghost">Lead {a.lead.code}</ButtonLink>}</> : undefined}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !a ? <LoadingState /> : <>
        <p>Status <Badge s={a.status} />{a.reviewNote ? <span className="cz-muted"> · {a.reviewNote}</span> : null}</p>
        {has('citrus_admin', 'business_manager', 'immigration_consultant') && a.status === 'submitted' && <Card title="Preliminary review" className="cz-mt">
          {review.error && <Alert tone="danger">{review.error}</Alert>}
          <TextArea label="Review note (questions for the attorney, documents to request)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={review.fieldErrors.note} />
          <div style={{ marginTop: 8 }}><Button onClick={() => review.run()} loading={review.pending}>Mark reviewed</Button></div>
          <p className="cz-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>Eligibility is a legal question for the client's U.S. immigration attorney. <Link href={`/eb5/leads/${a.lead.id}`}>Assign one on the lead</Link>.</p>
        </Card>}
        <div className="cz-mt"><ApplicationSheet a={a} office={a.office} /></div>
      </>}
    </Screen>
  );
}
