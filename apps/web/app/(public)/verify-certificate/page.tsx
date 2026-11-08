'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Icon } from '@collabiz/ui';
import { api } from '@/lib/api';

interface V { code: string; holder: string; organization: string | null; course: string; issuedAt: string; expiresAt: string; status: string }

/** Public certificate check (supports screen 118): shows holder, company, course and validity only. */
export default function VerifyCertificate() {
  const [code, setCode] = useState('');
  const [r, setR] = useState<V | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const check = async (c = code) => { setErr(null); setR(null); try { setR(await api.get<V>(`/public/training-certificates/${encodeURIComponent(c.trim())}`)); } catch { setErr('No certificate matches this code. Check it and try again.'); } };
  useEffect(() => { const c = new URLSearchParams(window.location.search).get('code'); if (c) { setCode(c); check(c); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main id="main" className="cz-container" style={{ maxWidth: 560, padding: '56px 16px 80px' }}>
      <h1 style={{ fontSize: 32, margin: '0 0 8px' }}>Verify a certificate</h1>
      <p className="cz-muted">Enter the code printed on a COLLABIZ training certificate.</p>
      <form className="cz-row" style={{ gap: 8, margin: '20px 0', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); check(); }}>
        <input className="cz-input" aria-label="Certificate code" placeholder="CZC-2026-12345678" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button type="submit" disabled={code.trim().length < 8}>Check</Button>
      </form>
      {err && <Alert tone="warning">{err}</Alert>}
      {r && (
        <section className="cz-card" aria-label="Certificate details">
          <div className="cz-row" style={{ gap: 10 }}><Icon name={r.status === 'valid' ? 'verify' : 'warning'} size={22} /><strong style={{ fontSize: 18 }}>{r.status === 'valid' ? 'Genuine and current' : r.status === 'expired' ? 'Genuine but expired' : 'Revoked'}</strong></div>
          <dl className="cz-sheet-facts" style={{ marginTop: 14 }}>
            <div><dt>Holder</dt><dd>{r.holder}</dd></div><div><dt>Company</dt><dd>{r.organization ?? '—'}</dd></div>
            <div><dt>Course</dt><dd>{r.course}</dd></div><div><dt>Valid to</dt><dd>{new Date(r.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
          </dl>
        </section>
      )}
    </main>
  );
}
