import { useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { POST_TOPICS, POST_TOPIC_LABELS } from '@collabiz/types';
import { Button, Card, Empty, ErrorView, Field, Icon, Loading, Notice, ScreenView, Segmented, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

interface Member { userId: string; name: string; org: string; city: string | null }
interface Post { id: string; body: string; topicLabel: string; likes: number; comments: number; liked: boolean; author: string; org: string; mine: boolean; createdAt: string }
const ini = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Community (native): members online, the wall, and private messages through Chat. */
export default function Community() {
  const router = useRouter();
  const { me } = useSession();
  const [tab, setTab] = useState('wall');
  const online = useApi<{ visible: boolean; members: Member[] }>('/community/online');
  const wall = useApi<Post[]>('/community/posts');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('general');
  const [to, setTo] = useState<Member | null>(null);
  const [msg, setMsg] = useState('');
  const verified = me?.activeOrg?.verificationStatus === 'verified';
  const share = useAction(async () => { await api.post('/community/posts', { body, topic }); setBody(''); wall.reload(); });
  const like = useAction(async (p: Post) => { await api.post(`/community/posts/${p.id}/like`); wall.reload(); });
  const send = useAction(async () => { const r = await api.post<{ threadId: string }>('/chat/direct', { recipientUserId: to!.userId, body: msg }); setMsg(''); setTo(null); router.push(`/chat/${r.threadId}` as never); });
  const visible = useAction(async () => { await api.post('/community/presence', { visible: !online.data?.visible }); online.reload(); });
  if ((wall.loading && !wall.data) || (online.loading && !online.data)) return <Loading />;
  if (wall.error || online.error) return <ErrorView error={wall.error ?? online.error} onRetry={() => { wall.reload(); online.reload(); }} />;
  return (
    <ScreenView title="Community" subtitle="Members online, thoughts and opportunities from the network." refreshControl={<RefreshControl refreshing={wall.loading} onRefresh={() => { wall.reload(); online.reload(); }} />}>
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'wall', label: 'Wall' }, { value: 'online', label: `Online (${online.data?.members.length ?? 0})` }]} />
      <View style={{ height: theme.space.md }} />
      {tab === 'online' ? (
        <>
          {to ? (
            <Card title={`Message ${to.name}`}>
              <Field label="Your message" multiline value={msg} onChangeText={setMsg} />
              {send.error ? <Notice tone="danger">{send.error}</Notice> : null}
              <Button title="Send and open chat" onPress={() => send.run()} loading={send.busy} disabled={!msg.trim()} testID="send-dm" />
              <Button title="Cancel" variant="plain" onPress={() => setTo(null)} />
            </Card>
          ) : null}
          {!online.data?.members.length ? <Empty title="No one else is online" body="Share a post on the wall instead." /> : online.data.members.map((m) => (
            <View key={m.userId} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.navy700, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700' }}>{ini(m.name)}</Text><View style={{ position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' }} /></View>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: theme.colors.navy900 }}>{m.name}</Text><Text style={s.hint} numberOfLines={1}>{m.org}{m.city ? `, ${m.city}` : ''}</Text></View>
              <Button compact variant="secondary" title="Message" onPress={() => setTo(m)} disabled={!verified} testID={`dm-${m.userId}`} />
            </View>
          ))}
          <Button variant="plain" title={online.data?.visible === false ? 'Show me as online' : 'Hide that I’m online'} onPress={() => visible.run()} />
        </>
      ) : (
        <>
          {verified ? (
            <Card title="Share with the community">
              <Field label="Thought, question or opportunity" multiline value={body} onChangeText={setBody} error={share.fieldErrors.body} />
              <Segmented label="Topic" value={topic} onChange={setTopic} options={POST_TOPICS.slice(0, 4).map((t) => ({ value: t, label: POST_TOPIC_LABELS[t].split(' ')[0] }))} />
              <View style={{ height: 10 }} />
              {share.error ? <Notice tone="danger">{share.error}</Notice> : null}
              <Button title="Post" onPress={() => share.run()} loading={share.busy} disabled={body.trim().length < 3} testID="post-btn" />
            </Card>
          ) : <Notice>Posting opens once your organisation is verified.</Notice>}
          {!wall.data?.length ? <Empty icon="chatbubbles-outline" title="No posts yet" body="Be the first to share something." /> : wall.data.map((p) => (
            <Card key={p.id}>
              <Text style={{ fontWeight: '600', color: theme.colors.navy900 }}>{p.author} <Text style={s.hint}>· {p.org}</Text></Text>
              <Text style={[s.hint, { marginBottom: 6 }]}>{p.topicLabel} · {new Date(p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              <Text style={{ fontSize: 15, color: theme.colors.navy900 }}>{p.body}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
                <Pressable onPress={() => like.run(p)} accessibilityRole="button" accessibilityState={{ selected: p.liked }} accessibilityLabel={`${p.liked ? 'Unlike' : 'Like'}, ${p.likes} likes`} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name={p.liked ? 'heart' : 'heart-outline'} size={18} color={p.liked ? '#16a34a' : theme.colors.grey600} /><Text style={s.hint}>{p.likes}</Text></Pressable>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="chatbubble-outline" size={17} color={theme.colors.grey600} /><Text style={s.hint}>{p.comments}</Text></View>
                {!p.mine && <Pressable onPress={() => Alert.alert('Report post', 'Report this post to moderators?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Report', onPress: () => api.post(`/community/posts/${p.id}/report`, { reason: 'Reported from the mobile app' }).catch(() => undefined) }])} accessibilityRole="button"><Text style={s.hint}>Report</Text></Pressable>}
              </View>
            </Card>
          ))}
        </>
      )}
    </ScreenView>
  );
}
