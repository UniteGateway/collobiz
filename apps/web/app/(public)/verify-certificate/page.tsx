'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, DescriptionList, StatusBadge, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

/** Public certificate verification (supports screens 051/152). Never discloses the customer. */
function Inner() {
  const initial = useSearchParams().get('code') ?? '';
  const [code, setCode] = useState(initial);
  const [r, setR] = useState<any>(null);
  const m = useMutation(async () => { const x = await api.get(`/public/certificates/${encodeURIComponent(code.trim().toUpperCase())}`); setR(x); return x; });
  return (
    <div className="cz-container cz-section" style={{ maxWidth: 720 }}>
      <h1>Verify a lead registration certificate</h1>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setR(null); m.run(); }} className="cz-row" style={{ alignItems: 'flex-end' }}>
        <TextInput label="Certificate number" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CZL-2026-12345678" />
        <Button type="submit" loading={m.pending}>Verify</Button>
      </form>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {r && (
        <section className="cz-card">
          {r.valid ? <Alert tone="success">This certificate is valid and in force.</Alert> : <Alert tone="warning">This certificate exists but is not currently in force.</Alert>}
          <DescriptionList items={[['Certificate', r.certificateCode], ['Opportunity', r.opportunityCode], ['Introducer', r.introducer], ['Registered', new Date(r.registeredAt).toLocaleString()], ['Protected until', r.protectedUntil ? new Date(r.protectedUntil).toLocaleDateString() : '—'], ['Status', <StatusBadge key="s" status={r.status} />], ['Evidence hash', <span key="h" className="cz-mono">{r.evidenceHash}</span>]]} />
        </section>
      )}
    </div>
  );
}
export default function VerifyCertificatePage() {
  return <Suspense><Inner /></Suspense>;
}
