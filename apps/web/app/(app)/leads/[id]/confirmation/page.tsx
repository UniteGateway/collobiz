'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { sectorName } from '@collabiz/types';
import { Alert, Card, DescriptionList, LoadingState, Money, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { LeadTabs } from '@/components/LeadWizard';
import { useQuery } from '@/lib/hooks';

/** Screen 049 — Lead Registration Confirmation (record ID, sealed evidence hash, status, next action). */
export default function Confirmation() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/leads/${id}`);
  if (q.loading) return <Screen id="049"><LoadingState /></Screen>;
  if (q.error) return <Screen id="049"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const { claim, opportunity: o, customer } = q.data;
  const next = o.status === 'duplicate_review' ? 'A compliance reviewer is checking a possible duplicate registration.' : o.status === 'unite_priority_review' ? `${o.groupCompany} is reviewing it first.` : o.status === 'released' ? 'Released by Unite Group — you may pursue it with approved partners.' : o.status === 'accepted' ? 'Accepted by Unite Group. Your protected introduction is recorded for commission.' : `Status: ${o.status}`;
  return (
    <Screen id="049" title={`Lead ${o.code}`}>
      <LeadTabs id={id} />
      {claim.status === 'protected' && <Alert tone="success" title="Registered and protected.">Your introduction is protected until {new Date(claim.protectedUntil).toLocaleDateString()}.</Alert>}
      {claim.status === 'pending' && <Alert tone="warning" title="Registered — protection pending.">{next}</Alert>}
      <div className="cz-grid cz-grid-2" style={{ alignItems: 'start' }}>
        <Card title="Registration record">
          <DescriptionList items={[
            ['Tracking ID', <span key="c" className="cz-mono">{o.code}</span>], ['Certificate', <span key="cc" className="cz-mono">{claim.certificateCode}</span>],
            ['Registered', new Date(claim.createdAt).toLocaleString()], ['Evidence hash', <span key="h" className="cz-mono">{claim.evidenceHash}</span>],
            ['Protection', <StatusBadge key="p" status={claim.status} />], ['Opportunity status', <StatusBadge key="o" status={o.status} />],
          ]} />
        </Card>
        <Card title="Opportunity">
          <DescriptionList items={[['Customer', `${customer.legalName}, ${customer.city}`], ['Sector', sectorName(o.sector)], ['Scope', o.title], ['Estimated value', <Money key="v" minor={o.estimatedValue} />], ['First review by', o.groupCompany ?? '—'], ['Fee trigger', claim.feeTrigger]]} />
          <p style={{ marginTop: 12 }}><strong>Next:</strong> {next} <Link href={`/leads/${id}/review-status`}>Track review →</Link></p>
        </Card>
      </div>
    </Screen>
  );
}
