'use client';
import Link from 'next/link';
import { useState } from 'react';
import { SOLAR_QUOTE_STATUS_LABELS } from '@collabiz/types';
import { ButtonLink, Card, EmptyState, Kpi, Grid, Segmented, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { SOLAR_TONE, SolarNav, kwLabel, lakh, modelSystem, rupees } from '@/components/Solar';
import { useQuery } from '@/lib/hooks';

interface Overview { totals: { quotes: number; open: number; openValue: number; won: number; wonValue: number; commissionProjected: number; referrals: number; rewardsDue: number }; referralCode: string }
interface Row { id: string; code: string; customer: string; city: string; model: string; system: string; capacityKw: number; total: number; net: number; commission: number; status: string; createdAt: string; validUntil: string }

/** Unite Solar desk — quote kits, EPC projects and PPAs for your customers, from their power bill. */
export default function SolarDesk() {
  const o = useQuery<Overview>('/solar/overview');
  const q = useQuery<Row[]>('/solar/quotes');
  const [f, setF] = useState('open');
  const rows = (q.data ?? []).filter((r) => (f === 'open' ? ['draft', 'sent', 'accepted'].includes(r.status) : f === 'won' ? ['won', 'installed', 'paid'].includes(r.status) : true));
  return (
    <Screen page={{ key: 'solar', title: 'Unite Solar desk', access: 'verified-partner' }}
      description="Quote solar for your customers in minutes — upload their power bill and COLLABIZ sizes the system, applies the subsidy, shows savings and payback, and works out your commission."
      actions={<ButtonLink href="/solar/new">New quote</ButtonLink>}>
      <SolarNav />
      {o.error ? <ApiErrorView error={o.error} onRetry={o.reload} /> : !o.data ? <Skeleton height={120} /> : (
        <Grid cols={4}>
          <Kpi label="Open quotes" value={o.data.totals.open} hint={`${lakh(o.data.totals.openValue)} quoted`} icon="documents" />
          <Kpi label="Orders won" value={o.data.totals.won} hint={`${lakh(o.data.totals.wonValue)} sold`} icon="check" />
          <Kpi label="Commission on won orders" value={rupees(o.data.totals.commissionProjected)} accent hint="earned when the customer pays" icon="earnings" />
          <Kpi label="Referrals" value={o.data.totals.referrals} hint={o.data.totals.rewardsDue ? `${rupees(o.data.totals.rewardsDue)} reward due` : `your link: ${o.data.referralCode}`} icon="teams" href="/solar/referrals" />
        </Grid>
      )}
      <Card>
        <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}>
          <h2>Your quotes</h2>
          <Segmented label="Show" value={f} onChange={setF} options={[{ value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'all', label: 'All' }]} />
        </div>
        {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={160} /> : !rows.length ? (
          <EmptyState icon="documents" title={f === 'open' ? 'No open quotes' : 'Nothing here yet'} action={<ButtonLink href="/solar/new">Make a quote</ButtonLink>}>Start with the customer’s latest electricity bill — a PDF from the DISCOM website works best.</EmptyState>
        ) : (
          <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>{rows.map((r) => (
            <li key={r.id} className="cz-card cz-lead" data-quote={r.customer}>
              <div className="cz-lead-head">
                <Link href={`/solar/quotes/${r.id}`}><strong>{r.customer} — {kwLabel(r.capacityKw)}</strong></Link>
                <span className="cz-muted">{modelSystem(r.model, r.system)} · {r.city} · {r.code}</span>
                <span style={{ marginLeft: 'auto' }}><StatusBadge status={r.status} tone={SOLAR_TONE[r.status]} label={SOLAR_QUOTE_STATUS_LABELS[r.status]} /></span>
              </div>
              <span className="cz-muted" style={{ fontSize: 13 }}>{r.model === 'ppa' ? 'No upfront cost' : `${rupees(r.total)}${r.net !== r.total ? ` · ${rupees(r.net)} after subsidy` : ''}`} · your commission {rupees(r.commission)}</span>
            </li>
          ))}</ul>
        )}
      </Card>
    </Screen>
  );
}
