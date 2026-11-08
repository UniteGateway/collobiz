import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ErrorView, Icon, Loading, Notice, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

interface Msg { id: string; author: string; org: string; mine: boolean; createdAt: string; body: string | null; state: 'visible' | 'deleted' | 'purged'; canDelete: boolean }
interface Thread { id: string; kind: 'direct' | 'project'; subject: string | null; retentionDays: number; members: { userId: string; name: string; org: string }[]; messages: Msg[] }

/** Screen 106/107 — Conversation (native). Long-press a message to unsend (own, 15 min) or report (others). */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const q = useApi<Thread>(`/chat/threads/${id}`);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const list = useRef<FlatList<Msg>>(null);
  useEffect(() => { const t = setInterval(() => q.reload(), 8000); return () => clearInterval(t); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useAction(async () => { const body = text.trim(); if (!body) return; await api.post(`/chat/threads/${id}/messages`, { body }); setText(''); await q.reload(); });
  const act = (m: Msg) => {
    const run = async (choice: 'unsend' | 'report') => {
      try {
        if (choice === 'unsend') await api.post(`/chat/messages/${m.id}/delete`);
        else { await api.post(`/chat/messages/${m.id}/report`, { reason: 'Reported from the mobile app as inappropriate' }); setNotice('Reported. Only that message is shared with COLLABIZ support.'); }
        await q.reload();
      } catch (e) { setNotice(e instanceof Error ? e.message : 'Something went wrong'); }
    };
    const option: 'unsend' | 'report' | null = m.canDelete ? 'unsend' : !m.mine && m.state === 'visible' ? 'report' : null;
    if (!option) return;
    const label = option === 'unsend' ? 'Unsend message' : 'Report message';
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [label, 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 }, (i) => { if (i === 0) run(option); });
    else Alert.alert(label, option === 'report' ? 'Only this message is shared with support.' : undefined, [{ text: 'Cancel', style: 'cancel' }, { text: option === 'unsend' ? 'Unsend' : 'Report', style: 'destructive', onPress: () => { run(option); } }]);
  };
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const t = q.data!;
  const title = t.kind === 'project' ? t.subject ?? 'Project' : t.members.find((x) => x.userId !== me?.id)?.name ?? 'Conversation';
  return (
    <SafeAreaView style={s.safe} edges={['bottom', 'left', 'right']} testID={t.kind === 'project' ? 'screen-107' : 'screen-106'}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {notice && <View style={{ padding: 12 }}><Notice tone="info">{notice}</Notice></View>}
        <FlatList ref={list} data={t.messages} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 14, gap: 6 }} onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={[s.hint, { textAlign: 'center', marginTop: 40 }]}>No messages yet. Messages are encrypted and visible only to the people in this conversation.</Text>}
          renderItem={({ item: m }) => (
            <Pressable onLongPress={() => act(m)} accessibilityRole="text" accessibilityLabel={`${m.mine ? 'You' : m.author}: ${m.body ?? 'message removed'}`} accessibilityHint={m.canDelete ? 'Long press to unsend' : !m.mine ? 'Long press to report' : undefined}
              style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }} testID={`msg-${m.id}`}>
              {!m.mine && t.kind === 'project' && <Text style={{ fontSize: 12, color: theme.colors.grey600, marginLeft: 12, marginBottom: 2 }}>{m.author} · {m.org}</Text>}
              <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: m.state !== 'visible' ? 'transparent' : m.mine ? theme.colors.navy700 : '#fff', borderWidth: m.mine && m.state === 'visible' ? 0 : 0.5, borderColor: theme.colors.grey300, borderStyle: m.state !== 'visible' ? 'dashed' : 'solid' }}>
                <Text style={{ fontSize: 16, lineHeight: 21, color: m.state !== 'visible' ? theme.colors.grey600 : m.mine ? '#fff' : theme.colors.navy900, fontStyle: m.state !== 'visible' ? 'italic' : 'normal' }}>
                  {m.state === 'visible' ? m.body : m.state === 'deleted' ? 'Message deleted' : 'Removed under the retention policy'}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: theme.colors.grey600, marginTop: 2, alignSelf: m.mine ? 'flex-end' : 'flex-start', marginHorizontal: 8 }}>{new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text>
            </Pressable>
          )} />
        {send.error && <View style={{ paddingHorizontal: 12 }}><Notice tone="danger">{send.error}</Notice></View>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 0.5, borderTopColor: theme.colors.grey200 }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={theme.colors.grey500} multiline maxLength={4000} accessibilityLabel="Message"
            style={{ flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 0.5, borderColor: theme.colors.grey300, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 16, color: theme.colors.navy900 }} />
          <Pressable onPress={() => send.run()} disabled={!text.trim() || send.busy} accessibilityRole="button" accessibilityLabel="Send" testID="send"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? theme.colors.navy700 : theme.colors.grey200, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
        <Text style={{ fontSize: 11, color: theme.colors.grey600, textAlign: 'center', paddingBottom: 6, backgroundColor: '#fff' }}>Encrypted at rest · kept {Math.round(t.retentionDays / 365)} years</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
