'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, StatusBadge, TextInput, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MfaEnrol } from '@/components/MfaEnrol';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface SessionRow { id: string; userAgent: string | null; createdAt: string; expiresAt: string }

/** Screen 145 — Account Security & MFA (atlas: mobile-first). */
export default function SecurityPage() {
  const { me, refresh } = useSession();
  const sessions = useQuery<SessionRow[]>('/auth/sessions');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [disableCode, setDisableCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const change = useMutation(async () => {
    await api.post('/auth/password', pw);
    window.location.href = '/login?next=/settings/security';
    return true;
  });
  const revoke = useMutation(async (id: string) => {
    await api.delete(`/auth/sessions/${id}`);
    sessions.reload();
    return true;
  });
  const disable = useMutation(async () => {
    await api.post('/auth/mfa/disable', { code: disableCode });
    setMsg('Multi-factor authentication disabled.');
    await refresh();
    return true;
  });
  return (
    <Screen id="145">
      {msg && <Alert tone="success">{msg}</Alert>}
      <Card title="Multi-factor authentication" actions={me && <StatusBadge status={me.mfaEnabled ? 'active' : 'not_enabled'} label={me.mfaEnabled ? 'Enabled' : 'Not enabled'} />}>
        {!me ? <LoadingState /> : me.mfaEnabled ? (
          me.mfaRequired ? <p>MFA is mandatory for your administrative role and cannot be disabled.</p> : (
            <form noValidate onSubmit={(e) => { e.preventDefault(); disable.run(); }} className="cz-row" style={{ alignItems: 'flex-end' }}>
              {disable.error && <Alert tone="danger">{disable.error}</Alert>}
              <TextInput label="Code to disable MFA" inputMode="numeric" maxLength={6} value={disableCode} onChange={(e) => setDisableCode(e.target.value)} />
              <Button variant="danger" type="submit" loading={disable.pending}>Disable MFA</Button>
            </form>
          )
        ) : <MfaEnrol onDone={() => { setMsg('Multi-factor authentication is now enabled.'); refresh(); }} />}
      </Card>
      <Card title="Change password">
        <form noValidate onSubmit={(e) => { e.preventDefault(); change.run(); }} style={{ maxWidth: 420 }}>
          {change.error && <Alert tone="danger">{change.error}</Alert>}
          <TextInput label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={change.fieldErrors.currentPassword} />
          <TextInput label="New password" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={change.fieldErrors.newPassword} hint="Changing your password signs you out everywhere." />
          <Button type="submit" loading={change.pending}>Update password</Button>
        </form>
      </Card>
      <Card title="Active sessions">
        {sessions.loading ? <LoadingState /> : sessions.error ? <ApiErrorView error={sessions.error} onRetry={sessions.reload} /> : (
          <DataTable caption="Active sessions" rows={sessions.data ?? []} columns={[
            { key: 'userAgent', header: 'Device', render: (r) => r.userAgent?.slice(0, 60) ?? 'Unknown device' },
            { key: 'createdAt', header: 'Signed in', render: (r) => new Date(r.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) },
            { key: 'expiresAt', header: 'Expires', render: (r) => new Date(r.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
            { key: 'a', header: '', render: (r) => <Button size="sm" variant="secondary" onClick={() => revoke.run(r.id)}>Sign out</Button> },
          ]} />
        )}
      </Card>
    </Screen>
  );
}
