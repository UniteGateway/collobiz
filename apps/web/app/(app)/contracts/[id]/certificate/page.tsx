'use client';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Sig { organization: string; typedName: string; title: string | null; method: string; bodyHash: string; matchesApproved: boolean; evidenceSha256: string | null; ip: string | null; signedAt: string }
interface C { code: string; title: string; status: string; executedAt: string | null; version: { no: number; bodyHash: string; approvedAt: string } | null; intact: boolean; signatures: Sig[]; note: string }
const METHOD: Record<string, string> = { typed: 'Typed signature (electronic acceptance)', wet_ink_upload: 'Wet-ink signed copy uploaded', aadhaar_esign: 'Aadhaar eSign' };
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }) : '—');

/** Signing certificate — printable record of who signed which exact text, how and when. */
export default function Certificate() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<C>(`/contracts/${id}/certificate`);
  const c = q.data;
  return (
    <Screen page={{ key: 'signing-certificate', title: c ? `Signing certificate — ${c.code}` : 'Signing certificate', access: 'partner' }} description={c?.title} actions={<Button variant="secondary" onClick={() => window.print()}>Print</Button>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !c ? <LoadingState /> : (
        <Card>
          {c.intact ? <Alert tone="success">The approved text is unchanged since approval (fingerprint verified).</Alert> : <Alert tone="danger">The approved text failed its integrity check.</Alert>}
          <p style={{ fontSize: 14 }}><strong>Approved version {c.version?.no}</strong> · {when(c.version?.approvedAt ?? null)}<br /><span className="cz-mono" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>SHA-256 {c.version?.bodyHash}</span></p>
          <p style={{ fontSize: 14 }}>Status: <strong>{c.status === 'executed' ? `Executed ${when(c.executedAt)}` : c.status.replace(/_/g, ' ')}</strong></p>
          <ol className="cz-timeline">{c.signatures.map((s, i) => (
            <li key={i} data-signature={s.organization}><strong>{s.organization}</strong> — {s.typedName}{s.title ? `, ${s.title}` : ''}<br />
              <span style={{ fontSize: 13.5 }}>{METHOD[s.method] ?? s.method} · {when(s.signedAt)}{s.ip ? ` · IP ${s.ip}` : ''} · {s.matchesApproved ? 'signed the approved text' : 'fingerprint differs from the approved text'}</span>
              {s.evidenceSha256 && <><br /><span className="cz-mono" style={{ fontSize: 12 }}>Signed copy SHA-256 {s.evidenceSha256}</span></>}</li>
          ))}</ol>
          <p className="cz-muted" style={{ fontSize: 12.5 }}>{c.note}</p>
        </Card>
      )}
    </Screen>
  );
}
