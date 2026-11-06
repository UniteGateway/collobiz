'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, TextInput } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Team invitation acceptance (supports screen 144). */
function InviteInner() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { refresh } = useSession();
  const [f, setF] = useState({ fullName: '', password: '' });
  const m = useMutation(async () => {
    await api.post('/auth/invitations/accept', { token, password: f.password, fullName: f.fullName || undefined });
    await refresh();
    router.replace('/dashboard');
    return true;
  });
  return (
    <main id="main" className="cz-container" style={{ maxWidth: 480, paddingTop: 40 }}>
      <section className="cz-card">
        <h1>Join your team on COLLABIZ</h1>
        {!token && <Alert tone="danger">This invitation link is incomplete.</Alert>}
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
          <TextInput label="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={m.fieldErrors.fullName} autoComplete="name" />
          <TextInput label="Choose a password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={m.fieldErrors.password} autoComplete="new-password" hint="At least 10 characters with a letter and a number" />
          <Button type="submit" loading={m.pending} disabled={!token}>Accept invitation</Button>
        </form>
      </section>
    </main>
  );
}
export default function InvitePage() {
  return <Suspense><InviteInner /></Suspense>;
}
