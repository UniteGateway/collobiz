'use client';
import Link from 'next/link';
import { OFFER_KIND_LABELS, OFFER_PRICING_LABELS } from '@collabiz/types';
import { ButtonLink, Card, EmptyState, Icon, LoadingState, PageHeader, StatusBadge } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Row { id: string; code: string; title: string; issuer: string; kind: string; pricing: string; targetMode: string; places: number; exclusive: boolean; deadline: string; status: string; open: boolean; sent: number; viewed: number; responses: number; selected: number; leads: number; wonValue: number }
const AUDIENCE: Record<string, string> = { all: 'All verified partners', selected: 'Chosen partners', filtered: 'Filtered group' };

/** Direct offers — work, products and markets sent straight to partners, with their responses. */
export default function OffersAdmin() {
  const q = useQuery<Row[]>('/admin/offers');
  return (
    <div>
      <PageHeader title="Direct offers" breadcrumb="Unite Group Administration"
        description="Send work, products to sell, manpower needs or a local presence straight to partners — all of them, ones you choose, or a group filtered by office and spare manpower. Set the price yourself or ask partners to quote, then pick who you work with."
        actions={<ButtonLink href="/offers/new"><Icon name="plus" size={16} />New offer</ButtonLink>} />
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data?.length ? <Card><EmptyState icon="briefcase" title="No offers sent yet">Create one to reach partners directly in their dashboard.</EmptyState></Card> : (
        <ul className="cz-offer-list" aria-label="Direct offers">
          {q.data.map((o) => (
            <li key={o.id}>
              <Link href={`/offers/${o.id}`} className="cz-card cz-offer" data-offer={o.code}>
                <div className="cz-offer-head"><span className="cz-tag">{OFFER_KIND_LABELS[o.kind]}</span>{o.exclusive && <span className="cz-tag">Exclusive</span>}
                  <StatusBadge status={o.open ? 'open' : o.status} label={o.open ? `Open · closes ${new Date(o.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : o.status === 'open' ? 'Past deadline' : undefined} /></div>
                <strong className="cz-offer-title">{o.title}</strong>
                <span className="cz-muted">{o.issuer} · {AUDIENCE[o.targetMode]} · {OFFER_PRICING_LABELS[o.pricing]}</span>
                <div className="cz-offer-stats">
                  <span><strong>{o.sent}</strong> sent</span><span><strong>{o.viewed}</strong> opened</span><span><strong>{o.responses}</strong> response{o.responses === 1 ? '' : 's'}</span><span><strong>{o.selected} of {o.places}</strong> selected</span>{o.leads > 0 && <><span><strong>{o.leads}</strong> buyers</span><span><strong>₹{Math.round(o.wonValue / 100).toLocaleString('en-IN')}</strong> won</span></>}
                </div>
                <span className="cz-mono cz-muted" style={{ fontSize: 12.5 }}>{o.code}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
