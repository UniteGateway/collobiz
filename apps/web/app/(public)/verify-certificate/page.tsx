'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, DescriptionList, Icon, StatusBadge, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';

/**
 * Public certificate verification, for both kinds of COLLABIZ certificate:
 *  · lead registration certificates, CZL-… (supports screens 051/152): never discloses the customer;
 *  · training certificates, CZC-… (supports screen 118): holder, company, course and validity only.
 */
interface Lead { certificateCode: string; opportunityCode: string; introducer: string; registeredAt: string; protectedUntil: string | null; status: string; valid: boolean; evidenceHash: string }
interface Training { code: string; holder: string; organization: string | null; course: string; issuedAt: string; expiresAt: string; status: string }
type Result = { kind: 'lead'; r: Lead } | { kind: 'training'; r: Training };

const isTraining = (c: string) => c.startsWith('CZC-');
const longDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

function Inner() {
  const initial = useSearchParams().get('code') ?? '';
  const [code, setCode] = useState(initial);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const check = async (raw = code) => {
    const c = raw.trim().toUpperCase();
    setErr(null); setRes(null); setPending(true);
    try {
      setRes(isTraining(c)
        ? { kind: 'training', r: await api.get<Training>(`/public/training-certificates/${encodeURIComponent(c)}`) }
        : { kind: 'lead', r: await api.get<Lead>(`/public/certificates/${encodeURIComponent(c)}`) });
    } catch { setErr('No certificate matches this number. Check it and try again.'); }
    setPending(false);
  };
  // Training certificates link here with their code; check those straight away. Lead certificates are checked on request.
  useEffect(() => { if (initial && isTraining(initial.trim().toUpperCase())) check(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cz-container cz-section" style={{ maxWidth: 720 }}>
      <h1>Verify a certificate</h1>
      <p className="cz-muted">Enter the number printed on a COLLABIZ lead registration certificate (CZL-…) or training certificate (CZC-…).</p>
      <form noValidate onSubmit={(e) => { e.preventDefault(); check(); }} className="cz-row" style={{ alignItems: 'flex-end' }}>
        <TextInput label="Certificate number" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CZL-2026-12345678" />
        <Button type="submit" loading={pending} disabled={code.trim().length < 8}>Verify</Button>
      </form>
      {err && <Alert tone="warning">{err}</Alert>}
      {res?.kind === 'lead' && (
        <section className="cz-card" aria-label="Lead registration certificate">
          {res.r.valid ? <Alert tone="success">This certificate is valid and in force.</Alert> : <Alert tone="warning">This certificate exists but is not currently in force.</Alert>}
          <DescriptionList items={[['Certificate', res.r.certificateCode], ['Opportunity', res.r.opportunityCode], ['Introducer', res.r.introducer], ['Registered', new Date(res.r.registeredAt).toLocaleString('en-IN')], ['Protected until', res.r.protectedUntil ? longDate(res.r.protectedUntil) : '—'], ['Status', <StatusBadge key="s" status={res.r.status} />], ['Evidence hash', <span key="h" className="cz-mono">{res.r.evidenceHash}</span>]]} />
        </section>
      )}
      {res?.kind === 'training' && (
        <section className="cz-card" aria-label="Training certificate">
          <div className="cz-row" style={{ gap: 10, marginBottom: 14 }}><Icon name={res.r.status === 'valid' ? 'verify' : 'warning'} size={22} /><strong style={{ fontSize: 18 }}>{res.r.status === 'valid' ? 'Genuine and current' : res.r.status === 'expired' ? 'Genuine but expired' : 'Revoked'}</strong></div>
          <DescriptionList items={[['Holder', res.r.holder], ['Company', res.r.organization ?? '—'], ['Course', res.r.course], ['Issued', longDate(res.r.issuedAt)], ['Valid to', longDate(res.r.expiresAt)]]} />
        </section>
      )}
    </div>
  );
}
export default function VerifyCertificatePage() {
  return <Suspense><Inner /></Suspense>;
}
