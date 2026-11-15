import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { SERVICE_KINDS, SERVICE_KIND_LABELS } from '@collabiz/types';
import { Badge, Button, Card, ErrorView, Field, Loading, Notice, Row, ScreenView, Segmented, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { ACTIVE, TONE, usePartner } from '@/uniteSolar';

interface Mkt { referralCode: string; referralLink: string; attribution: { leads: number } }
interface Demo { materials: { id: string; name: string; maxPerPartner: number }[]; requests: { id: string; name: string; qty: number; status: string; partnerActions: string[] }[] }
const ACT: Record<string, string> = { confirmed: 'Confirm received', damaged: 'Report damage', returned: 'Mark returned' };

/** Marketing, demo materials and service requests (native). */
export default function Marketing() {
  const p = usePartner();
  const ok = !!p.unit && ACTIVE.includes(p.unit.status);
  const m = useApi<Mkt>(ok ? '/network/marketing' : null);
  const d = useApi<Demo>(ok ? '/network/demo' : null);
  const [tab, setTab] = useState('marketing');
  const [sr, setSr] = useState({ kind: 'site_survey', customerName: '', details: '' });
  const ask = useAction(async (materialId: string) => { await api.post(`/network/units/${p.unit!.id}/demo-requests`, { materialId, qty: 1 }); d.reload(); });
  const step = useAction(async (id: string, to: string) => { await api.post(`/network/demo/${id}/status`, { to, note: to === 'confirmed' ? undefined : 'Reported from the mobile app' }); d.reload(); });
  const raise = useAction(async () => { await api.post(`/network/units/${p.unit!.id}/service-requests`, sr); setSr({ ...sr, customerName: '', details: '' }); return true; });
  if (p.loading && !p.data) return <Loading />;
  if (!ok) return <ScreenView title="Marketing"><Notice>The marketing centre opens once your application is approved.</Notice></ScreenView>;
  if (m.error || d.error) return <ErrorView error={m.error ?? d.error} onRetry={() => { m.reload(); d.reload(); }} />;
  if (!m.data || !d.data) return <Loading />;
  return (
    <ScreenView title="Marketing & service" eyebrow="Unite Solar">
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'marketing', label: 'Referral' }, { value: 'demo', label: 'Demo kit' }, { value: 'service', label: 'Service' }]} />
      <View style={{ height: theme.space.md }} />
      {tab === 'marketing' ? (
        <Card title="Your referral link">
          <Text style={s.rowSub}>{m.data.referralLink}</Text>
          <Text style={s.hint}>Code {m.data.referralCode} · {m.data.attribution.leads} customer(s) attributed to you</Text>
          <Button title="Share link" icon="share-outline" onPress={() => Share.share({ message: `Go solar with Unite Solar: ${m.data!.referralLink}` })} testID="us-share" />
        </Card>
      ) : null}
      {tab === 'demo' ? (
        <>
          {(ask.error || step.error) ? <Notice tone="danger">{ask.error ?? step.error}</Notice> : null}
          <Card title="My requests">{d.data.requests.length ? d.data.requests.map((r) => (
            <View key={r.id} style={{ paddingVertical: 6, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1 }}>{r.qty} × {r.name}</Text><Badge status={r.status} tone={TONE[r.status]} label={r.status} /></View>
              {r.partnerActions.map((to) => <Button key={to} compact variant="secondary" title={ACT[to] ?? to} onPress={() => step.run(r.id, to)} />)}
            </View>
          )) : <Text style={s.hint}>No requests yet.</Text>}</Card>
          <Card title="Request materials">{d.data.materials.map((x) => <Row key={x.id} title={x.name} subtitle={`Up to ${x.maxPerPartner}`} onPress={() => ask.run(x.id)} chevron />)}</Card>
        </>
      ) : null}
      {tab === 'service' ? (
        <Card title="Raise a service request">
          <Segmented label="Request" value={sr.kind} onChange={(v) => setSr({ ...sr, kind: v })} options={SERVICE_KINDS.slice(0, 3).map((k) => ({ value: k, label: SERVICE_KIND_LABELS[k].split(' ')[0] }))} />
          <Segmented label="More" value={sr.kind} onChange={(v) => setSr({ ...sr, kind: v })} options={SERVICE_KINDS.slice(3).map((k) => ({ value: k, label: SERVICE_KIND_LABELS[k].split(' ')[0] }))} />
          <Text style={s.hint}>{SERVICE_KIND_LABELS[sr.kind]}</Text>
          <Field label="Customer name" value={sr.customerName} onChangeText={(v) => setSr({ ...sr, customerName: v })} error={raise.fieldErrors.customerName} />
          <Field label="Details" multiline value={sr.details} onChangeText={(v) => setSr({ ...sr, details: v })} error={raise.fieldErrors.details} />
          {raise.error ? <Notice tone="danger">{raise.error}</Notice> : null}
          <Button title="Send to Unite" onPress={async () => { if (await raise.run()) setTab('service'); }} loading={raise.busy} disabled={sr.customerName.length < 2 || sr.details.length < 10} testID="us-service" />
        </Card>
      ) : null}
    </ScreenView>
  );
}
