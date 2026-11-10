import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { RESOLUTION_DECISION_LABELS } from '@collabiz/types';
import { Button, Card, ErrorView, Field, Loading, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** Contract dispute (native) — the record, a response or evidence, and one appeal. */
export default function DisputeCase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/resolution/${id}`);
  const [text, setText] = useState('');
  const respond = useAction(async (kind: string) => { await api.post(`/resolution/${id}/respond`, { body: text, kind }); setText(''); await q.reload(); });
  const appeal = useAction(async () => { await api.post(`/resolution/${id}/appeal`, { note: text }); setText(''); await q.reload(); });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const c = q.data;
  return (
    <ScreenView title={c.code} subtitle={`${c.subject} · ${c.raisedBy} v ${c.against}`}>
      <Stack.Screen options={{ title: c.code }} />
      {c.decision && <Notice tone={c.status === 'closed' ? 'success' : 'info'} title={`Decision: ${RESOLUTION_DECISION_LABELS[c.decision]}`}>{c.decisionNote}</Notice>}
      {(respond.error || appeal.error) && <Notice tone="danger">{respond.error ?? appeal.error}</Notice>}
      <Card title="Record">
        {c.events.map((e: any, i: number) => <View key={i} style={{ paddingVertical: 6 }}><Text style={s.hint}>{e.org} · {e.kind} · {new Date(e.at).toLocaleDateString('en-IN')}</Text><Text style={s.p}>{e.body}</Text></View>)}
      </Card>
      {(c.canRespond || c.canAppeal) && (
        <Card title={c.canAppeal ? 'Appeal the decision' : 'Add to the record'}>
          <Field label={c.canAppeal ? 'Why the decision should change' : 'Your response or evidence'} value={text} onChangeText={setText} multiline testID="dispute-text" />
          {c.canRespond && <Button title="Add response" onPress={() => respond.run('response')} disabled={text.trim().length < 10} loading={respond.busy} testID="dispute-respond" />}
          {c.canAppeal && <Button title="Appeal" onPress={() => appeal.run()} disabled={text.trim().length < 20} loading={appeal.busy} testID="dispute-appeal" />}
        </Card>
      )}
    </ScreenView>
  );
}
