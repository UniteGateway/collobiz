'use client';
import { useState } from 'react';
import { Alert, Button, ButtonLink, Card, DescriptionList, LoadingState, StatusBadge, Stepper, Timeline } from '@collabiz/ui';
import { newIdempotencyKey } from '@collabiz/types';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { STEP_META, useOnboarding } from '@/lib/onboarding';

const FLOW = ['not_started', 'submitted', 'under_review', 'verified'];

/** Screen 022 — Verification Status & Approval (partner view). */
export default function StatusPage() {
  const { status, reload } = useOnboarding();
  const { refresh } = useSession();
  const [key] = useState(newIdempotencyKey);
  // Stable key per page view: a double-click or retry replays instead of submitting twice.
  const run = useMutation(async () => {
    await api.request('POST', '/onboarding/submit', {}, { idempotencyKey: key });
    reload();
    await refresh();
    return true;
  });
  if (!status) return <Screen id="022"><LoadingState /></Screen>;
  const org = status.organization;
  const v = org?.verificationStatus ?? 'not_started';
  const idx = v === 'reupload_requested' || v === 'rejected' ? 2 : Math.max(0, FLOW.indexOf(v));
  return (
    <Screen id="022">
      {!org ? (
        <Card><p>You haven’t started partner onboarding.</p><ButtonLink href="/onboarding/account-type">Start now</ButtonLink></Card>
      ) : (
        <>
          <Card title={org.displayName} actions={<StatusBadge status={v} />}>
            <Stepper steps={['Draft', 'Submitted', 'Under review', 'Verified']} current={v === 'verified' ? 4 : idx} />
            {v === 'verified' && <Alert tone="success">Your organization is verified. You can now register protected leads, apply to opportunities and join collaboration teams.</Alert>}
            {v === 'reupload_requested' && <Alert tone="warning" title="Action needed:">{status.history[0]?.reason}</Alert>}
            {v === 'rejected' && <Alert tone="danger" title="Verification declined:">{status.history[0]?.reason} — you may correct your details and resubmit, or contact support.</Alert>}
            {(v === 'submitted' || v === 'under_review') && <Alert tone="info">Our compliance team is reviewing your application. You’ll be notified by email.</Alert>}
            <DescriptionList items={[['Legal name', org.legalName], ['Membership level', org.membershipLevel], ['Account type', status.kind]]} />
          </Card>
          <Card title="Checklist">
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {STEP_META.map((s) => {
                const done = status.steps.find((x) => x.step === s.step)?.complete;
                return <li key={s.step} style={{ padding: '6px 0', borderBottom: '1px solid var(--cz-grey-100)' }}>{done ? '✅' : '⬜️'} <a href={s.href(status.kind)}>{s.label}</a> <span className="cz-muted" style={{ fontSize: 12 }}>· screen {s.screen}</span></li>;
              })}
            </ul>
            {run.error && <div style={{ marginTop: 12 }}><Alert tone="danger">{run.error}</Alert></div>}
            {['not_started', 'reupload_requested', 'rejected'].includes(v) && (
              <div style={{ marginTop: 12 }}><Button variant="accent" onClick={() => run.run()} loading={run.pending} disabled={!status.canSubmit}>Submit for verification</Button></div>
            )}
          </Card>
          <Card title="Review history">
            <Timeline items={status.history.map((h, i) => ({ id: String(i), at: h.at, title: `${h.from.replace(/_/g, ' ')} → ${h.to.replace(/_/g, ' ')}`, detail: h.reason ?? undefined }))} empty="No reviews yet." />
          </Card>
        </>
      )}
    </Screen>
  );
}
