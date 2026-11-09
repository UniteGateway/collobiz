'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ButtonLink, EmptyState, Icon, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { MY_STATUS, dueText, kindLabel, placesText, termsLine, type Offer } from '@/components/Offers';
import { useQuery } from '@/lib/hooks';

type Row = Offer & { myStatus: string; myResponse: { status: string; mode: string; reward: string; price: number | null } | null };

/** Offers for you — work, products and markets Unite Group companies sent directly to your company. */
export default function OffersPage() {
  const q = useQuery<Row[]>('/offers');
  const [tab, setTab] = useState('open');
  const rows = q.data ?? [];
  const groups: Record<string, Row[]> = {
    open: rows.filter((o) => o.open && ['sent', 'viewed'].includes(o.myStatus)),
    answered: rows.filter((o) => ['responded', 'selected'].includes(o.myStatus)),
    closed: rows.filter((o) => !(o.open && ['sent', 'viewed'].includes(o.myStatus)) && !['responded', 'selected'].includes(o.myStatus)),
  };
  const list = groups[tab];
  return (
    <Screen page={{ key: 'offers', title: 'Offers for you', access: 'verified-partner' }}
      description="Work, products to sell and markets to develop that Unite Group companies sent straight to your company. Accept their terms or propose your own."
      actions={<ButtonLink href="/settings/capacity" variant="secondary"><Icon name="users" size={16} />Your capacity</ButtonLink>}>
      <div style={{ marginBottom: 14 }}>
        <Segmented label="Offers" value={tab} onChange={setTab} options={[{ value: 'open', label: `To answer ${groups.open.length}` }, { value: 'answered', label: `Answered ${groups.answered.length}` }, { value: 'closed', label: 'Closed' }]} />
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={220} /> : !list.length ? (
        <div className="cz-card"><EmptyState icon="briefcase" title={tab === 'open' ? 'Nothing waiting for you' : tab === 'answered' ? 'You haven’t answered any offers yet' : 'No closed offers'}>
          {tab === 'open' ? 'Keep your capacity up to date — Unite Group uses it to choose who receives offers.' : null}
        </EmptyState></div>
      ) : (
        <ul className="cz-offer-list">
          {list.map((o) => {
            const [label, tone] = MY_STATUS[o.myStatus] ?? [o.myStatus, 'neutral'];
            return (
              <li key={o.id}>
                <Link href={`/offers/${o.id}`} className="cz-card cz-offer" data-offer={o.code}>
                  <div className="cz-offer-head"><span className="cz-tag">{kindLabel(o.kind)}</span>{o.exclusive && <span className="cz-tag">Exclusive</span>}<StatusBadge status={o.myStatus} tone={tone} label={label} /></div>
                  <strong className="cz-offer-title">{o.title}</strong>
                  <span className="cz-muted">{o.venture ? `${o.venture.name} · ` : ''}{o.issuer} · {placesText(o)}</span>
                  <span className="cz-offer-terms">{termsLine(o)}</span>
                  <span className="cz-offer-foot"><span className="cz-mono cz-muted">{o.code}</span><span className={o.open && new Date(o.deadline).getTime() - Date.now() < 3 * 86400_000 ? 'cz-due-soon' : 'cz-muted'}>{o.open ? dueText(o.deadline) : 'Closed'}</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
