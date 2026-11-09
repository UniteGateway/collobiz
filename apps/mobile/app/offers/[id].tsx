import { useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { OFFER_KIND_LABELS, OFFER_PRICING_LABELS, PERCENT_REWARDS, REWARD_LABELS, newIdempotencyKey, regionLabel, sectorName } from '@collabiz/types';
import { Badge, Button, Card, Chips, ErrorView, Field, Loading, Notice, Row, ScreenView, Segmented, s, theme } from '@/components/ui';
import { api } from '@/api';
import { toMinor, useAction, useApi } from '@/hooks';
import { MY_STATUS, dueText, rupees } from '@/offers';

interface Resp { mode: string; price: number | null; priceUnit: string | null; rewardModel: string; rewardBps: number | null; rewardAmount: number | null; rewardText: string; manpower: number | null; hasOffice: boolean; officeLocation: string | null; message: string; status: string; version: number; decisionNote: string | null }
interface Detail { id: string; code: string; title: string; summary: string; issuer: string; kind: string; sector: string; regions: string[]; pricing: string; unitePrice: number | null; priceUnit: string | null; uniteReward: { text: string } | null; rewardModels: string[]; needsOffice: boolean; minManpower: number | null; exclusive: boolean; places: number; deadline: string; open: boolean; agreementNote: string | null; myStatus: string; declineReason: string | null; myResponse: Resp | null; myCapacity: { hasOffice: boolean; officeLocations: string[]; idleManpower: number } | null }

/** One direct offer (native): terms, requirements and your response. */
export default function OfferDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<Detail>(`/offers/${id}`);
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const o = q.data!;
  const [label, tone] = MY_STATUS[o.myStatus] ?? [o.myStatus, 'neutral'];
  const terms = [rupees(o.unitePrice, o.priceUnit), o.uniteReward?.text].filter(Boolean).join(' · ');
  return (
    <ScreenView eyebrow={`Offer from ${o.issuer}`} title={o.title} right={<Badge status={o.myStatus} tone={tone} label={label} />}>
      <Stack.Screen options={{ title: o.code }} />
      <Card>
        <Row title="What" subtitle={OFFER_KIND_LABELS[o.kind]} />
        <Row title="Where" subtitle={`${sectorName(o.sector)} · ${o.regions.length ? o.regions.map(regionLabel).join(', ') : 'Anywhere'}`} />
        <Row title="Pricing" subtitle={OFFER_PRICING_LABELS[o.pricing]} />
        {o.pricing !== 'partner_quote' && <Row title="Unite Group terms" subtitle={terms || '—'} />}
        <Row title="Rewards you may propose" subtitle={o.rewardModels.map((m) => REWARD_LABELS[m]).join(', ')} />
        <Row title="You need" subtitle={[o.needsOffice ? 'An existing office or setup' : null, o.minManpower ? `At least ${o.minManpower} people` : null].filter(Boolean).join(' · ') || 'No minimum'} />
        <Row title="Places" subtitle={o.exclusive ? 'One partner, exclusive' : `${o.places} partner(s)`} />
        <Row title="Responses close" subtitle={o.open ? dueText(o.deadline) : 'Closed'} />
      </Card>
      <Card title="About this offer"><Text style={[s.p, { marginBottom: 0 }]}>{o.summary}</Text></Card>
      {o.agreementNote && <Notice tone="info" title="Profit share and equity">{o.agreementNote}</Notice>}
      {o.myStatus === 'selected' && o.myResponse && <Notice tone="success" title="You were selected">Agreed terms: {o.myResponse.rewardText}{o.myResponse.price != null ? ` · ${rupees(o.myResponse.price, o.myResponse.priceUnit)}` : ''}. {o.myResponse.decisionNote ?? ''}</Notice>}
      {o.myStatus === 'not_selected' && <Notice tone="info" title="Not selected">{o.myResponse?.decisionNote ?? 'Another partner was chosen.'}</Notice>}
      {o.myStatus === 'declined' && <Notice tone="info" title="You declined">{o.declineReason ?? ''}</Notice>}
      {!['selected', 'not_selected', 'declined'].includes(o.myStatus) && (o.open ? <Respond o={o} onDone={q.reload} /> : <Notice tone="info">This offer is no longer taking responses.</Notice>)}
    </ScreenView>
  );
}

function Respond({ o, onDone }: { o: Detail; onDone: () => void }) {
  const r = o.myResponse;
  const canAccept = o.pricing !== 'partner_quote';
  const canPropose = o.pricing !== 'unite_price';
  const [editing, setEditing] = useState(!r || r.status === 'withdrawn');
  const [mode, setMode] = useState(r?.mode ?? (canAccept ? 'accept_terms' : 'proposal'));
  const [f, setF] = useState({
    price: r?.price != null ? String(r.price / 100) : '', unit: r?.priceUnit ?? o.priceUnit ?? 'per month', model: [r?.rewardModel ?? o.rewardModels[0]],
    value: r?.rewardBps != null ? String(r.rewardBps / 100) : r?.rewardAmount != null ? String(r.rewardAmount / 100) : '', manpower: r?.manpower != null ? String(r.manpower) : '',
    hasOffice: r?.hasOffice ?? (o.needsOffice || !!o.myCapacity?.hasOffice), office: r?.officeLocation ?? o.myCapacity?.officeLocations[0] ?? '', message: r?.message ?? '',
  });
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const key = useMemo(newIdempotencyKey, [editing, mode]);
  const model = f.model[0];
  const pct = PERCENT_REWARDS.has(model);
  const send = useAction(async () => {
    await api.request('POST', `/offers/${o.id}/respond`, {
      mode, message: f.message, hasOffice: f.hasOffice, officeLocation: f.hasOffice && f.office ? f.office : undefined, manpower: f.manpower ? Number(f.manpower) : undefined,
      ...(mode === 'proposal' ? { price: toMinor(f.price), priceUnit: f.price ? f.unit : undefined, reward: { model, ...(pct ? { bps: Math.round(Number(f.value) * 100) } : { amount: toMinor(f.value) }) } } : {}),
    }, { idempotencyKey: key });
    setEditing(false); onDone();
  });
  const decline = useAction(async () => { await api.post(`/offers/${o.id}/decline`, { reason }); onDone(); });
  const e = send.fieldErrors;
  if (r && r.status === 'submitted' && !editing) {
    return (
      <Card title={`Your response · version ${r.version}`}>
        <Row title={r.mode === 'accept_terms' ? 'Accepted Unite Group’s terms' : 'Your proposal'} subtitle={[rupees(r.price, r.priceUnit), r.rewardText].filter(Boolean).join(' · ')} />
        <Text style={[s.p, { marginTop: 8 }]}>{r.message}</Text>
        <Button title="Change response" variant="secondary" onPress={() => setEditing(true)} testID="edit-response" />
      </Card>
    );
  }
  return (
    <Card title="Respond">
      {send.error && <Notice tone="danger">{send.error}</Notice>}
      {canAccept && canPropose && <View style={{ marginBottom: theme.space.md }}><Segmented label="Response type" value={mode} onChange={setMode} options={[{ value: 'accept_terms', label: 'Accept terms' }, { value: 'proposal', label: 'Propose mine' }]} /></View>}
      {mode === 'accept_terms' ? <Notice tone="info">You accept {[rupees(o.unitePrice, o.priceUnit), o.uniteReward?.text].filter(Boolean).join(' · ')}.</Notice> : (
        <>
          <Field label={o.pricing === 'partner_quote' ? 'Your price (₹)' : 'Your price (₹, optional)'} value={f.price} onChangeText={(v) => setF({ ...f, price: v })} keyboardType="decimal-pad" error={e.price} hint={`Price ${f.unit}`} />
          <Text style={s.label}>Reward you want</Text>
          <Chips value={f.model} onChange={(v) => setF({ ...f, model: v.slice(-1).length ? v.slice(-1) : f.model, value: '' })} options={o.rewardModels.map((m) => ({ value: m, label: REWARD_LABELS[m] }))} />
          <Field label={pct ? `${REWARD_LABELS[model]} (%)` : `${REWARD_LABELS[model]} (₹)`} value={f.value} onChangeText={(v) => setF({ ...f, value: v })} keyboardType="decimal-pad" error={e.reward} />
        </>
      )}
      <Field label={o.minManpower ? `People you will commit (min ${o.minManpower})` : 'People you will commit (optional)'} value={f.manpower} onChangeText={(v) => setF({ ...f, manpower: v.replace(/\D/g, '') })} keyboardType="number-pad" error={e.manpower} hint={o.myCapacity ? `You declared ${o.myCapacity.idleManpower} free` : undefined} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Switch value={f.hasOffice} onValueChange={(v) => setF({ ...f, hasOffice: v })} trackColor={{ true: theme.colors.green500, false: theme.colors.grey300 }} accessibilityLabel="We have an office or setup" />
        <Text style={[s.p, { flex: 1, marginBottom: 0 }]}>We have an office or setup here{o.needsOffice ? ' (required)' : ''}</Text>
      </View>
      {f.hasOffice && <Field label="Office location" value={f.office} onChangeText={(v) => setF({ ...f, office: v })} error={e.officeLocation} />}
      <Field label="Why your company" value={f.message} onChangeText={(v) => setF({ ...f, message: v })} multiline error={e.message} hint="At least 20 characters. Only Unite Group sees this." />
      <Button title={r ? 'Send updated response' : mode === 'accept_terms' ? 'Accept and send' : 'Send proposal'} variant="accent" onPress={() => send.run()} loading={send.busy} disabled={f.message.trim().length < 20} testID="send-response" />
      {!r && !declining && <Button title="Decline" variant="plain" onPress={() => setDeclining(true)} testID="decline" />}
      {declining && (
        <>
          {decline.error && <Notice tone="danger">{decline.error}</Notice>}
          <Field label="Reason for declining" value={reason} onChangeText={setReason} />
          <Button title="Decline offer" variant="danger" onPress={() => decline.run()} loading={decline.busy} disabled={reason.trim().length < 5} testID="confirm-decline" />
        </>
      )}
    </Card>
  );
}
