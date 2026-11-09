import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { PILOT_CONTINUE, PILOT_CONTINUE_LABELS, PILOT_FEATURES, PILOT_FEATURE_LABELS } from '@collabiz/types';
import { Button, Chips, ErrorView, Field, Loading, Notice, ScreenView, Segmented, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Mine { lastAt: string | null; canAnswer: boolean; nextAt: string | null }
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Scale({ label, value, onChange, from, to }: { label: string; value: number; onChange: (n: number) => void; from: number; to: number }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => {
        const on = value === n;
        return (
          <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${n}`} testID={`${label}-${n}`}
            style={{ minWidth: 44, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? theme.colors.navy700 : theme.colors.grey200, backgroundColor: on ? theme.colors.navy700 : '#fff' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: on ? '#fff' : theme.colors.navy900 }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pilot check-in (native) — the same two-minute weekly survey as the web. */
export default function PilotScreen() {
  const mine = useApi<Mine>('/pilot-feedback/mine');
  const [f, setF] = useState({ usefulness: 0, ease: 0, recommend: -1, used: [] as string[], mostValuable: '', blockers: '', wishlist: '', continueUse: '', contactOk: false });
  const [done, setDone] = useState(false);
  const send = useAction(async () => {
    await api.post('/pilot-feedback', { ...f, mostValuable: f.mostValuable || undefined, blockers: f.blockers || undefined, wishlist: f.wishlist || undefined, platform: 'mobile' });
    setDone(true);
  });
  if (mine.loading && !mine.data) return <Loading />;
  if (mine.error) return <ErrorView error={mine.error} onRetry={mine.reload} />;
  const ready = f.usefulness > 0 && f.ease > 0 && f.recommend >= 0 && !!f.continueUse;
  if (done) return <ScreenView title="Pilot check-in"><Notice tone="success" title="Thank you">Your check-in reached the Unite Group pilot team. They read every answer.</Notice></ScreenView>;
  if (mine.data && !mine.data.canAnswer && mine.data.nextAt) {
    return <ScreenView title="Pilot check-in"><Notice tone="info" title="You’ve already checked in today">Last check-in {when(mine.data.lastAt!)}. You can send the next one after {when(mine.data.nextAt)}.</Notice></ScreenView>;
  }
  return (
    <ScreenView title="Pilot check-in" subtitle="Two minutes, once a week. Tell Unite Group what works and what gets in your way."
      footer={<Button title="Send check-in" onPress={() => send.run()} loading={send.busy} disabled={!ready} testID="send-pilot" />}>
      {send.error && <Notice tone="danger">{send.error}</Notice>}
      <Text style={s.label}>1. How useful is COLLABIZ for your business so far? (1–5)</Text>
      <Scale label="Usefulness" from={1} to={5} value={f.usefulness} onChange={(usefulness) => setF({ ...f, usefulness })} />
      <Text style={s.label}>2. How easy is it to use? (1–5)</Text>
      <Scale label="Ease" from={1} to={5} value={f.ease} onChange={(ease) => setF({ ...f, ease })} />
      <Text style={s.label}>3. How likely are you to recommend it to another partner? (0 = not at all, 10 = extremely)</Text>
      <Scale label="Recommend" from={0} to={10} value={f.recommend} onChange={(recommend) => setF({ ...f, recommend })} />
      <Text style={s.label}>4. What did you use this week?</Text>
      <Chips value={f.used} onChange={(used) => setF({ ...f, used })} options={PILOT_FEATURES.map((k) => ({ value: k, label: PILOT_FEATURE_LABELS[k] }))} />
      <Field label="5. What was most valuable? (optional)" value={f.mostValuable} onChangeText={(mostValuable) => setF({ ...f, mostValuable })} multiline maxLength={1000} />
      <Field label="6. What stopped you or didn’t work? (optional)" value={f.blockers} onChangeText={(blockers) => setF({ ...f, blockers })} multiline maxLength={2000} />
      <Field label="7. One thing to add or change (optional)" value={f.wishlist} onChangeText={(wishlist) => setF({ ...f, wishlist })} multiline maxLength={2000} />
      <Text style={s.label}>8. Would you keep using COLLABIZ after the pilot?</Text>
      <Segmented label="Keep using" value={f.continueUse} onChange={(continueUse) => setF({ ...f, continueUse })} options={PILOT_CONTINUE.map((k) => ({ value: k, label: PILOT_CONTINUE_LABELS[k] }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginTop: 8 }}>
        <Switch value={f.contactOk} onValueChange={(contactOk) => setF({ ...f, contactOk })} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="The pilot team may contact me" />
        <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>The pilot team may contact me about my answers</Text>
      </View>
    </ScreenView>
  );
}
