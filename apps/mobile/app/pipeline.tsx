import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS as STAGE } from '@collabiz/types';
import { Badge, Button, Card, ErrorView, Field, Kpi, Loading, Notice, ScreenView, money, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** Screen 053 — Sales Pipeline (native: stage tabs instead of a wide kanban). */
export default function Pipeline() {
  const q = useApi<any>('/crm/pipeline');
  const [stage, setStage] = useState('qualified');
  const [sel, setSel] = useState<any>(null);
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const move = useAction(async () => { await api.post(`/crm/deals/${sel.id}/move`, { stage: to, lostReason: to === 'lost' ? reason : undefined, expectedVersion: sel.version }); setSel(null); await q.reload(); });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const col = q.data.columns.find((c: any) => c.stage === stage);
  return (
    <ScreenView id="053">
      <Stack.Screen options={{ title: 'Pipeline' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Kpi label="Open" value={q.data.metrics.open} /><Kpi label="Value" value={money(q.data.metrics.openValue)} accent /></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {q.data.columns.map((c: any) => (
          <Pressable key={c.stage} accessibilityRole="tab" accessibilityState={{ selected: stage === c.stage }} onPress={() => setStage(c.stage)} style={[s.chip, stage === c.stage && { backgroundColor: theme.colors.navy700 }]}>
            <Text style={{ color: stage === c.stage ? '#fff' : theme.colors.navy900 }}>{STAGE[c.stage] ?? c.stage} ({c.deals.length})</Text>
          </Pressable>
        ))}
      </View>
      {move.error && <Notice tone="danger">{move.error}</Notice>}
      {!col?.deals.length && <Notice tone="info">No deals at this stage.</Notice>}
      {(col?.deals ?? []).map((d: any) => (
        <Card key={d.id} title={d.title}>
          <Text style={s.hint}>{d.customer} · {money(d.value)}</Text>
          {sel?.id === d.id ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 }}>
                {PIPELINE_STAGES.filter((x) => x !== d.stage).map((x) => <Pressable key={x} onPress={() => setTo(x)} accessibilityRole="radio" accessibilityState={{ checked: to === x }} style={[s.chip, to === x && { backgroundColor: theme.colors.green700 }]}><Text style={{ color: to === x ? '#fff' : theme.colors.navy900 }}>{STAGE[x]}</Text></Pressable>)}
              </View>
              {to === 'lost' && <Field label="Why lost?" value={reason} onChangeText={setReason} error={move.fieldErrors.lostReason} />}
              <Button title="Move" onPress={() => move.run()} loading={move.busy} disabled={!to} />
            </>
          ) : !['won', 'lost'].includes(d.stage) ? <Button title="Move stage" variant="secondary" onPress={() => { setSel(d); setTo(''); }} /> : <Badge status={d.stage} label={STAGE[d.stage]} />}
        </Card>
      ))}
    </ScreenView>
  );
}
