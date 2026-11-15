import { useState } from 'react';
import { Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DOCUMENT_MODULES } from '@collabiz/types';
import { Empty, ErrorView, Icon, Loading, Notice, ScreenView, Segmented, s, theme } from '@/components/ui';
import { API_URL, api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Doc { id: string; title: string; kindLabel: string; module: string; source: 'file' | 'link'; size: number | null; description: string | null }
const QUICK = ['all', 'unite-solar', 'powertek', 'projects'] as const;
const label = (k: string) => (k === 'all' ? 'All' : (DOCUMENT_MODULES.find(([m]) => m === k)?.[1] ?? k).replace(' products', ''));

/** Catalogues & documents (native): brochures, catalogues, DPRs and datasheets for every module. */
export default function Library() {
  const router = useRouter();
  const [m, setM] = useState<string>('all');
  const q = useApi<Doc[]>('/documents', { module: m });
  const open = useAction(async (d: Doc) => {
    const r = await api.post<{ url: string }>(`/documents/${d.id}/open`);
    if (r.url.startsWith('/v1/')) await Linking.openURL(`${API_URL}${r.url}`);
    else if (r.url.startsWith('/')) router.push(r.url as never);
    else await Linking.openURL(r.url);
  });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView title="Catalogues & documents" subtitle="Brochures, catalogues, DPRs and datasheets published by Unite." refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      <Segmented label="Module" value={m} onChange={setM} options={QUICK.map((k) => ({ value: k, label: label(k) }))} />
      <View style={{ height: theme.space.md }} />
      {open.error ? <Notice tone="danger">{open.error}</Notice> : null}
      {!q.data?.length ? <Empty icon="document-text-outline" title="No documents yet" body="Unite publishes catalogues, brochures and DPRs here." /> : q.data.map((d) => (
        <Pressable key={d.id} testID={`doc-${d.id}`} accessibilityRole="button" accessibilityLabel={`Open ${d.title}`} onPress={() => open.run(d)} style={({ pressed }) => [s.card, { flexDirection: 'row', gap: 12, alignItems: 'center' }, pressed && { backgroundColor: theme.colors.grey50 }]}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.navy700 }}><Icon name="document-text-outline" color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: theme.colors.navy900 }}>{d.title}</Text>
            <Text style={s.hint}>{d.kindLabel} · {d.module}{d.source === 'file' ? ' · PDF' : ' · Link'}</Text>
            {d.description ? <Text style={s.hint} numberOfLines={2}>{d.description}</Text> : null}
          </View>
          <Icon name={d.source === 'file' ? 'download-outline' : 'open-outline'} />
        </Pressable>
      ))}
    </ScreenView>
  );
}
