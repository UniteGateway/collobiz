import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Badge, Card, Empty, ErrorView, Loading, ScreenView, money, s } from '@/components/ui';
import { useApi } from '@/hooks';

/** Screen 100 (native) — Payment & Settlement History. */
export default function Payments() {
  const q = useApi<any[]>('/payouts');
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView id="100">
      <Stack.Screen options={{ title: 'Payments' }} />
      {!q.data?.length ? <Empty title="No payouts yet" body="Approved commission can be requested from the web app." /> : q.data.map((p) => (
        <Card key={p.id} title={`${p.code} · ${money(p.payable)}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={s.hint}>Invoice {p.partnerInvoiceNo} · TDS {money(p.tds)}</Text>
            <Badge status={p.status} />
          </View>
          {p.settlement && <Text style={s.p} testID={`utr-${p.code}`}>Paid by {p.settlement.method.toUpperCase()} · {p.settlement.bankReference} · {new Date(p.settlement.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>}
          {p.rejectionReason && <Text style={s.hint}>Rejected: {p.rejectionReason}</Text>}
        </Card>
      ))}
    </ScreenView>
  );
}
