import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, ErrorView, Field, Loading, Notice, Row, ScreenView, inrShort, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface E {
  id: string; code: string; stage: string; status: string; side: 'earner' | 'company' | 'staff' | 'team'; opportunity: { title: string; company: string };
  stages: { key: string; label: string; done: boolean; at: string | null; by: string }[];
  lead: { certificateCode: string; customerName: string; city: string } | null;
  commissions: { id: string; grossPaise: number; tdsPaise: number; netPaise: number; status: string; dueOn: string | null; paymentReference: string | null; receivedConfirmedAt: string | null }[];
  team: { id: string; org: string; role: string; sharePct: number; status: string; mine: boolean }[];
  allocations: { id: string; amountPaise: number; status: string; reference: string | null; orgId: string }[];
  disputes: { id: string; status: string; reason: string; ruling: string | null }[];
}

/** Commission tracker (native): the eight steps, lead registration, commission received, team share and disputes. */
export default function ComearnEngagement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<E>(`/comearn/engagements/${id}`);
  const [f, setF] = useState({ customerName: '', city: '', contactName: '', phone: '', email: '', requirement: '', consent: false });
  const [reason, setReason] = useState('');
  const lead = useAction(async () => { await api.post(`/comearn/engagements/${id}/lead`, { ...f, phone: f.phone || undefined, email: f.email || undefined }); q.reload(); return true; });
  const received = useAction(async (cid: string) => { await api.post(`/comearn/commissions/${cid}/received`, {}); q.reload(); return true; });
  const confirm = useAction(async (aid: string) => { await api.post(`/comearn/allocations/${aid}/confirm`, {}); q.reload(); return true; });
  const dispute = useAction(async () => { await api.post(`/comearn/engagements/${id}/dispute`, { reason }); setReason(''); q.reload(); return true; });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const e = q.data!;
  return (
    <ScreenView title={e.opportunity.title} subtitle={`${e.code} · paid by ${e.opportunity.company}`}>
      <Stack.Screen options={{ title: 'Commission tracker' }} />
      {e.status === 'disputed' ? <Notice tone="warning">In dispute — payment is on hold until COLLABIZ rules.</Notice> : null}
      <Card title="Tracker">
        {e.stages.map((st, i) => (
          <View key={st.key} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
            <Text style={{ width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, backgroundColor: st.done ? theme.colors.green700 : '#EEF2F7', color: st.done ? '#fff' : theme.colors.navy900, fontWeight: '700', overflow: 'hidden' }}>{st.done ? '✓' : i + 1}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{st.label}</Text><Text style={s.hint}>{st.done && st.at ? new Date(st.at).toLocaleDateString('en-IN') : st.by === 'company' ? 'Recorded by the company' : 'Done by you'}</Text></View>
          </View>
        ))}
      </Card>
      {e.side === 'earner' && e.stage === 'agreement_accepted' ? (
        <Card title="Register your customer">
          <Text style={[s.hint, { marginBottom: 8 }]}>The first member to register a customer for this opportunity owns the introduction.</Text>
          <Field label="Customer name" value={f.customerName} onChangeText={(v) => setF({ ...f, customerName: v })} error={lead.fieldErrors.customerName} />
          <Field label="City" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} error={lead.fieldErrors.city} />
          <Field label="Contact person" value={f.contactName} onChangeText={(v) => setF({ ...f, contactName: v })} error={lead.fieldErrors.contactName} />
          <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} error={lead.fieldErrors.phone} />
          <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} error={lead.fieldErrors.email} />
          <Field label="What the customer needs" multiline value={f.requirement} onChangeText={(v) => setF({ ...f, requirement: v })} error={lead.fieldErrors.requirement} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}><Switch value={f.consent} onValueChange={(v) => setF({ ...f, consent: v })} accessibilityLabel="Customer agreed to be contacted" /><Text style={{ flex: 1 }}>The customer agreed this company may contact them</Text></View>
          {lead.error ? <Notice tone="danger">{lead.error}</Notice> : null}
          <Button title="Register and protect lead" loading={lead.busy} onPress={() => lead.run()} />
        </Card>
      ) : null}
      {e.lead ? <Card title="Protected lead"><Text>{e.lead.customerName}, {e.lead.city}</Text><Text style={s.hint}>Certificate {e.lead.certificateCode}</Text></Card> : null}
      {e.commissions.map((c) => (
        <Card key={c.id} title={`Commission ${inrShort(c.grossPaise)}`}>
          <Text style={s.hint}>Tax deducted {inrShort(c.tdsPaise)} · net {inrShort(c.netPaise)}{c.dueOn ? ` · due ${c.dueOn}` : ''}{c.paymentReference ? ` · ref ${c.paymentReference}` : ''}</Text>
          <Badge status={c.status} />
          {e.side === 'earner' && c.status === 'paid' && !c.receivedConfirmedAt ? <Button title="Confirm received" variant="secondary" loading={received.busy} onPress={() => received.run(c.id)} /> : null}
        </Card>
      ))}
      {e.team.length ? <Card title="Team">{e.team.map((t) => <Row key={t.id} title={`${t.org}${t.mine ? ' (you)' : ''}`} subtitle={`${t.role} · ${t.sharePct}% · ${t.status}`} />)}
        {e.allocations.map((a) => <Row key={a.id} title={`Team share ${inrShort(a.amountPaise)}`} subtitle={a.status === 'owed' ? 'Owed by the lead member' : a.status === 'paid' ? `Paid · ${a.reference}` : 'Received'} right={e.side === 'team' && a.status === 'paid' ? <Button compact title="Confirm" onPress={() => confirm.run(a.id)} /> : undefined} />)}
      </Card> : null}
      {e.side === 'earner' || e.side === 'company' ? (
        <Card title="Dispute">
          {e.disputes.map((d) => <Text key={d.id} style={s.hint}>{d.status === 'open' ? 'Open' : 'Resolved'} · {d.reason}{d.ruling ? ` — ${d.ruling}` : ''}</Text>)}
          {!e.disputes.some((d) => d.status === 'open') ? <>
            <Field label="What is wrong? (20+ characters)" multiline value={reason} onChangeText={setReason} />
            {dispute.error ? <Notice tone="danger">{dispute.error}</Notice> : null}
            <Button title="Raise dispute" variant="secondary" disabled={reason.trim().length < 20} loading={dispute.busy} onPress={() => dispute.run()} />
          </> : null}
        </Card>
      ) : null}
    </ScreenView>
  );
}
