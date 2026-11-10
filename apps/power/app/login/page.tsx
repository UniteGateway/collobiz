'use client';
import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Button, Field, Notice } from '@/components/ui';
import { api } from '@/lib/client';

export default function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(undefined);
    try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify(f) }); const next = new URLSearchParams(location.search).get('next'); location.href = next && next.startsWith('/') ? next : '/'; }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-white via-slate-50 to-blue-50 px-4 dark:from-navy-950 dark:via-navy-950 dark:to-navy-900">
      <form onSubmit={go} className="w-full max-w-sm rounded-[1.5rem] bg-white p-8 shadow-[0_24px_60px_rgba(11,31,58,0.12)] ring-1 ring-slate-200/70 dark:bg-white/5 dark:ring-white/10">
        <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-green-500 text-white"><Zap /></span>
        <h1 className="text-2xl font-semibold text-navy-900 dark:text-white">Unite Power Dispatch</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">Solar + BESS smart energy optimiser</p>
        <div className="flex flex-col gap-4">
          {err && <Notice tone="red">{err}</Notice>}
          <Field label="Email" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <Field label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </div>
      </form>
    </main>
  );
}
