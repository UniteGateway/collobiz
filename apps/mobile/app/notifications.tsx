import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Empty, ErrorView, Icon, Loading, ScreenView, Section, Segmented, s, theme, type IconName } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface N { id: string; kind: string; title: string; body: string; link: string | null; createdAt: string; readAt: string | null }
const ICON: Record<string, IconName> = { message: 'chatbubble', meeting: 'calendar', project: 'folder-open', tender: 'hammer', contract: 'document-text', commission: 'wallet', trade: 'cube', team: 'people', opportunity: 'storefront', lead: 'shield-checkmark', announcement: 'megaphone', support: 'help-buoy', security: 'lock-closed' };
/** Web links stored on notifications → native screens. */
const nativeHref = (l: string | null) => {
  if (!l) return null;
  if (l.startsWith('/chat/groups/')) return `/chat/${l.split('/')[3]}`;
  if (l.startsWith('/chat/')) return l;
  const meeting = l.match(/\/meetings(?:\/|\?id=)([0-9a-f-]{36})/); if (meeting) return `/meetings/${meeting[1]}`;
  if (l.startsWith('/support')) return '/help';
  if (l.startsWith('/opportunities/')) return l;
  if (l.startsWith('/projects/')) return `/projects/${l.split('/')[2]}/progress`;
  return null;
};

/** Screen 111 — Notifications & alerts (native). */
export default function Notifications() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');
  const q = useApi<{ items: N[]; unread: number }>('/notifications', filter === 'unread' ? { unread: 'true' } : undefined);
  const all = useAction(async () => { await api.post('/notifications/read', { all: true }); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const open = async (n: N) => { if (!n.readAt) await api.post('/notifications/read', { ids: [n.id] }).catch(() => {}); const h = nativeHref(n.link); if (h) router.push(h as never); else q.reload(); };
  return (
    <ScreenView id="111" title="Notifications" subtitle={q.data?.unread ? `${q.data.unread} unread` : 'You’re all caught up'} right={q.data?.unread ? <Button title="Read all" variant="plain" compact onPress={() => all.run()} /> : undefined}>
      <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} />
      {!q.data?.items.length ? <Empty icon="notifications-off-outline" title="Nothing here" body="Invitations, signatures, messages and payouts appear here." /> : (
        <Section>
          {q.data.items.map((n) => (
            <Pressable key={n.id} testID={`notif-${n.id}`} onPress={() => open(n)} accessibilityRole="button" accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${n.title}`}
              style={({ pressed }) => [{ flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#fff', alignItems: 'flex-start' }, pressed && { backgroundColor: theme.colors.grey50 }]}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.navy50, alignItems: 'center', justifyContent: 'center' }}><Icon name={ICON[n.kind] ?? 'notifications'} size={17} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { fontWeight: n.readAt ? '400' : '600' }]}>{n.title}</Text>
                {!!n.body && <Text style={s.rowSub} numberOfLines={2}>{n.body}</Text>}
                <Text style={[s.hint, { fontSize: 12 }]}>{new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              {!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.info, marginTop: 6 }} />}
            </Pressable>
          ))}
        </Section>
      )}
    </ScreenView>
  );
}
