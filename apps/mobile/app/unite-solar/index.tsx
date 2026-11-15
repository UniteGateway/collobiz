import { RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Empty, ErrorView, Kpi, Loading, Notice, Row, ScreenView, s, money, theme } from '@/components/ui';
import { useApi } from '@/hooks';
import { DISCLAIMER, TONE, usePartner } from '@/uniteSolar';

interface Dash {
  unit: { code: string; status: string; statusLabel: string; city: string; district: string; state: string; paymentStatus: string; pricing: { total: number }; decisionNote: string | null; packageName: string };
  package: { name: string; inventoryEnabled: boolean }; steps: { key: string; label: string; done: boolean }[];
  territory: { name: string; level: string; expiresOn: string | null; status: string } | null; catchment: { pincode: string } | null;
  leadDna: { entitled: boolean; offered: string }; sales: { orders: number; value: number; awaitingAcceptance: number; margin: number };
  inventory: { value: number; lowStock: number } | null; earnings: { stream: string; label: string; pending: number; approved: number; paid: number }[];
}

/** My Unite Solar partnership (native): progress, payment, territory, sales, stock and earnings at a glance. */
export default function UniteSolarHome() {
  const router = useRouter();
  const p = usePartner();
  const d = useApi<Dash>(p.unit ? `/network/units/${p.unit.id}/dashboard` : null);
  if ((p.loading && !p.data) || (p.unit && d.loading && !d.data)) return <Loading />;
  if (p.error || d.error) return <ErrorView error={p.error ?? d.error} onRetry={() => { p.reload(); d.reload(); }} />;
  const go = (path: string) => () => router.push(path as never);
  if (!p.unit || !d.data) return (
    <ScreenView title="Unite Solar" subtitle="Franchise and store partner programme.">
      <Empty icon="sunny-outline" title="You are not a Unite Solar partner yet" body="Compare the plans and apply. Unite reviews every application before anything is signed or paid." />
      <Button title="Compare partner plans" onPress={go('/unite-solar/plans')} testID="us-plans" />
    </ScreenView>
  );
  const x = d.data, u = x.unit, live = u.status === 'live';
  return (
    <ScreenView title={x.package.name} eyebrow="Unite Solar" subtitle={`${u.city}, ${u.district} · ${u.code}`} refreshControl={<RefreshControl refreshing={d.loading} onRefresh={d.reload} />}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Badge status={u.status} tone={TONE[u.status]} label={u.statusLabel} /><View style={{ flex: 1 }} /></View>
        {x.steps.map((st) => <Text key={st.key} style={[s.rowSub, { color: st.done ? theme.colors.green700 : theme.colors.grey600 }]}>{st.done ? '✓' : '○'} {st.label}</Text>)}
        {u.decisionNote ? <Notice title="Note from Unite">{u.decisionNote}</Notice> : null}
      </Card>
      {u.paymentStatus !== 'verified' && ['approved', 'agreement_signed', 'setup'].includes(u.status) ? (
        <Notice tone={u.paymentStatus === 'submitted' ? 'info' : 'warning'} title="Payment">{u.paymentStatus === 'submitted' ? 'Awaiting verification by Unite finance.' : `Amount due after approval: ${money(u.pricing.total)} incl. GST. Record the payment on the web dashboard.`} Your rights start only after the agreement is signed and finance verifies the payment.</Notice>
      ) : null}
      <Card title={x.territory ? 'Territory' : 'Catchment'}>
        <Text style={s.rowSub}>{x.territory ? `${x.territory.name} (${x.territory.level}) · ${x.territory.status}${x.territory.expiresOn ? ` · until ${x.territory.expiresOn}` : ''}` : `PIN ${x.catchment?.pincode} — not exclusive`}</Text>
        <Text style={s.hint}>LeadDNA: {x.leadDna.entitled ? 'licence active' : x.leadDna.offered === 'add-on' ? 'available as an add-on' : x.leadDna.offered === 'included' ? 'included' : 'not part of this plan — use COLLABIZ lead registration'}</Text>
      </Card>
      {live ? (
        <>
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            <View style={{ flex: 1 }}><Kpi label="Sales" value={money(x.sales.value)} hint={`${x.sales.orders} orders`} onPress={go('/unite-solar/sales')} /></View>
            <View style={{ flex: 1 }}>{x.inventory ? <Kpi label="Stock" value={money(x.inventory.value)} hint={`${x.inventory.lowStock} low`} onPress={go('/unite-solar/stock')} /> : <Kpi label="Awaiting acceptance" value={x.sales.awaitingAcceptance} onPress={go('/unite-solar/sales')} />}</View>
          </View>
          <Card title="Earnings">
            {x.earnings.map((e) => <Text key={e.stream} style={s.rowSub}>{e.label}: {money(e.paid)} paid · {money(e.approved)} approved · {money(e.pending)} pending</Text>)}
            <Text style={s.hint}>{DISCLAIMER}</Text>
          </Card>
        </>
      ) : null}
      <Card>
        <Row icon="pricetags-outline" title="Partner plans" onPress={go('/unite-solar/plans')} chevron />
        {live ? <Row icon="cart-outline" title="Sales & orders" onPress={go('/unite-solar/sales')} chevron testID="us-sales" /> : null}
        {live && x.package.inventoryEnabled ? <Row icon="cube-outline" title="Inventory" onPress={go('/unite-solar/stock')} chevron testID="us-stock" /> : null}
        <Row icon="wallet-outline" title="Earnings" onPress={go('/unite-solar/earnings')} chevron />
        <Row icon="megaphone-outline" title="Marketing, demo materials & service" onPress={go('/unite-solar/marketing')} chevron />
      </Card>
    </ScreenView>
  );
}
