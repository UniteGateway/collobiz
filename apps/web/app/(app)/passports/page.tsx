'use client';
import Link from 'next/link';
import { PASSPORT_PARTY_ROLE_LABELS } from '@collabiz/types';
import { Card, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

/** Deal Passports other partners have shared with your company. */
export default function SharedPassports() {
  const q = useQuery<{ claimId: string; code: string; title: string; role: string; ndaAccepted: boolean }[]>('/passports/shared');
  return (
    <Screen page={{ key: 'shared-passports', title: 'Shared Deal Passports', access: 'partner' }} description="Registered deals other partners have shared with you to collaborate on. Accept the confidentiality undertaking to open one.">
      <Card>{q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.length ? <EmptyState icon="documents" title="Nothing shared with you yet">When a partner shares a Deal Passport with your company, it appears here.</EmptyState> : (
        <ul className="cz-ws-list">{q.data.map((p) => (
          <li key={p.code} data-passport={p.code}><span><Link href={`/leads/${p.claimId}/passport`}><strong>{p.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}><span className="cz-mono">{p.code}</span> · {PASSPORT_PARTY_ROLE_LABELS[p.role]}</span></span>
            <StatusBadge status={p.ndaAccepted ? 'active' : 'pending'} tone={p.ndaAccepted ? 'success' : 'warning'} label={p.ndaAccepted ? 'Open' : 'Accept undertaking'} /></li>
        ))}</ul>
      )}</Card>
    </Screen>
  );
}
