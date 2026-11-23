'use client';
import Link from 'next/link';
import { LoadingState } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

interface T { code: string; title: string; version: number; counselApproved: boolean; counselApprovedAt: string | null; body: string }

/** Unite Industry Club — legal library: every template, its version and whether counsel has approved it. */
export default function ClubLegal() {
  const q = useQuery<{ items: T[]; notice: string }>('/public/club/legal');
  return (
    <div className="cz-container cz-section" data-screen="club-legal">
      <p className="cz-hx-eyebrow">Unite Industry Club</p>
      <h1>Legal documents</h1>
      <p className="cz-hx-sub" style={{ maxWidth: 820 }}>The templates behind every Club agreement. Members fill in the details on COLLABIZ and both parties sign the exact text online. Placeholders in double braces are filled from the parties’ registered details.</p>
      {!q.data ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 12, marginTop: 16 }}>
          {q.data.items.map((t) => (
            <details key={t.code} className="cz-card" data-legal={t.code}>
              <summary><strong>{t.title}</strong> <span className="cz-muted">· version {t.version} · {t.counselApproved ? `approved by counsel ${t.counselApprovedAt ? new Date(t.counselApprovedAt).toLocaleDateString('en-IN') : ''}` : 'pilot draft, awaiting counsel review'}</span></summary>
              <pre className="cz-legal">{t.body}</pre>
            </details>
          ))}
        </div>
      )}
      <p className="cz-muted" style={{ marginTop: 16, fontSize: 14 }}>These documents are not legal advice. Take your own advice before signing. <Link href="/club/terms">Club Terms and Conditions</Link></p>
    </div>
  );
}
