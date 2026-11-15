import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PRICING_LABELS, PRICING_MODELS } from '@collabiz/types';
import { Badge, Button, Card, Chips, ErrorView, Field, Loading, Notice, Row, ScreenView, Section, Segmented, inrShort, s, theme } from '@/components/ui';
import { useAction, useApi } from '@/hooks';
import { STAGES, STAGE_INDEX, send, type Money } from '@/collab';

interface Terms { scope: string; deliverables: string; pricingModel: string; value: number; sharePercent?: number; paymentTerms: string; durationMonths: number; startDate: string; payer: 'owner' | 'applicant' }
interface Room {
  side: 'owner' | 'applicant'; stage: string; waitingFor: string | null; prerequisite: string | null; offer: { id: string; title: string; publisher: string }; application: { id: string; applicant: string };
  rounds: { id: string; round: number; mine: boolean; status: string; terms: Terms; pricingLabel: string }[]; can: { propose: boolean; accept: boolean; decline: boolean };
  agreement: { id: string; code: string; status: string; value: number } | null; project: { id: string; code: string } | null; money: Money;
}
const in3Weeks = () => new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

/** Proposal room (native): see each round, accept, decline or counter; then the agreement, project and money. */
export default function ProposalRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useApi<Room>(`/collab/applications/${id}/room`);
  const [compose, setCompose] = useState(false);
  const [f, setF] = useState({ scope: '', deliverables: '', pricingModel: 'fixed_fee', value: '', paymentTerms: '', durationMonths: '12', startDate: in3Weeks(), payer: '' });
  const act = useAction(async (path: string, body?: object) => { await send(path, body); setCompose(false); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  const other = d.side === 'owner' ? d.application.applicant : d.offer.publisher;
  const live = d.rounds.find((r) => r.status === 'sent');
  const startCompose = () => {
    const b = live?.terms;
    setF(b ? { scope: b.scope, deliverables: b.deliverables, pricingModel: b.pricingModel, value: String(b.value / 100), paymentTerms: b.paymentTerms, durationMonths: String(b.durationMonths), startDate: b.startDate, payer: b.payer } : { ...f, payer: d.side === 'owner' ? 'applicant' : 'owner' });
    setCompose(true);
  };
  return (
    <ScreenView title="Proposal room" eyebrow="COLLAB" subtitle={`${d.offer.title} · with ${other}`}>
      <Text style={[s.hint, { marginBottom: 8 }]} testID="stage">Step {(STAGE_INDEX[d.stage] ?? 0) + 1} of {STAGES.length}: {STAGES[STAGE_INDEX[d.stage] ?? 0]}</Text>
      {act.error && <Notice tone="danger">{act.error}</Notice>}
      {d.prerequisite && <Notice tone="info">{d.prerequisite}</Notice>}
      {d.agreement && (
        <Card title={`Agreement ${d.agreement.code}`}>
          <Text style={s.p}>{inrShort(d.agreement.value)} · {d.agreement.status === 'executed' ? 'Signed by both' : 'Ready to sign'}. Sign it in Documents on the web or in the app.</Text>
          {d.project && <Button title={`Open project ${d.project.code}`} variant="secondary" onPress={() => router.push(`/projects/${d.project!.id}/progress` as never)} />}
        </Card>
      )}
      <Section title="Money for this collaboration" footer="Kept separate: these are not interchangeable revenue numbers.">
        <Row title="Pipeline" right={<Text style={s.rowTitle}>{inrShort(d.money.pipelineValue)}</Text>} />
        <Row title="Contract value" right={<Text style={s.rowTitle}>{inrShort(d.money.contractValue)}</Text>} />
        <Row title="Invoiced" right={<Text style={s.rowTitle}>{inrShort(d.money.invoiced)}</Text>} />
        <Row title="Collected" right={<Text style={s.rowTitle}>{inrShort(d.money.collected)}</Text>} />
      </Section>
      <Section title="Proposals" footer={d.waitingFor === 'you' ? 'Waiting for you.' : d.waitingFor === 'them' ? `Waiting for ${other}.` : undefined}>
        {[...d.rounds].reverse().map((r) => (
          <View key={r.id} testID={`round-${r.round}`} style={{ padding: 16, backgroundColor: r.mine ? theme.colors.grey50 : '#fff', gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={s.rowTitle}>Round {r.round} · {r.mine ? 'You' : other}</Text><Badge status={r.status} label={r.status === 'sent' ? 'Open' : r.status} /></View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.navy900 }}>{inrShort(r.terms.value)}</Text>
            <Text style={s.rowSub}>{r.pricingLabel} · {r.terms.durationMonths} months · paid by {r.terms.payer === d.side ? 'you' : other}</Text>
            <Text style={s.p}>{r.terms.scope}</Text>
            {r.status === 'sent' && !r.mine && d.can.accept && <Button title="Accept and create agreement" onPress={() => act.run(`/collab/proposals/${r.id}/accept`)} loading={act.busy} testID="accept" />}
          </View>
        ))}
        {!d.rounds.length && <Row title="No proposals yet" />}
      </Section>
      {d.can.propose && !compose && <Button title={live ? 'Counter-proposal' : 'Send a proposal'} variant={live ? 'secondary' : 'primary'} onPress={startCompose} testID="compose" />}
      {compose && (
        <Card title={live ? 'Counter-proposal' : 'Proposal'}>
          <Field label="Scope of work" value={f.scope} onChangeText={(v) => setF({ ...f, scope: v })} multiline error={act.fieldErrors.scope} />
          <Field label="Deliverables" value={f.deliverables} onChangeText={(v) => setF({ ...f, deliverables: v })} error={act.fieldErrors.deliverables} />
          <Text style={s.label}>Pricing</Text>
          <Chips value={[f.pricingModel]} onChange={(v) => setF({ ...f, pricingModel: v[v.length - 1] ?? f.pricingModel })} options={PRICING_MODELS.filter((p) => p !== 'barter' && p !== 'revenue_share' && p !== 'commission').map((p) => ({ value: p, label: PRICING_LABELS[p] }))} />
          <Field label="Total value for the term (₹)" value={f.value} keyboardType="number-pad" onChangeText={(v) => setF({ ...f, value: v.replace(/\D/g, '') })} error={act.fieldErrors.value} />
          <Field label="Payment terms" value={f.paymentTerms} onChangeText={(v) => setF({ ...f, paymentTerms: v })} error={act.fieldErrors.paymentTerms} />
          <Field label="Duration (months)" value={f.durationMonths} keyboardType="number-pad" onChangeText={(v) => setF({ ...f, durationMonths: v.replace(/\D/g, '') })} />
          <Field label="Start date (YYYY-MM-DD)" value={f.startDate} onChangeText={(v) => setF({ ...f, startDate: v })} error={act.fieldErrors.startDate} />
          <Segmented label="Who pays" value={f.payer} onChange={(v) => setF({ ...f, payer: v })} options={[{ value: d.side, label: 'We pay' }, { value: d.side === 'owner' ? 'applicant' : 'owner', label: 'They pay' }]} />
          <Button title="Send" testID="send-proposal" loading={act.busy} disabled={!f.value || f.scope.length < 20}
            onPress={() => act.run(`/collab/applications/${d.application.id}/proposals`, { scope: f.scope, deliverables: f.deliverables, pricingModel: f.pricingModel, value: Math.round(Number(f.value) * 100), paymentTerms: f.paymentTerms, durationMonths: Number(f.durationMonths), startDate: f.startDate, payer: f.payer })} />
          <Button title="Cancel" variant="plain" onPress={() => setCompose(false)} />
        </Card>
      )}
    </ScreenView>
  );
}
