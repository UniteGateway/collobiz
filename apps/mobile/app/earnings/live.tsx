import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Badge, Card, ErrorView, Loading, ScreenView, money, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

const STEPS = ['estimated', 'eligible', 'earned', 'approved', 'invoiced', 'settled'];
const LABEL: Record<string, string> = { estimated: 'Projected', eligible: 'Eligible', earned: 'Earned', approved: 'Approved', invoiced: 'Requested', settled: 'Paid' };
const words = (code: string) => { const w = code.replace(/^entry\./, '').replace(/[._]/g, ' '); return LABEL[code.replace(/^entry\./, '')] ?? w.charAt(0).toUpperCase() + w.slice(1); };
const when = (d: string) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Screen 158 (native) — Live Earnings & Settlement Tracker. */
export default function Live() {
  const q = useApi<any>('/earnings');
  const [sel, setSel] = useState<string | null>(null);
  const j = useApi<any[]>(sel ? `/commissions/entries/${sel}/journal` : null);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView id="158">
      <Stack.Screen options={{ title: 'Live tracker' }} />
      {!q.data.lines.length && <Card title="No earnings yet"><Text style={s.p}>Commission lines appear here once a customer milestone you introduced is certified.</Text></Card>}
      {q.data.lines.map((l: any) => {
        const at = STEPS.indexOf(l.status);
        return (
          <Card key={l.id} title={l.description}>
            <Text style={s.hint}>{l.project} · net {money(l.payable)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 8 }} accessibilityRole="progressbar" accessibilityLabel={`Status ${LABEL[l.status] ?? l.status}`}>
              {STEPS.map((st, i) => <View key={st} style={[s.chip, i <= at && at >= 0 && { backgroundColor: theme.colors.green700, borderColor: theme.colors.green700 }]}><Text style={{ fontSize: 12, color: i <= at && at >= 0 ? '#fff' : theme.colors.navy900 }}>{LABEL[st]}</Text></View>)}
            </View>
            {at < 0 && <Badge status={l.status} />}
            {l.holdReason && <Text style={s.hint}>On hold: {l.holdReason}</Text>}
            <Pressable accessibilityRole="button" onPress={() => setSel(sel === l.id ? null : l.id)}><Text style={[s.p, { color: theme.colors.green700, fontWeight: '600' }]}>{sel === l.id ? 'Hide history' : 'Show history'}</Text></Pressable>
            {sel === l.id && (j.data ?? []).map((x) => <Text key={x.id} style={s.hint}>{when(x.createdAt)} · {words(x.action)} · {x.who}{x.note ? ` — ${x.note}` : ''}</Text>)}
          </Card>
        );
      })}
    </ScreenView>
  );
}
