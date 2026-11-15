'use client';
import { useState } from 'react';
import { OFFER_CATEGORIES } from '@collabiz/types';
import { ButtonLink, Card, Checkbox, EmptyState, LoadingState, Segmented, Select, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { OfferCard, type OfferView } from '@/components/Collab';
import { useQuery } from '@/lib/hooks';

/** BUSINESS OFFERS — live offers from verified businesses: what they have to offer and the partners they are seeking. */
export default function BusinessOffers() {
  const [category, setCategory] = useState('');
  const [side, setSide] = useState('');
  const [q, setQ] = useState('');
  const [zero, setZero] = useState(false);
  const qs = new URLSearchParams({ ...(category ? { category } : {}), ...(side ? { side } : {}), ...(q ? { q } : {}), ...(zero ? { zeroUpfront: '1' } : {}) });
  const r = useQuery<{ items: OfferView[]; counts: Record<string, number> }>(`/business-offers?${qs}`);
  return (
    <Screen page={{ key: 'business-offers', title: 'Business Offers', access: 'partner' }} eyebrow="BUSINESS OFFERS"
      description="Have something? Make business. Offers here were checked by COLLABIZ before publishing — the checks are listed on each offer. They are not guarantees."
      actions={<ButtonLink href="/business-offers/new">Publish an offer</ButtonLink>}>
      <div className="cz-row cz-collab-filters" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Segmented label="Show" value={side} onChange={setSide} options={[{ value: '', label: 'All' }, { value: 'offering', label: 'Offering' }, { value: 'seeking', label: 'Seeking partners' }]} />
        <div style={{ minWidth: 240 }}><Select label="Category" placeholder="All categories" value={category} onChange={(e) => setCategory(e.target.value)}
          options={OFFER_CATEGORIES.map((c) => ({ value: c.code, label: `${c.label}${r.data?.counts[c.code] ? ` (${r.data.counts[c.code]})` : ''}` }))} /></div>
        <div style={{ minWidth: 200, flex: 1 }}><TextInput label="Search" placeholder="Title, description or offer ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Checkbox label="No upfront fee" checked={zero} onChange={(e) => setZero(e.target.checked)} />
      </div>
      {r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !r.data ? <LoadingState /> : !r.data.items.length ? (
        <Card><EmptyState icon="opportunities" title="No offers match these filters" action={<ButtonLink href="/business-offers/new" variant="secondary">Publish an offer</ButtonLink>}>Try another category, or publish what you have so others can find you.</EmptyState></Card>
      ) : <div className="cz-product-grid">{r.data.items.map((o) => <OfferCard key={o.id} o={o} />)}</div>}
    </Screen>
  );
}
