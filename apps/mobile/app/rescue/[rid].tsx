import { useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Button, Card, Chips, ErrorView, Field, Loading, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** A project team asking for help (native) — offer what you can provide. */
export default function RescueOffer() {
  const { rid } = useLocalSearchParams<{ rid: string }>();
  const q = useApi<any>(`/rescue/${rid}`);
  const [items, setItems] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const go = useAction(async () => { await api.post(`/rescue/${rid}/interest`, { items, note }); await q.reload(); });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data;
  return (
    <ScreenView title="A project team needs help" subtitle={d.project}>
      <Stack.Screen options={{ title: 'Offer help' }} />
      <Card><Text style={s.p}>{d.note}</Text></Card>
      {d.myInterest && <Notice tone="success">You offered help. The project team will contact you.</Notice>}
      {go.error && <Notice tone="danger">{go.error}</Notice>}
      <Card title="What you can provide">
        <Chips options={d.gaps.map((g: any) => ({ value: g.key, label: g.label }))} value={items} onChange={setItems} />
        <Field label="Details" value={note} onChangeText={setNote} multiline testID="rescue-note" />
        <Button title="Offer to help" onPress={() => go.run()} disabled={!items.length || note.trim().length < 10} loading={go.busy} testID="rescue-offer" />
      </Card>
    </ScreenView>
  );
}
