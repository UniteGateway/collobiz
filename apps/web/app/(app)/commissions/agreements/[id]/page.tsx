'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Card, DescriptionList, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { EARNED_NOTE, EarningsTabs, inr, when } from '@/components/Finance';
import { useQuery } from '@/lib/hooks';

/** Screen 096 — Commission Agreement Detail (frozen terms with integrity hash). */
export default function AgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/commissions/agreements/${id}`);
  if (q.loading) return <Screen id="096"><LoadingState /></Screen>;
  if (q.error) return <Screen id="096"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const a = q.data;
  const p = a.terms.policy;
  const rate = p.basis === 'percent' ? `${p.rateBps / 100}% of each paid milestone` : p.basis === 'flat' ? `${inr(p.flatAmount)} for the project, allocated by milestone value` : `Tiered: ${p.tiers.map((t: any) => `${t.rateBps / 100}%${t.upTo ? ` up to ${inr(t.upTo)}` : ' above'}`).join(', ')}`;
  return (
    <Screen id="096" title={`Agreement ${a.code}`} actions={<StatusBadge status={a.status} />}>
      <EarningsTabs />
      <Alert tone="info">{EARNED_NOTE}</Alert>
      {!a.termsIntact && <Alert tone="danger">Integrity check failed: the stored terms do not match their hash. Contact COLLABIZ finance.</Alert>}
      <Card title="Terms (frozen when the agreement was created)">
        <DescriptionList items={[
          ['Beneficiary', a.beneficiary], ['Payer', a.payer], ['Project', <Link key="p" href={`/projects/${a.project.id}`}>{a.project.code} — {a.project.title}</Link>],
          ['Policy', `${p.name} (${p.code} v${p.version})`], ['Rate', rate], ['Your share', `${a.shareBps / 100}%`],
          ['Earned when', 'The customer’s payment for each certified milestone is recorded'], ['TDS', `${p.tdsBps / 100}% withheld at source`], ['GST', a.terms.gstRegistered ? '18% added (GST-registered)' : 'Not applicable (not GST-registered)'],
          ['Clawback window', `${p.clawbackDays} days after payment`], ['Created', when(a.createdAt)],
          ['Terms hash', <span key="h" className="cz-mono" style={{ wordBreak: 'break-all' }}>{a.termsHash}{a.termsIntact ? ' ✓ verified' : ''}</span>],
        ]} />
        <p><Link href={`/commissions/agreements/${a.id}/milestones`}>See the schedule by milestone →</Link></p>
      </Card>
    </Screen>
  );
}
