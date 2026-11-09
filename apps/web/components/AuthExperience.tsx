'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@collabiz/types';
import { Alert, Button, Checkbox, Icon, type IconName } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

type Mode = 'login' | 'register';
const GUESTS: { email: string; name: string; role: string; icon: IconName }[] = [
  { email: 'asha@voltepc.example', name: 'Asha Patil', role: 'EPC contractor · Volt EPC', icon: 'projects' },
  { email: 'ravi@sunrise.example', name: 'Ravi Patel', role: 'Trader & distributor · Sunrise Traders', icon: 'trading' },
  { email: 'meera@consult.example', name: 'Meera Iyer', role: 'Consultant', icon: 'briefcase' },
];

/** Password strength for the sign-up hint: the API rule is at least 10 characters with a letter and a number. */
function strength(p: string) {
  const rules = [p.length >= 10, /[a-z]/i.test(p) && /\d/.test(p), /[^A-Za-z0-9]/.test(p) || p.length >= 14, /[a-z]/.test(p) && /[A-Z]/.test(p)];
  const score = !p ? 0 : rules.filter(Boolean).length;
  const ok = rules[0] && rules[1];
  return { score, ok, label: !p ? '' : !ok ? 'Too weak — use 10+ characters with a letter and a number' : score >= 4 ? 'Strong' : score === 3 ? 'Good' : 'Fair' };
}

/** A filled text field with a floating-style label and an optional trailing control. */
function Field({ label, error, hint, trailing, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: React.ReactNode; trailing?: React.ReactNode }) {
  const id = useId();
  return (
    <div className="cz-auth-field" data-invalid={error ? true : undefined}>
      <label htmlFor={id}>{label}</label>
      <div className="cz-auth-input">
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-d` : undefined} {...rest} />
        {trailing}
      </div>
      {(error || hint) && <p id={`${id}-d`} className={error ? 'cz-error-text' : 'cz-auth-hint'}>{error ?? hint}</p>}
    </div>
  );
}

/** Animated brand scene: sun, partner network with flowing connections, solar array, floating status cards. Decorative only. */
function Showcase({ mode }: { mode: Mode }) {
  return (
    <aside className="cz-auth-show" aria-hidden="true">
      <div className="cz-auth-aurora"><span /><span /><span /></div>
      <div className="cz-auth-show-inner">
        <div className="cz-auth-brand"><img src="/brand/collabiz-mark.png" alt="" width={36} height={36} /><span>collabiz</span></div>
        <div className="cz-auth-scene">
          <svg viewBox="0 0 520 400" role="presentation">
            <defs>
              <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FFE9A8" /><stop offset="55%" stopColor="#FFC94A" /><stop offset="100%" stopColor="#FFB020" stopOpacity="0" /></radialGradient>
              <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1D4E89" /><stop offset="100%" stopColor="#0B2F5C" /></linearGradient>
              <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fff" stopOpacity="0" /><stop offset="50%" stopColor="#fff" stopOpacity=".55" /><stop offset="100%" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <clipPath id="arr"><path d="M60 330 L200 270 L470 270 L400 345 Z" /></clipPath>
            </defs>
            <g className="cz-anim-sun" transform="translate(410 80)">
              <circle r="70" fill="url(#sun)" opacity=".55" />
              <g className="cz-anim-rays">{Array.from({ length: 12 }, (_, i) => <rect key={i} x="-2" y="-62" width="4" height="16" rx="2" fill="#FFD66B" transform={`rotate(${i * 30})`} />)}</g>
              <circle r="30" fill="#FFCF4D" />
            </g>
            <g className="cz-anim-net" stroke="#7FD18B" strokeWidth="1.6" fill="none">
              {[[90, 110, 200, 70], [200, 70, 300, 150], [90, 110, 160, 200], [160, 200, 300, 150], [300, 150, 400, 210], [160, 200, 250, 240], [250, 240, 400, 210]].map(([a, b, c, d], i) => (
                <line key={i} x1={a} y1={b} x2={c} y2={d} className="cz-anim-flow" style={{ animationDelay: `${i * 0.35}s` }} />
              ))}
            </g>
            {[[90, 110, 'P'], [200, 70, 'U'], [300, 150, 'C'], [160, 200, 'E'], [400, 210, 'T'], [250, 240, 'S']].map(([x, y, t], i) => (
              <g key={i} className="cz-anim-node" style={{ animationDelay: `${i * 0.5}s`, transformOrigin: `${x}px ${y}px` }}>
                <circle cx={x as number} cy={y as number} r="15" fill={i === 1 ? '#2E7D32' : '#03325D'} stroke="#9fd38f" strokeWidth="2" />
                <text x={x as number} y={(y as number) + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="-apple-system, Segoe UI, sans-serif">{t}</text>
              </g>
            ))}
            <g clipPath="url(#arr)">
              <path d="M60 330 L200 270 L470 270 L400 345 Z" fill="url(#panel)" />
              {Array.from({ length: 6 }, (_, i) => <line key={`v${i}`} x1={200 + i * 45} y1="270" x2={60 + i * 57} y2="345" stroke="#5B8BC9" strokeOpacity=".55" />)}
              <line x1="130" y1="300" x2="435" y2="300" stroke="#5B8BC9" strokeOpacity=".55" />
              <rect className="cz-anim-sheen" x="-120" y="260" width="110" height="100" fill="url(#sheen)" />
            </g>
          </svg>
          <div className="cz-auth-chip cz-chip-a"><Icon name="verify" size={16} /><span><strong>Lead protected</strong><small>Certificate CZL-2026 · 90 days</small></span></div>
          <div className="cz-auth-chip cz-chip-b"><Icon name="earnings" size={16} /><span><strong>Commission earned</strong><small>₹1,04,544 · Unite Solar</small></span></div>
          <div className="cz-auth-chip cz-chip-c"><Icon name="award" size={16} /><span><strong>Buy 1 get 1 — live</strong><small>Festive solar lights</small></span></div>
        </div>
        <div className="cz-auth-copy">
          <h2>{mode === 'login' ? 'Your network is working while you’re away.' : 'Join the Unite-first B2B network.'}</h2>
          <p>{mode === 'login' ? 'Protected leads, partner teams, Unite Solar quotes and every rupee of commission — in one place.' : 'Verified partners win work with Unite Group companies — solar, power, trading and more — and get paid transparently.'}</p>
          <ul>
            <li><Icon name="check" size={15} />Free to join — no recruitment fees</li>
            <li><Icon name="lock" size={15} />Your introductions are certificate-protected</li>
            <li><Icon name="value" size={15} />Commission tracked to the customer’s payment</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}

/** COLLABIZ sign-in and sign-up (screen 011): Apple-style split layout with an animated brand scene. */
export function AuthExperience({ initial }: { initial: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const mode: Mode = initial;
  const [f, setF] = useState({ email: '', password: '', fullName: '', phone: '', mfaCode: '', acceptTerms: false });
  const [needMfa, setNeedMfa] = useState(false);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const next = params.get('next');
  const go = () => router.replace(next && next.startsWith('/') ? next : '/dashboard');

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
    await refresh(); go(); return true;
  });
  const registerM = useMutation(async () => {
    await api.post('/auth/register', { email: f.email, password: f.password, fullName: f.fullName, phone: f.phone || undefined, acceptTerms: f.acceptTerms });
    await refresh(); router.replace('/verify'); return true;
  });
  const m = mode === 'login' ? loginM : registerM;
  const features = useQuery<{ demoMode?: boolean }>('/public/demo');
  const guestM = useMutation(async (email: string) => { await api.post('/auth/login', { email, password: 'Collabiz#2026' }); await refresh(); go(); return true; });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pw = strength(f.password);
  const qs = next ? `?next=${encodeURIComponent(next)}` : '';
  const capsCheck = (e: React.KeyboardEvent) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  return (
    <main id="main" className="cz-auth" data-screen="011" data-mode={mode}>
      <Showcase mode={mode} />
      <section className="cz-auth-panel">
        <div className="cz-auth-top">
          <Link href="/" className="cz-auth-home" aria-label="COLLABIZ home"><img src="/brand/collabiz-logo.png" alt="COLLABIZ — Connect. Collaborate. Grow." width={168} /></Link>
          <Link href="/" className="cz-auth-back"><Icon name="prev" size={15} />Back to site</Link>
        </div>
        <div className="cz-auth-card" key={mode}>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="cz-auth-sub">{mode === 'login' ? 'Sign in to continue to COLLABIZ.' : 'It takes a minute. Verification comes next, at your pace.'}</p>
          <nav className="cz-auth-switch" aria-label="Sign in or create an account">
            <Link href={`/login${qs}`} aria-current={mode === 'login' ? 'page' : undefined}>Sign in</Link>
            <Link href={`/signup${qs}`} aria-current={mode === 'register' ? 'page' : undefined}>Create account</Link>
            <span className="cz-auth-thumb" aria-hidden="true" />
          </nav>
          <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
            {m.error && !(mode === 'login' && needMfa && !f.mfaCode) && <Alert tone="danger">{m.error}</Alert>}
            {mode === 'register' && <Field label="Full name" value={f.fullName} onChange={set('fullName')} error={m.fieldErrors.fullName} autoComplete="name" required />}
            <Field label="Email" type="email" inputMode="email" value={f.email} onChange={set('email')} error={m.fieldErrors.email} autoComplete={mode === 'login' ? 'username' : 'email'} required autoFocus={mode === 'login'} />
            {mode === 'register' && <Field label="Mobile number (optional)" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} error={m.fieldErrors.phone} autoComplete="tel" hint="Used for OTP verification" />}
            <Field label="Password" type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} onKeyUp={capsCheck} onKeyDown={capsCheck} error={m.fieldErrors.password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required
              hint={caps ? 'Caps Lock is on' : mode === 'register' ? (pw.label || 'At least 10 characters with a letter and a number') : undefined}
              trailing={<button type="button" className="cz-auth-eye" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? 'Hide characters' : 'Show characters'}><Icon name="eye" size={18} /></button>} />
            {mode === 'register' && f.password && <div className="cz-auth-meter" data-score={pw.ok ? pw.score : 1} aria-hidden="true"><span /><span /><span /><span /></div>}
            {mode === 'login' && needMfa && (
              <>
                <Alert tone="info">Enter the 6-digit code from your authenticator app.</Alert>
                <Field label="Authentication code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={f.mfaCode} onChange={set('mfaCode')} error={m.fieldErrors.mfaCode} autoFocus />
              </>
            )}
            {mode === 'login' && <div className="cz-auth-row"><span /><Link href="/support/contact?topic=account">Forgot password?</Link></div>}
            {mode === 'register' && (
              <>
                <Checkbox label={<>I accept the <Link href="/membership">partner terms</Link> and <Link href="/settings/privacy">privacy notice</Link>.</>} checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} />
                {m.fieldErrors.acceptTerms && <p className="cz-error-text">{m.fieldErrors.acceptTerms}</p>}
              </>
            )}
            <Button type="submit" size="lg" loading={m.pending} className="cz-auth-submit">{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
          </form>
          {mode === 'register' && <ol className="cz-auth-steps" aria-label="What happens next"><li><span>1</span>Create account</li><li><span>2</span>Verify e-mail</li><li><span>3</span>Company & KYC</li><li><span>4</span>Start winning work</li></ol>}
          {features.data?.demoMode && mode === 'login' && (
            <section className="cz-auth-guest" aria-labelledby="guest-h">
              <div className="cz-auth-or"><span>or explore a demo account</span></div>
              <h2 id="guest-h" className="cz-sr-only">Explore as a guest</h2>
              {guestM.error && <Alert tone="danger">{guestM.error}</Alert>}
              <ul>{GUESTS.map((g) => (
                <li key={g.email}>
                  <button type="button" className="cz-guest-btn" onClick={() => guestM.run(g.email)} disabled={guestM.pending} aria-label={`Continue as ${g.name}, ${g.role}`}>
                    <span className="cz-guest-icon"><Icon name={g.icon} size={18} /></span>
                    <span style={{ flex: 1, textAlign: 'left' }}><strong>{g.name}</strong><span>{g.role}</span></span>
                    <Icon name="next" size={16} />
                  </button>
                </li>
              ))}</ul>
              <p className="cz-auth-fine">Sample partner accounts. All companies and figures are demonstration data.</p>
            </section>
          )}
          <p className="cz-auth-fine">{mode === 'login' ? <>New to COLLABIZ? <Link href={`/signup${qs}`}>Create a free account</Link></> : <>Already a partner? <Link href={`/login${qs}`}>Sign in</Link></>}</p>
        </div>
        <p className="cz-auth-legal">Registration is free. COLLABIZ never charges fees for recruiting partners. Powered by Unite Group.</p>
      </section>
    </main>
  );
}
