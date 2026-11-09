'use client';
import Link from 'next/link';
import { PROPERTY_KIND_LABELS, UNIT_STATUS_LABELS, UNIT_TYPE_LABELS } from '@collabiz/types';
import { Card, EmptyState, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';
import { crore } from '@/components/Property';

interface Project { id: string; code: string; name: string; kind: string; city: string; owner: string | null; reraNumber: string | null; commissionBps: number; units: number; available: number; availableValue: number; description: string }
interface Hold { id: string; project: string; projectId: string; unitNo: string; unitType: string; price: number; status: string; heldUntil: string | null; buyerName: string | null; commission: number }

/** Property sales — Unite projects partners can sell as channel partners: hold units for buyers, earn commission on sales. */
export default function PropertyPage() {
  const q = useQuery<Project[]>('/property/projects');
  const holds = useQuery<Hold[]>('/property/holds');
  return (
    <Screen page={{ key: 'property', title: 'Property sales', access: 'verified-partner' }}
      description="Unite Group projects you can sell as a channel partner — industrial plots and sheds, homes and commercial space. Hold a unit for your buyer for 48 hours; Unite completes the booking and you earn commission on the sale.">
      <div className="cz-stack" style={{ gap: 16 }}>
        {holds.data && holds.data.length > 0 && (
          <Card title="Your buyers">
            <ul className="cz-stack" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>{holds.data.map((h) => (
              <li key={h.id} className="cz-row" style={{ justifyContent: 'space-between', gap: 8 }} data-hold={h.unitNo}>
                <span><strong>{h.project} · {h.unitNo}</strong> <span className="cz-muted">({UNIT_TYPE_LABELS[h.unitType]}) for {h.buyerName}{h.status === 'held' && h.heldUntil ? ` · held until ${new Date(h.heldUntil).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</span></span>
                <span className="cz-row" style={{ gap: 8 }}><span className="cz-muted" style={{ fontSize: 13 }}>Commission {crore(h.commission)}</span><StatusBadge status={h.status} tone={h.status === 'sold' ? 'success' : h.status === 'booked' ? 'info' : 'warning'} label={UNIT_STATUS_LABELS[h.status]} /></span>
              </li>
            ))}</ul>
          </Card>
        )}
        {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={200} /> : !q.data.length ? <div className="cz-card"><EmptyState icon="building" title="No projects open to partners right now" /></div> : (
          <ul className="cz-offer-list">{q.data.map((p) => (
            <li key={p.id}><Link href={`/property/${p.id}`} className="cz-card cz-offer" data-project={p.name}>
              <div className="cz-offer-head"><span className="cz-tag">{PROPERTY_KIND_LABELS[p.kind]}</span>{p.reraNumber && <span className="cz-tag">RERA {p.reraNumber}</span>}</div>
              <strong className="cz-offer-title">{p.name}</strong>
              <span className="cz-muted">{p.owner} · {p.city}</span>
              <span className="cz-offer-terms">{p.available} of {p.units} units available · {crore(p.availableValue)} available · commission {p.commissionBps / 100}%</span>
            </Link></li>
          ))}</ul>
        )}
      </div>
    </Screen>
  );
}
