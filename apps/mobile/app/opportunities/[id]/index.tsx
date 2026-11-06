import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { sectorName } from '@collabiz/types';
import { Badge, Button, Card, ErrorView, Loading, Notice, Row, ScreenView, money, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** Screen 036 — Opportunity Detail (native) with eligibility summary (041). */
export default function OpportunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const o = useApi<any>(`/opportunities/${id}`);
  const el = useApi<any>(`/opportunities/${id}/eligibility`);
  const save = useAction(async () => { if (o.data.saved) await api.delete(`/opportunities/${id}/save`); else await api.post(`/opportunities/${id}/save`); await o.reload(); });
  if (o.loading) return <Loading />;
  if (o.error) return <ErrorView error={o.error} onRetry={o.reload} />;
  const d = o.data;
  const canApply = el.data?.eligible && !d.myApplication && !d.isOwner;
  return (
    <ScreenView id="036" title={d.title} footer={canApply ? <Button title="Apply / express interest" variant="accent" onPress={() => router.push(`/opportunities/${id}/apply`)} testID="apply-cta" /> : undefined}>
      <Stack.Screen options={{ title: d.code }} />
      {d.myApplication && <Notice tone="info">Your organization applied — status: {d.myApplication.status}</Notice>}
      <Card><Text style={s.p}>{d.summary}</Text></Card>
      <Card title="Key facts">
        <Row title="Sector" subtitle={sectorName(d.sector)} />
        <Row title="Location" subtitle={d.city ?? '—'} />
        <Row title="Indicative value" subtitle={money(d.estimatedValue)} />
        <Row title="Closes" subtitle={d.deadline ? new Date(d.deadline).toLocaleDateString() : 'Open'} />
        <Row title="Published by" subtitle={d.publisher} />
      </Card>
      {el.data && (
        <Card title="Eligibility (screen 041)">
          {el.data.checks.map((c: any) => (
            <View key={c.key} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 }}>
              <Badge status={c.result} tone={c.result === 'pass' ? 'success' : c.result === 'warn' ? 'warning' : 'danger'} label={c.result === 'pass' ? 'Pass' : c.result === 'warn' ? 'Note' : 'Fail'} />
              <View style={{ flex: 1 }}><Text style={s.rowTitle}>{c.label}</Text><Text style={s.hint}>{c.detail}</Text></View>
            </View>
          ))}
        </Card>
      )}
      <Button title={d.saved ? '★ Saved' : '☆ Save'} variant="secondary" onPress={() => save.run()} loading={save.busy} />
    </ScreenView>
  );
}
