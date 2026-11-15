import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorView, Field, Loading, Notice, Row, ScreenView, Segmented, s, money, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { TONE, usePartner } from '@/uniteSolar';

interface Product { id: string; name: string; sku: string; customerPrice: number }
interface Order { id: string; number: string; customerName: string; orderDate: string; subtotal: number; status: string; fulfilment: string; fulfilmentStatus: string | null; lines: { item: string; qty: number; earning?: { kind: string; amount: number } }[]; commissions: { id: string; amount: number; status: string; statusLabel: string }[] }
const FUL: Record<string, string> = { requested: 'Requested from Unite', dispatched: 'Dispatched', installed: 'Installed', accepted: 'Accepted' };

/** Sales & orders (native): record a sale from stock or for Unite to fulfil; record customer acceptance. */
export default function Sales() {
  const p = usePartner();
  const id = p.unit?.status === 'live' ? p.unit.id : null;
  const q = useApi<Order[]>(id ? `/network/units/${id}/sales` : null);
  const cat = useApi<{ products: Product[] }>(id ? '/network/products' : null);
  const stock = p.unit?.packageCode === 'store_with_stock';
  const [f, setF] = useState({ customerName: '', pincode: '', fulfilment: 'unite', productId: '', qty: '1' });
  const add = useAction(async () => {
    await api.post(`/network/units/${id}/sales`, { customerName: f.customerName, pincode: f.pincode || p.unit!.pincode, fulfilment: stock ? f.fulfilment : 'unite', lines: [{ productId: f.productId, qty: Number(f.qty) }] }, true);
    setF({ ...f, customerName: '', productId: '', qty: '1' }); q.reload();
  });
  const accept = useAction(async (o: Order) => { await api.post(`/network/orders/${o.id}/accept`, { acceptedBy: o.customerName }); q.reload(); });
  if (p.loading && !p.data) return <Loading />;
  if (p.error || q.error) return <ErrorView error={p.error ?? q.error} onRetry={() => { p.reload(); q.reload(); }} />;
  if (!id) return <ScreenView title="Sales & orders"><Empty title="Sales open once your partnership is active" /></ScreenView>;
  const product = cat.data?.products.find((x) => x.id === f.productId);
  return (
    <ScreenView title="Sales & orders" eyebrow="Unite Solar">
      <Card title="New sale">
        {stock ? <Segmented label="Fulfilment" value={f.fulfilment} onChange={(v) => setF({ ...f, fulfilment: v })} options={[{ value: 'from_stock', label: 'From my stock' }, { value: 'unite', label: 'Unite fulfils' }]} /> : <Text style={s.hint}>Fulfilled by Unite Solar — you hold no stock.</Text>}
        <Field label="Customer name" value={f.customerName} onChangeText={(v) => setF({ ...f, customerName: v })} error={add.fieldErrors.customerName} />
        <Field label="Installation PIN" value={f.pincode} placeholder={p.unit!.pincode} keyboardType="number-pad" maxLength={6} onChangeText={(v) => setF({ ...f, pincode: v.replace(/\D/g, '') })} />
        <Text style={s.label}>Product</Text>
        {(cat.data?.products ?? []).map((x) => <Row key={x.id} title={x.name} subtitle={money(x.customerPrice)} right={f.productId === x.id ? <Text style={{ color: theme.colors.green700, fontWeight: '700' }}>✓</Text> : undefined} onPress={() => setF({ ...f, productId: x.id })} testID={`product-${x.sku}`} />)}
        <Field label="Quantity" value={f.qty} keyboardType="number-pad" onChangeText={(v) => setF({ ...f, qty: v.replace(/\D/g, '') })} />
        {product ? <Text style={s.rowSub}>Value {money(product.customerPrice * Number(f.qty || 0))} + GST (catalogue price)</Text> : null}
        {add.error ? <Notice tone="danger">{add.error}</Notice> : null}
        <Button title={stock && f.fulfilment === 'from_stock' ? 'Record sale from stock' : 'Send to Unite for fulfilment'} onPress={() => add.run()} loading={add.busy} disabled={!f.customerName || !f.productId || !Number(f.qty)} testID="us-sale" />
      </Card>
      {accept.error ? <Notice tone="danger">{accept.error}</Notice> : null}
      {!(q.data ?? []).length ? <Empty title="No sales yet" /> : (q.data ?? []).map((o) => (
        <Card key={o.id}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ fontWeight: '600', flex: 1 }}>{o.number}</Text><Badge status={o.status} tone={TONE[o.status]} label={o.status} /></View>
          <Text style={s.rowSub}>{o.orderDate} · {o.customerName} · {money(o.subtotal)}</Text>
          <Text style={s.rowSub}>{o.lines.map((l) => `${l.qty} × ${l.item}`).join(', ')}</Text>
          <Text style={s.hint}>{o.fulfilment === 'from_stock' ? `From your stock · margin ${money(o.lines.reduce((a, l) => a + (l.earning?.amount ?? 0), 0))}` : `${FUL[o.fulfilmentStatus ?? ''] ?? ''}${o.commissions.length ? ` · commission ${money(o.commissions.reduce((a, c) => a + c.amount, 0))} (${o.commissions[0].statusLabel})` : ''}`}</Text>
          {o.fulfilment === 'unite' && ['dispatched', 'installed'].includes(o.fulfilmentStatus ?? '') && o.status !== 'cancelled' ? (
            <Button compact variant="secondary" title="Record customer acceptance" onPress={() => Alert.alert('Customer acceptance', `Confirm ${o.customerName} accepted delivery / installation?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: () => accept.run(o) }])} />
          ) : null}
        </Card>
      ))}
    </ScreenView>
  );
}
