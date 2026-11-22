'use client';
import Link from 'next/link';
import { DataTable, LoadingState } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { Badge, day } from '@/components/Eb5';
import { useQuery } from '@/lib/hooks';

interface P { id: string; org: string; kyb: string; kind: string; role: string; jurisdiction: string; i956kStatus: string; agreementStatus: string; complianceStatus: string; leads: number; createdAt: string }

/** GO EB5 partner directory — approved by compliance only. */
export default function Eb5Partners() {
  const q = useQuery<P[]>('/eb5/partners');
  return (
    <Screen page={{ key: 'eb5-partners', title: 'GO EB5 partners', access: 'authenticated' }} eyebrow="GO EB5" description="Immigration advisers, consultants, accountants, law firms and project representatives who introduce prospects. Approval needs a signed partner agreement and an I-956K assessment.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <DataTable rows={q.data} caption="GO EB5 partners" columns={[
          { key: 'o', header: 'Partner', render: (p) => <span><Link href={`/eb5/partners/${p.id}`}>{p.org}</Link><br /><span className="cz-muted" style={{ fontSize: 12 }}>{p.kind.replace(/_/g, ' ')} · {p.jurisdiction}</span></span> },
          { key: 'r', header: 'Role', render: (p) => (p.role === 'bd_partner' ? 'Business development partner' : 'Referral consultant') },
          { key: 'k', header: 'Business KYB', render: (p) => <Badge s={p.kyb} /> },
          { key: 'i', header: 'I-956K', render: (p) => <Badge s={p.i956kStatus} /> },
          { key: 'a', header: 'Partner agreement', render: (p) => <Badge s={p.agreementStatus} /> },
          { key: 'c', header: 'Compliance', render: (p) => <Badge s={p.complianceStatus} /> },
          { key: 'l', header: 'Introductions', render: (p) => p.leads }, { key: 'd', header: 'Applied', render: (p) => day(p.createdAt) },
        ]} />
      )}
    </Screen>
  );
}
