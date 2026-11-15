import { RefreshControl, Text, View } from 'react-native';
import { Badge, Card, Empty, ErrorView, Kpi, Loading, Notice, ScreenView, s, money, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Enq { id: string; code: string; customerName: string; city: string; lines: { name: string; qty: number }[]; status: string; statusLabel: string; protectedUntil: string; quoteValue: number | null; orderValue: number | null; commission: number | null; rateBps: number | null }
interface Mine { channel: string; enquiries: Enq[]; totals: { open: number; won: number; commissionWon: number; commissionEarned: number }; disclaimer: string }
const TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = { submitted: 'info', in_discussion: 'info', quoted: 'warning', won: 'success', paid: 'success', lost: 'neutral', withdrawn: 'neutral' };

/** My Powertek enquiries (native). */
export default function MyEnquiries() {
  const q = useApi<Mine>('/product-sales/powertek/enquiries/mine');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  return (
    <ScreenView title="My enquiries" eyebrow="Powertek products" subtitle={`Selling as ${d.channel}`} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={q.reload} />}>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <View style={{ flex: 1 }}><Kpi label="Open" value={d.totals.open} /></View>
        <View style={{ flex: 1 }}><Kpi label="Earned" value={money(d.totals.commissionEarned)} hint={`${money(d.totals.commissionWon)} projected`} /></View>
      </View>
      {!d.enquiries.length ? <Empty title="No enquiries yet" body="Pick products and register your customer." /> : d.enquiries.map((e) => (
        <Card key={e.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ fontWeight: '600', flex: 1 }}>{e.code}</Text><Badge status={e.status} tone={TONE[e.status]} label={e.statusLabel} /></View>
          <Text style={s.rowSub}>{e.customerName}, {e.city}</Text>
          <Text style={s.hint}>{e.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}</Text>
          <Text style={s.hint}>{e.orderValue ? `Order ${money(e.orderValue)}` : e.quoteValue ? `Quoted ${money(e.quoteValue)}` : `Customer yours until ${e.protectedUntil}`}{e.commission != null ? ` · commission ${money(e.commission)}` : ''}</Text>
        </Card>
      ))}
      <Notice>{d.disclaimer}</Notice>
    </ScreenView>
  );
}
