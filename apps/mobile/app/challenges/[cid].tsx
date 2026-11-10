import { useState } from 'react';
import { Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, Chips, ErrorView, Field, Loading, Notice, Row, ScreenView, Section, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** 48-hour team challenge (native) — put your company forward for roles. */
export default function Challenge() {
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const q = useApi<any>(`/challenges/${cid}`);
  const [roles, setRoles] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const join = useAction(async () => { await api.post(`/challenges/${cid}/interest`, { items: roles, note }); await q.reload(); });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const c = q.data;
  return (
    <ScreenView title={c.opportunity.title} subtitle={`Roles covered: ${c.coverage.covered} of ${c.coverage.total}`}>
      <Stack.Screen options={{ title: 'Team challenge' }} />
      <Section>{c.coverage.rows.map((r: any) => <Row key={r.role} title={r.role} right={<Badge status={r.covered ? 'covered' : 'open'} tone={r.covered ? 'success' : 'warning'} label={r.covered ? 'Covered' : 'Open'} />} />)}</Section>
      {c.myInterest && <Notice tone="success">You put forward: {c.myInterest.roles.join(', ')}.</Notice>}
      {join.error && <Notice tone="danger">{join.error}</Notice>}
      {c.canJoin && (
        <Card title="Put your company forward">
          <Chips options={c.roles.map((r: string) => ({ value: r, label: r }))} value={roles} onChange={setRoles} />
          <Field label="Why your company" value={note} onChangeText={setNote} multiline testID="challenge-note" />
          <Button title="Put us forward" onPress={() => join.run()} disabled={!roles.length || note.trim().length < 10} loading={join.busy} testID="challenge-join" />
        </Card>
      )}
      <Text style={s.hint}>{c.note}</Text>
    </ScreenView>
  );
}
