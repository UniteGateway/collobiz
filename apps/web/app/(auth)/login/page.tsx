'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Checkbox, Icon, Tabs, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { ApiError } from '@collabiz/types';

/** Screen 011 — Login / Create Account (atlas: mobile-first). */
function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
  const [f, setF] = useState({ email: '', password: '', fullName: '', phone: '', mfaCode: '', acceptTerms: false });
  const [needMfa, setNeedMfa] = useState(false);
  const next = params.get('next');

  const loginM = useMutation(async () => {
    try {
      await api.post('/auth/login', { email: f.email, password: f.password, ...(needMfa ? { mfaCode: f.mfaCode } : {}) });
    } catch (e) {
      if (e instanceof ApiError && (e.body as { mfaRequired?: boolean })?.mfaRequired) {
        setNeedMfa(true);
        if (!needMfa) return false;
      }
      throw e;
    }
    await refresh();
    router.replace(next && next.startsWith('/') ? next : '/dashboard');
    return true;
  });
  const registerM = useMutation(async () => {
    await api.post('/auth/register', { email: f.email, password: f.password, fullName: f.fullName, phone: f.phone || undefined, acceptTerms: f.acceptTerms });
    await refresh();
    router.replace('/verify');
    return true;
  });
  const m = mode === 'login' ? loginM : registerM;
  // Demo environments only (DEMO_MODE=true on the API): one-click sign-in to sample partner accounts.
  const features = useQuery<{ demoMode?: boolean }>('/public/demo');
  const GUESTS = [
    { email: 'asha@voltepc.example', name: 'Asha Patil', role: 'EPC contractor · Volt EPC', icon: 'projects' as const },
    { email: 'ravi@sunrise.example', name: 'Ravi Patel', role: 'Trader & distributor · Sunrise Traders', icon: 'trading' as const },
    { email: 'meera@consult.example', name: 'Meera Iyer', role: 'Consultant', icon: 'briefcase' as const },
  ];
  const guestM = useMutation(async (email: string) => {
    await api.post('/auth/login', { email, password: 'Collabiz#2026' });
    await refresh();
    router.replace(next && next.startsWith('/') ? next : '/dashboard');
    return true;
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <main id="main" className="cz-container" style={{ maxWidth: 480, paddingTop: 40, paddingBottom: 64 }} data-screen="011">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <Link href="/"><img src="/brand/collabiz-logo.png" alt="COLLABIZ — Connect. Collaborate. Grow." width={260} /></Link>
      </div>
      <h1 className="cz-sr-only">{mode === 'login' ? 'Sign in to COLLABIZ' : 'Create your COLLABIZ account'}</h1>
      <section className="cz-card">
        <Tabs value={mode} onChange={(v) => { setMode(v); setNeedMfa(false); }} tabs={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Create account' }]} />
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          {m.error && !(mode === 'login' && needMfa && !f.mfaCode) && <Alert tone="danger">{m.error}</Alert>}
          {mode === 'register' && <TextInput label="Full name" value={f.fullName} onChange={set('fullName')} error={m.fieldErrors.fullName} autoComplete="name" required />}
          <TextInput label="Email" type="email" value={f.email} onChange={set('email')} error={m.fieldErrors.email} autoComplete="email" required />
          {mode === 'register' && <TextInput label="Mobile number (optional)" type="tel" value={f.phone} onChange={set('phone')} error={m.fieldErrors.phone} autoComplete="tel" hint="Used for OTP verification" />}
          <TextInput label="Password" type="password" value={f.password} onChange={set('password')} error={m.fieldErrors.password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} hint={mode === 'register' ? 'At least 10 characters with a letter and a number' : undefined} required />
          {mode === 'login' && needMfa && (
            <>
              <Alert tone="info">Enter the 6-digit code from your authenticator app.</Alert>
              <TextInput label="Authentication code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={f.mfaCode} onChange={set('mfaCode')} error={m.fieldErrors.mfaCode} autoFocus />
            </>
          )}
          {mode === 'register' && (
            <>
              <Checkbox label={<>I accept the <Link href="/membership">partner terms</Link> and <Link href="/settings/privacy">privacy notice</Link>.</>} checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} />
              {m.fieldErrors.acceptTerms && <p className="cz-error-text">{m.fieldErrors.acceptTerms}</p>}
            </>
          )}
          <Button type="submit" loading={m.pending} style={{ width: '100%', marginTop: 12 }}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        </form>
      </section>
      {features.data?.demoMode && mode === 'login' && (
        <section className="cz-card cz-guest" aria-labelledby="guest-h" style={{ marginTop: 16 }}>
          <h2 id="guest-h" style={{ fontSize: 16, margin: 0 }}>Explore as a guest</h2>
          <p className="cz-muted" style={{ fontSize: 13.5, margin: '4px 0 12px' }}>Sign in to a sample partner account. All companies and figures are demonstration data.</p>
          {guestM.error && <Alert tone="danger">{guestM.error}</Alert>}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {GUESTS.map((g) => (
              <li key={g.email}>
                <button type="button" className="cz-guest-btn" onClick={() => guestM.run(g.email)} disabled={guestM.pending} aria-label={`Continue as ${g.name}, ${g.role}`}>
                  <span className="cz-guest-icon"><Icon name={g.icon} size={18} /></span>
                  <span style={{ flex: 1, textAlign: 'left' }}><strong>{g.name}</strong><span>{g.role}</span></span>
                  <Icon name="arrow" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="cz-muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 16 }}>Registration is free. COLLABIZ never charges fees for recruiting partners.</p>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
