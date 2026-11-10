import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PAYMENT_STATE_LABELS } from '@collabiz/types';
import { Badge, Button, Card, ErrorView, Kpi, Loading, Notice, ScreenView, s } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;
const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { paid: 'success', partially_paid: 'warning', invoiced: 'warning', disputed: 'danger', approved: 'info', earned: 'info' };

/** Project payments (native) — each milestone's payment state; the client confirms payments the supplier reported. */
export default function ProjectPayments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<any>(`/projects/${id}/payments`);
  const confirm = useAction(async (rid: string) => { await api.post(`/payment-receipts/${rid}/confirm`); await q.reload(); });
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data;
  return (
    <ScreenView title="Payments" subtitle={`${d.project.code} — ${d.project.title}`}>
      <Stack.Screen options={{ title: 'Payments' }} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <View style={{ flex: 1 }}><Kpi label="Invoiced" value={rupees(d.totals.invoiced)} /></View>
        <View style={{ flex: 1 }}><Kpi label="Received" value={rupees(d.totals.received)} accent /></View>
        <View style={{ flex: 1 }}><Kpi label="Outstanding" value={rupees(d.totals.outstanding)} hint={d.totals.overdue ? `${rupees(d.totals.overdue)} overdue` : undefined} /></View>
      </View>
      {confirm.error && <Notice tone="danger">{confirm.error}</Notice>}
      {d.milestones.map((m: any) => (
        <Card key={m.id} title={`${m.seq}. ${m.title}`} action={<Badge status={m.state} tone={TONE[m.state] ?? 'neutral'} label={PAYMENT_STATE_LABELS[m.state]} />}>
          <Text style={s.p}>{rupees(m.amount)}</Text>
          {m.invoice ? <Text style={s.hint}>Invoice {m.invoice.number} · received {rupees(m.invoice.received)} of {rupees(m.invoice.amount)}{m.invoice.overdueDays ? ` · ${m.invoice.overdueDays} days overdue` : ''}</Text> : <Text style={s.hint}>Not invoiced yet</Text>}
          {(m.invoice?.reported ?? []).map((r: any) => (
            <View key={r.id} style={{ marginTop: 8 }}>
              <Text style={s.p} testID="reported">Supplier reports {rupees(r.amount)} received (ref {r.reference}) — not counted until confirmed</Text>
              {d.canConfirm && <Button title="Confirm it left our account" variant="secondary" onPress={() => confirm.run(r.id)} loading={confirm.busy} testID={`confirm-${r.id}`} />}
            </View>
          ))}
        </Card>
      ))}
      <Text style={s.hint}>{d.note}</Text>
    </ScreenView>
  );
}
