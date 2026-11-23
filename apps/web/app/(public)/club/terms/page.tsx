'use client';
import Link from 'next/link';
import { Alert, LoadingState } from '@collabiz/ui';
import { useQuery } from '@/lib/hooks';

/** Unite Industry Club — Membership Terms and Conditions (public). */
export default function ClubTerms() {
  const q = useQuery<{ title: string; version: number; body: string; counselApproved: boolean }>('/public/club/terms');
  return (
    <div className="cz-container cz-section" data-screen="club-terms">
      <p className="cz-hx-eyebrow">Unite Industry Club</p>
      <h1>Terms and Conditions</h1>
      {!q.data ? <LoadingState /> : (
        <>
          <p className="cz-muted">{q.data.title} · version {q.data.version}</p>
          {!q.data.counselApproved && <Alert tone="warning">Pilot draft — this version has not yet been approved by Unite’s legal counsel.</Alert>}
          <pre className="cz-legal cz-card">{q.data.body}</pre>
          <p><Link href="/club/legal">All legal documents</Link> · <Link href="/club">About the club</Link></p>
        </>
      )}
    </div>
  );
}
