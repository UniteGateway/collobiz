'use client';
import { useParams } from 'next/navigation';
import { Alert, Button, DescriptionList, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { useQuery } from '@/lib/hooks';

/** Screen 051 — Protected Lead Ownership Certificate. */
export default function Certificate() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}`);
  if (q.loading) return <Screen id="051"><LoadingState /></Screen>;
  if (q.error) return <Screen id="051"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const { claim, opportunity: o, customer } = q.data;
  const active = ['protected', 'upheld'].includes(claim.status);
  return (
    <Screen id="051" actions={<Button variant="secondary" onClick={() => window.print()}>Print</Button>}>
      <LeadTabs id={id} />
      {!active && <Alert tone="warning">This lead is currently <StatusBadge status={claim.status} /> — the certificate is not in force.</Alert>}
      <section className="cz-certificate" aria-label="Protected lead ownership certificate">
        <img src="/brand/collabiz-logo.png" alt="COLLABIZ" width={200} />
        <h2 style={{ marginTop: 16 }}>Protected Lead Ownership Certificate</h2>
        <DescriptionList items={[
          ['Certificate no.', <span key="c" className="cz-mono">{claim.certificateCode}</span>], ['Opportunity', `${o.code} — ${o.title}`], ['Customer', customer.legalName],
          ['Protected from', claim.protectedFrom ? new Date(claim.protectedFrom).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'], ['Protected until', claim.protectedUntil ? new Date(claim.protectedUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'],
          ['Status', <StatusBadge key="s" status={claim.status} />], ['Fee trigger', claim.feeTrigger], ['Evidence hash', <span key="h" className="cz-mono">{claim.evidenceHash}</span>],
        ]} />
        <p className="cz-muted" style={{ fontSize: 12, marginTop: 16 }}>Conditional protection under the COLLABIZ Lead Registration Agreement. Protection is not a guarantee of award or payment; commission becomes payable only on the contractual trigger above. Disputes are decided on evidence by an independent panel, with appeal.</p>
      </section>
    </Screen>
  );
}
