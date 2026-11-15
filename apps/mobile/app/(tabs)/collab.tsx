import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ASSET_KINDS, ASSET_LABELS, ASSET_UNITS, NEED_KINDS, NEED_LABELS, type AssetKind, type NeedKind } from '@collabiz/types';
import { Button, Card, Chips, Empty, ErrorView, Field, Loading, Notice, Row, ScreenView, Section, Tag, inrShort, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { send, type OfferView, type Reason } from '@/collab';

interface Profile { assets: { id: string; kind: AssetKind; title: string; capacity: number | null; city: string | null; verification: string }[]; needs: { id: string; kind: NeedKind; description: string }[]; canEdit: boolean }
interface Matches { empty: boolean; note: string; offers: { offer: OfferView; score: number; reasons: Reason[] }[]; programs: { program: { id: string; name: string; tagline: string }; score: number; reasons: Reason[] }[] }
const QUICK: AssetKind[] = ['store', 'office', 'team', 'factory', 'land', 'skills', 'capital', 'customers'];

/** COLLAB (native tab): what you have, what you need, and who you could work with — with the reasons for every match. */
export default function CollabTab() {
  const router = useRouter();
  const p = useApi<Profile>('/collab/profile');
  const m = useApi<Matches>('/collab/matches');
  const [adding, setAdding] = useState<'asset' | 'need' | null>(null);
  const [f, setF] = useState({ kind: 'office' as string, title: '', description: '', capacity: '', city: '' });
  const reload = async () => { await p.reload(); await m.reload(); };
  const save = useAction(async () => {
    if (adding === 'asset') await send('/collab/assets', { kind: f.kind, title: f.title, description: f.description, capacity: f.capacity ? Number(f.capacity) : undefined, city: f.city || undefined });
    else await send('/collab/needs', { kind: f.kind, description: f.description });
    setAdding(null); setF({ kind: 'office', title: '', description: '', capacity: '', city: '' }); await reload();
  });
  const remove = useAction(async (path: string) => { await api.request('DELETE', path); await reload(); });
  if (p.loading && !p.data) return <Loading />;
  if (p.error) return <ErrorView error={p.error} onRetry={p.reload} />;
  const d = p.data!;
  const open = (kind: 'asset' | 'need', k: string) => { setF({ kind: k, title: '', description: '', capacity: '', city: '' }); setAdding(kind); };
  return (
    <ScreenView id="collab" tab eyebrow="COLLAB" title="What can we build together?" subtitle="Tell us what you have and what you need. We show who you could work with, and why.">
      {save.error && <Notice tone="danger">{save.error}</Notice>}
      {remove.error && <Notice tone="danger">{remove.error}</Notice>}
      <Section title="1 · What you have">
        {d.assets.map((a) => <Row key={a.id} testID={`asset-${a.id}`} icon="cube-outline" title={a.title} subtitle={`${ASSET_LABELS[a.kind]}${a.capacity ? ` · ${a.capacity} ${ASSET_UNITS[a.kind]}` : ''}${a.city ? ` · ${a.city}` : ''} · ${a.verification === 'verified' ? 'Verified' : 'Self-declared'}`}
          right={d.canEdit ? <Pressable onPress={() => remove.run(`/collab/assets/${a.id}`)} accessibilityRole="button" accessibilityLabel={`Remove ${a.title}`} hitSlop={10}><Text style={{ color: theme.colors.grey600, fontSize: 13 }}>Remove</Text></Pressable> : undefined} />)}
        {!d.assets.length && <Row icon="add-circle-outline" title="Nothing listed yet" subtitle="Pick what you have below" />}
      </Section>
      {d.canEdit && adding !== 'asset' && <Chips value={[]} onChange={(v) => v[0] && open('asset', v[0])} options={QUICK.map((k) => ({ value: k, label: `+ ${ASSET_LABELS[k]}` }))} />}
      {adding === 'asset' && (
        <Card title="Add something you have">
          <Chips value={[f.kind]} onChange={(v) => setF({ ...f, kind: v[v.length - 1] ?? f.kind })} options={ASSET_KINDS.map((k) => ({ value: k, label: ASSET_LABELS[k] }))} />
          <Field label="Short title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} error={save.fieldErrors.title} />
          <Field label="Describe it" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline error={save.fieldErrors.description} />
          <Field label={`Capacity (${ASSET_UNITS[f.kind as AssetKind]})`} value={f.capacity} keyboardType="decimal-pad" onChangeText={(v) => setF({ ...f, capacity: v.replace(/[^\d.]/g, '') })} />
          <Field label="City" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
          <Button title="Save" onPress={() => save.run()} loading={save.busy} disabled={!f.title || f.description.length < 10} testID="save-asset" />
          <Button title="Cancel" variant="plain" onPress={() => setAdding(null)} />
        </Card>
      )}
      <Section title="2 · What you need">
        {d.needs.map((n) => <Row key={n.id} icon="search-outline" title={NEED_LABELS[n.kind]} subtitle={n.description}
          right={d.canEdit ? <Pressable onPress={() => remove.run(`/collab/needs/${n.id}`)} accessibilityRole="button" accessibilityLabel={`Remove ${NEED_LABELS[n.kind]}`} hitSlop={10}><Text style={{ color: theme.colors.grey600, fontSize: 13 }}>Remove</Text></Pressable> : undefined} />)}
        {d.canEdit && adding !== 'need' && <Row icon="add-circle-outline" title="Add a need" onPress={() => open('need', 'customers')} testID="add-need" chevron />}
      </Section>
      {adding === 'need' && (
        <Card title="What do you need?">
          <Chips value={[f.kind]} onChange={(v) => setF({ ...f, kind: v[v.length - 1] ?? f.kind })} options={NEED_KINDS.map((k) => ({ value: k, label: NEED_LABELS[k] }))} />
          <Field label="Details" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} multiline error={save.fieldErrors.description} />
          <Button title="Save" onPress={() => save.run()} loading={save.busy} disabled={f.description.length < 10} testID="save-need" />
          <Button title="Cancel" variant="plain" onPress={() => setAdding(null)} />
        </Card>
      )}
      <Section title="3 · Who you could work with" footer={m.data?.note}>
        {m.error ? <ErrorView error={m.error} onRetry={m.reload} /> : !m.data ? <Loading /> : m.data.empty ? <Empty icon="people-outline" title="Start with 1 or 2" body="Add something you have or need to see matches." /> : (
          <>
            {m.data.offers.map((x) => (
              <Pressable key={x.offer.id} testID={`match-${x.offer.id}`} onPress={() => router.push(`/business-offers/${x.offer.id}`)} accessibilityRole="button" accessibilityLabel={`${x.offer.title}, match ${x.score}`}
                style={({ pressed }) => [{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#fff' }, pressed && { backgroundColor: theme.colors.grey50 }]}>
                <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: theme.colors.green100, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.green800 }}>{x.score}</Text></View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.rowTitle, { fontWeight: '600' }]} numberOfLines={2}>{x.offer.title}</Text>
                  <Text style={s.rowSub}>{x.offer.categoryLabel}{x.offer.city ? ` · ${x.offer.city}` : ''}{x.offer.estimatedValue ? ` · ${inrShort(x.offer.estimatedValue)}` : ''}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{x.reasons.filter((r) => r.points > 0).slice(0, 3).map((r) => <Tag key={r.code}>{r.text}</Tag>)}</View>
                </View>
              </Pressable>
            ))}
            {m.data.programs.map((x) => <Row key={x.program.id} icon="business-outline" title={x.program.name} subtitle={`${x.reasons[0]?.text ?? ''} · Unite programme`} onPress={() => router.push('/ventures' as never)} chevron />)}
            {!m.data.offers.length && !m.data.programs.length && <Row icon="search" title="No matches yet" subtitle="Publish an offer so others can find you" onPress={() => router.push('/post' as never)} chevron />}
          </>
        )}
      </Section>
      <Button title="My collaborations" variant="secondary" onPress={() => router.push('/collab/workspace' as never)} testID="my-collabs" />
    </ScreenView>
  );
}
