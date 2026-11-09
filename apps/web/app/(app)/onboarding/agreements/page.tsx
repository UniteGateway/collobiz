'use client';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, StatusBadge, TextInput, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useOnboarding } from '@/lib/onboarding';

/** Scrollable agreement text; reports "read" once scrolled to the end — or immediately if it fits without scrolling. */
function AgreementText({ title, body, onRead }: { title: string; body: string; onRead: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  const report = () => {
    if (!reported.current) {
      reported.current = true;
      onRead();
    }
  };
  useEffect(() => {
    const el = ref.current;
    if (el && el.scrollHeight <= el.clientHeight + 8) report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);
  return (
    <div ref={ref} tabIndex={0} aria-label={`${title} text`} onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) report(); }}
      style={{ maxHeight: 180, overflowY: 'auto', whiteSpace: 'pre-wrap', background: 'var(--cz-navy-50)', padding: 12, borderRadius: 8, fontSize: 14 }}>{body}</div>
  );
}

interface Ag { code: string; version: number; title: string; body: string; bodyHash: string; legalReviewed: boolean; accepted: { acceptedAt: string; typedName: string } | null }

/** Screen 021 — Agreement Acceptance & e-Sign (click-to-accept evidence: typed name, time, IP, document hash). */
export default function AgreementsPage() {
  const { me } = useSession();
  const { goNext, reload, locked } = useOnboarding();
  const ags = useQuery<Ag[]>('/onboarding/agreements');
  const [names, setNames] = useState<Record<string, string>>({});
  const [read, setRead] = useState<Record<string, boolean>>({});
  const accept = useMutation(async (a: Ag) => { await api.post('/onboarding/agreements/accept', { templateCode: a.code, version: a.version, typedName: names[a.code] ?? '' }); ags.reload(); reload(); return true; });
  const all = (ags.data ?? []).every((a) => a.accepted);
  return (
    <Screen id="021" description="Read each agreement and type your full name to sign. We record the time, your IP address and a fingerprint of the exact text you accepted.">
      <Alert tone="warning">These templates are drafts pending legal review (Master Book §7.2). Accepting records your consent to the current version.</Alert>
      {accept.error && <Alert tone="danger">{accept.error}</Alert>}
      {ags.loading ? <LoadingState /> : ags.error ? <ApiErrorView error={ags.error} onRetry={ags.reload} /> : (ags.data ?? []).map((a) => (
        <Card key={a.code} title={`${a.title} · v${a.version}`} actions={<StatusBadge status={a.accepted ? 'signed' : 'pending'} label={a.accepted ? `Signed ${new Date(a.accepted.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not signed'} />}>
          <AgreementText title={a.title} body={a.body} onRead={() => setRead((r) => ({ ...r, [a.code]: true }))} />
          <p className="cz-muted cz-mono" style={{ fontSize: 11, marginTop: 6, overflowWrap: 'anywhere' }}>Document fingerprint (SHA-256): {a.bodyHash}</p>
          {!a.accepted && (
            <form noValidate onSubmit={(e) => { e.preventDefault(); accept.run(a); }} className="cz-row" style={{ alignItems: 'flex-end' }}>
              <TextInput label={`Type your full name (${me?.fullName}) to sign`} value={names[a.code] ?? ''} onChange={(e) => setNames({ ...names, [a.code]: e.target.value })} error={accept.fieldErrors.typedName} />
              <Button type="submit" loading={accept.pending} disabled={locked || !read[a.code]} title={!read[a.code] ? 'Scroll to the end of the agreement first' : undefined}>Sign</Button>
            </form>
          )}
        </Card>
      ))}
      <Button onClick={() => goNext('agreements')} disabled={!all}>Continue to review</Button>
    </Screen>
  );
}
