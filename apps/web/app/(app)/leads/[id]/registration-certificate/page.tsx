'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Button, DescriptionList, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { useQuery } from '@/lib/hooks';

/** Screen 152 — Digital Lead Registration Certificate: publicly verifiable (QR + code) without revealing the customer. */
export default function DigitalCertificate() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}`);
  const [qr, setQr] = useState<string | null>(null);
  const code = q.data?.claim.certificateCode;
  const verifyUrl = typeof window !== 'undefined' && code ? `${window.location.origin}/verify-certificate?code=${code}` : '';
  useEffect(() => { if (verifyUrl) QRCode.toDataURL(verifyUrl, { width: 160, margin: 1, color: { dark: '#011E48' } }).then(setQr).catch(() => setQr(null)); }, [verifyUrl]);
  if (q.loading) return <Screen id="152"><LoadingState /></Screen>;
  if (q.error) return <Screen id="152"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const { claim, opportunity: o } = q.data;
  return (
    <Screen id="152" actions={<Button variant="secondary" onClick={() => window.print()}>Print / save as PDF</Button>}>
      <LeadTabs id={id} />
      <section className="cz-certificate" aria-label="Digital lead registration certificate">
        <div className="cz-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <img src="/brand/collabiz-logo.png" alt="COLLABIZ" width={180} />
            <h2 style={{ marginTop: 12 }}>Digital Lead Registration Certificate</h2>
          </div>
          {qr && <img src={qr} alt={`QR code linking to verification of certificate ${code}`} width={140} height={140} />}
        </div>
        <DescriptionList items={[
          ['Certificate no.', <span key="c" className="cz-mono">{claim.certificateCode}</span>], ['Tracking ID', <span key="t" className="cz-mono">{o.code}</span>],
          ['Registered at', `${new Date(claim.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' })} IST`], ['Sealed evidence (SHA-256)', <span key="h" className="cz-mono">{claim.evidenceHash}</span>], ['Status', <StatusBadge key="s" status={claim.status} />],
        ]} />
        <p style={{ marginTop: 12 }}>Anyone can verify this certificate at <Link href={`/verify-certificate?code=${code}`}>/verify-certificate</Link>. Verification confirms the registration time, introducer and protection status; it never discloses the customer.</p>
      </section>
    </Screen>
  );
}
