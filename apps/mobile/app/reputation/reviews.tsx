import { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Empty, ErrorView, Field, Loading, Notice, ScreenView, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Review { id: string; reviewer: string; quality: number; timeliness: number; communication: number; comment: string; status: string; response: string | null; createdAt: string }
const STATUS: Record<string, [string, 'success' | 'warning' | 'neutral']> = { published: ['Counted', 'success'], under_appeal: ['Under appeal', 'warning'], removed: ['Removed', 'neutral'] };

/** Screen 164 (native) — reviews of your company; reply publicly or appeal. */
export default function Reviews() {
  const q = useApi<{ reviews: Review[]; appeals: { reviewId: string; status: string }[] }>('/reputation/me');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView id="164" title="Reviews" subtitle="Only companies that worked with you on certified work can review you.">
      {!q.data?.reviews.length ? <Empty icon="star-outline" title="No reviews yet" body="Reviews appear after you deliver certified work with another company." /> : q.data.reviews.map((r) => <Item key={r.id} r={r} appealed={q.data!.appeals.some((a) => a.reviewId === r.id)} onChange={q.reload} />)}
    </ScreenView>
  );
}

function Item({ r, appealed, onChange }: { r: Review; appealed: boolean; onChange: () => void }) {
  const [mode, setMode] = useState<'reply' | 'appeal' | null>(null);
  const [text, setText] = useState('');
  const m = useAction(async () => { if (mode === 'reply') await api.post(`/reviews/${r.id}/response`, { response: text }); else await api.post('/reputation/appeals', { reviewId: r.id, reason: text }); setMode(null); setText(''); onChange(); });
  const avg = (r.quality + r.timeliness + r.communication) / 3;
  return (
    <View style={[s.card, { gap: 8 }]} testID={`review-${r.id}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={[s.rowTitle, { fontWeight: '600', flex: 1 }]}>{r.reviewer}</Text><Badge status={r.status} tone={STATUS[r.status]?.[1]} label={STATUS[r.status]?.[0] ?? r.status} /></View>
      <Text style={{ color: '#E9A23B', fontSize: 16 }} accessibilityLabel={`${avg.toFixed(1)} out of 5`}>{'★'.repeat(Math.round(avg))}<Text style={{ color: theme.colors.grey300 }}>{'★'.repeat(5 - Math.round(avg))}</Text><Text style={[s.hint, { fontSize: 13 }]}>  {avg.toFixed(1)}</Text></Text>
      <Text style={s.p}>{r.comment}</Text>
      {r.response && <View style={{ padding: 10, borderRadius: 10, backgroundColor: theme.colors.grey50 }}><Text style={{ fontWeight: '600', fontSize: 12.5 }}>Your reply</Text><Text style={s.rowSub}>{r.response}</Text></View>}
      {m.error && <Notice tone="danger">{m.error}</Notice>}
      {mode ? (
        <View>
          <Field label={mode === 'reply' ? 'Your public reply' : 'Why this review is wrong'} value={text} onChangeText={setText} multiline hint={mode === 'appeal' ? 'The review stops counting while compliance looks at it.' : undefined} />
          <View style={{ flexDirection: 'row', gap: 8 }}><Button title={mode === 'reply' ? 'Post reply' : 'Submit appeal'} compact onPress={() => m.run()} loading={m.busy} disabled={text.trim().length < (mode === 'reply' ? 10 : 20)} /><Button title="Cancel" variant="plain" compact onPress={() => setMode(null)} /></View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!r.response && r.status !== 'removed' && <Button title="Reply" variant="secondary" compact onPress={() => setMode('reply')} />}
          {r.status === 'published' && !appealed && <Button title="Appeal" variant="plain" compact onPress={() => setMode('appeal')} />}
        </View>
      )}
    </View>
  );
}
