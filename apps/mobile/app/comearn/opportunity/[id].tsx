import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CE_TRIGGERS } from '@collabiz/types';
import { Button, Card, ErrorView, Loading, Notice, ScreenView, inrShort, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { rate } from '../index';

interface D { id: string; title: string; company: string; territory: string; description: string; model: string; rateBps: number | null; fixedPaise: number | null; trigger: keyof typeof CE_TRIGGERS; paymentDays: number; potentialPaise: number | null; restricted: boolean; mine: boolean; engagement: { id: string } | null }

/** Opportunity (native): terms, then join by reading and accepting the commission agreement. */
export default function ComearnOpportunity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<D>(`/comearn/opportunities/${id}`);
  const [joined, setJoined] = useState<{ id: string; agreement: string; termsHash: string } | null>(null);
  const [ok, setOk] = useState(false);
  const join = useAction(async () => { const r = await api.post<{ id: string; agreement: string; termsHash: string }>(`/comearn/opportunities/${id}/join`, {}); setJoined(r); return r; });
  const accept = useAction(async () => { await api.post(`/comearn/engagements/${joined!.id}/accept`, { termsHash: joined!.termsHash, confirm: ok }); router.replace(`/comearn/engagement/${joined!.id}` as never); return true; });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const o = q.data!;
  return (
    <ScreenView title={o.title} subtitle={`${o.company} · ${o.territory}`}>
      <Stack.Screen options={{ title: 'Opportunity' }} />
      {o.restricted ? <Notice tone="warning">Regulated sector — check whether your work needs a licence or registration.</Notice> : null}
      <Card title={`Commission ${rate(o)}`}>
        <Text style={s.hint}>Earned when: {CE_TRIGGERS[o.trigger]} · paid within {o.paymentDays} days of approval by {o.company}</Text>
        {o.potentialPaise != null ? <Text style={s.hint}>Potential {inrShort(o.potentialPaise)} — an estimate, not a promise</Text> : null}
      </Card>
      <Card title="The opportunity"><Text>{o.description}</Text></Card>
      {join.error ? <Notice tone="danger">{join.error}</Notice> : null}
      {o.mine ? <Notice tone="info">This is your company’s opportunity. Manage it on the web.</Notice>
        : o.engagement ? <Button title="Open my tracker" onPress={() => router.push(`/comearn/engagement/${o.engagement!.id}` as never)} />
        : !joined ? <Button title="Start earning" testID="ce-join" loading={join.busy} onPress={() => join.run()} /> : (
          <Card title="Commission agreement">
            <Text style={{ fontSize: 13, lineHeight: 19 }} testID="ce-agreement">{joined.agreement}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 }}>
              <Switch value={ok} onValueChange={setOk} accessibilityLabel="I accept this commission agreement" /><Text style={{ flex: 1 }}>I have read and accept this agreement for my business</Text>
            </View>
            {accept.error ? <Notice tone="danger">{accept.error}</Notice> : null}
            <Button title="Accept and continue" disabled={!ok} loading={accept.busy} onPress={() => accept.run()} />
          </Card>
        )}
    </ScreenView>
  );
}
