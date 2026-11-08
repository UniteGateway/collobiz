import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Empty, ErrorView, Loading, ScreenView, Tag, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useApi } from '@/hooks';

interface Ann { id: string; title: string; body: string; important: boolean; publishedAt: string; read: boolean }

/** Screen 110 — Business announcements (native). Tapping one expands it and marks it read. */
export default function Announcements() {
  const q = useApi<Ann[]>('/announcements');
  const [open, setOpen] = useState<string | null>(null);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const tap = async (a: Ann) => { setOpen(open === a.id ? null : a.id); if (!a.read) { await api.post(`/announcements/${a.id}/read`).catch(() => {}); q.reload(); } };
  return (
    <ScreenView id="110" title="Announcements">
      {!q.data?.length ? <Empty icon="megaphone-outline" title="No announcements" body="Programme news and tender windows appear here." /> : q.data.map((a) => (
        <Pressable key={a.id} testID={`ann-${a.id}`} onPress={() => tap(a)} accessibilityRole="button" accessibilityState={{ expanded: open === a.id }} accessibilityLabel={`${a.read ? '' : 'New. '}${a.title}`} style={[s.card, { gap: 6 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!a.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.info }} />}
            {a.important && <Tag tone="navy">Important</Tag>}
            <Text style={[s.hint, { marginTop: 0 }]}>{new Date(a.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
          </View>
          <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.navy900 }}>{a.title}</Text>
          <Text style={[s.p, { marginBottom: 0 }]} numberOfLines={open === a.id ? undefined : 2}>{a.body}</Text>
        </Pressable>
      ))}
    </ScreenView>
  );
}
