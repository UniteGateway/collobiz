'use client';
import { Alert, ButtonLink, DataTable, EmptyState, Kpi, Skeleton, StatusBadge, Button } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Enq { id: string; code: string; customerName: string; city: string; state: string; lines: { name: string; qty: number }[]; status: string; statusLabel: string; protectedUntil: string; quoteValue: number | null; orderValue: number | null; rateBps: number | null; commission: number | null; createdAt: string }
interface Mine { channel: string; enquiries: Enq[]; totals: { open: number; won: number; commissionWon: number; commissionEarned: number }; disclaimer: string }
const inr = (p: number | null) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
const TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { submitted: 'info', in_discussion: 'info', quoted: 'warning', won: 'success', paid: 'success', lost: 'neutral', withdrawn: 'neutral' };

/** My Powertek enquiries — status from enquiry to paid order, and the commission each one carries. */
export default function MyPowertekEnquiries() {
  const q = useQuery<Mine>('/product-sales/powertek/enquiries/mine');
  const withdraw = useMutation(async (e: Enq) => { const reason = window.prompt(`Why withdraw ${e.code}?`); if (!reason) return; await api.post(`/product-sales/powertek/enquiries/${e.id}/withdraw`, { reason }); q.reload(); });
  return (
    <Screen page={{ key: 'powertek-enquiries', title: 'My Powertek enquiries', access: 'partner' }} actions={<ButtonLink href="/powertek">Browse products</ButtonLink>}>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <div className="cz-grid cz-grid-4">
            <Kpi label="Selling as" value={q.data.channel} />
            <Kpi label="Open enquiries" value={q.data.totals.open} />
            <Kpi label="Commission on won orders" value={inr(q.data.totals.commissionWon)} hint="Projected until the customer pays" />
            <Kpi label="Commission earned" value={inr(q.data.totals.commissionEarned)} href="/earnings" />
          </div>
          {withdraw.error && <Alert tone="danger">{withdraw.error}</Alert>}
          <section className="cz-card"><DataTable caption="Enquiries" rows={q.data.enquiries} empty={<EmptyState title="No enquiries yet" action={<ButtonLink href="/powertek">Browse Powertek products</ButtonLink>}>Add products to the enquiry basket and register your customer.</EmptyState>} columns={[
            { key: 'c', header: 'Enquiry', render: (e) => <><strong>{e.code}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{e.createdAt.slice(0, 10)} · {e.customerName}, {e.city}</span></> },
            { key: 'p', header: 'Products', render: (e) => e.lines.map((l) => `${l.qty} × ${l.name}`).join(', ') },
            { key: 'v', header: 'Quote / order', render: (e) => (e.orderValue ? `Order ${inr(e.orderValue)}` : e.quoteValue ? `Quoted ${inr(e.quoteValue)}` : '—') },
            { key: 'm', header: 'Your commission', render: (e) => (e.commission != null ? `${inr(e.commission)} (${(e.rateBps! / 100).toFixed(2)}%)` : e.status === 'won' || e.status === 'paid' ? 'Rate to be confirmed' : '—') },
            { key: 's', header: 'Status', render: (e) => <><StatusBadge status={e.status} tone={TONE[e.status]} label={e.statusLabel} />{['submitted', 'in_discussion', 'quoted'].includes(e.status) && <><br /><span className="cz-muted" style={{ fontSize: 12 }}>Customer yours until {e.protectedUntil}</span></>}</> },
            { key: 'a', header: '', render: (e) => (['submitted', 'in_discussion', 'quoted'].includes(e.status) ? <Button size="sm" variant="ghost" onClick={() => withdraw.run(e)}>Withdraw</Button> : null) },
          ]} /></section>
          <Alert tone="info">{q.data.disclaimer} Earned commission moves to Earnings for finance approval, TDS and payout.</Alert>
        </div>
      )}
    </Screen>
  );
}
