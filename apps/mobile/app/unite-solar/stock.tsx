import { RefreshControl, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorView, Kpi, Loading, Notice, ScreenView, s, money, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { usePartner } from '@/uniteSolar';

interface Inv { enabled: boolean; message?: string; stockEntitlement: number; allocated: number; remainingAllocation: number; valuation: { onHand: number; sold: number }; reconciliation: { ok: boolean };
  items: { productId: string; sku: string; name: string; qty: number; value: number; reorderLevel: number; low: boolean }[];
  allocations: { id: string; number: string; invoiceNumber: string; value: number; gst: number; status: string; lines: { name: string; qty: number }[] }[] }

/** Inventory (native): confirm opening stock received, on-hand stock and reorder alerts. */
export default function Stock() {
  const p = usePartner();
  const id = p.unit?.id ?? null;
  const q = useApi<Inv>(id ? `/network/units/${id}/inventory` : null);
  const receive = useAction(async (aid: string) => { await api.post(`/network/units/${id}/allocations/${aid}/receive`, {}, true); q.reload(); });
  if ((p.loading && !p.data) || (id && q.loading && !q.data)) return <Loading />;
  if (p.error || q.error) return <ErrorView error={p.error ?? q.error} onRetry={q.reload} />;
  if (!q.data?.enabled) return <ScreenView title="Inventory"><Empty title="No stock to manage" body={q.data?.message ?? 'Your plan holds no stock — sales are fulfilled by Unite Solar.'} /></ScreenView>;
  const d = q.data;
  return (
    <ScreenView title="Inventory" eyebrow="Unite Solar" refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <View style={{ flex: 1 }}><Kpi label="On hand" value={money(d.valuation.onHand)} /></View>
        <View style={{ flex: 1 }}><Kpi label="Entitlement left" value={money(d.remainingAllocation)} hint={`of ${money(d.stockEntitlement)}`} /></View>
      </View>
      {d.allocations.filter((a) => a.status === 'dispatched').map((a) => (
        <Notice key={a.id} tone="warning" title={`Stock dispatched — ${a.number}`}>
          {`Invoice ${a.invoiceNumber}: ${a.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')} — ${money(a.value)} + GST ${money(a.gst)}.`}
        </Notice>
      ))}
      {d.allocations.filter((a) => a.status === 'dispatched').map((a) => <Button key={`r${a.id}`} title={`Confirm ${a.number} received`} onPress={() => receive.run(a.id)} loading={receive.busy} testID="us-receive" />)}
      {receive.error ? <Notice tone="danger">{receive.error}</Notice> : null}
      <Notice tone={d.reconciliation.ok ? 'success' : 'danger'}>{d.reconciliation.ok ? 'Stock reconciles — movements add up to what is on hand.' : 'Stock does not reconcile — contact Unite.'}</Notice>
      <Card title="Stock on hand">
        {d.items.map((i) => (
          <View key={i.productId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{i.name}</Text><Text style={s.hint}>{i.sku} · {money(i.value)}</Text></View>
            <Text style={{ fontWeight: '700' }}>{i.qty}</Text>{i.low ? <Badge status="low" tone="warning" label="Reorder" /> : null}
          </View>
        ))}
      </Card>
      <Text style={s.hint}>Damage, returns and transfers are recorded on the web dashboard.</Text>
    </ScreenView>
  );
}
