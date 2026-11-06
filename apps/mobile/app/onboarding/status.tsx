import { useMemo } from 'react';
import { Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { newIdempotencyKey } from '@collabiz/types';
import { Badge, Button, Card, ErrorView, Loading, Notice, Row, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi, ONBOARDING_STEPS } from '@/hooks';
import { useSession } from '@/session';

/** Screen 022 — Verification Status & Approval (native partner view). */
export default function Status() {
  const router = useRouter();
  const { refresh } = useSession();
  const st = useApi<any>('/onboarding/status');
  const key = useMemo(newIdempotencyKey, []);
  const submit = useAction(async () => { await api.request('POST', '/onboarding/submit', {}, { idempotencyKey: key }); await st.reload(); await refresh(); });
  if (st.loading) return <Loading />;
  if (st.error) return <ErrorView error={st.error} onRetry={st.reload} />;
  const d = st.data;
  const v: string = d.organization?.verificationStatus ?? 'not_started';
  return (
    <ScreenView id="022" footer={['not_started', 'reupload_requested', 'rejected'].includes(v) ? <Button title="Submit for verification" variant="accent" onPress={() => submit.run()} loading={submit.busy} disabled={!d.canSubmit} testID="kyb-submit" /> : undefined}>
      <Stack.Screen options={{ title: 'Verification' }} />
      <Card title={d.organization?.displayName ?? 'Partner account'}>
        <Badge status={v} />
        {v === 'reupload_requested' && <Notice tone="warning">{d.history[0]?.reason}</Notice>}
        {v === 'rejected' && <Notice tone="danger">{d.history[0]?.reason}</Notice>}
        {v === 'verified' && <Text style={[s.p, { marginTop: 8 }]}>Verified — you can register protected leads and join teams.</Text>}
      </Card>
      {submit.error && <Notice tone="danger">{submit.error}</Notice>}
      <Card title="Checklist">
        {ONBOARDING_STEPS.map((x) => {
          const done = d.steps.find((y: any) => y.step === x.step)?.complete;
          return <Row key={x.step} title={`${done ? '✅' : '⬜️'} ${x.label}`} onPress={() => router.push(x.route as any)} />;
        })}
      </Card>
      <Card title="History">
        {d.history.length === 0 ? <Text style={s.hint}>No reviews yet.</Text> : d.history.map((h: any, i: number) => <Row key={i} title={`${h.from} → ${h.to}`} subtitle={`${new Date(h.at).toLocaleString()}${h.reason ? ' · ' + h.reason : ''}`} />)}
      </Card>
    </ScreenView>
  );
}
