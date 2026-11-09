'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Skeleton } from '@collabiz/ui';
import { api } from '@/lib/api';

interface Info { email: string | null; organization: string; alreadyOptedOut: boolean }

/** One-click unsubscribe from Unite Group outreach (link in every Growth Desk message). No sign-in needed. */
function Inner() {
  const token = useSearchParams().get('token') ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!token) { setErr('This link is not complete. Please use the full link from the e-mail.'); return; }
    api.get<Info>('/public/unsubscribe', { token }).then(setInfo).catch(() => setErr('This link is not valid. Please use the link from the most recent e-mail.'));
  }, [token]);
  const confirm = async () => {
    setPending(true);
    try { await api.post('/public/unsubscribe', { token }); setDone(true); } catch { setErr('Something went wrong. Please try again, or reply to the e-mail with “unsubscribe”.'); } finally { setPending(false); }
  };
  return (
    <div className="cz-container cz-section" style={{ maxWidth: 640 }}>
      <h1>Stop messages from Unite Group</h1>
      {err ? <Alert tone="warning">{err}</Alert> : !info ? <Skeleton height={120} /> : done || info.alreadyOptedOut ? (
        <Alert tone="success" title="You will not hear from us again">{info.email ?? info.organization} has been removed from all Unite Group outreach. If you still receive a message, reply to it and we will act on it at once.</Alert>
      ) : (
        <div className="cz-card cz-stack" style={{ gap: 14 }}>
          <p style={{ margin: 0 }}>Unsubscribe <strong>{info.email ?? info.organization}</strong> from all outreach by Unite Group companies?</p>
          <p className="cz-muted" style={{ margin: 0 }}>This applies to every Unite business and campaign. It does not affect messages about an order or agreement you already have with us.</p>
          <div><Button onClick={confirm} loading={pending}>Unsubscribe</Button></div>
        </div>
      )}
    </div>
  );
}

export default function Unsubscribe() {
  return <Suspense><Inner /></Suspense>;
}
