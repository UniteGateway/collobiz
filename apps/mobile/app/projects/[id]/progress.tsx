import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, Empty, ErrorView, Field, Loading, Notice, ScreenView, s, theme } from '@/components/ui';
import { api, API_URL } from '@/api';
import { useAction, useApi } from '@/hooks';
import { isOffline, outbox, useOutbox, type SiteUpdateItem } from '@/outbox';

type Photo = { uri: string; name: string; type: string };

/** Screen 079 (native) — Site Progress & Photo Updates: camera or gallery photos become milestone evidence. */
export default function SiteProgress() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const updates = useApi<any[]>(`/projects/${id}/updates`);
  const ms = useApi<any>(`/projects/${id}/milestones`);
  const [note, setNote] = useState('');
  const [pct, setPct] = useState('');
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [done, setDone] = useState(false);
  const [queued, setQueued] = useState(false);
  const send = async (it: Pick<SiteUpdateItem, 'projectId' | 'note' | 'milestoneId' | 'progressPct' | 'photos'>) => {
    const fd = new FormData();
    fd.append('note', it.note);
    if (it.milestoneId) fd.append('milestoneId', it.milestoneId);
    if (it.milestoneId && it.progressPct) fd.append('progressPct', it.progressPct);
    it.photos.forEach((p) => fd.append('files', p as unknown as Blob));
    await api.upload(`/projects/${it.projectId}/updates`, fd);
  };
  const box = useOutbox(send);
  const pending = box.items.filter((i) => i.projectId === id);
  const add = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true, selectionLimit: 5 });
    if (r.canceled) return;
    setPhotos([...photos, ...r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `site-${Date.now()}-${i}.jpg`, type: a.mimeType ?? 'image/jpeg' }))].slice(0, 5));
  };
  const post = useAction(async () => {
    const item = { projectId: id, note, milestoneId, progressPct: pct, photos };
    setDone(false); setQueued(false);
    try {
      await send(item);
      setDone(true);
    } catch (e) {
      if (!isOffline(e)) throw e; // the server's answer (e.g. a validation message) is shown as usual
      await outbox().add(item); // no signal: keep it on the phone and send it later
      await box.refresh();
      setQueued(true);
    }
    setNote(''); setPct(''); setPhotos([]);
    await Promise.all([updates.reload(), ms.reload()]);
  });
  const open = useAction(async (docId: string) => { const r = await api.get<{ url: string }>(`/projects/${id}/documents/${docId}/url`); await Linking.openURL(API_URL + r.url); });
  if (updates.loading || ms.loading) return <Loading />;
  if (updates.error) return <ErrorView error={updates.error} onRetry={updates.reload} />;
  const reportable = (ms.data?.milestones ?? []).filter((m: any) => ['in_progress', 'rejected'].includes(m.status));
  return (
    <ScreenView id="079">
      <Stack.Screen options={{ title: 'Site progress' }} />
      {done && <Notice tone="success">Update posted. Photos are stored privately and count as evidence for the milestone.</Notice>}
      {queued && <Notice tone="info">No connection — the update is saved on this phone and will be sent automatically when you are back online.</Notice>}
      {pending.length > 0 && (
        <Card title={`Waiting to send (${pending.length})`}>
          {pending.map((p) => <Text key={p.id} style={s.p} testID="outbox-item">{p.note}{p.photos.length ? ` · ${p.photos.length} photo(s)` : ''}{p.error ? ` — not accepted: ${p.error}` : ''}</Text>)}
          <Button title="Send now" variant="secondary" onPress={() => box.flush()} loading={box.busy} testID="outbox-send" />
          {pending.some((p) => p.error) && <Text style={s.hint}>Updates marked “not accepted” need changes — remove them and post again.</Text>}
          {pending.filter((p) => p.error).map((p) => <Button key={`rm-${p.id}`} title={`Remove “${p.note.slice(0, 24)}”`} variant="plain" onPress={() => box.remove(p.id)} />)}
        </Card>
      )}
      {(post.error || open.error) && <Notice tone="danger">{post.error ?? open.error}</Notice>}
      <Card title="Post a site update">
        <Field label="What happened on site?" value={note} onChangeText={setNote} multiline error={post.fieldErrors.note} testID="update-note" />
        <Text style={s.label}>Milestone</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: milestoneId === null }} onPress={() => setMilestoneId(null)} style={[s.chip, milestoneId === null && { backgroundColor: theme.colors.navy700 }]}><Text style={{ color: milestoneId === null ? '#fff' : theme.colors.navy900 }}>General</Text></Pressable>
          {reportable.map((m: any) => (
            <Pressable key={m.id} accessibilityRole="radio" accessibilityState={{ checked: milestoneId === m.id }} onPress={() => setMilestoneId(m.id)} style={[s.chip, milestoneId === m.id && { backgroundColor: theme.colors.navy700 }]}>
              <Text style={{ color: milestoneId === m.id ? '#fff' : theme.colors.navy900 }}>{m.seq}. {m.title} ({m.progressPct}%)</Text>
            </Pressable>
          ))}
        </View>
        {milestoneId && <Field label="Progress %" value={pct} onChangeText={setPct} keyboardType="number-pad" error={post.fieldErrors.progressPct} testID="update-pct" />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Take photo" variant="secondary" onPress={() => add(true)} /></View>
          <View style={{ flex: 1 }}><Button title="From gallery" variant="secondary" onPress={() => add(false)} /></View>
        </View>
        {photos.length > 0 && <Text style={s.hint}>{photos.length} photo(s) attached</Text>}
        <Button title="Post update" onPress={() => post.run()} loading={post.busy} disabled={note.trim().length < 5} testID="update-post" />
      </Card>
      <Card title="Site diary">
        {!updates.data?.length ? <Empty title="No site updates yet" /> : updates.data.map((u) => (
          <View key={u.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E6E9EF' }}>
            <Text style={s.hint}>{u.org} · {new Date(u.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}{u.milestone ? ` · ${u.milestone}` : ''}{u.progressPct != null ? ` · ${u.progressPct}%` : ''}</Text>
            <Text style={s.p}>{u.note}</Text>
            {u.attachments.map((a: any) => <Text key={a.id} accessibilityRole="link" style={[s.p, { color: '#2E7D32' }]} onPress={() => open.run(a.id)}>{a.category === 'photo' ? 'Photo' : 'File'}: {a.fileName}</Text>)}
          </View>
        ))}
      </Card>
    </ScreenView>
  );
}
