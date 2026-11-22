'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, ButtonLink, Card, DataTable, EmptyState, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day, useEb5 } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface P { id: string; org: string; complianceStatus: string; complianceNote: string | null; linkToken?: string; i956kStatus: string; agreementStatus: string }
interface L { id: string; code: string; fullName: string; country: string; status: string; createdAt: string }

/** Partner desk: application status, the partner link, and introductions with their coarse status only. */
export default function Eb5PartnerDesk() {
  const { me, loading } = useEb5();
  const p = useQuery<P>(me?.partner ? `/eb5/partners/${me.partner.id}` : null);
  const leads = useQuery<L[]>(me?.partner?.status === 'approved' ? '/eb5/leads' : null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const link = p.data?.linkToken ? `${origin}/go-eb5/${p.data.linkToken}` : '';
  return (
    <Screen page={{ key: 'eb5-partner-desk', title: 'GO EB5 partner desk', access: 'authenticated' }} eyebrow="GO EB5"
      actions={me?.partner?.status === 'approved' ? <ButtonLink href="/eb5/leads/new" variant="accent">Introduce a prospect</ButtonLink> : undefined}>
      {loading ? <LoadingState /> : !me?.partner ? (
        <Card><EmptyState icon="teams" title="Not a GO EB5 partner yet" action={me?.canApplyAsPartner ? <ButtonLink href="/eb5/partners/apply">Apply</ButtonLink> : undefined}>Business owners and admins can apply for their business.</EmptyState></Card>
      ) : p.error ? <ApiErrorView error={p.error} /> : !p.data ? <LoadingState /> : <>
        <div className="cz-grid cz-grid-2">
          <Card title="Your partner status">
            <dl className="cz-dl"><dt>Compliance</dt><dd><Badge s={p.data.complianceStatus} /></dd><dt>Partner agreement</dt><dd><Badge s={p.data.agreementStatus} /></dd><dt>Form I-956K</dt><dd><Badge s={p.data.i956kStatus} /></dd><dt>Note</dt><dd>{p.data.complianceNote ?? 'Waiting for compliance review'}</dd></dl>
          </Card>
          <Card title="Your introduction link">
            {link ? <>
              <p style={{ marginTop: 0 }}>Prospects can send their own enquiry through this link; it is recorded as your introduction with their consent.</p>
              <p className="cz-qr-url"><a href={link} target="_blank" rel="noopener noreferrer">{link}</a></p>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>Copy link</Button>
            </> : <p className="cz-muted" style={{ margin: 0 }}>Your link appears once compliance approves your business.</p>}
          </Card>
        </div>
        <Alert tone="info">You see only the people you introduced and a general status. Contact details, applications, documents, agreements and payments stay with GO EB5 and the client.</Alert>
        {leads.data && <Card title={`My introductions (${leads.data.length})`} className="cz-mt">
          <DataTable rows={leads.data} caption="My introductions" empty={<p className="cz-muted">No introductions yet.</p>} columns={[
            { key: 'c', header: 'Reference', render: (l) => <Link href={`/eb5/leads/${l.id}`}>{l.code}</Link> }, { key: 'n', header: 'Prospect', render: (l) => l.fullName },
            { key: 'k', header: 'Country', render: (l) => l.country }, { key: 's', header: 'Status', render: (l) => <Badge s={l.status} /> }, { key: 'd', header: 'Introduced', render: (l) => day(l.createdAt) },
          ]} />
        </Card>}
      </>}
    </Screen>
  );
}
