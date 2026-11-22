'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, LoadingState } from '@collabiz/ui';
import { Eb5LeadForm, leadBody, type LeadInput } from '@/components/Eb5LeadForm';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Public enquiry through a GO EB5 partner's link. The prospect gives their own consent. */
export default function GoEb5Enquiry() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<{ partner: string; brand: string; entity: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { api.get<{ partner: string; brand: string; entity: string }>(`/eb5/intro/${encodeURIComponent(token)}`).then(setInfo).catch(() => setErr('This link is not active.')); }, [token]);
  const save = useMutation(async (f: LeadInput) => { const r = await api.post<{ message: string }>(`/eb5/intro/${encodeURIComponent(token)}`, leadBody(f)); setDone(r.message); return r; });
  return (
    <div className="cz-public-proof">
      <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>GO EB5 · EB-5 consultancy by CITRUS360 LLC</p>
      {err ? <Alert tone="warning">{err}</Alert> : !info ? <LoadingState /> : <>
        <h1 style={{ margin: 0 }}>Ask about EB-5 consultancy</h1>
        <p style={{ margin: 0 }}>You were referred by <strong>{info.partner}</strong>. A {info.brand} manager will contact you. Consultancy services are provided by {info.entity}; legal advice is given only by a qualified U.S. immigration attorney.</p>
        {done ? <Alert tone="success" title="Enquiry received">{done}</Alert> : <Eb5LeadForm self onSubmit={(f) => save.run(f)} pending={save.pending} error={save.error} fieldErrors={save.fieldErrors} submitLabel="Send my enquiry" />}
        <p className="cz-muted" style={{ fontSize: 12.5 }}>No visa approval, processing time or investment return is promised. Your details are used only to respond to this enquiry; you can ask us to delete them at any time.</p>
      </>}
    </div>
  );
}
