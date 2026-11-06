'use client';
import { useEffect, useMemo, useState } from 'react';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, DescriptionList, Grid, LoadingState, Money, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmt, SEALED_NOTE, TenderTabs, useTender } from '@/components/Tenders';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { fromMinor, toMinor } from '@/lib/regions';

const EMPTY = { approach: '', experience: '', timelineWeeks: '', team: '', amount: '', validityDays: '90', paymentTerms: '', exclusions: '' };

/** Screen 068 — Partner Bid Submission (two sealed envelopes). */
export default function BidSubmission() {
  const t = useTender();
  const d = t.data;
  const bid = useQuery<any>(d?.role === 'bidder' ? `/tenders/${t.id}/bid` : null);
  const [f, setF] = useState(EMPTY);
  const key = useMemo(newIdempotencyKey, [bid.data?.id]);
  useEffect(() => {
    const b = bid.data;
    if (b) setF({ approach: b.technical.approach, experience: b.technical.experience, timelineWeeks: String(b.technical.timelineWeeks), team: b.technical.team ?? '', amount: fromMinor(b.commercial.amount), validityDays: String(b.commercial.validityDays), paymentTerms: b.commercial.paymentTerms, exclusions: b.commercial.exclusions ?? '' });
  }, [bid.data?.id, bid.data?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const payload = () => ({
    technical: { approach: f.approach, experience: f.experience, timelineWeeks: Number(f.timelineWeeks) || 0, team: f.team || undefined },
    commercial: { amount: toMinor(f.amount) ?? 0, validityDays: Number(f.validityDays) || 0, paymentTerms: f.paymentTerms, exclusions: f.exclusions || undefined },
  });
  const save = useMutation(async () => { await api.put(`/tenders/${t.id}/bid`, payload()); bid.reload(); return 'saved'; });
  const submit = useMutation(async () => {
    await api.put(`/tenders/${t.id}/bid`, payload());
    const r = await api.request<any>('POST', `/tenders/${t.id}/bid/submit`, undefined, { idempotencyKey: key });
    bid.reload(); t.reload(); return r;
  });
  const withdraw = useMutation(async () => { await api.post(`/tenders/${t.id}/bid/withdraw`); bid.reload(); t.reload(); setF(EMPTY); return true; });
  if (t.loading || bid.loading) return <Screen id="068"><LoadingState /></Screen>;
  if (t.error) return <Screen id="068"><ApiErrorView error={t.error} onRetry={t.reload} /></Screen>;
  if (d.role !== 'bidder') return <Screen id="068" title={d.title}><TenderTabs t={d} /><Alert tone="info">Only verified partner organizations other than the issuer can bid on this tender.</Alert></Screen>;
  const b = bid.data;
  const sealed = b && b.status !== 'draft';
  const err = save.error ?? submit.error ?? withdraw.error;
  const fe = { ...save.fieldErrors, ...submit.fieldErrors };
  return (
    <Screen id="068" title={d.title}>
      <TenderTabs t={d} />
      <Alert tone="info">{SEALED_NOTE}</Alert>
      {err && <Alert tone="danger">{err}</Alert>}
      {!d.eligibility?.eligible && <Alert tone="warning" title="Your organization is not eligible yet">See the eligibility checklist on the overview tab. You can prepare a draft, but submission will be refused.</Alert>}
      {save.data === 'saved' && !sealed && <Alert tone="success">Draft saved (encrypted). Drafts that are not submitted lapse when bidding closes.</Alert>}
      {sealed && (
        <Card title="Sealed bid" actions={<StatusBadge status={b.status} />}>
          <DescriptionList items={[
            ['Submitted', fmt(b.submittedAt) ],
            ['Seal (SHA-256)', <span className="cz-mono" style={{ wordBreak: 'break-all' }}>{b.sealedHash}</span> ],
            ['Price', <Money minor={b.commercial.amount} /> ],
            ['Delivery timeline', `${b.technical.timelineWeeks} weeks` ],
          ]} />
          {d.biddingOpen && b.status === 'submitted' && (
            <>
              <p className="cz-muted">A sealed bid cannot be edited. To change it, withdraw it and submit a new bid before {fmt(d.closesAt)}.</p>
              <Button variant="danger" onClick={() => withdraw.run()} loading={withdraw.pending}>Withdraw bid</Button>
            </>
          )}
        </Card>
      )}
      {!sealed && d.biddingOpen && (
        <>
          <Card title="Envelope 1 — Technical">
            <TextArea label="Technical approach & methodology" rows={5} value={f.approach} onChange={set('approach')} error={fe['technical.approach']} />
            <TextArea label="Relevant experience" rows={3} value={f.experience} onChange={set('experience')} error={fe['technical.experience']} />
            <Grid cols={2}>
              <TextInput label="Delivery timeline (weeks)" inputMode="numeric" value={f.timelineWeeks} onChange={set('timelineWeeks')} error={fe['technical.timelineWeeks']} />
              <TextInput label="Key team (optional)" value={f.team} onChange={set('team')} />
            </Grid>
          </Card>
          <Card title="Envelope 2 — Commercial">
            <Grid cols={2}>
              <TextInput label="Total price (₹, excl. taxes)" inputMode="decimal" value={f.amount} onChange={set('amount')} error={fe['commercial.amount']} />
              <TextInput label="Offer validity (days)" inputMode="numeric" value={f.validityDays} onChange={set('validityDays')} error={fe['commercial.validityDays']} />
            </Grid>
            <TextArea label="Payment terms" rows={2} value={f.paymentTerms} onChange={set('paymentTerms')} error={fe['commercial.paymentTerms']} />
            <TextArea label="Exclusions (optional)" rows={2} value={f.exclusions} onChange={set('exclusions')} />
            <div className="cz-row">
              <Button variant="secondary" onClick={() => save.run()} loading={save.pending}>Save draft</Button>
              <Button variant="accent" onClick={() => submit.run()} loading={submit.pending}>Submit sealed bid</Button>
            </div>
          </Card>
        </>
      )}
      {!sealed && !d.biddingOpen && <Alert tone="warning">Bidding for this tender has closed.</Alert>}
    </Screen>
  );
}
