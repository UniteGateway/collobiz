import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Button, ErrorView, Loading, Notice, ScreenView, Section, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { WhatsappPrefs } from '@/components/WhatsappPrefs';

interface Pref { kind: string; email: boolean; sms: boolean; push: boolean; mandatory: boolean }
const LABEL: Record<string, string> = { message: 'Messages', meeting: 'Meetings', project: 'Projects', tender: 'Tenders', contract: 'Contracts', commission: 'Commission', trade: 'Trading', team: 'Teams', opportunity: 'Opportunities', lead: 'Leads', announcement: 'Announcements', support: 'Support', security: 'Security' };

/** Screen 147 — Notification preferences (native). Legal, financial and security email cannot be switched off. */
export default function NotificationPrefs() {
  const q = useApi<Pref[]>('/me/notification-preferences');
  const [rows, setRows] = useState<Pref[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setRows(q.data); }, [q.data]);
  const save = useAction(async () => { await api.put('/me/notification-preferences', { preferences: rows.map(({ kind, email, sms, push }) => ({ kind, email, sms, push })) }); setSaved(true); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const dirty = JSON.stringify(rows.map(({ kind, email, sms, push }) => ({ kind, email, sms, push }))) !== JSON.stringify((q.data ?? []).map(({ kind, email, sms, push }) => ({ kind, email, sms, push })));
  const set = (kind: string, ch: 'email' | 'sms' | 'push', v: boolean) => { setSaved(false); setRows(rows.map((r) => (r.kind === kind ? { ...r, [ch]: v } : r))); };
  return (
    <ScreenView id="147" title="Notifications" subtitle="Everything always appears in your notifications list. Choose where else you hear about it."
      footer={<Button title="Save changes" onPress={() => save.run()} loading={save.busy} disabled={!dirty} testID="save-prefs" />}>
      {saved && !dirty && <Notice tone="success">Preferences saved.</Notice>}
      {save.error && <Notice tone="danger">{save.error}</Notice>}
      {rows.map((r) => (
        <Section key={r.kind} title={LABEL[r.kind] ?? r.kind} footer={r.mandatory ? 'Email can’t be switched off — it carries legal or financial notices.' : undefined}>
          {(['push', 'email', 'sms'] as const).map((ch) => (
            <View key={ch} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 48, backgroundColor: '#fff' }}>
              <Text style={s.rowTitle}>{ch === 'push' ? 'Push' : ch === 'email' ? 'Email' : 'SMS'}</Text>
              <Switch value={r[ch]} onValueChange={(v) => set(r.kind, ch, v)} disabled={ch === 'email' && r.mandatory} trackColor={{ true: theme.colors.green600, false: theme.colors.grey300 }}
                accessibilityLabel={`${LABEL[r.kind] ?? r.kind} by ${ch}`} testID={`pref-${r.kind}-${ch}`} />
            </View>
          ))}
        </Section>
      ))}
      <WhatsappPrefs />
    </ScreenView>
  );
}
