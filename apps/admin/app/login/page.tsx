'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@collabiz/types';
import { Alert, Button, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Unite Group administrator sign-in (password + TOTP). */
function AdminLoginInner() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { refresh } = useSession();
  const [f, setF] = useState({ email: '', password: '', mfaCode: '' });
  const [needMfa, setNeedMfa] = useState(false);
  const m = useMutation(async () => {
    try {
      await api.post('/auth/login', { email: f.email, password: f.password, ...(f.mfaCode ? { mfaCode: f.mfaCode } : {}) });
    } catch (e) {
      if (e instanceof ApiError && (e.body as { mfaRequired?: boolean })?.mfaRequired && !needMfa) {
        setNeedMfa(true);
        return false;
      }
      throw e;
    }
    await refresh();
    router.replace(next && next.startsWith('/') ? next : '/');
    return true;
  });
  return (
    <main id="main" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--cz-navy-900)', padding: 16 }}>
      <section className="cz-card" style={{ width: '100%', maxWidth: 420 }}>
        <img src="/brand/collabiz-logo.png" alt="COLLABIZ" width={220} style={{ display: 'block', margin: '0 auto 8px' }} />
        <h1 style={{ textAlign: 'center', fontSize: 20 }}>Unite Group administration</h1>
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          {m.error && <Alert tone="danger">{m.error}</Alert>}
          <TextInput label="Email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextInput label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {needMfa && <TextInput label="Authentication code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={f.mfaCode} onChange={(e) => setF({ ...f, mfaCode: e.target.value })} hint="6-digit code from your authenticator app" autoFocus />}
          <Button type="submit" loading={m.pending} style={{ width: '100%' }}>{needMfa ? 'Verify and sign in' : 'Continue'}</Button>
        </form>
        <p className="cz-muted" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>Restricted system. All access is logged.</p>
      </section>
    </main>
  );
}
export default function AdminLoginPage() {
  return <Suspense><AdminLoginInner /></Suspense>;
}
