import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Badge, Button, Card, Empty, ErrorView, Field, Loading, Notice, ScreenView, money, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

/** Screen 088 (native) — Product Enquiry & Price Request: find a product, ask for a price, follow the thread. */
export default function EnquiryDesk() {
  const [tab, setTab] = useState<'inbox' | 'new'>('inbox');
  const [q, setQ] = useState('');
  const market = useApi<any>(tab === 'new' ? '/trading/market' : null, { q: q || undefined });
  const list = useApi<any[]>('/trading/enquiries');
  const [sel, setSel] = useState<string | null>(null);
  const th = useApi<any>(sel ? `/trading/enquiries/${sel}` : null);
  const [product, setProduct] = useState<any>(null);
  const [form, setForm] = useState({ quantity: '', message: '' });
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState<any>(null);
  const send = useAction(async () => {
    const e = await api.post<any>('/trading/enquiries', { [product.source === 'supplier' ? 'supplierProductId' : 'catalogItemId']: product.id, quantity: form.quantity, message: form.message });
    setSent(e); setProduct(null); setForm({ quantity: '', message: '' }); setTab('inbox'); setSel(e.id); await list.reload();
  });
  const post = useAction(async () => { await api.post(`/trading/enquiries/${sel}/messages`, { body: reply }); setReply(''); await th.reload(); });
  const Tab = ({ v, label }: { v: 'inbox' | 'new'; label: string }) => (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === v }} onPress={() => setTab(v)} style={[s.chip, tab === v && { backgroundColor: theme.colors.navy700 }]}><Text style={{ color: tab === v ? '#fff' : theme.colors.navy900 }}>{label}</Text></Pressable>
  );
  return (
    <ScreenView id="088">
      <Stack.Screen options={{ title: 'Enquiries' }} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Tab v="inbox" label="My enquiries" /><Tab v="new" label="New price request" /></View>
      {sent?.routedToDistributor && <Notice tone="info">Routed to the supplier’s authorised distributor for your region.</Notice>}
      {tab === 'new' && (
        product ? (
          <Card title={product.name}>
            <Text style={s.hint}>{product.supplier}{product.price != null ? ` · ${money(product.price)} / ${product.unit}` : ' · price on request'}</Text>
            {send.error && <Notice tone="danger">{send.error}</Notice>}
            <Field label="Quantity" value={form.quantity} onChangeText={(v) => setForm({ ...form, quantity: v })} error={send.fieldErrors.quantity} testID="enq-qty" />
            <Field label="Message" value={form.message} onChangeText={(v) => setForm({ ...form, message: v })} multiline error={send.fieldErrors.message} testID="enq-msg" />
            <Button title="Send enquiry" onPress={() => send.run()} loading={send.busy} disabled={!form.quantity || form.message.trim().length < 5} testID="enq-send" />
            <Button title="Choose another product" variant="secondary" onPress={() => setProduct(null)} />
          </Card>
        ) : (
          <>
            <Field label="Search products" value={q} onChangeText={setQ} testID="enq-search" />
            {market.loading ? <Loading /> : market.error ? <ErrorView error={market.error} onRetry={market.reload} /> : [...(market.data?.products ?? []), ...(market.data?.catalog ?? [])].map((p: any) => (
              <Card key={`${p.source}-${p.id}`} title={p.name}>
                <Text style={s.hint}>{p.supplier}{p.price != null ? ` · ${money(p.price)} / ${p.unit}` : ''}</Text>
                <Button title="Request price" variant="secondary" onPress={() => setProduct(p)} testID={`enq-pick-${p.id}`} />
              </Card>
            ))}
          </>
        )
      )}
      {tab === 'inbox' && (
        list.loading ? <Loading /> : list.error ? <ErrorView error={list.error} onRetry={list.reload} /> : !list.data?.length ? <Empty title="No enquiries yet" body="Use “New price request” to ask a supplier for a price." /> : (
          <>
            {list.data.map((e) => (
              <Pressable key={e.id} accessibilityRole="button" onPress={() => setSel(e.id)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E6E9EF' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.p}>{e.subject}</Text><Badge status={e.status} /></View>
                <Text style={s.hint}>{e.code} · {e.direction === 'sent' ? `to ${e.supplier}` : `from ${e.buyer}`}{e.intendedSupplier ? ` (distributor for ${e.intendedSupplier})` : ''}</Text>
              </Pressable>
            ))}
            {sel && th.data && (
              <Card title={`${th.data.code} — ${th.data.subject}`}>
                {th.data.messages.map((m: any) => <View key={m.id} style={{ marginBottom: 8 }}><Text style={s.hint}>{m.org} · {new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text><Text style={s.p}>{m.body}</Text></View>)}
                {th.data.quotations.map((qt: any) => <Notice key={qt.id} tone="success">Quotation {qt.code}: {money(qt.total)} incl. tax, {qt.deliveryDays} days</Notice>)}
                {th.data.status !== 'closed' && (
                  <>
                    {post.error && <Notice tone="danger">{post.error}</Notice>}
                    <Field label="Reply" value={reply} onChangeText={setReply} multiline testID="enq-reply" />
                    <Button title="Send reply" onPress={() => post.run()} loading={post.busy} disabled={reply.trim().length < 2} testID="enq-reply-send" />
                  </>
                )}
              </Card>
            )}
          </>
        )
      )}
    </ScreenView>
  );
}
