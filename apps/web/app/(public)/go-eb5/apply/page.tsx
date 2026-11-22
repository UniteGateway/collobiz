'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, LoadingState } from '@collabiz/ui';
import { EMPTY_APPLICATION, Eb5ApplicationForm, type AppData } from '@/components/Eb5ApplicationForm';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Public GO EB5 online application — the Preliminary Consultancy Application, no account needed. */
export default function GoEb5OnlineApplication() {
  const [info, setInfo] = useState<{ brand: string; entity: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [d, setD] = useState<AppData>(EMPTY_APPLICATION);
  const [hp, setHp] = useState('');
  const [done, setDone] = useState<{ reference: string | null; message: string } | null>(null);
  useEffect(() => { api.get<{ brand: string; entity: string }>('/eb5/public/info').then(setInfo).catch(() => setErr('Online applications are not open at the moment.')); }, []);
  const submit = useMutation(async () => { const r = await api.post<{ reference: string | null; message: string }>('/eb5/public/applications', { ...d, website: hp || undefined }); setDone(r); window.scrollTo({ top: 0, behavior: 'smooth' }); return r; });
  return (
    <div className="cz-eb5-public">
      <section className="cz-eb5-public-hero">
        <img src="/photos/global-skyline.webp" alt="" aria-hidden />
        <div>
          <img src="/brands/goeb5.png" alt="GO EB5 — U.S. Investor Visa Program" width={240} height={80} className="cz-eb5-public-logo" />
          <h1>Online preliminary consultancy application</h1>
          <p>Tell us about yourself and your family. A GO EB5 manager reviews every application and contacts you to arrange a consultation with an independent U.S. immigration attorney.</p>
          <ul><li>About 10 minutes</li><li>No documents needed now</li><li>No fee for this application</li></ul>
        </div>
      </section>
      <div className="cz-eb5-public-body">
        {err ? <Alert tone="warning">{err}</Alert> : !info ? <LoadingState /> : done ? (
          <Alert tone="success" title={done.reference ? `Application ${done.reference} received` : 'Thank you'}>{done.message} <Link href="/login">Sign in</Link></Alert>
        ) : (
          <form noValidate onSubmit={(e) => { e.preventDefault(); submit.run(); }}>
            {submit.error && <Alert tone="danger" title={submit.error}>{Object.keys(submit.fieldErrors).length ? 'Please complete the highlighted answers.' : null}</Alert>}
            <Eb5ApplicationForm value={d} onChange={setD} errors={submit.fieldErrors} entity={info.entity} />
            <label className="cz-hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
            <div className="cz-row cz-eb5-actions"><Button type="submit" loading={submit.pending}>Submit application</Button></div>
            <p className="cz-muted" style={{ fontSize: 12.5 }}>{info.brand} provides consultancy and coordination through {info.entity}. It is not a law firm and does not give legal advice. EB-5 capital is at risk; no visa approval, timeline, investment return or capital repayment is guaranteed.</p>
          </form>
        )}
      </div>
    </div>
  );
}
