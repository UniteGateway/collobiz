import { useState } from 'react';
import { Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Empty, ErrorView, Loading, Notice, ScreenView, Segmented, money, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useApi } from '@/hooks';

export interface NoticeItem { id: string; title: string; kindLabel: string; sourceApp: string; organization: string; recordUrl: string; dueAt: string | null; valuePaise: number | null; band: 'P0' | 'P1' | 'P2' | 'P3'; why: string[]; verificationLabel: string; verification: string; nextStep: string; confidentiality: string; status: string; kind: string }
interface Dash { counts: { open: number; critical: number; high: number; overdue: number; decisions: number; followUps: number; thisWeek: number }; items: NoticeItem[] }
export const BAND: Record<string, { label: string; bg: string; fg: string; bar: string }> = {
  P0: { label: 'URGENT', bg: '#FEE4E2', fg: '#B42318', bar: '#D92D20' }, P1: { label: 'HIGH', bg: '#FEF0C7', fg: '#B54708', bar: '#F79009' },
  P2: { label: 'NORMAL', bg: '#D1E9FF', fg: '#175CD3', bar: '#2E90FA' }, P3: { label: 'LOW', bg: '#F2F4F7', fg: '#475467', bar: '#98A2B3' },
};
const due = (iso: string | null) => { if (!iso) return 'No due date in the source'; const d = new Date(iso); const over = d.getTime() < Date.now(); return `${over ? 'Overdue · was due' : 'Due'} ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`; };

/** One notice with Open, Done and Snooze. */
export function NoticeRow({ n, onChange, compact }: { n: NoticeItem; onChange: () => void; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const b = BAND[n.band];
  const act = async (k: string, path: string, body: object = {}) => { setBusy(k); setErr(''); try { await api.post(`/action-os/notices/${n.id}/${path}`, body); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const open = () => (n.recordUrl.startsWith('http') ? Linking.openURL(n.recordUrl) : router.push(n.recordUrl as never));
  return (
    <View testID={`notice-${n.id}`} style={[s.card, { borderLeftWidth: 4, borderLeftColor: b.bar, gap: 6 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ backgroundColor: b.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: b.fg, fontSize: 10.5, fontWeight: '800' }}>{b.label}</Text></View>
        <Text style={[s.hint, { flex: 1 }]} numberOfLines={1}>{n.kindLabel} · {n.organization}</Text>
        <Text style={{ fontSize: 10.5, color: n.verification === 'confirmed' ? theme.colors.green700 : '#B54708' }}>{n.verificationLabel}</Text>
      </View>
      <Text style={{ fontSize: 15.5, fontWeight: '700', color: theme.colors.navy900 }}>{n.title}</Text>
      <Text style={[s.hint, n.dueAt && new Date(n.dueAt).getTime() < Date.now() ? { color: '#B42318', fontWeight: '600' } : null]}>{due(n.dueAt)}{n.valuePaise != null && n.confidentiality === 'normal' ? ` · ${money(n.valuePaise)}` : ''}</Text>
      {!compact && n.why.length > 0 && <Text style={s.rowSub}>Why it matters: {n.why.join(' · ')}</Text>}
      {!compact && <Text style={{ fontSize: 13, color: '#53389E', backgroundColor: '#F9F5FF', borderRadius: 10, padding: 8 }}>Suggested next step: {n.nextStep}</Text>}
      {err ? <Text style={{ color: '#B42318', fontSize: 13 }} accessibilityRole="alert">{err}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button compact variant="secondary" title="Open record" onPress={open} testID={`open-${n.id}`} />
        {n.status === 'open' && <><Button compact variant="plain" title="Done" loading={busy === 'd'} onPress={() => act('d', 'complete')} testID={`done-${n.id}`} />
          <Button compact variant="plain" title="Snooze 1 day" loading={busy === 's'} onPress={() => act('s', 'snooze', { until: new Date(Date.now() + 86400000).toISOString() })} /></>}
      </View>
    </View>
  );
}

/** My Action Board (native). */
export default function ActionBoard() {
  const router = useRouter();
  const dash = useApi<Dash>('/action-os/dashboard');
  const [view, setView] = useState('all');
  const gen = async () => { const r = await api.post<{ id: string }>('/action-os/plans/generate', { kind: 'on_demand' }); router.push(`/action-os` as never); return r; };
  if (dash.loading && !dash.data) return <Loading />;
  if (dash.error) return <ErrorView error={dash.error} onRetry={dash.reload} />;
  const d = dash.data!;
  const items = (Array.isArray(d.items) ? d.items : []).filter((n) => view === 'all' || (view === 'top' ? n.band === 'P0' || n.band === 'P1' : view === 'overdue' ? !!n.dueAt && new Date(n.dueAt).getTime() < Date.now() : n.kind === 'decision' || n.kind === 'approval'));
  return (
    <ScreenView title="My action board" eyebrow="COLLABIZ ACTION OS" subtitle="What needs attention, why it matters and what to do next." refreshControl={<RefreshControl refreshing={dash.loading} onRefresh={dash.reload} />}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: theme.space.md }}>
        {[['Open', d.counts.open], ['Top', d.counts.critical + d.counts.high], ['Overdue', d.counts.overdue], ['Decisions', d.counts.decisions]].map(([l, v]) => (
          <View key={l as string} style={[s.card, { flex: 1, marginBottom: 0, padding: 10 }]}><Text style={{ fontSize: 22, fontWeight: '800', color: l === 'Overdue' && Number(v) ? '#B54708' : theme.colors.navy900 }}>{v as number}</Text><Text style={s.hint}>{l as string}</Text></View>
        ))}
      </View>
      <Segmented label="Show" value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'top', label: 'Top' }, { value: 'overdue', label: 'Overdue' }, { value: 'decisions', label: 'Decisions' }]} />
      {!items.length ? <Empty icon="checkmark-done-outline" title="Nothing needs attention" body="New proposals, deadlines, collections and approvals appear here automatically." /> : items.map((n) => <NoticeRow key={n.id} n={n} onChange={dash.reload} />)}
      <Button variant="secondary" title="Generate my plan now" onPress={() => { void gen().then(dash.reload).catch(() => undefined); }} testID="generate-plan" />
      <Notice tone="info">Priorities come from transparent rules. Suggested next steps are suggestions — nothing is sent, approved or paid for you.</Notice>
      <Pressable onPress={() => router.push('/notifications' as never)} accessibilityRole="link"><Text style={[s.hint, { textAlign: 'center', marginTop: 8 }]}>Notification history ›</Text></Pressable>
    </ScreenView>
  );
}
