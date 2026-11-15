import { useState } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, ErrorView, Field, Loading, Notice, ScreenView, SearchBar, Segmented, s, theme } from '@/components/ui';
import { API_URL, api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Item { id: string; name: string; productLine: string | null; category: string | null; description: string; hasImage: boolean; commissionBps: number | null }
interface Cat { total: number; lines: { line: string; count: number }[]; items: Item[]; note: string }
const short = (l: string) => l.replace(/^POWERTEK /, '').toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());

/** Powertek products (native): browse the whole catalogue, pick products and register a customer enquiry. */
export default function Powertek() {
  const router = useRouter();
  const [q, setQ] = useState(''); const [line, setLine] = useState('');
  const c = useApi<Cat>('/product-sales/powertek/catalogue', { q: q || undefined, line: line || undefined });
  const [picked, setPicked] = useState<Record<string, { item: Item; qty: string }>>({});
  const [f, setF] = useState({ customerName: '', customerPhone: '', city: '', state: '', pincode: '', requirement: '', consent: false });
  const [sent, setSent] = useState<string | null>(null);
  const send = useAction(async () => {
    const r = await api.post<{ code: string }>('/product-sales/powertek/enquiries', { ...f, customerPhone: f.customerPhone || undefined, lines: Object.values(picked).map((p) => ({ catalogItemId: p.item.id, qty: Number(p.qty) || 1 })) }, true);
    setSent(r.code); setPicked({}); return r;
  });
  if (c.loading && !c.data) return <Loading />;
  if (c.error) return <ErrorView error={c.error} onRetry={c.reload} />;
  const chosen = Object.values(picked);
  const lines = (c.data?.lines ?? []).slice(0, 4);
  return (
    <ScreenView title="Powertek products" eyebrow="Sell & earn" subtitle="Anyone can sell Unite Powertek products. Register your customer; Powertek quotes and delivers; you earn on the order after payment."
      right={<Button compact variant="secondary" title="My enquiries" onPress={() => router.push('/powertek/enquiries' as never)} />}>
      {sent ? <Notice tone="success" title={`Enquiry ${sent} sent`}>The customer is registered to you for 90 days.</Notice> : null}
      <SearchBar value={q} onChangeText={setQ} placeholder="Search 360+ products" label="Search products" />
      <Segmented label="Product line" value={line} onChange={setLine} options={[{ value: '', label: 'All' }, ...lines.map((l) => ({ value: l.line, label: short(l.line) }))]} />
      <Text style={[s.hint, { marginVertical: 8 }]}>{c.data?.total} products · {c.data?.note}</Text>
      {!c.data?.items.length ? <Empty title="No products match" /> : c.data.items.map((it) => {
        const on = !!picked[it.id];
        return (
          <Pressable key={it.id} testID={`pt-${it.id}`} accessibilityRole="button" accessibilityLabel={`${on ? 'Remove' : 'Add'} ${it.name}`} onPress={() => setPicked((p) => { const n = { ...p }; if (n[it.id]) delete n[it.id]; else n[it.id] = { item: it, qty: '1' }; return n; })}
            style={[s.card, { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2, borderColor: on ? theme.colors.green700 : 'transparent' }]}>
            {it.hasImage ? <Image source={{ uri: `${API_URL}/v1/catalog/${it.id}/image` }} style={{ width: 64, height: 64, borderRadius: 8 }} accessibilityIgnoresInvertColors /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: theme.colors.navy900 }}>{it.name}</Text>
              <Text style={s.hint}>{it.productLine ? short(it.productLine) : ''}{it.category ? ` · ${it.category}` : ''}</Text>
              <Text style={s.hint}>{it.commissionBps != null ? `Earn ${(it.commissionBps / 100).toFixed(2)}% of order` : 'Commission rate to be confirmed'}</Text>
            </View>
            <Text style={{ fontWeight: '700', color: on ? theme.colors.green700 : theme.colors.grey500 }}>{on ? '✓' : '+'}</Text>
          </Pressable>
        );
      })}
      {chosen.length ? (
        <Card title={`Enquiry for ${chosen.length} product(s)`}>
          {chosen.map((p) => <Field key={p.item.id} label={`Qty — ${p.item.name}`} keyboardType="number-pad" value={p.qty} onChangeText={(v) => setPicked({ ...picked, [p.item.id]: { ...p, qty: v.replace(/\D/g, '') } })} />)}
          <Field label="Customer (company or person)" value={f.customerName} onChangeText={(v) => setF({ ...f, customerName: v })} error={send.fieldErrors.customerName} />
          <Field label="Customer mobile (optional)" keyboardType="phone-pad" value={f.customerPhone} onChangeText={(v) => setF({ ...f, customerPhone: v.replace(/\D/g, '').slice(0, 10) })} error={send.fieldErrors.customerPhone} />
          <Field label="City" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
          <Field label="State" value={f.state} onChangeText={(v) => setF({ ...f, state: v })} />
          <Field label="PIN code" keyboardType="number-pad" maxLength={6} value={f.pincode} onChangeText={(v) => setF({ ...f, pincode: v.replace(/\D/g, '') })} error={send.fieldErrors.pincode} />
          <Field label="Customer requirement" multiline value={f.requirement} onChangeText={(v) => setF({ ...f, requirement: v })} error={send.fieldErrors.requirement} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Switch value={f.consent} onValueChange={(v) => setF({ ...f, consent: v })} accessibilityLabel="Customer agreed to be contacted" />
            <Text style={[s.rowSub, { flex: 1 }]}>The customer agreed to be contacted by Unite Powertek</Text>
          </View>
          {send.error ? <Notice tone="danger">{send.error}</Notice> : null}
          <Button title="Send enquiry to Powertek" onPress={() => send.run()} loading={send.busy} disabled={!f.consent || !f.customerName || f.requirement.length < 10} testID="pt-send" />
        </Card>
      ) : null}
    </ScreenView>
  );
}
