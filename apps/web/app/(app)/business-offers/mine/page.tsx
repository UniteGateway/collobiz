'use client';
import Link from 'next/link';
import { ButtonLink, Card, DataTable, EmptyState, LoadingState, StatusBadge } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { STATUS_TONE, type OfferView } from '@/components/Collab';
import { useQuery } from '@/lib/hooks';

/** My offers: status, expiry and applicants for every offer this business published. */
export default function MyOffers() {
  const r = useQuery<OfferView[]>('/business-offers/mine');
  return (
    <Screen page={{ key: 'business-offers-mine', title: 'My offers', access: 'partner' }} eyebrow="BUSINESS OFFERS" actions={<ButtonLink href="/business-offers/new">Publish an offer</ButtonLink>}>
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !r.data ? <LoadingState /> : !r.data.length ? (
        <Card><EmptyState icon="opportunities" title="You have not published an offer yet">Offer your seats, store, capacity or expertise — or say what partner you are seeking.</EmptyState></Card>
      ) : (
        <Card flush>
          <DataTable caption="My business offers" rowKey={(o) => o.id} rows={r.data} columns={[
            { key: 'title', header: 'Offer', render: (o) => <><Link href={`/business-offers/${o.id}`}><strong>{o.title}</strong></Link><br /><span className="cz-muted" style={{ fontSize: 13 }}>{o.code} · {o.categoryLabel}</span></> },
            { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} tone={STATUS_TONE[o.status]} label={o.statusLabel} /> },
            { key: 'expires', header: 'Expires', render: (o) => new Date(o.expiresOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) },
            { key: 'applicants', header: 'Applicants', render: (o) => o.applicants ?? 0 },
          ]} />
        </Card>
      )}
    </Screen>
  );
}
