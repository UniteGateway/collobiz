'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { KIND_META } from '@/components/Comms';
import { WhatsappPrefs } from '@/components/WhatsappPrefs';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Pref { kind: string; inApp: boolean; email: boolean; sms: boolean; push: boolean; mandatory: boolean }

/** Screen 147 — Notification preferences. In-app is always on; legal, financial and security email cannot be switched off. */
export default function NotificationPrefs() {
  const q = useQuery<Pref[]>('/me/notification-preferences');
  const [rows, setRows] = useState<Pref[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setRows(q.data); }, [q.data]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(q.data ?? []);
  const save = useMutation(async () => { const r = await api.put<Pref[]>('/me/notification-preferences', { preferences: rows.map(({ kind, email, sms, push }) => ({ kind, email, sms, push })) }); setRows(r); setSaved(true); await q.reload(); return true; });
  const toggle = (kind: string, ch: 'email' | 'sms' | 'push') => { setSaved(false); setRows(rows.map((r) => (r.kind === kind ? { ...r, [ch]: !r[ch] } : r))); };
  return (
    <Screen id="147" title="Notifications" description="Choose how you hear about each kind of activity. Everything always appears in your notifications centre."
      actions={<Button onClick={() => save.run()} loading={save.pending} disabled={!dirty}>Save changes</Button>}>
      {saved && !dirty && <Alert tone="success">Preferences saved.</Alert>}
      {save.error && <Alert tone="danger">{save.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : (
        <div className="cz-ta-table-wrap">
          <table className="cz-prefs">
            <caption className="cz-sr-only">Notification channels by activity</caption>
            <thead><tr><th scope="col">Activity</th><th scope="col">In app</th><th scope="col">Email</th><th scope="col">SMS</th><th scope="col">Push</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kind}>
                  <th scope="row"><span className="cz-row" style={{ gap: 10, flexWrap: 'nowrap' }}><Icon name={KIND_META[r.kind]?.icon ?? 'bell'} size={16} /><span><strong>{KIND_META[r.kind]?.label ?? r.kind}</strong>{r.mandatory && <span className="cz-muted cz-pref-note">Email required — legal or financial notices</span>}</span></span></th>
                  <td><span className="cz-switch" data-on aria-label="Always on"><span /></span></td>
                  {(['email', 'sms', 'push'] as const).map((ch) => {
                    const locked = ch === 'email' && r.mandatory;
                    return <td key={ch}><button type="button" role="switch" className="cz-switch" aria-checked={r[ch]} data-on={r[ch] || undefined} disabled={locked} aria-label={`${KIND_META[r.kind]?.label ?? r.kind} by ${ch}`} onClick={() => toggle(r.kind, ch)}><span /></button></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="cz-muted" style={{ fontSize: 13, marginTop: 14 }}>SMS is sent only for time-critical items and when your mobile number is verified.</p>
      <WhatsappPrefs />
    </Screen>
  );
}
