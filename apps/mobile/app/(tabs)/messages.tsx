import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Empty, ErrorView, Icon, Loading, ScreenView, SearchBar, Segmented, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Row { id: string; kind: 'direct' | 'project'; title: string; lastMessageAt: string | null; unread: number; preview: { author: string; text: string } | null }
export const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
export const initials = (n: string) => n.replace(/\(.*\)/, '').trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

/** Screen 105 — Inbox (native tab): direct conversations and project team chats. */
export default function Messages() {
  const router = useRouter();
  const q = useApi<Row[]>('/inbox');
  const [filter, setFilter] = useState('all');
  const [term, setTerm] = useState('');
  const rows = (q.data ?? []).filter((r) => (filter === 'all' || (filter === 'unread' ? r.unread > 0 : r.kind === filter)) && (!term || `${r.title} ${r.preview?.text ?? ''}`.toLowerCase().includes(term.toLowerCase())));
  return (
    <ScreenView id="105" tab title="Messages" scroll={false} right={<Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel="Notifications" style={{ padding: 8 }}><Icon name="notifications-outline" size={24} /></Pressable>}>
      <SearchBar value={term} onChangeText={setTerm} placeholder="Search conversations" label="Search conversations" />
      <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'direct', label: 'Direct' }, { value: 'project', label: 'Projects' }]} />
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorView error={q.error} onRetry={q.reload} /> : (
        <FlatList data={rows} keyExtractor={(r) => r.id} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}
          style={[s.group, { flexGrow: 0 }]} ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: theme.colors.grey200, marginLeft: 72 }} />}
          ListEmptyComponent={<Empty icon="chatbubbles-outline" title="No conversations" body="Message a verified partner from the web app, or open a project to chat with its team." />}
          renderItem={({ item: r }) => (
            <Pressable testID={`thread-${r.id}`} onPress={() => router.push(`/chat/${r.id}`)} accessibilityRole="button" accessibilityLabel={`${r.title}${r.unread ? `, ${r.unread} unread` : ''}`}
              style={({ pressed }) => [{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, backgroundColor: '#fff' }, pressed && { backgroundColor: theme.colors.grey50 }]}>
              <View style={{ width: 44, height: 44, borderRadius: r.kind === 'project' ? 12 : 22, backgroundColor: r.kind === 'project' ? theme.colors.navy50 : theme.colors.navy700, alignItems: 'center', justifyContent: 'center' }}>
                {r.kind === 'project' ? <Icon name="folder-open" size={20} /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{initials(r.title)}</Text>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[s.rowTitle, { fontWeight: '600', flex: 1 }]} numberOfLines={1}>{r.title}</Text>
                  {r.lastMessageAt && <Text style={[s.hint, { marginTop: 0 }]}>{ago(r.lastMessageAt)}</Text>}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.rowSub, { flex: 1, marginTop: 0 }, r.unread > 0 && { color: theme.colors.navy900, fontWeight: '500' }]} numberOfLines={1}>{r.preview ? `${r.kind === 'project' ? `${r.preview.author.split(' ')[0]}: ` : ''}${r.preview.text}` : 'No messages yet'}</Text>
                  {r.unread > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.info, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{r.unread}</Text></View>}
                </View>
              </View>
            </Pressable>
          )} />
      )}
    </ScreenView>
  );
}
