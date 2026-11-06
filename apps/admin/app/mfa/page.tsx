'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, LoadingState, Alert } from '@collabiz/ui';
import { MfaEnrol } from '@/components/MfaEnrol';
import { useSession } from '@/lib/session';

/** Mandatory MFA enrolment for administrators (§7.1). */
export default function AdminMfaPage() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !me) router.replace('/login?next=/mfa');
  }, [loading, me, router]);
  if (loading || !me) return <LoadingState />;
  return (
    <main id="main" className="cz-container cz-section" style={{ maxWidth: 760 }}>
      <Card title="Set up multi-factor authentication">
        {me.mfaEnabled ? <Alert tone="success">MFA is enabled. <a href="/">Continue to the dashboard</a></Alert> : (
          <MfaEnrol onDone={async () => { await refresh(); router.replace('/'); }} />
        )}
      </Card>
    </main>
  );
}
