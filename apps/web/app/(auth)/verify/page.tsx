'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, LoadingState, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Screen 012 — OTP & Email Verification (atlas: mobile-first). */
export default function VerifyPage() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!loading && !me) router.replace('/login?next=/verify');
  }, [loading, me, router]);
  const send = useMutation(async () => {
    const r = await api.post<{ devOtp?: string }>('/auth/otp/send', { channel });
    setNotice(`A new code was sent to your ${channel}.${r.devOtp ? ` (Development code: ${r.devOtp})` : ''}`);
    return r;
  });
  const verify = useMutation(async () => {
    await api.post('/auth/otp/verify', { channel, code });
    await refresh();
    setCode('');
    setNotice(`${channel === 'email' ? 'Email' : 'Mobile number'} verified.`);
    return true;
  });
  if (loading || !me) return <LoadingState />;
  const done = me.emailVerified;
  return (
    <main id="main" className="cz-container" style={{ maxWidth: 480, paddingTop: 40 }} data-screen="012">
      <section className="cz-card">
        <h1>Verify your account</h1>
        <p className="cz-muted">We sent a 6-digit code to <strong>{me.email}</strong>. Codes expire after 10 minutes.</p>
        <div className="cz-row" style={{ marginBottom: 12 }}>
          <span>Email: {me.emailVerified ? '✅ verified' : '⏳ pending'}</span>
          <span>Mobile: {me.phoneVerified ? '✅ verified' : '—'}</span>
        </div>
        {notice && <Alert tone="success">{notice}</Alert>}
        {(verify.error || send.error) && <Alert tone="danger">{verify.error ?? send.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); verify.run(); }}>
          <fieldset className="cz-fieldset">
            <legend>Verify</legend>
            <div className="cz-chips">
              {(['email', 'phone'] as const).map((c) => <button type="button" key={c} className="cz-chip" aria-pressed={channel === c} onClick={() => setChannel(c)}>{c === 'email' ? 'Email' : 'Mobile (SMS)'}</button>)}
            </div>
          </fieldset>
          <TextInput label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={verify.fieldErrors.code} />
          <div className="cz-row">
            <Button type="submit" loading={verify.pending} disabled={code.length !== 6}>Verify</Button>
            <Button type="button" variant="secondary" loading={send.pending} onClick={() => send.run()}>Resend code</Button>
          </div>
        </form>
        {done && (
          <div style={{ marginTop: 20 }}>
            <Alert tone="success">Your email is verified. Next, choose your account type to start partner onboarding.</Alert>
            <Button variant="accent" onClick={() => router.push(me.activeOrg ? '/dashboard' : '/onboarding/account-type')}>Continue</Button>
          </div>
        )}
      </section>
    </main>
  );
}
