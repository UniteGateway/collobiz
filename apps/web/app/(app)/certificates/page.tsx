'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, EmptyState, Icon, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { fmtDate } from '@/components/Growth';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Cert { code: string; course: string; level: string; score: number; issuedAt: string; expiresAt: string; status: 'valid' | 'expired' | 'revoked' }

/** Screen 118 — Partner certificates and badges, each verifiable by its code. */
export default function Certificates() {
  const { me } = useSession();
  const q = useQuery<Cert[]>('/learning/certificates');
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (code: string) => { try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard unavailable */ } };
  return (
    <Screen id="118" title="Certificates" description="Share a certificate code with clients; anyone can confirm it is genuine and current with the code alone.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !q.data.length ? (
        <div className="cz-card"><EmptyState icon="award" title="No certificates yet" action={<Link href="/learning" className="cz-btn cz-btn-accent">Start learning</Link>}>Pass a course assessment to earn your first certificate.</EmptyState></div>
      ) : (
        <ul className="cz-cert-grid">
          {q.data.map((c) => (
            <li key={c.code} className="cz-cert" data-status={c.status}>
              <div className="cz-cert-badge" aria-hidden><Icon name="award" size={26} /></div>
              <span className="cz-muted" style={{ fontSize: 12.5 }}>COLLABIZ certificate · {c.level}</span>
              <strong className="cz-cert-title">{c.course}</strong>
              <span>{me?.fullName}{me?.activeOrg ? ` · ${me.activeOrg.name}` : ''}</span>
              <dl><div><dt>Score</dt><dd>{c.score}%</dd></div><div><dt>Issued</dt><dd>{fmtDate(c.issuedAt)}</dd></div><div><dt>Valid to</dt><dd>{fmtDate(c.expiresAt)}</dd></div></dl>
              <div className="cz-cert-foot"><code>{c.code}</code><StatusBadge status={c.status} tone={c.status === 'valid' ? 'success' : 'warning'} label={c.status === 'valid' ? 'Valid' : c.status === 'expired' ? 'Expired' : 'Revoked'} /></div>
              <div className="cz-row" style={{ gap: 6 }}><Button size="sm" variant="secondary" onClick={() => copy(c.code)}><Icon name={copied === c.code ? 'check' : 'documents'} size={14} />{copied === c.code ? 'Copied' : 'Copy code'}</Button><Link className="cz-btn cz-btn-ghost cz-btn-sm" href={`/verify-certificate?code=${c.code}`}><Icon name="verify" size={14} />Verification page</Link></div>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
